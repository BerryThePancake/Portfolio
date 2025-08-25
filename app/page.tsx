'use client';

import { title, subtitle } from "@/components/primitives";
import { useState, useRef, useEffect } from "react";
import { motion, type Transition } from "framer-motion";


// --- Local ShinyText (inlined to avoid missing import)
// Shows normal text at all times and overlays a moving highlight on hover
// so the title never disappears.
type ShinyTextProps = { text: string; disabled?: boolean; speed?: number; className?: string };
function ShinyText({ text, disabled = false, speed = 2.5, className = "" }: ShinyTextProps) {
  return (
    <span className={`relative inline-block ${className}`} style={{ ["--shine-speed" as any]: `${speed}s` }}>
      {/* Base text stays visible */}
      <span className={`base ${disabled ? "" : "glow"}`}>{text}</span>
      {/* Overlay highlight that animates right→left */}
      <span className={`shine ${disabled ? "paused" : ""}`} aria-hidden="true">
        {text}
      </span>
      <style jsx>{`
        .base { position: relative; z-index: 0; }
        .base.glow { text-shadow: 0 0 12px rgba(255,255,255,0.18), 0 0 24px rgba(255,255,255,0.12); }
        .shine {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background: linear-gradient(
            90deg,
            transparent 0%,
            transparent 46%,
            rgba(255,255,255,0) 47%,
            rgba(255,255,255,1) 50%,
            rgba(255,255,255,0) 53%,
            transparent 54%,
            transparent 100%
          ),
          linear-gradient(
            90deg,
            transparent 0%,
            transparent 40%,
            rgba(255,255,255,0.35) 50%,
            transparent 60%,
            transparent 100%
          );
          background-size: 260% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter: drop-shadow(0 0 10px rgba(255,255,255,0.25));
          animation: shine var(--shine-speed, 2.5s) linear infinite reverse;
          transition: opacity 0.2s ease;
          opacity: 1;
        }
        .shine.paused { animation-play-state: paused; opacity: 0; }
        @keyframes shine {
          from { background-position: -200% 0; }
          to { background-position: 200% 0; }
        }
        @media (prefers-reduced-motion: reduce) { .shine { animation: none; } }
      `}</style>
    </span>
  );
}


