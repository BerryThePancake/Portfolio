'use client'

import dynamic from 'next/dynamic'

// Load the heavy sim on the client only
const MplSim = dynamic(() => import('../../components/MplSim'), { ssr: false })

export default function ProjectsPage() {
  return (
    <main className="min-h-[80vh]">
      <header className="max-w-2xl mx-auto px-6 py-10 text-center space-y-2">
        <h1 className="text-3xl font-semibold">Projects</h1>
        <p className="opacity-80 text-sm">
          A selection of interactive and technical work. The 3D simulation below is rendered with three.js (WebGL) in your browser.
        </p>
      </header>

      <section id="three-sim" className="space-y-3">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-semibold">Interactive 3D Attractor</h2>
          <p className="opacity-80 text-sm">
            Leipnik–Newton attractor with alpha/beta sliders, a stability toggle, and a reset.
          </p>
        </div>

        {/* Full-bleed section is handled inside the component */}
        <MplSim />
      </section>
    </main>
  )
}
