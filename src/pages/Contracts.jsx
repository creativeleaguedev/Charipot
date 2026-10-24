import React, { useState } from "react";
import { Link } from "react-router-dom";
import { LOTTERY_SOURCE, ESCROW_SOURCE } from "@/lib/contractSources";
import { ShieldCheck, FileCode2, Lock, Coins, ArrowLeft, ChevronDown } from "lucide-react";

// Public, auditable smart-contract reference page. Shows each contract's
// purpose, key guarantees, and its full Solidity source in a neon-styled dark
// code panel. Linked from the Play page so players can verify the draw and
// escrow logic before buying.
export default function Contracts() {
  const [open, setOpen] = useState({ lottery: true, escrow: false });

  const contracts = [
    {
      key: "lottery",
      name: "Chari.sol",
      title: "Chari — 5/39 Charity Draw",
      source: LOTTERY_SOURCE,
      accent: "neon-gold",
      icon: Coins,
    },
    {
      key: "escrow",
      name: "GovMarketplaceEscrow.sol",
      title: "GOV P2P Marketplace — Escrow",
      source: ESCROW_SOURCE,
      accent: "neon-navy",
      icon: Lock,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-navy-gradient p-6 text-white shadow-xl">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-accent/20 px-3 py-1 text-xs font-semibold text-accent">
              <ShieldCheck className="h-3.5 w-3.5" /> Transparent & Verifiable
            </div>
            <h1 className="mt-3 text-2xl font-bold">Smart Contracts</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/75">
              The charity draw and GOV marketplace are governed by auditable Solidity contracts. Review the full source below.
            </p>
          </div>
          <Link to="/play" className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur hover:bg-white/20 btn-lantern">
            <ArrowLeft className="h-4 w-4" /> Back to Play
          </Link>
        </div>
      </div>

      {contracts.map((c) => {
        const Icon = c.icon;
        const isOpen = open[c.key];
        return (
          <div key={c.key} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <button
              onClick={() => setOpen((o) => ({ ...o, [c.key]: !o[c.key] }))}
              className={`flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-muted/40 ${isOpen ? "border-b border-border" : ""} btn-lantern`}
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-navy-gradient text-accent ${c.accent}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold leading-tight">{c.title}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground"><FileCode2 className="h-3 w-3" /> {c.name}</p>
                </div>
              </div>
              <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>

            <div className="p-5">
              {isOpen && (
                <div className="mt-4 overflow-hidden rounded-xl border border-border bg-[#0b1020] shadow-[inset_0_0_0_1px_rgba(99,102,241,0.25),0_0_30px_rgba(56,189,248,0.15)]">
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
                    <span className="flex items-center gap-1.5 font-mono text-[11px] text-sky-300"><FileCode2 className="h-3.5 w-3.5" /> Solidity 0.8.x · MIT</span>
                    <span className="flex items-center gap-1 text-[11px] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" /> auditable source</span>
                  </div>
                  <pre className="max-h-[460px] overflow-auto p-4 font-mono text-[11.5px] leading-relaxed text-sky-100/90">
                    <code>{c.source}</code>
                  </pre>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}