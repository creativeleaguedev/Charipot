import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/useWallet";
import { fmtUSD, fmtNum } from "@/lib/configRegistry";
import { useToast } from "@/components/ui/use-toast";
import { Landmark, Vote, Flame, Clock, Check, AlertTriangle, Wallet, Trophy, Info, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { InteractiveInput } from "@/components/ui/interactive-input";
import { useLang } from "@/lib/LanguageContext";

const FUND_STATUS = {
  FULLY_FUNDED: { label: "Fully Funded", tone: "bg-emerald-100 text-emerald-700" },
  PARTIALLY_FUNDED: { label: "Partially Funded", tone: "bg-amber-100 text-amber-700" },
  NOT_FUNDED: { label: "Not Funded", tone: "bg-red-100 text-red-700" },
  PENDING: { label: "Pending", tone: "bg-slate-100 text-slate-600" },
};

export default function FundingRounds() {
  const { user, wallet, refresh } = useWallet();
  const { toast } = useToast();
  const { t } = useLang();
  const [round, setRound] = useState(null);
  const [items, setItems] = useState([]);
  const [commit, setCommit] = useState({});
  const [busy, setBusy] = useState(null);
  const [myVotes, setMyVotes] = useState([]);
  const [charityBalance, setCharityBalance] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const rs = await base44.entities.FundingRound.list("-created_date", 20);
      const active = rs.find((r) => r.status === "ACTIVE") || rs.find((r) => r.status !== "DRAFT") || rs[0];
      setRound(active || null);
      if (active) {
        const its = await base44.entities.FundingRoundProject.filter({ fundingRoundId: active.id });
        setItems(its);
      } else { setItems([]); }
      if (user) { const v = await base44.entities.Vote.filter({ userId: user.id }); setMyVotes(v); }
      try {
        const cw = await base44.functions.invoke("getCharityWallet", {});
        setCharityBalance(cw?.data?.total ?? null);
      } catch (_) { setCharityBalance(null); }
    } catch (e) { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, [user]);

  const govVoted = myVotes.filter((v) => round && v.fundingRoundId === round.id).reduce((s, v) => s + (v.govAmount || 0), 0);
  const daysLeft = round?.endDate ? Math.max(0, Math.ceil((new Date(round.endDate).getTime() - Date.now()) / 86400000)) : 0;
  const votingOpen = round?.status === "ACTIVE";
  const showResults = round && ["ALLOCATION_CALCULATED", "ALLOCATION_APPROVED", "FUNDING_IN_PROGRESS", "COMPLETED"].includes(round.status);

  const ranked = [...items].sort((a, b) => {
    if (showResults) return (a.finalRank || 999) - (b.finalRank || 999);
    return (b.liveVotes || 0) - (a.liveVotes || 0);
  });

  // The funding round target (admin-set, e.g. 20k) is the allocation pool.
  // Projects are funded top-down by vote rank: #1 is funded up to its requested
  // amount, then #2, and so on. Votes only decide the ranking — there is no
  // proportional vote-share split. The live charity wallet balance (raised so
  // far) is shown as progress toward this target at the bottom of the page.
  const totalRequested = items.reduce((s, it) => s + (it.requestedFunding || 0), 0);
  const roundTarget = round?.fundingAmount || 0;
  const charityPool = charityBalance ?? 0;
  const projectedMap = (() => {
    const sorted = [...items].sort((a, b) => (b.liveVotes || 0) - (a.liveVotes || 0) || (a.requestedFunding || 0) - (b.requestedFunding || 0));
    let rem = roundTarget;
    const map = {};
    sorted.forEach((it, idx) => {
      let alloc = 0;
      if (rem > 0) {
        alloc = Math.min(it.requestedFunding || 0, rem);
        rem = +(rem - alloc).toFixed(2);
      }
      map[it.id] = { rank: idx + 1, projected: alloc, remainingAfter: +rem.toFixed(2) };
    });
    return map;
  })();

  const commitGov = async (it) => {
    if (!votingOpen) return toast({ title: t("fr.warning"), variant: "destructive" });
    const amt = Number(commit[it.id] || 0);
    if (!amt || amt <= 0) return toast({ title: t("fr.commit_placeholder"), variant: "destructive" });
    if (amt > (wallet?.govBalance || 0)) return toast({ title: "Insufficient GOV balance", variant: "destructive" });
    setBusy(it.id);
    try {
      await base44.entities.Vote.create({
        projectId: it.projectId, projectName: it.projectName, userId: user.id, userName: user.full_name || user.email,
        govAmount: amt, governanceRound: 1, fundingRoundId: round.id, burnedAt: new Date().toISOString(),
      });
      await base44.entities.GovTransaction.create({
        fromUserId: user.id, fromName: user.full_name || user.email, toUserId: "burn", toName: "Burn (Funding Round)",
        amount: amt, type: "BURN", projectId: it.projectId, projectName: it.projectName, reference: "fr_burn_" + Date.now(), createdAt: new Date().toISOString(),
      });
      await base44.entities.Wallet.update(wallet.id, {
        govBalance: (wallet.govBalance || 0) - amt, govBurned: (wallet.govBurned || 0) + amt, govCommitted: (wallet.govCommitted || 0) + amt,
      });
      await base44.entities.FundingRoundProject.update(it.id, { liveVotes: (it.liveVotes || 0) + amt, voterCount: (it.voterCount || 0) + 1 });
      await base44.entities.FundingRound.update(round.id, { totalVotes: (round.totalVotes || 0) + amt, voterCount: (round.voterCount || 0) + 1 });
      setCommit({ ...commit, [it.id]: "" });
      refresh();
      load();
      toast({ title: "GOV committed & burned", description: `${amt} GOV burned for ${it.projectName}.` });
    } catch (e) {
      toast({ title: "Commit failed", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("fr.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("fr.subtitle")}</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("fr.loading")}</div>
      ) : !round ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">{t("fr.no_rounds")}</div>
      ) : (
        <>
          {/* Round header */}
          <div className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-accent" /><h2 className="text-xl font-bold">{round.name}</h2></div>
                {round.description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{round.description}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{t("fr.round_target")}</p>
                <p className="text-2xl font-bold text-accent">{fmtUSD(roundTarget)}</p>
                <p className="text-[11px] text-muted-foreground">{t("fr.total_needed")}: {fmtUSD(totalRequested)}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-card p-3 shadow-sm"><p className="text-[11px] text-muted-foreground">{t("fr.total_gov")}</p><p className="text-lg font-bold">{fmtNum(round.totalVotes || 0)}</p></div>
              <div className="rounded-xl bg-card p-3 shadow-sm"><p className="text-[11px] text-muted-foreground">{t("fr.voters")}</p><p className="text-lg font-bold">{fmtNum(round.voterCount || 0)}</p></div>
              <div className="rounded-xl bg-card p-3 shadow-sm"><p className="text-[11px] text-muted-foreground">{votingOpen ? t("fr.days_remaining") : t("fr.status")}</p><p className="text-lg font-bold">{votingOpen ? daysLeft : round.status.replace(/_/g, " ").toLowerCase()}</p></div>
              <div className="rounded-xl bg-card p-3 shadow-sm"><p className="text-[11px] text-muted-foreground">{t("fr.your_votes")}</p><p className="text-lg font-bold">{fmtNum(govVoted)}</p></div>
            </div>
          </div>

          {votingOpen && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{t("fr.warning")}</p>
            </div>
          )}

          {/* Project ranking */}
          {items.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-accent" />
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{showResults ? t("fr.final_ranking") : t("fr.live_ranking")}</h2>
                <span className="ml-auto text-[11px] text-muted-foreground">{showResults ? t("fr.ranked_locked") : t("fr.funded_topdown")}</span>
              </div>
              <div className="divide-y divide-border">
                {ranked.map((it, i) => {
                  const rank = showResults ? (it.finalRank || i + 1) : (projectedMap[it.id]?.rank || i + 1);
                  const votes = showResults ? (it.finalVoteCount || it.liveVotes || 0) : (it.liveVotes || 0);
                  const proj = showResults ? (it.allocationAmount || 0) : (projectedMap[it.id]?.projected || 0);
                  const barPct = it.requestedFunding > 0 ? Math.min(100, (proj / it.requestedFunding) * 100) : 0;
                  const fs = FUND_STATUS[it.fundingStatus] || FUND_STATUS.PENDING;
                  return (
                    <div key={it.id} className="flex items-center gap-3 py-2.5">
                      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold", rank === 1 ? "bg-gold-gradient text-primary-foreground" : rank === 2 ? "bg-slate-300 text-slate-800" : rank === 3 ? "bg-amber-200 text-amber-800" : "bg-muted text-muted-foreground")}>
                        {rank <= 3 ? <Trophy className="h-4 w-4" /> : `#${rank}`}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{it.projectName}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{it.clubName} · {it.region}</p>
                      </div>
                      <div className="hidden w-32 sm:block"><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gold-gradient" style={{ width: `${barPct}%` }} /></div></div>
                      <div className="w-24 text-right"><p className="text-sm font-bold">{fmtNum(votes)}</p><p className="text-[10px] text-muted-foreground">{t("fr.gov")}</p></div>
                      <div className="w-28 text-right"><p className="text-sm font-bold">{fmtUSD(proj)}</p>{showResults ? <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", fs.tone)}>{fs.label}</span> : <p className="text-[10px] text-muted-foreground">{t("fr.by_rank")}</p>}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Voting cards */}
          {votingOpen && items.length > 0 && (
            <div className="space-y-4">
              {ranked.map((it, i) => {
                const rank = projectedMap[it.id]?.rank || i + 1;
                const projected = projectedMap[it.id]?.projected || 0;
                const remainingAfter = projectedMap[it.id]?.remainingAfter || 0;
                const barPct = it.requestedFunding > 0 ? Math.min(100, (projected / it.requestedFunding) * 100) : 0;
                const myVote = myVotes.filter((v) => v.projectId === it.projectId && v.fundingRoundId === round.id).reduce((s, v) => s + v.govAmount, 0);
                return (
                  <div key={it.id} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold", rank <= 3 ? "bg-gold-gradient text-primary-foreground" : "bg-muted text-muted-foreground")}>#{rank}</div>
                        <div>
                          <h3 className="text-lg font-bold leading-tight">{it.projectName}</h3>
                          <p className="text-xs text-muted-foreground">{it.clubName} · {it.category} · {it.region}</p>
                          {it.description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{it.description}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{t("fr.funding_request")}</p>
                        <p className="text-lg font-bold">{fmtUSD(it.requestedFunding)}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      <div className="rounded-xl bg-muted/40 p-3"><p className="text-[11px] text-muted-foreground">{t("fr.gov_committed")}</p><p className="text-lg font-bold">{fmtNum(it.liveVotes || 0)}</p></div>
                      <div className="rounded-xl bg-muted/40 p-3"><p className="text-[11px] text-muted-foreground">{t("fr.current_rank")}</p><p className="text-lg font-bold">#{rank}</p></div>
                      <div className="rounded-xl bg-accent/10 p-3"><p className="text-[11px] text-muted-foreground">{t("fr.funding_by_rank")}</p><p className="text-lg font-bold text-accent">{fmtUSD(projected)}</p>{remainingAfter > 0 && <p className="text-[10px] text-muted-foreground">→ {fmtUSD(remainingAfter)} {t("fr.left_for_next")}</p>}</div>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gold-gradient" style={{ width: `${barPct}%` }} /></div>
                    {myVote > 0 && <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-accent"><Check className="h-3.5 w-3.5" /> You've committed {fmtNum(myVote)} GOV to this project</p>}
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <div className="min-w-[180px] flex-1">
                        <label className="text-xs font-medium text-muted-foreground">{t("fr.commit_label", { n: fmtNum(wallet?.govBalance || 0) })}</label>
                        <InteractiveInput type="number" value={commit[it.id] || ""} onChange={(e) => setCommit({ ...commit, [it.id]: e.target.value })} placeholder={t("fr.commit_placeholder")} className="mt-1.5 w-full" />
                      </div>
                      <button onClick={() => commitGov(it)} disabled={busy === it.id} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 btn-scratch disabled:opacity-50">
                        {busy === it.id ? t("fr.burning") : t("fr.commit_btn")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Charity wallet progress — at the bottom */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-accent" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("fr.wallet_funding_progress")}</h2>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{t("fr.charity_balance")}</p>
                <p className="text-2xl font-bold text-accent">{charityBalance != null ? fmtUSD(charityBalance) : "—"}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{t("fr.round_target")}</p>
                <p className="text-lg font-bold">{fmtUSD(roundTarget)}</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{fmtUSD(charityPool)} / {fmtUSD(roundTarget)}</span>
                <span>{roundTarget > 0 ? Math.min(100, (charityPool / roundTarget) * 100).toFixed(1) : 0}%</span>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-gold-gradient transition-all" style={{ width: `${roundTarget > 0 ? Math.min(100, (charityPool / roundTarget) * 100) : 0}%` }} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}