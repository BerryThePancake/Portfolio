'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ===== settings you can tweak =====
const AUTO_RESET_MS = 20_000; // auto-reset interval (20s)
const EDGE_GUTTER_PX = 150;   // distance from each screen edge
const BORDER_PX = 12;         // border thickness
const BORDER_COLOR_LIGHT = '#E6C000';  // gold in light
const BORDER_COLOR_DARK  = '#BF00E6';  // purple in dark

// Line population
const INITIAL_LINES = 45;     // starting number of lines
const MAX_LINES = 200;        // hard cap to avoid overloading the GPU
const TAIL = 60;              // trail length per line
const SPAWN_MS = 3500;        // how often to try spawning new lines
const SPAWN_MIN = 1;          // spawn this many lines each tick (min)
const SPAWN_MAX = 3;          // spawn this many lines each tick (max)

// Zoom controls
const ZOOM_IN_SCALE = 0.9;   // < 1 moves camera closer
const ZOOM_OUT_SCALE = 1.1;  // > 1 moves camera farther

// Spawn levels (lines per click)
const SPAWN_COUNTS = { 1: 5, 2: 12, 3: 22 };

// ----- system ODE -----
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

// small helper: hex to rgba with alpha
function hexToRgba(hex, alpha = 1) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function MplSim() {
  const mountRef = useRef(null);

  // UI
  const [a, setA] = useState(0.5);
  const [b, setB] = useState(0.5);
  const [stable, setStable] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [autoSpawn, setAutoSpawn] = useState(true);
  const [spawnLevel, setSpawnLevel] = useState(1);

  // live params (no scene rebuilds on slider change)
  const paramsRef = useRef({ a: 0.5, b: 0.5, stable: false });
  useEffect(() => { paramsRef.current.a = a; }, [a]);
  useEffect(() => { paramsRef.current.b = b; }, [b]);
  useEffect(() => { paramsRef.current.stable = stable; }, [stable]);

  // sim refs (so Reset/Spawn can mutate on the fly)
  const headsRef = useRef([]);          // Array<THREE.Vector3>
  const trailsRef = useRef([]);         // Array<Float32Array>
  const posAttrsRef = useRef([]);       // Array<THREE.BufferAttribute>
  const linesRef = useRef([]);          // Array<THREE.Line>
  const groupRef = useRef(null);        // THREE.Group

  // refs to camera/controls to drive zoom buttons
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);

  // theme watch (for overlay + border color)
  useEffect(() => {
    const computeTheme = () =>
      setIsDark(
        document.documentElement.classList.contains('dark') ||
        document.body.classList.contains('dark')
      );
    computeTheme();
    const mo = new MutationObserver(computeTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  // one-time scene
  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;

    // renderer / scene / camera
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
    host.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block',
    });

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    camera.position.set(0, 0, 30);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.minDistance = 5;
    controls.maxDistance = 200;
    controlsRef.current = controls;

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    // helpers to create & dispose lines
    function makeLine(head) {
      const positions = new Float32Array(3 * TAIL);
      for (let k = 0; k < TAIL; k++) {
        positions[3 * k + 0] = head.x;
        positions[3 * k + 1] = head.y;
        positions[3 * k + 2] = head.z;
      }
      const geom = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(positions, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geom.setAttribute('position', attr);

      const hue = (linesRef.current.length % 360) / 360;
      const color = new THREE.Color().setHSL(hue, 0.85, 0.55);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
      const line = new THREE.Line(geom, mat);
      line.frustumCulled = false;

      group.add(line);
      linesRef.current.push(line);
      trailsRef.current.push(positions);
      posAttrsRef.current.push(attr);
      headsRef.current.push(head);
    }

    function disposeOldest(n = 1) {
      for (let i = 0; i < n; i++) {
        if (linesRef.current.length === 0) return;
        const line = linesRef.current.shift();
        const attr = posAttrsRef.current.shift();
        trailsRef.current.shift();
        const head = headsRef.current.shift(); // eslint-disable-line @typescript-eslint/no-unused-vars
        if (line) {
          group.remove(line);
          line.geometry?.dispose?.();
          line.material?.dispose?.();
        }
        attr?.array && (attr.array = null);
      }
    }

    function randomHead() {
      return new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    }

    // seed initial lines
    for (let i = 0; i < INITIAL_LINES; i++) makeLine(randomHead());

    // size to host
    function resize() {
      const r = host.getBoundingClientRect();
      const width  = Math.max(320, Math.floor(r.width));
      const height = Math.max(560, Math.floor(r.height));
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    window.addEventListener('resize', resize);
    resize();

    // integrator
    const t_end = 50.0, pts = 800;
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
      const sub  = stable ? 6 : 1;
      const CAP  = stable ? 2000 : 5000;
      const CLIP = stable ? 5000 : 10000;
      const dt   = dtBase;

      for (let i = 0; i < headsRef.current.length; i++) {
        const v = headsRef.current[i];
        let x = v.x, y = v.y, z = v.z;
        const ldt = dt / sub;
        for (let s = 0; s < sub; s++) {
          [x, y, z] = rk4Step(x, y, z, ldt, a, b);
          [x, y, z] = clampCap(x, y, z, CLIP, CAP);
        }
        v.set(x, y, z);

        const buf = trailsRef.current[i];
        buf.copyWithin(3, 0, (buf.length - 3));
        buf[0] = x; buf[1] = y; buf[2] = z;
        posAttrsRef.current[i].needsUpdate = true;
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
      window.removeEventListener('resize', resize);
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
      headsRef.current = [];
      trailsRef.current = [];
      posAttrsRef.current = [];
      linesRef.current = [];
      cameraRef.current = null;
      controlsRef.current = null;
      groupRef.current = null;
    };
  }, []);

  // Spawning logic (periodic, bursty)
  const spawnLines = useCallback((count) => {
    const group = groupRef.current;
    if (!group) return;
    const current = linesRef.current.length;
    const canAdd = Math.max(0, MAX_LINES - current);
    const n = Math.min(count, canAdd);
    for (let i = 0; i < n; i++) {
      const head = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      // makeLine uses closures in the scene effect; re-implement here in-place:
      const positions = new Float32Array(3 * TAIL);
      for (let k = 0; k < TAIL; k++) {
        positions[3 * k + 0] = head.x;
        positions[3 * k + 1] = head.y;
        positions[3 * k + 2] = head.z;
      }
      const geom = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(positions, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geom.setAttribute('position', attr);

      const hue = (linesRef.current.length % 360) / 360;
      const color = new THREE.Color().setHSL(hue, 0.85, 0.55);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
      const line = new THREE.Line(geom, mat);
      line.frustumCulled = false;

      group.add(line);
      linesRef.current.push(line);
      trailsRef.current.push(positions);
      posAttrsRef.current.push(attr);
      headsRef.current.push(head);
    }
  }, []);

  useEffect(() => {
    if (!autoSpawn) return; // disabled
    const id = setInterval(() => {
      const burst = Math.floor(Math.random() * (SPAWN_MAX - SPAWN_MIN + 1)) + SPAWN_MIN;
      spawnLines(burst);
    }, SPAWN_MS);
    return () => clearInterval(id);
  }, [autoSpawn, spawnLines]);

  // helpers for zoom + fit
  const applyZoom = useCallback((scale) => {
    const cam = cameraRef.current;
    const ctr = controlsRef.current;
    if (!cam || !ctr) return;
    const dir = cam.position.clone().sub(ctr.target);
    const dist = dir.length();
    const minD = ctr.minDistance ?? 0.1;
    const maxD = ctr.maxDistance ?? 1e6;
    const newDist = THREE.MathUtils.clamp(dist * scale, minD, maxD);
    dir.setLength(newDist);
    cam.position.copy(ctr.target).add(dir);
    cam.updateProjectionMatrix();
    ctr.update();
  }, []);

  const fitView = useCallback((padding = 1.25) => {
    const group = groupRef.current;
    const cam = cameraRef.current;
    const ctr = controlsRef.current;
    if (!group || !cam || !ctr) return;
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z) || 1;
    const halfFov = (cam.fov * Math.PI) / 180 / 2;
    const distance = (maxSize * padding) / Math.tan(halfFov);
    const dir = cam.position.clone().sub(ctr.target).normalize();
    cam.position.copy(center.clone().add(dir.multiplyScalar(distance)));
    ctr.target.copy(center);
    cam.updateProjectionMatrix();
    ctr.update();
  }, []);

  const zoomIn = useCallback(() => applyZoom(ZOOM_IN_SCALE), [applyZoom]);
  const zoomOut = useCallback(() => applyZoom(ZOOM_OUT_SCALE), [applyZoom]);

  // Reset: reseed particles & refill trails
  const resetSim = useCallback(() => {
    for (let i = 0; i < headsRef.current.length; i++) {
      const x = Math.random() * 2 - 1;
      const y = Math.random() * 2 - 1;
      const z = Math.random() * 2 - 1;
      const v = headsRef.current[i];
      v.set(x, y, z);
      const buf = trailsRef.current[i];
      for (let k = 0; k < buf.length; k += 3) { buf[k] = x; buf[k + 1] = y; buf[k + 2] = z; }
      posAttrsRef.current[i].needsUpdate = true;
    }
  }, []);

  // Auto-reset timer
  useEffect(() => {
    const id = setInterval(() => resetSim(), AUTO_RESET_MS);
    return () => clearInterval(id);
  }, [resetSim]);

  const borderColor = isDark ? BORDER_COLOR_DARK : BORDER_COLOR_LIGHT;
  const accentHex = isDark ? '#BF00E6' : '#E6C000';
  const glowSoft = isDark ? 'rgba(191,0,230,0.45)' : 'rgba(230,192,0,0.45)';

  return (
    // Escape page container, then apply a 150px gutter on both sides
    <section className="relative w-screen mx-[calc(50%-50vw)]">
      <div
        className="relative mx-[150px]"
        style={{ marginLeft: EDGE_GUTTER_PX, marginRight: EDGE_GUTTER_PX }}
      >
        {/* Transparent box with THICC border */}
        <div
          className="relative overflow-hidden rounded-2xl bg-transparent shadow-[0_10px_40px_rgba(0,0,0,0.35)]"
          style={{
            borderStyle: 'solid',
            borderWidth: BORDER_PX,
            borderColor,
            boxShadow: `0 10px 40px rgba(0,0,0,0.35), 0 0 24px ${accentHex}, 0 0 70px ${glowSoft}`,
          }}
        >
          {/* Big host inside the bordered box */}
          <div
            ref={mountRef}
            className="relative w-full h-[82vh] md:h-[86vh] lg:h-[88vh] min-h-[560px]"
          />

          {/* Controls overlay (Dynamic Island 2.0) */}
          <div className="absolute bottom-4 md:bottom-5 left-0 right-0 px-3 md:px-6 pb-4 md:pb-6 pointer-events-none">
            <div className="w-full flex justify-center">
              <div
                className="pointer-events-auto rounded-full border px-5 py-2.5 md:px-6 md:py-3"
                style={{
                  background: isDark
                    ? 'linear-gradient(180deg, rgba(14,14,14,.88), rgba(14,14,14,.65))'
                    : 'linear-gradient(180deg, rgba(255,255,255,.70), rgba(255,255,255,.55))',
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                  backdropFilter: 'blur(10px)',
                  boxShadow: `0 0 0 1px ${isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.08)'}, 0 8px 40px rgba(0,0,0,.35), 0 0 25px ${isDark ? 'rgba(191,0,230,.35)' : 'rgba(230,192,0,.35)'}`,
                }}
              >
                <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[1fr_auto_1fr] xl:items-center xl:gap-5 w-[min(92vw,1120px)]">
                  {/* ALPHA */}
                  <label className="flex items-center gap-3 min-w-0">
                    <span className="text-xs md:text-sm whitespace-nowrap opacity-80">alpha</span>
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.001}
                      value={a}
                      onChange={(e) => setA(parseFloat(e.target.value))}
                      className="w-full"
                      style={{ accentColor: accentHex }}
                    />
                    <span className="text-xs tabular-nums w-16 text-right">{a.toFixed(3)}</span>
                  </label>

                  {/* CENTER ACTIONS */}
                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                    {/* STABLE toggle */}
                    <button
                      onClick={() => setStable((s) => !s)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                        stable
                          ? isDark
                            ? 'bg-emerald-600/30 border-emerald-500/40'
                            : 'bg-emerald-500/20 border-emerald-600/40'
                          : isDark
                          ? 'bg-zinc-800/50 border-white/10'
                          : 'bg-zinc-200/60 border-black/10'
                      }`}
                      title="Numerical damping & caps to avoid explosions"
                    >
                      Stable: {stable ? 'ON' : 'OFF'}
                    </button>

                    {/* RESET */}
                    <button
                      onClick={resetSim}
                      className="text-xs font-medium px-3 py-1.5 rounded-full border transition"
                      style={{
                        backgroundColor: isDark ? hexToRgba(accentHex, 0.3) : hexToRgba(accentHex, 0.1),
                        borderColor: hexToRgba(accentHex, 0.6),
                        color: isDark ? '#fff' : '#1a001f',
                      }}
                      title="Reseed all lines"
                    >
                      Reset
                    </button>

                    {/* SPAWN LEVEL CLUSTER */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setSpawnLevel((l) => Math.max(1, l - 1))}
                        className="h-7 w-7 md:h-8 md:w-8 rounded-full border border-white/15 bg-black/30 text-white backdrop-blur-sm flex items-center justify-center shadow hover:opacity-95 active:scale-95 transition"
                        title="Lower spawn level"
                      >
                        −
                      </button>
                      <button
                        onClick={() => spawnLines(SPAWN_COUNTS[spawnLevel])}
                        className="text-xs font-medium px-3 py-1.5 rounded-full border transition"
                        style={{
                          backgroundColor: isDark ? hexToRgba('#10b981', 0.25) : hexToRgba('#10b981', 0.12),
                          borderColor: hexToRgba('#10b981', 0.45),
                          color: isDark ? '#eafff5' : '#064e3b',
                        }}
                        title="Click to spawn a burst at the selected level"
                      >
                        {`Spawn: ${spawnLevel}`}
                      </button>
                      <button
                        onClick={() => setSpawnLevel((l) => Math.min(3, l + 1))}
                        className="h-7 w-7 md:h-8 md:w-8 rounded-full border border-white/15 bg-black/30 text-white backdrop-blur-sm flex items-center justify-center shadow hover:opacity-95 active:scale-95 transition"
                        title="Raise spawn level"
                      >
                        +
                      </button>
                    </div>

                    {/* AUTO TOGGLE */}
                    <button
                      onClick={() => setAutoSpawn(v => !v)}
                      className="text-xs font-medium px-3 py-1.5 rounded-full border transition"
                      style={{
                        backgroundColor: autoSpawn ? hexToRgba(accentHex, 0.25) : 'transparent',
                        borderColor: hexToRgba(accentHex, 0.6),
                        color: isDark ? '#fff' : '#1a001f',
                      }}
                      title="Toggle periodic spawning"
                    >
                      Auto: {autoSpawn ? 'ON' : 'OFF'}
                    </button>

                    <div className="hidden xl:block h-6 w-px bg-white/10 mx-1" />

                    {/* ZOOM / FIT */}
                    <div className="flex items-center gap-1.5">
                      <button
                        aria-label="Zoom in"
                        onClick={zoomIn}
                        className="h-8 w-8 md:h-9 md:w-9 rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-sm flex items-center justify-center shadow hover:opacity-95 active:scale-95 transition"
                        title="Zoom in"
                      >
                        +
                      </button>
                      <button
                        aria-label="Zoom out"
                        onClick={zoomOut}
                        className="h-8 w-8 md:h-9 md:w-9 rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-sm flex items-center justify-center shadow hover:opacity-95 active:scale-95 transition"
                        title="Zoom out"
                      >
                        −
                      </button>
                      <button
                        aria-label="Fit view"
                        onClick={() => fitView(1.3)}
                        className="h-9 px-3 rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-sm flex items-center justify-center shadow hover:opacity-95 active:scale-95 transition"
                        title="Frame all lines"
                      >
                        Fit
                      </button>
                    </div>
                  </div>

                  {/* BETA */}
                  <label className="flex items-center gap-3 min-w-0">
                    <span className="text-xs md:text-sm whitespace-nowrap opacity-80">beta</span>
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.001}
                      value={b}
                      onChange={(e) => setB(parseFloat(e.target.value))}
                      className="w-full accent-[#E6C000]"
                    />
                    <span className="text-xs tabular-nums w-16 text-right">{b.toFixed(3)}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          {/* /controls */}
        </div>
      </div>
    </section>
  );
}
