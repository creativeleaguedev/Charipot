import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/useWallet";
import { canAccessAdmin } from "@/lib/adminAccess";
import { fmtNum } from "@/lib/configRegistry";
import { ShieldCheck, Clock, History, Lock, ArrowUpRight, Scale, Trophy, Ticket, Users, Vote, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";

const CAT_META = {
  revenue_split: { label: "Ticket Revenue Split", icon: Scale, tint: "bg-primary/10 text-primary", bar: ["hsl(217 72% 28%)", "hsl(43 74% 50%)", "hsl(173 58% 39%)", "hsl(12 76% 61%)"] },
  prize_split: { label: "Prize Fund Split", icon: Trophy, tint: "bg-accent/15 text-accent-foreground", bar: ["hsl(43 74% 50%)", "hsl(217 72% 28%)", "hsl(173 58% 39%)", "hsl(12 76% 61%)"] },
  lottery: { label: "Lottery Parameters", icon: Ticket, tint: "bg-emerald-100 text-emerald-700", bar: [] },
  agent: { label: "Agent & Referral", icon: Users, tint: "bg-violet-100 text-violet-700", bar: [] },
  governance: { label: "Governance", icon: Vote, tint: "bg-sky-100 text-sky-700", bar: [] },
  project: { label: "Project Funding", icon: FolderKanban, tint: "bg-rose-100 text-rose-700", bar: [] },
};

export default function ConfigRegistry() {
  const { user, loading } = useWallet();
  const [params, setParams] = useState([]);
  const [pcrs, setPcrs] = useState([]);
  const [tab, setTab] = useState("current");

  useEffect(() => {
    if (!canAccessAdmin(user)) return;
    (async () => {
      const p = await base44.entities.ConfigParameter.list("key", 100);
      setParams(p);
      const pc = await base44.entities.PCR.list("-createdAt", 30);
      setPcrs(pc);
    })();
  }, [user]);

  // Restrict to admins only — regular users are redirected away.
  if (!loading && !canAccessAdmin(user)) return <Navigate to="/home" replace />;

  const grouped = {};
  params.forEach((p) => { (grouped[p.category] = grouped[p.category] || []).push(p); });

  const pending = pcrs.filter((p) => p.status === "SCHEDULED" || p.status === "VALIDATED");
  const history = pcrs.filter((p) => p.status === "EFFECTIVE" || p.status === "REJECTED");

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl bg-navy-gradient p-6 text-white shadow-md">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gold">
          <ShieldCheck className="h-3.5 w-3.5" /> Transparent & Auditable
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Configuration Registry</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/80">
          Every economic parameter is public, bounded, and auditable. No financial rule is hardcoded — all values are read live from this on-chain-aligned registry.
        </p>
      </div>

      {/* Stat strip */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><ShieldCheck className="h-5 w-5" /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active Parameters</p>
              <p className="text-xl font-bold text-foreground">{fmtNum(params.length)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Clock className="h-5 w-5" /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending Changes</p>
              <p className="text-xl font-bold text-foreground">{fmtNum(pending.length)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {[["current", "Current Values", ShieldCheck], ["pending", "Pending Changes", Clock], ["history", "Change History", History]].map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors", tab === k ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icon className="h-4 w-4" />
            {label}
            {k === "pending" && pending.length > 0 && <span className="rounded-full bg-accent px-2 text-xs font-bold text-primary-foreground">{pending.length}</span>}
          </button>
        ))}
      </div>

      {/* Current values */}
      {tab === "current" && (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, list]) => {
            const meta = CAT_META[cat] || { label: cat, icon: ShieldCheck, tint: "bg-muted text-muted-foreground", bar: [] };
            const Icon = meta.icon;
            return (
              <div key={cat} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-6 py-4">
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", meta.tint)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{meta.label}</h2>
                  <span className="ml-auto text-xs text-muted-foreground">{list.length} parameter{list.length === 1 ? "" : "s"}</span>
                </div>
                <div className="p-6">
                  {(cat === "revenue_split" || cat === "prize_split") && (
                    <div className="mb-4">
                      <div className="flex h-3 overflow-hidden rounded-full shadow-inner">
                        {list.map((p, i) => (
                          <div key={p.key} style={{ width: `${p.value}%`, backgroundColor: meta.bar[i % meta.bar.length] }} title={`${p.label}: ${p.value}%`} />
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        {list.map((p, i) => (
                          <span key={p.key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.bar[i % meta.bar.length] }} />
                            {p.label} · {p.value}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {list.map((p) => (
                      <div key={p.key} className="rounded-xl border border-border bg-background p-4 transition-shadow hover:shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{p.label}</p>
                          {p.highImpact && <Lock className="h-3.5 w-3.5 text-amber-500" />}
                        </div>
                        <p className="mt-1.5 text-2xl font-bold text-primary">{p.value}<span className="text-sm font-normal text-muted-foreground"> {p.unit}</span></p>
                        <p className="mt-1.5 text-xs text-muted-foreground">Bounds: {p.min}–{p.max} {p.unit}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pending changes */}
      {tab === "pending" && (
        <div className="space-y-4">
          {pending.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
              <Clock className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
              No pending parameter changes. All proposals are timelocked and auditable once submitted.
            </div>
          ) : pending.map((pcr) => (
            <div key={pcr.id} className="rounded-2xl border border-amber-300/60 bg-amber-50/70 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-foreground">{pcr.parameterLabel}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{pcr.oldValue} <ArrowUpRight className="inline h-3.5 w-3.5 text-amber-600" /> <span className="font-bold text-accent">{pcr.proposedValue}</span></p>
                  {pcr.justification && <p className="mt-1.5 text-sm italic text-amber-800">“{pcr.justification}”</p>}
                </div>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", pcr.status === "SCHEDULED" ? "bg-amber-200 text-amber-800" : "bg-blue-100 text-blue-700")}>{pcr.status}</span>
              </div>
              {pcr.effectiveAt && <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700"><Clock className="h-3.5 w-3.5" /> Effective {new Date(pcr.effectiveAt).toLocaleString()} · {pcr.timelockHours}h timelock</p>}
              <p className="mt-1 text-xs text-muted-foreground">Proposed by {pcr.proposerName} · {pcr.highImpact ? "High-impact (multisig required)" : "Standard change"}</p>
            </div>
          ))}
        </div>
      )}

      {/* History */}
      {tab === "history" && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">Change History</h2>
          <p className="mt-1 text-sm text-muted-foreground">Every finalized parameter change, with its rationale and effective date.</p>
          <div className="mt-4 space-y-2">
            {history.length === 0 ? (
              <p className="rounded-xl bg-muted/30 p-6 text-center text-sm text-muted-foreground">No historical changes recorded yet.</p>
            ) : history.map((pcr) => (
              <div key={pcr.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{pcr.parameterLabel}: {pcr.oldValue} → <span className="text-accent">{pcr.proposedValue}</span></p>
                  {pcr.justification && <p className="mt-0.5 text-xs text-muted-foreground">{pcr.justification}</p>}
                </div>
                <div className="text-right">
                  <span className={cn("rounded-full px-2 py-1 text-xs font-semibold", pcr.status === "EFFECTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>{pcr.status}</span>
                  {pcr.effectiveAt && <p className="mt-1 text-xs text-muted-foreground">{new Date(pcr.effectiveAt).toLocaleDateString()}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}