// --- LetterGlitch component (hover-activated canvas bg) ---
function LetterGlitch({
  glitchColors = ["#2b4539", "#61dca3", "#61b3dc"],
  glitchSpeed = 50,
  centerVignette = false,
  outerVignette = true,
  paused = false,
}: {
  glitchColors?: string[];
  glitchSpeed?: number;
  centerVignette?: boolean;
  outerVignette?: boolean;
  paused?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const letters = useRef<{ char: string; color: string }[]>([]);
  const grid = useRef({ columns: 0, rows: 0 });
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastGlitch = useRef<number>(Date.now());

  const fontSize = 16;
  const charWidth = 10;
  const charHeight = 20;

  const chars = [
    "A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","!","@","#","$","&","*","(",")","-","_","+","=","/","[","]","{","}",";",":","<",">",",","0","1","2","3","4","5","6","7","8","9",
  ];

  const randChar = () => chars[Math.floor(Math.random() * chars.length)];
  const randColor = () => glitchColors[Math.floor(Math.random() * glitchColors.length)];

  const calcGrid = (w: number, h: number) => ({ columns: Math.ceil(w / charWidth), rows: Math.ceil(h / charHeight) });

  const initLetters = (c: number, r: number) => {
    grid.current = { columns: c, rows: r };
    const total = c * r;
    letters.current = Array.from({ length: total }, () => ({ char: randChar(), color: randColor() }));
  };

  const resize = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const parent = canvas.parentElement; if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = parent.getBoundingClientRect();
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
    if (ctxRef.current) ctxRef.current.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { columns, rows } = calcGrid(rect.width, rect.height);
    initLetters(columns, rows);
    draw();
  };

  const draw = () => {
    const ctx = ctxRef.current; const canvas = canvasRef.current; if (!ctx || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.font = `${fontSize}px monospace`;
    ctx.textBaseline = "top";
    letters.current.forEach((l, idx) => {
      const x = (idx % grid.current.columns) * charWidth;
      const y = Math.floor(idx / grid.current.columns) * charHeight;
      ctx.fillStyle = l.color;
      ctx.fillText(l.char, x, y);
    });
  };

  const tick = () => {
    const now = Date.now();
    if (now - lastGlitch.current >= glitchSpeed) {
      const count = Math.max(1, Math.floor(letters.current.length * 0.05));
      for (let i = 0; i < count; i++) {
        const index = Math.floor(Math.random() * letters.current.length);
        const item = letters.current[index]; if (item) { item.char = randChar(); item.color = randColor(); }
      }
      draw();
      lastGlitch.current = now;
    }
    animationRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    ctxRef.current = canvas.getContext("2d");
    resize();
    draw();

    let t: number | undefined;
    const onResize = () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        resize();
        tick();
      }, 100);
    };
    window.addEventListener("resize", onResize);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (!ctxRef.current) return;
    if (!paused) {
      animationRef.current = requestAnimationFrame(tick);
    } else {
      if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
    }
    return () => {
      if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
    };
  }, [paused, glitchSpeed]);

  const containerStyle: React.CSSProperties = { position: "relative", width: "100%", height: "100%", backgroundColor: "#000", overflow: "hidden" };
  const canvasStyle: React.CSSProperties = { display: "block", width: "100%", height: "100%" };
  const outerVignetteStyle: React.CSSProperties = { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", background: "radial-gradient(circle, rgba(0,0,0,0) 60%, rgba(0,0,0,1) 100%)" };
  const centerVignetteStyle: React.CSSProperties = { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", background: "radial-gradient(circle, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 60%)" };

  return (
    <div style={containerStyle}>
      <canvas ref={canvasRef} style={canvasStyle} />
      {outerVignette && <div style={outerVignetteStyle} />}
      {centerVignette && <div style={centerVignetteStyle} />}
    </div>
  );
}

// --- SplitText (scroll-in, per-character) ---
// Lightweight alternative to GSAP SplitText using IntersectionObserver + CSS transitions.
// Animates characters once when the element scrolls into view.
function SplitText({
  text,
  className = "",
  delay = 75,
  duration = 0.6,
  ease = "cubic-bezier(0.22,1,0.36,1)",
  threshold = 0.1,
  rootMargin = "-100px",
  textAlign = "center",
  waveLastEmoji = false,
}: {
  text: string;
  className?: string;
  delay?: number; // ms between letters
  duration?: number; // seconds per letter
  ease?: string | ((t: number) => number);
  threshold?: number;
  rootMargin?: string;
  textAlign?: React.CSSProperties["textAlign"]; 
  waveLastEmoji?: boolean;
}) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // build spans
    el.innerHTML = "";
    const chars = Array.from(text);
    const easing = typeof ease === "string" ? ease : "cubic-bezier(0.22,1,0.36,1)";
    chars.forEach((ch, i) => {
      const span = document.createElement("span");
      const isSpace = ch === " ";
      span.textContent = isSpace ? " " : ch; // preserve spaces visually
      span.style.display = "inline-block";
      span.style.transform = "translateY(40px)";
      span.style.opacity = "0";
      span.style.willChange = "transform, opacity";
      span.style.transition = `transform ${duration}s ${easing}, opacity ${duration}s ${easing}`;
      span.style.transitionDelay = `${(i * delay) / 1000}s`;
      el.appendChild(span);
    });

    // If requested, make the final 👋 rock in place after the SplitText reveal
    if (waveLastEmoji) {
      let last = chars.length - 1;
      while (last >= 0 && chars[last] === " ") last--;
      if (last >= 0 && chars[last] === "👋") {
        const hand = el.children[last] as HTMLElement | undefined;
        if (hand) {
          hand.style.transformOrigin = "70% 70%";
          const prefersReduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          const totalDelay = last * delay + duration * 1000; // wait until its slide-in finishes
          if (!prefersReduced && typeof (hand as any).animate === "function") {
            setTimeout(() => {
              const y = '-0.10em';
hand.style.willChange = 'transform';
(hand as any).animate(
  [
    { transform: `translateY(${y}) rotate(0deg)` },
    { transform: `translateY(${y}) rotate(12deg)` },
    { transform: `translateY(${y}) rotate(-6deg)` },
    { transform: `translateY(${y}) rotate(12deg)` },
    { transform: `translateY(${y}) rotate(-2deg)` },
    { transform: `translateY(${y}) rotate(8deg)` },
    { transform: `translateY(${y}) rotate(0deg)` }
  ],
  { duration: 1600, easing: "ease-in-out", iterations: Infinity, delay: 200 }
);
            }, totalDelay + 50);
          }
        }
      }
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            Array.from(el.children).forEach((node) => {
              const s = node as HTMLElement;
              s.style.transform = "translateY(0)";
              s.style.opacity = "1";
            });
            io.disconnect();
          }
        });
      },
      { threshold, rootMargin }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [text, delay, duration, ease, threshold, rootMargin]);

  return (
    <p
      ref={ref}
      className={`split-parent ${className}`}
      style={{ textAlign, overflow: "visible", display: "inline-block", whiteSpace: "normal", wordWrap: "break-word", padding: "0.15em 0.05em" }}
    >
      {text}
    </p>
  );
}

