"use client";
import MplSim from "../../components/MplSim"; // or "@/components/MplSim" if you use the @ alias

export default function SimMplPage() {
  return (
    <main className="p-6 min-h-[80vh]">
      <h1 className="text-2xl font-semibold mb-4">Leipnik–Newton (Matplotlib in the browser)</h1>
      <MplSim />
    </main>
  );
}