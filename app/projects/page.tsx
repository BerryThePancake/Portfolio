"use client";
import dynamic from "next/dynamic";

// Use dynamic import with ssr:false so the Pyodide/DOM code only runs in the browser
const MplSim = dynamic(() => import("../../components/MplSim"), { ssr: false });

export default function ProjectsPage() {
  return (
    <main className="p-6 min-h-[80vh] space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Projects</h1>
        <p className="opacity-80 text-sm">A selection of interactive and technical work. The Python simulation below runs entirely in your browser via Pyodide.</p>
      </header>

      {/* --- Python Simulation Project --- */}
      <section id="python-sim" className="space-y-3">
        <h2 className="text-2xl font-semibold">Interactive Python Simulation</h2>
        <p className="opacity-80 text-sm">
          Leipnik–Newton attractor with sliders and stability toggle (Matplotlib + Pyodide). No server required.
        </p>
        <div className="rounded-2xl border border-default-200 p-2 bg-black/50">
          <MplSim />
        </div>
      </section>

      {/* You can add more project sections below */}
    </main>
  );
}