// --- BlurText (scroll-in blur/reveal; words or letters) ---
function buildKeyframes(
  from: Record<string, string | number>,
  steps: Array<Record<string, string | number>>
): Record<string, Array<string | number>> {
  const keys = new Set<string>([...Object.keys(from), ...steps.flatMap((s) => Object.keys(s))]);
  const keyframes: Record<string, Array<string | number>> = {};
  keys.forEach((k) => {
    keyframes[k] = [from[k], ...steps.map((s) => s[k])];
  });
  return keyframes;
}

function BlurText({
  text = "",
  delay = 200,
  className = "",
  animateBy = "words",
  direction = "top",
  threshold = 0.1,
  rootMargin = "0px",
  animationFrom,
  animationTo,
  easing = (t: number) => t,
  onAnimationComplete,
  stepDuration = 0.35,
}: {
  text?: string;
  delay?: number;
  className?: string;
  animateBy?: "words" | "letters";
  direction?: "top" | "bottom";
  threshold?: number;
  rootMargin?: string;
  animationFrom?: Record<string, string | number>;
  animationTo?: Array<Record<string, string | number>>;
  easing?: (t: number) => number | string;
  onAnimationComplete?: () => void;
  stepDuration?: number;
}) {
  const elements = animateBy === "words" ? text.split(" ") : text.split("");
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.unobserve(el);
        }
      },
      { threshold, rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  const defaultFrom = direction === "top"
    ? { filter: "blur(10px)", opacity: 0, y: -50 }
    : { filter: "blur(10px)", opacity: 0, y: 50 };

  const defaultTo = [
    { filter: "blur(5px)", opacity: 0.5, y: direction === "top" ? 5 : -5 },
    { filter: "blur(0px)", opacity: 1, y: 0 },
  ];

  const fromSnapshot = animationFrom ?? defaultFrom;
  const toSnapshots = animationTo ?? defaultTo;

  const stepCount = toSnapshots.length + 1;
  const totalDuration = stepDuration * (stepCount - 1);
  const times = Array.from({ length: stepCount }, (_, i) => (stepCount === 1 ? 0 : i / (stepCount - 1)));

  return (
    <p ref={ref} className={className} style={{ display: "flex", flexWrap: "wrap" }}>
      {elements.map((segment, index) => {
        const animateKeyframes = buildKeyframes(fromSnapshot, toSnapshots);
        const spanTransition: Transition = {
          duration: totalDuration,
          times,
          delay: (index * delay) / 1000,
          ease: easing as any,
        };
        return (
          <motion.span
            key={index}
            initial={fromSnapshot}
            animate={inView ? animateKeyframes : fromSnapshot}
            transition={spanTransition}
            onAnimationComplete={index === elements.length - 1 ? onAnimationComplete : undefined}
            style={{ display: "inline-block", willChange: "transform, filter, opacity" }}
          >
            {segment === " " ? " " : segment}
            {animateBy === "words" && index < elements.length - 1 && " "}
          </motion.span>
        );
      })}
    </p>
  );
}

