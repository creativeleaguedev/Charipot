import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { fmtUSD, fmtNum } from "@/lib/configRegistry";
import { useToast } from "@/components/ui/use-toast";
import { Landmark, Loader2, Trophy, Banknote, Check, Clock, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS = {
  DRAFT: { label: "Draft", tone: "bg-slate-200 text-slate-700" },
  ACTIVE: { label: "Active", tone: "bg-emerald-100 text-emerald-700" },
  VOTING_CLOSED: { label: "Voting Closed", tone: "bg-amber-100 text-amber-700" },
  ALLOCATION_CALCULATED: { label: "Allocation Calculated", tone: "bg-blue-100 text-blue-700" },
  ALLOCATION_APPROVED: { label: "Allocation Approved", tone: "bg-indigo-100 text-indigo-700" },
  FUNDING_IN_PROGRESS: { label: "Funding In Progress", tone: "bg-cyan-100 text-cyan-700" },
  COMPLETED: { label: "Completed", tone: "bg-emerald-100 text-emerald-700" },
  SUSPENDED: { label: "Suspended", tone: "bg-orange-100 text-orange-700" },
  CANCELLED: { label: "Cancelled", tone: "bg-red-100 text-red-700" },
};
const FUND_STATUS = {
  FULLY_FUNDED: "bg-emerald-100 text-emerald-700",
  PARTIALLY_FUNDED: "bg-amber-100 text-amber-700",
  NOT_FUNDED: "bg-red-100 text-red-700",
  PENDING: "bg-slate-100 text-slate-600",
};

// Rounds eligible for manual disbursement: allocation is locked or already underway.
const DISBURSABLE = ["ALLOCATION_APPROVED", "FUNDING_IN_PROGRESS"];

export default function FundingDisbursementPanel({ user }) {
  const { toast } = useToast();
  const [rounds, setRounds] = useState([]);
  const [itemsByRound, setItemsByRound] = useState({});
  const [projects, setProjects] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // roundId | `${roundId}:${projectId}` | `all:${roundId}`
  const [openRound, setOpenRound] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const rs = await base44.entities.FundingRound.list("-created_date", 50);
      setRounds(rs);
      const map = {};
      const projMap = {};
      for (const r of rs) {
        const items = await base44.entities.FundingRoundProject.filter({ fundingRoundId: r.id });
        // Rank by finalRank (if set), otherwise by liveVotes desc
        items.sort((a, b) => {
          const ra = a.finalRank || 0;
          const rb = b.finalRank || 0;
          if (ra && rb && ra !== rb) return ra - rb;
          if (ra && !rb) return -1;
          if (rb && !ra) return 1;
          return (b.liveVotes || 0) - (a.liveVotes || 0);
        });
        map[r.id] = items;
        // Hydrate the linked Project records so we can show disbursement status.
        const ids = [...new Set(items.map((it) => it.projectId))];
        for (const id of ids) {
          if (!projMap[id]) {
            try { projMap[id] = await base44.entities.Project.get(id); } catch { /* project may be deleted */ }
          }
        }
      }
      setItemsByRound(map);
      setProjects(projMap);
      // Auto-open the most recent disbursable round for convenience.
      if (!openRound) {
        const firstDisbursable = rs.find((r) => DISBURSABLE.includes(r.status));
        if (firstDisbursable) setOpenRound(firstDisbursable.id);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const log = (action, details, severity = "warning") =>
    base44.entities.AuditLog.create({
      actor: user?.full_name || "Treasury Admin", actorRole: "treasury_admin",
      action, entityType: "FundingRound", details,
      timestamp: new Date().toISOString(), severity,
    });

  const disburseProject = async (round, item) => {
    const alloc = Number(item.allocationAmount) || 0;
    if (alloc <= 0) {
      toast({ title: "Nothing to disburse", description: "This project has no allocated funding.", variant: "destructive" });
      return;
    }
    setBusy(`${round.id}:${item.projectId}`);
    try {
      const proj = projects[item.projectId];
      // Ledger disbursement: mark allocated + disbursed and move to funding in progress.
      await base44.entities.Project.update(item.projectId, {
        fundingAllocated: alloc,
        fundingDisbursed: alloc,
        status: "FUNDING_IN_PROGRESS",
      });
      await log("ROUND_DISBURSEMENT_EXECUTED",
        `Disbursed ${fmtUSD(alloc)} to ${proj?.name || item.projectName} (${item.clubName}) for round "${round.name}" — rank #${item.finalRank}.`);
      toast({ title: "Disbursement executed", description: `${fmtUSD(alloc)} → ${item.projectName}` });
      // Refresh just the touched project + round status if needed.
      setProjects((prev) => ({ ...prev, [item.projectId]: { ...proj, fundingAllocated: alloc, fundingDisbursed: alloc, status: "FUNDING_IN_PROGRESS" } }));
      if (round.status === "ALLOCATION_APPROVED") {
        await base44.entities.FundingRound.update(round.id, { status: "FUNDING_IN_PROGRESS" });
        await log("FUNDING_ROUND_STARTED", `Funding disbursement started for "${round.name}".`);
        setRounds((prev) => prev.map((r) => (r.id === round.id ? { ...r, status: "FUNDING_IN_PROGRESS" } : r)));
      }
    } catch (e) {
      toast({ title: "Disbursement failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const disburseAll = async (round) => {
    const items = (itemsByRound[round.id] || []).filter(
      (it) => it.fundingStatus === "FULLY_FUNDED" || it.fundingStatus === "PARTIALLY_FUNDED"
    );
    const pending = items.filter((it) => {
      const p = projects[it.projectId];
      return !p || (p.fundingDisbursed || 0) < (it.allocationAmount || 0) - 0.01;
    });
    if (pending.length === 0) {
      toast({ title: "Already fully disbursed", description: "All funded projects in this round have been disbursed." });
      return;
    }
    setBusy(`all:${round.id}`);
    try {
      for (const it of pending) {
        const alloc = Number(it.allocationAmount) || 0;
        await base44.entities.Project.update(it.projectId, {
          fundingAllocated: alloc,
          fundingDisbursed: alloc,
          status: "FUNDING_IN_PROGRESS",
        });
      }
      await log("ROUND_DISBURSEMENT_BULK",
        `Bulk disbursed ${fmtUSD(pending.reduce((s, it) => s + (it.allocationAmount || 0), 0))} across ${pending.length} project(s) for round "${round.name}".`);
      if (round.status === "ALLOCATION_APPROVED") {
        await base44.entities.FundingRound.update(round.id, { status: "FUNDING_IN_PROGRESS" });
        await log("FUNDING_ROUND_STARTED", `Funding disbursement started for "${round.name}".`);
      }
      toast({ title: "Bulk disbursement complete", description: `${pending.length} project(s) disbursed.` });
      await load();
    } catch (e) {
      toast({ title: "Bulk disbursement failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Landmark className="h-5 w-5 text-accent" />
        <h2 className="text-lg font-bold">Funding Disbursements</h2>
        <span className="text-xs text-muted-foreground">Ranked projects per round · manual disbursement trigger</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading rounds…</div>
      ) : rounds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">No funding rounds yet.</div>
      ) : (
        <div className="space-y-4">
          {rounds.map((r) => {
            const items = itemsByRound[r.id] || [];
            const st = STATUS[r.status] || STATUS.DRAFT;
            const canDisburse = DISBURSABLE.includes(r.status);
            const funded = items.filter((it) => it.fundingStatus === "FULLY_FUNDED" || it.fundingStatus === "PARTIALLY_FUNDED");
            const disbursedCount = funded.filter((it) => {
              const p = projects[it.projectId];
              return p && (p.fundingDisbursed || 0) >= (it.allocationAmount || 0) - 0.01;
            }).length;
            const allDisbursed = funded.length > 0 && disbursedCount === funded.length;
            const open = openRound === r.id;
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold">{r.name}</h3>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.tone)}>{st.label}</span>
                      {allDisbursed && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"><Check className="h-3 w-3" /> Fully disbursed</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{fmtUSD(r.fundingAmount)} available</span>
                      <span>{items.length} project(s)</span>
                      <span>{fmtNum(r.totalVotes || 0)} GOV committed</span>
                      <span>{funded.length} funded · {disbursedCount} disbursed</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {canDisburse && !allDisbursed && (
                      <button onClick={() => disburseAll(r)} disabled={busy === `all:${r.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                        {busy === `all:${r.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Banknote className="h-3.5 w-3.5" />} Disburse All
                      </button>
                    )}
                    <button onClick={() => setOpenRound(open ? null : r.id)} className="rounded-lg border border-border px-2 py-1.5 text-xs font-semibold hover:bg-muted">
                      {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} {open ? "Hide" : "Ranked List"}
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="mt-3">
                    {!canDisburse && (
                      <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-xs text-amber-800">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <p>Disbursement is available once the rank-based allocation is calculated and approved. Current status: {st.label}.</p>
                      </div>
                    )}
                    {items.length === 0 ? <p className="text-xs text-muted-foreground">No projects in this round.</p> : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            <tr className="border-b border-border">
                              <th className="py-1.5 pr-2">Rank</th><th className="py-1.5 pr-2">Project</th>
                              <th className="py-1.5 pr-2">Request</th><th className="py-1.5 pr-2">GOV</th>
                              <th className="py-1.5 pr-2">Allocation</th><th className="py-1.5 pr-2">Disbursed</th>
                              <th className="py-1.5 pr-2">Status</th><th className="py-1.5">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((it) => {
                              const p = projects[it.projectId];
                              const alloc = Number(it.allocationAmount) || 0;
                              const disbursed = Number(p?.fundingDisbursed || 0);
                              const isFunded = it.fundingStatus === "FULLY_FUNDED" || it.fundingStatus === "PARTIALLY_FUNDED";
                              const isDisbursed = isFunded && disbursed >= alloc - 0.01;
                              return (
                                <tr key={it.id} className="border-b border-border/60">
                                  <td className="py-1.5 pr-2">
                                    <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold",
                                      it.finalRank === 1 ? "bg-gold-gradient text-primary-foreground" : it.finalRank <= 3 ? "bg-amber-200 text-amber-800" : "bg-muted text-muted-foreground")}>
                                      {it.finalRank > 0 ? `#${it.finalRank}` : "—"}
                                    </span>
                                  </td>
                                  <td className="py-1.5 pr-2"><p className="font-medium">{it.projectName}</p><p className="text-[10px] text-muted-foreground">{it.clubName} · {it.region}</p></td>
                                  <td className="py-1.5 pr-2">{fmtUSD(it.requestedFunding)}</td>
                                  <td className="py-1.5 pr-2">{fmtNum(r.status === "ACTIVE" ? it.liveVotes : (it.finalVoteCount || it.liveVotes))}</td>
                                  <td className="py-1.5 pr-2 font-semibold">{alloc > 0 ? fmtUSD(alloc) : "—"}</td>
                                  <td className="py-1.5 pr-2">{isFunded ? fmtUSD(Math.min(disbursed, alloc)) : "—"}</td>
                                  <td className="py-1.5 pr-2">
                                    {it.fundingStatus !== "PENDING" && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", FUND_STATUS[it.fundingStatus])}>{it.fundingStatus.replace("_", " ").toLowerCase()}</span>}
                                    {isDisbursed && <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"><Check className="h-2.5 w-2.5" /> paid</span>}
                                  </td>
                                  <td className="py-1.5">
                                    {canDisburse && isFunded && !isDisbursed && (
                                      <button onClick={() => disburseProject(r, it)} disabled={busy === `${r.id}:${it.projectId}`}
                                        className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                                        {busy === `${r.id}:${it.projectId}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Banknote className="h-3 w-3" />} Disburse
                                      </button>
                                    )}
                                    {isDisbursed && <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600"><Check className="h-3 w-3" /> Done</span>}
                                    {!isFunded && <span className="text-[11px] text-muted-foreground">—</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}