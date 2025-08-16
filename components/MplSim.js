'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ==========================
// Pure three.js version (no @react-three/fiber)
// - Responsive host: 1:1 on small, 16:9 on md+
// - RK4 integrator + sliders for a/b + Stable toggle
// - NEW: Reset button to reseed particles if the sim stalls
// - Perf: renderer/scene created once; a/b/stable live-update via refs
// ==========================

// ODE system
function deriv(x, y, z, a, b) {
  const dx = -a * x + y + 10 * y * z;
  const dy = -x - 0.4 * y + 5 * x * z;
  const dz = b * z - 5 * x * y;
  return [dx, dy, dz];
}

function clampCap(x, y, z, CLIP, CAP) {
  x = Math.max(-CLIP, Math.min(CLIP, x));
  y = Math.max(-CLIP, Math.min(CLIP, y));
  z = Math.max(-CLIP, Math.min(CLIP, z));
  const n = Math.hypot(x, y, z);
  if (n > CAP) {
    const s = CAP / n;
    return [x * s, y * s, z * s];
  }
  return [x, y, z];
}

export default function MplSim() {
  const mountRef = useRef(null);

  // UI state
  const [a, setA] = useState(0.5);
  const [b, setB] = useState(0.5);
  const [stable, setStable] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Live params for the render loop (avoid re-creating the scene)
  const paramsRef = useRef({ a: 0.5, b: 0.5, stable: false });
  useEffect(() => { paramsRef.current.a = a; }, [a]);
  useEffect(() => { paramsRef.current.b = b; }, [b]);
  useEffect(() => { paramsRef.current.stable = stable; }, [stable]);

  // Refs to sim buffers so UI handlers (Reset) can mutate them
  const headsRef = useRef(null);          // Float32Array (3*num)
  const trailsRef = useRef([]);           // Float32Array[] (per line)
  const posAttrsRef = useRef([]);         // THREE.BufferAttribute[]

  // Theme tracking for overlay style
  useEffect(() => {
    const computeTheme = () =>
      setIsDark(
        document.documentElement.classList.contains('dark') ||
          document.body.classList.contains('dark'),
      );
    computeTheme();
    const mo = new MutationObserver(computeTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  // One-time scene setup
  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;

    // --- renderer / scene / camera
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
    host.appendChild(renderer.domElement);
    // Make canvas fill and center inside host
    Object.assign(renderer.domElement.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
    });

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    camera.position.set(0, 0, 30);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;

    const group = new THREE.Group();
    scene.add(group);

    // --- particles / trails
    const num = 35;
    const tail = 50;
    const heads = new Float32Array(3 * num);
    for (let i = 0; i < num; i++) {
      heads[3 * i + 0] = Math.random() * 2 - 1;
      heads[3 * i + 1] = Math.random() * 2 - 1;
      heads[3 * i + 2] = Math.random() * 2 - 1;
    }

    const trails = [];
    const posAttrs = [];
    for (let i = 0; i < num; i++) {
      const positions = new Float32Array(3 * tail);
      for (let k = 0; k < tail; k++) {
        positions[3 * k + 0] = heads[3 * i + 0];
        positions[3 * k + 1] = heads[3 * i + 1];
        positions[3 * k + 2] = heads[3 * i + 2];
      }
      const geom = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(positions, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geom.setAttribute('position', attr);

      const color = new THREE.Color();
      color.setHSL(i / num, 0.85, 0.55);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
      const line = new THREE.Line(geom, mat);
      line.frustumCulled = false;
      group.add(line);

      trails.push(positions);
      posAttrs.push(attr);
    }

    // Expose to UI
    headsRef.current = heads;
    trailsRef.current = trails;
    posAttrsRef.current = posAttrs;

    // --- responsive sizes
    function resize() {
      const r = host.getBoundingClientRect();
      const width = Math.max(320, Math.floor(r.width));
      const height = Math.max(560, Math.floor(r.height));
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // --- integrator
    const t_end = 50.0;
    const pts = 800;
    const dtBase = t_end / pts;

    function rk4Step(x, y, z, dt, a, b) {
      const k1 = deriv(x, y, z, a, b);
      const k2 = deriv(x + 0.5 * dt * k1[0], y + 0.5 * dt * k1[1], z + 0.5 * dt * k1[2], a, b);
      const k3 = deriv(x + 0.5 * dt * k2[0], y + 0.5 * dt * k2[1], z + 0.5 * dt * k2[2], a, b);
      const k4 = deriv(x + dt * k3[0], y + dt * k3[1], z + dt * k3[2], a, b);
      x += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      y += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      z += (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
      return [x, y, z];
    }

    let raf = 0;
    function loop() {
      const { a, b, stable } = paramsRef.current;
      const sub = stable ? 6 : 1;
      const CAP = stable ? 2000 : 5000;
      const CLIP = stable ? 5000 : 10000;
      const dt = dtBase;

      for (let i = 0; i < heads.length / 3; i++) {
        let x = heads[3 * i + 0], y = heads[3 * i + 1], z = heads[3 * i + 2];
        const ldt = dt / sub;
        for (let s = 0; s < sub; s++) {
          [x, y, z] = rk4Step(x, y, z, ldt, a, b);
          [x, y, z] = clampCap(x, y, z, CLIP, CAP);
        }
        heads[3 * i + 0] = x; heads[3 * i + 1] = y; heads[3 * i + 2] = z;

        const buf = trails[i];
        buf.copyWithin(3, 0, (tail - 1) * 3);
        buf[0] = x; buf[1] = y; buf[2] = z;
        posAttrs[i].needsUpdate = true;
      }

      group.rotation.y += 0.2 * dtBase;
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    // cleanup
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      group.traverse(obj => {
        if (obj.isLine) {
          obj.geometry?.dispose?.();
          obj.material?.dispose?.();
        }
      });
      renderer.dispose();
      host.removeChild(renderer.domElement);
      headsRef.current = null;
      trailsRef.current = [];
      posAttrsRef.current = [];
    };
  }, []);

  // --- Reset handler: reseed heads and refill trails
  function resetSim() {
    const heads = headsRef.current;
    const trails = trailsRef.current;
    const posAttrs = posAttrsRef.current;
    if (!heads || !trails || !posAttrs) return;
    for (let i = 0; i < heads.length / 3; i++) {
      const x = Math.random() * 2 - 1;
      const y = Math.random() * 2 - 1;
      const z = Math.random() * 2 - 1;
      heads[3 * i + 0] = x; heads[3 * i + 1] = y; heads[3 * i + 2] = z;
      const buf = trails[i];
      for (let k = 0; k < buf.length; k += 3) { buf[k] = x; buf[k + 1] = y; buf[k + 2] = z; }
      if (posAttrs[i]) posAttrs[i].needsUpdate = true;
    }
  }

  return (
    <div className="w-full flex justify-center">
      <div className="w-full flex justify-center">
        <div className="relative w-full rounded-2xl shadow-lg overflow-hidden bg-transparent">
          {/* The host that defines aspect ratio & size */}
          <div ref={mountRef} className="relative w-full aspect-[1/1] md:aspect-[16/9] min-h-[560px]" />

          {/* Controls overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4 pointer-events-none">
            <div className={`pointer-events-auto backdrop-blur-sm rounded-xl px-3 py-2 md:px-4 md:py-3 border ${isDark ? 'bg-black/30 border-white/10' : 'bg-white/50 border-black/10'}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                <label className="flex items-center gap-3">
                  <span className="text-xs md:text-sm whitespace-nowrap opacity-80">alpha</span>
                  <input type="range" min={0} max={1.5} step={0.001} value={a} onChange={(e) => setA(parseFloat(e.target.value))} className="w-full accent-blue-500" />
                  <span className="text-xs tabular-nums w-16 text-right">{a.toFixed(3)}</span>
                </label>
                <label className="flex items-center gap-3">
                  <span className="text-xs md:text-sm whitespace-nowrap opacity-80">beta</span>
                  <input type="range" min={0} max={1.5} step={0.001} value={b} onChange={(e) => setB(parseFloat(e.target.value))} className="w-full accent-fuchsia-500" />
                  <span className="text-xs tabular-nums w-16 text-right">{b.toFixed(3)}</span>
                </label>

                <div className="flex items-center gap-3 md:col-span-2 flex-wrap">
                  <button onClick={() => setStable((s) => !s)} className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${stable ? (isDark ? 'bg-emerald-600/30 border-emerald-500/40' : 'bg-emerald-500/20 border-emerald-600/40') : (isDark ? 'bg-zinc-800/50 border-white/10' : 'bg-zinc-200/60 border-black/10')}`}>
                    Stable: {stable ? 'ON' : 'OFF'}
                  </button>
                  <button onClick={resetSim} className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${isDark ? 'bg-blue-600/30 border-blue-400/40' : 'bg-blue-500/15 border-blue-600/40'}`}>
                    Reset
                  </button>
                  <span className="text-[10px] opacity-70">Adds sub-steps & softer caps for smoother paths</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
