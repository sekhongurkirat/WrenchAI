"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAKES, getModels, REPAIR_TYPES } from "@/lib/vehicles";

const YEARS = Array.from({ length: 30 }, (_, i) => String(new Date().getFullYear() - i));

const selectCls =
  "w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3.5 text-sm text-white appearance-none focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-40";

export default function Home() {
  const router = useRouter();
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [repairType, setRepairType] = useState("");
  const [error, setError] = useState("");

  const models = getModels(make);

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!year || !make || !model) { setError("Select your vehicle year, make, and model."); return; }
    if (!repairType) { setError("Select a repair type."); return; }
    const params = new URLSearchParams({ year, make, model, repairType });
    router.push(`/repair?${params}`);
  };

  return (
    <main className="min-h-dvh bg-zinc-950 text-white flex flex-col">
      {/* Hero */}
      <div className="flex flex-col items-center pt-12 pb-6 px-6 text-center">
        <div className="text-5xl mb-3">🔧</div>
        <h1 className="text-3xl font-bold tracking-tight">WrenchAI</h1>
        <p className="mt-1.5 text-zinc-400 text-sm max-w-xs">
          AI-guided repairs. Point your phone at your car and follow the overlay.
        </p>
      </div>

      <form onSubmit={handleStart} className="flex-1 flex flex-col px-5 max-w-lg mx-auto w-full gap-5">
        {/* Vehicle selectors */}
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Your Vehicle</p>
          <div className="grid grid-cols-3 gap-2">
            {/* Year */}
            <div className="relative">
              <select
                value={year}
                onChange={(e) => { setYear(e.target.value); setError(""); }}
                className={selectCls}
              >
                <option value="">Year</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">▼</span>
            </div>

            {/* Make */}
            <div className="relative">
              <select
                value={make}
                onChange={(e) => { setMake(e.target.value); setModel(""); setError(""); }}
                className={selectCls}
              >
                <option value="">Make</option>
                {MAKES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">▼</span>
            </div>

            {/* Model */}
            <div className="relative">
              <select
                value={model}
                onChange={(e) => { setModel(e.target.value); setError(""); }}
                disabled={!make}
                className={selectCls}
              >
                <option value="">Model</option>
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">▼</span>
            </div>
          </div>
        </div>

        {/* Repair type grid */}
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">What do you need to fix?</p>
          <div className="grid grid-cols-2 gap-2">
            {REPAIR_TYPES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setRepairType(r.id); setError(""); }}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left transition-all active:scale-95 ${
                  repairType === r.id
                    ? "bg-orange-500/15 border-orange-500 text-orange-400"
                    : "bg-zinc-800/60 border-zinc-700 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                <span className="text-xl shrink-0">{r.icon}</span>
                <span className="text-sm font-medium leading-tight">{r.label}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-red-400 text-sm -mt-2">{error}</p>}

        <button
          type="submit"
          className="w-full bg-orange-500 hover:bg-orange-400 text-white font-bold py-4 rounded-2xl text-base transition-colors active:scale-95 mt-auto mb-8"
        >
          Start AR Repair →
        </button>
      </form>
    </main>
  );
}
