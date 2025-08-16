'use client'

import dynamic from 'next/dynamic';

// Run the sim only on the client
const MplSim = dynamic(() => import('../../components/MplSim'), { ssr: false });

export default function ProjectsPage() {
  return (
    <main className="p-6 min-h-[80vh] space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Projects</h1>
        <p className="opacity-80 text-sm">
          A selection of interactive and technical work. The 3D simulation below is rendered with three.js (WebGL) in your browser.
        </p>
      </header>

      <section id="three-sim" className="space-y-3">
        <h2 className="text-2xl font-semibold">Interactive 3D Attractor</h2>
        <p className="opacity-80 text-sm">Leipnik–Newton attractor with alpha/beta sliders and a stability toggle.</p>
        <div className="rounded-2xl border border-default-200 p-2 bg-black/50">
          <MplSim />
        </div>
      </section>
    </main>
  );
}