// Simple data model so you can edit titles, descriptions, and tags quickly
// Replace the placeholder image area inside <ProjectCard/> with a real <Image/> later
// (e.g., using next/image) once you have your photos.

type Project = {
  title: string;
  description: string;
  tags: string[];
  glitchBg?: boolean; // animated background in image slot when true
};

const projects: Project[] = [
  {
    title: "Programming",
    glitchBg: true,
    description:
      "Comprehensive personal finance manager built with Next.js and TypeScript. Track spending, visualize trends, and get insights.",
    tags: ["#React", "#TypeScript", "#Tailwind", "#Next.js"],
  },
  {
    title: "Electronics",
    description:
      "A downloader that saves entire playlists locally. Desktop + web version with cloud hosting and an ASGI backend.",
    tags: ["#Python", "#Webscraping", "#Proxy/API"],
  },
  {
    title: "Mechanical",
    description:
      "API testing tool with import/export, samples, auth, and CORS-friendly proxy. Built for speed and persistence.",
    tags: ["#TypeScript", "#Tailwind CSS", "#Next.js"],
  },
];

function ProjectCard({ project }: { project: Project }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="group h-full rounded-3xl border border-black/10 bg-white/80 p-5 shadow-sm transition-transform duration-300 hover:scale-[1.03] hover:shadow-xl dark:border-white/10 dark:bg-neutral-900/70 md:p-6 cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image area */}
      <div className="relative h-44 w-full overflow-hidden rounded-xl bg-gradient-to-tr from-neutral-200 to-neutral-100 dark:from-neutral-800 dark:to-neutral-700">
        {project.glitchBg ? (
          <LetterGlitch glitchSpeed={50} outerVignette centerVignette={false} paused={!hovered} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs opacity-60">Image goes here</div>
        )}
      </div>

      <h3 className="mt-5 text-xl font-semibold tracking-tight">
        <ShinyText text={project.title} disabled={!hovered} speed={1.8} className="inline-block" />
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
        {project.description}
      </p>

      <div className="mt-4 border-t border-black/5 pt-3 dark:border-white/10">
        <div className="flex flex-wrap gap-2">
          {project.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <section className="flex flex-col items-center justify-center gap-10 py-8 md:py-12">
      {/* Hero */}
      <div className="inline-block max-w-xl justify-center text-center">
        <SplitText text="Howdy! I'm Austin👋" className={title()} delay={75} duration={0.6} waveLastEmoji />
        <br />
        <BlurText
          className={subtitle({ class: "mt-4" })}
          text={"I'm a student at Tarleton State University, pursuing a double major in Mechanical and Electrical Engineering. Beyond my passion for engineering, I'm a music lover, an avid traveler, and an aspiring chef."}
          animateBy="words"
          direction="bottom"
          delay={20}
          stepDuration={0.15}
        />
      </div>

      {/* Three-card grid */}
      <div className="w-full max-w-6xl px-4 md:px-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8 items-stretch">
          {projects.map((p, i) => (
            <ProjectCard key={i} project={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
