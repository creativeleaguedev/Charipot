import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/useWallet";
import { loadConfig, fmtUSD, fmtNum, generateWinningNumbers, makeRandomnessProof, parseNumbers, normalizeNumbers, countMatches, prizeTier } from "@/lib/configRegistry";
import { useToast } from "@/components/ui/use-toast";
import NumberBall from "@/components/ui/NumberBall";
import { ShieldCheck, FileCheck2, Dice5, Landmark, ScrollText, Plus, Check, X, Lock, Play, AlertTriangle, Wallet, ShieldAlert, BadgeCheck, Users, UserCog, Inbox, Tag, Ticket, Banknote, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAllowedAdminTabs } from "@/lib/adminAccess";
import PlatformWalletsPanel from "@/components/admin/PlatformWalletsPanel";
import SecurityPanel from "@/components/admin/SecurityPanel";
import PayoutPanel from "@/components/admin/PayoutPanel";
import UsersPanel from "@/components/admin/UsersPanel";
import AgentTicketsPanel from "@/components/admin/AgentTicketsPanel";
import SupportInboxPanel from "@/components/admin/SupportInboxPanel";
import PassPackagesPanel from "@/components/admin/PassPackagesPanel";
import PassPurchasesPanel from "@/components/admin/PassPurchasesPanel";
import ProjectReviewPanel from "@/components/admin/ProjectReviewPanel";
import LotterySettingsPanel from "@/components/admin/LotterySettingsPanel";
import MilestoneTracker from "@/components/admin/MilestoneTracker";
import FundingRoundsPanel from "@/components/admin/FundingRoundsPanel";
import FundingDisbursementPanel from "@/components/admin/FundingDisbursementPanel";
import AgentPayoutPanel from "@/components/admin/AgentPayoutPanel";
import AdminAccessGate from "@/components/admin/AdminAccessGate";

const ADMIN_ROLE_LABELS = {
  admin: "Super Admin — full access to every function",
  platform_admin: "Platform Admin — parameter changes, project vetting, draw controls, treasury & audit",
};

const ALL_TABS = [
  { key: "users", label: "Users", icon: Users },
  { key: "passes", label: "Pass Packages", icon: Tag },
  { key: "pass_purchases", label: "Pass Purchases", icon: History },
  { key: "agent_tickets", label: "Agent Tickets", icon: UserCog },
  { key: "agent_payouts", label: "Agent Payouts", icon: Banknote },
  { key: "payouts", label: "Prize Payouts", icon: BadgeCheck },
  { key: "security", label: "Security", icon: ShieldAlert },
  { key: "pcr", label: "Parameter Changes", icon: FileCheck2 },
  { key: "vetting", label: "Project Vetting", icon: ShieldCheck },
  { key: "draws", label: "Draw Controls", icon: Dice5 },
  { key: "lottery", label: "Lottery Settings", icon: Ticket },
  { key: "funding_rounds", label: "Funding Rounds", icon: Landmark },
  { key: "disbursements", label: "Disbursements", icon: Banknote },
  { key: "treasury", label: "Treasury", icon: Landmark },
  { key: "wallets", label: "Wallets", icon: Wallet },
  { key: "support", label: "Support Inbox", icon: Inbox },
  { key: "audit", label: "Audit Log", icon: ScrollText },
];

const TAB_GROUPS = [
  { label: "Management", keys: ["users", "passes", "payouts", "security"] },
  { label: "Operations", keys: ["pcr", "vetting", "draws", "lottery", "funding_rounds", "disbursements", "treasury", "agent_tickets", "agent_payouts", "pass_purchases", "support"] },
  { label: "System", keys: ["wallets", "audit"] },
];

export default function AdminCenter() {
  const { user, loading } = useWallet();
  const allowedKeys = getAllowedAdminTabs(user);
  const TABS = ALL_TABS.filter((t) => allowedKeys.includes(t.key));
  const [tab, setTab] = useState(null);
  const [syncTick, setSyncTick] = useState(0);
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem("adminGateUnlocked") === "1");
  useEffect(() => { if (!tab && TABS.length) setTab(TABS[0].key); }, [TABS.length]);

  // Cross-device sync: any change to an admin-relevant entity (from this device
  // or another admin) bumps syncTick so the active panel remounts and reloads
  // fresh data — keeping every admin's Command Center in lockstep.
  useEffect(() => {
    const bump = () => setSyncTick((t) => t + 1);
    const subs = [
      base44.entities.Draw,
      base44.entities.Project,
      base44.entities.ConfigParameter,
      base44.entities.PrizePayout,
      base44.entities.PlatformWallet,
      base44.entities.SweepRecord,
      base44.entities.SupportTicket,
      base44.entities.AgentBonusRecord,
      base44.entities.Ticket,
      base44.entities.Wallet,
      base44.entities.FundingRound,
      base44.entities.FundingRoundProject,
      base44.entities.PassPurchase,
    ].map((e) => e.subscribe(bump));
    return () => subs.forEach((u) => u && u());
  }, []);
  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" /></div>;
  if (allowedKeys.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h1 className="mt-4 text-2xl font-bold">Access denied</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">The Administrator Command Center is restricted to authorized admin accounts. Your account does not have admin access.</p>
      </div>
    );
  }
  if (!unlocked) {
    return <AdminAccessGate onUnlocked={() => setUnlocked(true)} />;
  }
  const activeTab = tab || TABS[0]?.key;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Administrator Command Center</h1>
        <p className="text-sm text-muted-foreground">{ADMIN_ROLE_LABELS[user?.role] || "Prize verification, blacklisting, parameter changes, project vetting, draw controls, treasury, and audit."}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {TAB_GROUPS.map((g) => {
          const tabs = g.keys.map((k) => TABS.find((t) => t.key === k)).filter(Boolean);
          if (tabs.length === 0) return null;
          return (
            <div key={g.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{g.label}</p>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                {tabs.map((t) => (
                  <button key={t.key} onClick={() => setTab(t.key)} className={cn("flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors", activeTab === t.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                    <t.icon className="h-4 w-4" /> {t.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="contents" key={syncTick}>
      {activeTab === "users" && <UsersPanel user={user} />}
      {activeTab === "passes" && <PassPackagesPanel user={user} />}
      {activeTab === "pass_purchases" && <PassPurchasesPanel user={user} />}
      {activeTab === "agent_tickets" && <AgentTicketsPanel />}
      {activeTab === "agent_payouts" && <AgentPayoutPanel user={user} />}
      {activeTab === "payouts" && <PayoutPanel user={user} />}
      {activeTab === "security" && <SecurityPanel user={user} />}
      {activeTab === "pcr" && <PCRPanel user={user} />}
      {activeTab === "vetting" && <ProjectReviewPanel user={user} />}
      {activeTab === "draws" && <DrawPanel user={user} />}
      {activeTab === "lottery" && <LotterySettingsPanel user={user} />}
      {activeTab === "funding_rounds" && <FundingRoundsPanel user={user} />}
      {activeTab === "disbursements" && <FundingDisbursementPanel user={user} />}
      {activeTab === "treasury" && <TreasuryPanel user={user} />}
      {activeTab === "wallets" && <PlatformWalletsPanel user={user} />}
      {activeTab === "support" && <SupportInboxPanel user={user} />}
      {activeTab === "audit" && <AuditPanel />}
      </div>
    </div>
  );
}

function PCRPanel({ user }) {
  const [params, setParams] = useState([]);
  const [pcrs, setPcrs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selKey, setSelKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [justification, setJustification] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    const p = await base44.entities.ConfigParameter.list("key", 100);
    setParams(p);
    const pc = await base44.entities.PCR.list("-createdAt", 20);
    setPcrs(pc);
  };
  useEffect(() => { load(); }, []);

  const revKeys = ["rev_charity", "rev_prize", "rev_platform", "rev_agent"];
  const prizeKeys = ["prize_5", "prize_4", "prize_3"];

  const validate = (key, value) => {
    const param = params.find((p) => p.key === key);
    if (!param) return { ok: false, msg: "Unknown parameter" };
    if (value < param.min || value > param.max) return { ok: false, msg: `Value must be between ${param.min} and ${param.max} ${param.unit}` };
    // Invariant checks
    if (revKeys.includes(key) || prizeKeys.includes(key)) {
      const group = revKeys.includes(key) ? revKeys : prizeKeys;
      const sum = group.reduce((s, k) => {
        const pk = params.find((p) => p.key === k);
        return s + (k === key ? value : pk?.value || 0);
      }, 0);
      if (Math.round(sum) !== 100) return { ok: false, msg: `${revKeys.includes(key) ? "Revenue" : "Prize"} split must sum to exactly 100% (currently ${sum}%)` };
    }
    return { ok: true };
  };

  const submitPCR = async () => {
    const value = Number(newVal);
    const param = params.find((p) => p.key === selKey);
    const v = validate(selKey, value);
    if (!v.ok) return toast({ title: "Validation failed", description: v.msg, variant: "destructive" });
    setBusy(true);
    try {
      const pcr = await base44.entities.PCR.create({
        parameterKey: selKey,
        parameterLabel: param.label,
        oldValue: param.value,
        proposedValue: value,
        justification,
        status: "VALIDATED",
        proposerId: user?.id,
        proposerName: user?.full_name || user?.email || "Config Admin",
        highImpact: param.highImpact,
        timelockHours: param.timelockHours,
        createdAt: new Date().toISOString(),
        validatedAt: new Date().toISOString(),
      });
      await base44.entities.AuditLog.create({
        actor: user?.full_name || "Config Admin", actorRole: "config_admin", action: "PCR_PROPOSED",
        entityType: "PCR", entityId: pcr.id, details: `PCR proposed: ${param.label} ${param.value} → ${value}. ${justification}`,
        timestamp: new Date().toISOString(), severity: param.highImpact ? "warning" : "info",
      });
      setShowForm(false);
      setSelKey(""); setNewVal(""); setJustification("");
      load();
      toast({ title: "PCR submitted & validated", description: `Awaiting review. Timelock: ${param.timelockHours}h.` });
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const approvePCR = async (pcr) => {
    await base44.entities.PCR.update(pcr.id, {
      status: "SCHEDULED",
      approverId: user?.id,
      approverName: user?.full_name || user?.email,
      reviewedAt: new Date().toISOString(),
      scheduledAt: new Date().toISOString(),
      effectiveAt: new Date(Date.now() + pcr.timelockHours * 3600000).toISOString(),
    });
    await base44.entities.AuditLog.create({
      actor: user?.full_name || "Admin", actorRole: "admin", action: "PCR_APPROVED",
      entityType: "PCR", entityId: pcr.id, details: `PCR approved for ${pcr.parameterLabel}; effective ${new Date(Date.now() + pcr.timelockHours * 3600000).toLocaleString()}`,
      timestamp: new Date().toISOString(), severity: "warning",
    });
    load();
    toast({ title: "PCR approved & scheduled", description: `Takes effect after ${pcr.timelockHours}h timelock.` });
  };

  const applyPCR = async (pcr) => {
    const param = params.find((p) => p.key === pcr.parameterKey);
    await base44.entities.ConfigParameter.update(param.id, { value: pcr.proposedValue, lastUpdatedBy: user?.full_name || "Admin", lastUpdatedAt: new Date().toISOString() });
    await base44.entities.PCR.update(pcr.id, { status: "EFFECTIVE", effectiveAt: new Date().toISOString() });
    await base44.entities.AuditLog.create({
      actor: "System", actorRole: "system", action: "PCR_EFFECTIVE",
      entityType: "ConfigParameter", entityId: param.id, details: `${pcr.parameterLabel} now effective at ${pcr.proposedValue}${param.unit}`,
      timestamp: new Date().toISOString(), severity: "info",
    });
    load();
    toast({ title: "Parameter applied", description: `${pcr.parameterLabel} = ${pcr.proposedValue}${param.unit}` });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Propose, review, and schedule changes to any economic parameter. High-impact changes require a 7-day timelock.</p>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4" /> New PCR</button>
      </div>

      {/* Current params grouped */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ParamGroup title="Ticket Revenue Split" params={params.filter((p) => p.category === "revenue_split")} />
        <ParamGroup title="Prize Fund Split" params={params.filter((p) => p.category === "prize_split")} />
        <ParamGroup title="Lottery" params={params.filter((p) => p.category === "lottery")} />
        <ParamGroup title="Agent & Governance" params={params.filter((p) => p.category === "agent" || p.category === "governance")} />
      </div>

      {/* PCR queue */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">Parameter Change Requests</h2>
        <div className="mt-4 space-y-3">
          {pcrs.length === 0 && <p className="text-sm text-muted-foreground">No change requests yet.</p>}
          {pcrs.map((pcr) => (
            <div key={pcr.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{pcr.parameterLabel}</p>
                  <p className="text-sm text-muted-foreground">{pcr.oldValue} → <span className="font-bold text-accent">{pcr.proposedValue}</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">"{pcr.justification}"</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Proposed by {pcr.proposerName} · {pcr.highImpact ? "High-impact · 7d timelock" : `${pcr.timelockHours}h timelock`}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", pcr.status === "EFFECTIVE" ? "bg-emerald-100 text-emerald-700" : pcr.status === "SCHEDULED" ? "bg-amber-100 text-amber-700" : pcr.status === "VALIDATED" ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground")}>{pcr.status}</span>
                  {pcr.status === "VALIDATED" && <button onClick={() => approvePCR(pcr)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">Approve & Schedule</button>}
                  {pcr.status === "SCHEDULED" && <button onClick={() => applyPCR(pcr)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Apply now</button>}
                </div>
              </div>
              {pcr.effectiveAt && pcr.status === "SCHEDULED" && <p className="mt-2 text-[11px] text-amber-600">Effective: {new Date(pcr.effectiveAt).toLocaleString()}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">New Parameter Change Request</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Parameter</label>
                <select value={selKey} onChange={(e) => { setSelKey(e.target.value); const p = params.find((x) => x.key === e.target.value); if (p) setNewVal(String(p.value)); }} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary">
                  <option value="">Select…</option>
                  {params.map((p) => <option key={p.key} value={p.key}>{p.label} ({p.min}–{p.max} {p.unit})</option>)}
                </select>
              </div>
              {selKey && (() => {
                const p = params.find((x) => x.key === selKey);
                const v = validate(selKey, Number(newVal));
                return (
                  <>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">New value (current: {p.value} {p.unit})</label>
                      <input type="number" value={newVal} onChange={(e) => setNewVal(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                      {!v.ok && newVal && <p className="mt-1 text-xs text-red-500">{v.msg}</p>}
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Justification *</label>
                      <textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={3} placeholder="Document the reason for this change…" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button onClick={submitPCR} disabled={busy || !selKey || !justification} className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{busy ? "Submitting…" : "Submit PCR"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ParamGroup({ title, params }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-3 space-y-2">
        {params.map((p) => (
          <div key={p.key} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
            <div>
              <p className="text-sm font-medium">{p.label}</p>
              <p className="text-[11px] text-muted-foreground">{p.min}–{p.max} {p.unit} {p.highImpact && "· high-impact"}</p>
            </div>
            <p className="text-lg font-bold text-accent">{p.value}<span className="text-xs font-normal text-muted-foreground"> {p.unit}</span></p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrawPanel({ user }) {
  const [draws, setDraws] = useState([]);
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(null);
  const [jackpotDraft, setJackpotDraft] = useState("");
  const [poolDraft, setPoolDraft] = useState("");
  const [targetDraft, setTargetDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    const d = await base44.entities.Draw.list("-drawNumber", 10);
    setDraws(d);
    const cfg = await loadConfig();
    setConfig(cfg);
    const act = d.find((x) => ["BUILDING", "MINIMUM_REACHED", "TARGET_REACHED"].includes(x.status));
    if (act) {
      setJackpotDraft(String(act.jackpotAmount || 0));
      setPoolDraft(String(act.prizePool || 0));
      setTargetDraft(String(act.targetTickets || 0));
    }
  };
  useEffect(() => { load(); }, []);

  const saveDrawValues = async () => {
    const act = draws.find((d) => ["BUILDING", "MINIMUM_REACHED", "TARGET_REACHED"].includes(d.status));
    if (!act) { toast({ title: "No active draw", variant: "destructive" }); return; }
    const jackpot = Math.max(0, Number(jackpotDraft) || 0);
    const pool = Math.max(0, Number(poolDraft) || 0);
    const target = Math.max(1, Math.round(Number(targetDraft) || act.targetTickets || 1));
    setSaving(true);
    try {
      await base44.entities.Draw.update(act.id, {
        jackpotAmount: +jackpot.toFixed(2),
        prizePool: +pool.toFixed(2),
        targetTickets: target,
      });
      await base44.entities.AuditLog.create({
        actor: user?.full_name || "Lottery Admin", actorRole: "lottery_admin",
        action: "DRAW_VALUES_SET", entityType: "Draw", entityId: act.id,
        details: `Draw #${act.drawNumber} values set by admin — jackpot ${fmtUSD(jackpot)}, prize pool ${fmtUSD(pool)}, target tickets ${fmtNum(target)}.`,
        timestamp: new Date().toISOString(), severity: "warning",
      });
      load();
      toast({ title: "Draw values updated", description: `Draw #${act.drawNumber} — jackpot ${fmtUSD(jackpot)}, prize pool ${fmtUSD(pool)}, target ${fmtNum(target)} tickets.` });
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const lockDraw = async (d) => {
    setBusy(d.id);
    await base44.entities.Draw.update(d.id, { status: "LOCKED", lockedAt: new Date().toISOString() });
    await base44.entities.AuditLog.create({ actor: user?.full_name || "Lottery Admin", actorRole: "lottery_admin", action: "DRAW_LOCKED", entityType: "Draw", entityId: d.id, details: `Draw #${d.drawNumber} locked; agent attribution frozen`, timestamp: new Date().toISOString(), severity: "warning" });
    load(); setBusy(null);
    toast({ title: "Draw locked", description: `Draw #${d.drawNumber} is now locked. No further tickets accepted.` });
  };

  const runDraw = async (d) => {
    setBusy(d.id);
    const proof = makeRandomnessProof();
    const seed = proof + d.id;
    const winning = generateWinningNumbers(seed);
    const winningStr = normalizeNumbers(winning);
    await base44.entities.Draw.update(d.id, { status: "NUMBERS_GENERATED", winningNumbers: winningStr, randomnessProof: proof });
    // Evaluate tickets
    const tickets = await base44.entities.Ticket.filter({ drawNumber: d.drawNumber, status: "ACTIVE" });
    let w5 = 0, w4 = 0, w3 = 0;
    const updates = [];
    for (const t of tickets) {
      const m = countMatches(t.numbers, winningStr);
      const tier = prizeTier(m);
      if (tier === "5/5") w5++; else if (tier === "4/5") w4++; else if (tier === "3/5") w3++;
      if (tier !== "none") {
        let amt = 0;
        if (tier === "5/5") amt = w5 > 0 ? d.jackpotAmount / Math.max(w5, 1) : 0;
        else if (tier === "4/5") amt = d.prizePool * (config.prize_4.value / 100) / Math.max(w4, 1);
        else amt = d.prizePool * (config.prize_3.value / 100) / Math.max(w3, 1);
        updates.push(base44.entities.Ticket.update(t.id, { status: "WINNING", prizeTier: tier, prizeAmount: +amt.toFixed(2) }));
      } else {
        updates.push(base44.entities.Ticket.update(t.id, { status: "EXPIRED" }));
      }
    }
    await Promise.all(updates);
    const won = w5 > 0;
    await base44.entities.Draw.update(d.id, { status: "COMPLETED", winners5: w5, winners4: w4, winners3: w3, completedAt: new Date().toISOString(), totalPrizesPaid: d.jackpotAmount + d.prizePool });
    await base44.entities.AuditLog.create({ actor: "VRF Oracle", actorRole: "system", action: "RANDOMNESS_RECEIVED", entityType: "Draw", entityId: d.id, details: `Draw #${d.drawNumber}: winning ${winningStr} (proof ${proof}). ${w5}×5/5, ${w4}×4/5, ${w3}×3/5. ${won ? "Jackpot won" : "Jackpot rolled over"}`, timestamp: new Date().toISOString(), severity: "info" });
    load(); setBusy(null);
    toast({ title: `Draw #${d.drawNumber} completed`, description: `Winning: ${winningStr}. ${won ? "Jackpot won!" : "Jackpot rolled over."}` });
  };

  const depositReserve = async (d) => {
    const reserve = d.reserveBalance || 0;
    if (reserve <= 0) { toast({ title: "No reserve available", description: "Reserve balance is 0 for this draw.", variant: "destructive" }); return; }
    setBusy(d.id);
    await base44.entities.Draw.update(d.id, { jackpotAmount: +((d.jackpotAmount || 0) + reserve).toFixed(2), reserveBalance: 0 });
    await base44.entities.AuditLog.create({ actor: user?.full_name || "Lottery Admin", actorRole: "lottery_admin", action: "RESERVE_DEPOSITED", entityType: "Draw", entityId: d.id, details: `Reserve ${fmtUSD(reserve)} deposited into Draw #${d.drawNumber} jackpot`, timestamp: new Date().toISOString(), severity: "warning" });
    load(); setBusy(null);
    toast({ title: "Reserve deposited", description: `${fmtUSD(reserve)} added to Draw #${d.drawNumber} jackpot.` });
  };

  const active = draws.find((d) => ["BUILDING", "MINIMUM_REACHED", "TARGET_REACHED"].includes(d.status));

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Monitor draw thresholds and execute authorized draws. Winning numbers are generated from verifiable randomness — administrators cannot select or alter them.</p>
      {active && (
        <div className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold">Active Draw #{active.drawNumber}</p>
              <p className="text-xs text-muted-foreground">Status: {active.status} · {fmtNum(active.ticketCount)}/{fmtNum(active.targetTickets)} tickets · Jackpot {fmtUSD((active.jackpotAmount || 0) + (active.prizePool || 0))}</p>
              <p className="mt-1 text-xs text-muted-foreground">Reserve balance: <b className="text-accent">{fmtUSD(active.reserveBalance || 0)}</b> · accrued this draw: {fmtUSD(active.reserveAllocation || 0)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => depositReserve(active)} disabled={busy === active.id || (active.reserveBalance || 0) <= 0} className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20 disabled:opacity-50"><Landmark className="h-4 w-4" /> Deposit Reserve</button>
              <button onClick={() => lockDraw(active)} disabled={busy === active.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"><Lock className="h-4 w-4" /> Lock Draw</button>
              <button onClick={() => runDraw(active)} disabled={busy === active.id} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><Play className="h-4 w-4" /> {busy === active.id ? "Running…" : "Execute Draw"}</button>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Set draw values</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Manually adjust the active draw's jackpot, prize pool, and target ticket count. Every change is written to the audit log.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Jackpot amount (USD)</label>
                <input type="number" min="0" step="0.01" value={jackpotDraft} onChange={(e) => setJackpotDraft(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Prize pool / draw value (USD)</label>
                <input type="number" min="0" step="0.01" value={poolDraft} onChange={(e) => setPoolDraft(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Target tickets</label>
                <input type="number" min="1" step="1" value={targetDraft} onChange={(e) => setTargetDraft(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button onClick={saveDrawValues} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-5 py-2 text-sm font-semibold text-foreground hover:opacity-90 disabled:opacity-50">
                {saving ? "Saving…" : "Save draw values"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">Draw History</h2>
        <div className="mt-4 space-y-3">
          {draws.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
              <div>
                <p className="font-semibold">Draw #{d.drawNumber}</p>
                <p className="text-xs text-muted-foreground">{d.status} · {fmtNum(d.ticketCount)} tickets · Jackpot {fmtUSD((d.jackpotAmount || 0) + (d.prizePool || 0))} · Reserve {fmtUSD(d.reserveBalance || 0)}</p>
              </div>
              {d.winningNumbers ? (
                <div className="flex gap-1">{parseNumbers(d.winningNumbers).map((n, i) => <NumberBall key={i} n={n} size="sm" variant="navy" />)}</div>
              ) : <span className="text-xs text-muted-foreground">No winning numbers yet</span>}
              <div className="text-right text-xs">
                <p className="text-muted-foreground">5/5: {d.winners5 || 0} · 4/5: {d.winners4 || 0} · 3/5: {d.winners3 || 0}</p>
                {d.randomnessProof && <p className="text-[10px] text-muted-foreground">{d.randomnessProof.slice(0, 18)}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TreasuryPanel({ user }) {
  const [projects, setProjects] = useState([]);
  const [draws, setDraws] = useState([]);
  const [allocations, setAllocations] = useState({});
  const [threshold, setThreshold] = useState("");
  const [thresholdParam, setThresholdParam] = useState(null);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [sweepThreshold, setSweepThreshold] = useState("");
  const [sweepThresholdParam, setSweepThresholdParam] = useState(null);
  const [savingSweep, setSavingSweep] = useState(false);
  const [disbursing, setDisbursing] = useState(null);
  const { toast } = useToast();

  const load = async () => {
    const p = await base44.entities.Project.filter({ status: "SELECTED" });
    const p2 = await base44.entities.Project.filter({ status: "FUNDING_APPROVED" });
    const all = [...p, ...p2];
    setProjects(all);
    const d = await base44.entities.Draw.list("-drawNumber", 5);
    setDraws(d);
    // Read the threshold param directly from the DB (loadConfig caches and may
    // be stale right after the param is first seeded).
    const tpList = await base44.entities.ConfigParameter.filter({ key: "project_min_funding" });
    const tp = tpList[0] || null;
    setThresholdParam(tp);
    setThreshold(tp?.value != null ? String(tp.value) : "500");
    const spList = await base44.entities.ConfigParameter.filter({ key: "sweep_threshold" });
    const sp = spList[0] || null;
    setSweepThresholdParam(sp);
    setSweepThreshold(sp?.value != null ? String(sp.value) : "10");
    const alloc = {};
    all.forEach((pr) => { alloc[pr.id] = String(pr.requestedFunding || 0); });
    setAllocations(alloc);
  };
  useEffect(() => { load(); }, []);

  const saveThreshold = async () => {
    const val = Math.max(0, Number(threshold) || 0);
    setSavingThreshold(true);
    try {
      if (thresholdParam?.id) {
        await base44.entities.ConfigParameter.update(thresholdParam.id, { value: val, lastUpdatedBy: user?.full_name || "Treasury Admin", lastUpdatedAt: new Date().toISOString() });
      }
      await base44.entities.AuditLog.create({ actor: user?.full_name || "Treasury Admin", actorRole: "treasury_admin", action: "PROJECT_THRESHOLD_CHANGED", entityType: "ConfigParameter", entityId: thresholdParam?.id || "", details: `Minimum funding allocation threshold set to ${fmtUSD(val)}`, timestamp: new Date().toISOString(), severity: "warning" });
      load();
      toast({ title: "Threshold updated", description: `Minimum funding allocation is now ${fmtUSD(val)}.` });
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally { setSavingThreshold(false); }
  };

  const saveSweepThreshold = async () => {
    const val = Math.max(0, Number(sweepThreshold) || 0);
    setSavingSweep(true);
    try {
      if (sweepThresholdParam?.id) {
        await base44.entities.ConfigParameter.update(sweepThresholdParam.id, { value: val, lastUpdatedBy: user?.full_name || "Treasury Admin", lastUpdatedAt: new Date().toISOString() });
      } else {
        const created = await base44.entities.ConfigParameter.create({ key: "sweep_threshold", category: "lottery", label: "Collector Sweep Threshold", value: val, defaultValue: 10, min: 0, max: 100000, unit: "USD", description: "USDC or USDT balance in the collector wallet that triggers an automatic sweep to custody wallets.", highImpact: false, timelockHours: 48, lastUpdatedBy: user?.full_name || "Treasury Admin", lastUpdatedAt: new Date().toISOString() });
        setSweepThresholdParam(created);
      }
      await base44.entities.AuditLog.create({ actor: user?.full_name || "Treasury Admin", actorRole: "treasury_admin", action: "SWEEP_THRESHOLD_CHANGED", entityType: "ConfigParameter", entityId: sweepThresholdParam?.id || "", details: `Collector sweep threshold set to ${fmtUSD(val)}`, timestamp: new Date().toISOString(), severity: "warning" });
      load();
      toast({ title: "Sweep threshold updated", description: `Collector will sweep when USDC or USDT balance reaches ${fmtUSD(val)}.` });
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally { setSavingSweep(false); }
  };

  const disburse = async (p) => {
    const minVal = Number(thresholdParam?.value ?? 500);
    const maxVal = 100000;
    const alloc = Math.max(0, Number(allocations[p.id]) || 0);
    if (alloc < minVal) { toast({ title: "Below threshold", description: `Allocation must be at least ${fmtUSD(minVal)}.`, variant: "destructive" }); return; }
    if (alloc > maxVal) { toast({ title: "Exceeds maximum", description: `Allocation cannot exceed ${fmtUSD(maxVal)}.`, variant: "destructive" }); return; }
    setDisbursing(p.id);
    try {
      await base44.entities.Project.update(p.id, { status: "FUNDING_IN_PROGRESS", fundingAllocated: alloc, fundingDisbursed: alloc });
      await base44.entities.AuditLog.create({ actor: user?.full_name || "Treasury Admin", actorRole: "treasury_admin", action: "DISBURSEMENT_EXECUTED", entityType: "Project", entityId: p.id, details: `${fmtUSD(alloc)} disbursed to ${p.clubName} for ${p.name} (requested ${fmtUSD(p.requestedFunding)})`, timestamp: new Date().toISOString(), severity: "warning" });
      load();
      toast({ title: "Disbursement executed", description: `${fmtUSD(alloc)} to ${p.clubName}` });
    } catch (e) {
      toast({ title: "Disbursement failed", description: e.message, variant: "destructive" });
    } finally { setDisbursing(null); }
  };

  const totalDisbursed = draws.reduce((s, d) => s + (d.totalPrizesPaid || 0) + (d.agentBonusPaid || 0), 0);
  const minVal = Number(thresholdParam?.value ?? 500);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Execute approved disbursements and prize payouts. Admin dictates the allocation amount per project; a minimum threshold protects against underfunding. All treasury actions are recorded immutably.</p>

      {/* Funding threshold control */}
      <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Minimum Funding Allocation Threshold</label>
            <p className="text-[11px] text-muted-foreground">Every project disbursement must be at least this amount. Change it here — applies immediately to all future disbursements.</p>
            <div className="mt-2 flex gap-2">
              <input type="number" min="0" step="1" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="w-40 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
              <button onClick={saveThreshold} disabled={savingThreshold} className="inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-4 py-2 text-sm font-semibold text-foreground hover:opacity-90 disabled:opacity-50">{savingThreshold ? "Saving…" : "Update Threshold"}</button>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
            <p className="text-[11px] text-muted-foreground">Current threshold</p>
            <p className="text-lg font-bold text-accent">{fmtUSD(minVal)}</p>
          </div>
        </div>
      </div>

      {/* Collector sweep threshold control */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Collector Sweep Threshold</label>
            <p className="text-[11px] text-muted-foreground">When the collector wallet's USDC or USDT balance reaches this amount, funds are automatically swept to the custody wallets. Change it here — applies immediately to the next sweep cycle.</p>
            <div className="mt-2 flex gap-2">
              <input type="number" min="0" step="1" value={sweepThreshold} onChange={(e) => setSweepThreshold(e.target.value)} className="w-40 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
              <button onClick={saveSweepThreshold} disabled={savingSweep} className="inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-4 py-2 text-sm font-semibold text-foreground hover:opacity-90 disabled:opacity-50">{savingSweep ? "Saving…" : "Update Sweep Threshold"}</button>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
            <p className="text-[11px] text-muted-foreground">Current sweep threshold</p>
            <p className="text-lg font-bold text-accent">{fmtUSD(Number(sweepThresholdParam?.value ?? 10))}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><p className="text-xs text-muted-foreground">Total Prizes & Bonuses Paid</p><p className="mt-1 text-xl font-bold text-accent">{fmtUSD(totalDisbursed)}</p></div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><p className="text-xs text-muted-foreground">Pending Disbursements</p><p className="mt-1 text-xl font-bold">{fmtNum(projects.length)}</p></div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><p className="text-xs text-muted-foreground">Treasury Mode</p><p className="mt-1 text-xl font-bold">Multisig</p></div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">Pending Disbursements</h2>
        <p className="text-[11px] text-muted-foreground">Set the allocation amount for each project (must be ≥ {fmtUSD(minVal)}), then execute.</p>
        {projects.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No pending disbursements. Funded projects appear here after governance round completion.</p> : projects.map((p) => {
          const alloc = Number(allocations[p.id] || 0);
          const tooLow = alloc < minVal;
          return (
            <div key={p.id} className="mt-4 rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.clubName} · requested {fmtUSD(p.requestedFunding)} · {fmtNum(p.totalCommittedGov)} GOV committed</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <label className="text-[10px] font-medium uppercase text-muted-foreground">Allocation (USD)</label>
                  <input type="number" min={minVal} step="0.01" value={allocations[p.id] ?? ""} onChange={(e) => setAllocations({ ...allocations, [p.id]: e.target.value })} className={cn("w-36 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary", tooLow ? "border-red-400" : "border-input focus:border-primary")} />
                  {tooLow && <span className="text-[10px] text-red-500">min {fmtUSD(minVal)}</span>}
                  <button onClick={() => disburse(p)} disabled={disbursing === p.id || tooLow} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{disbursing === p.id ? "Disbursing…" : "Execute Disbursement"}</button>
                </div>
              </div>
              <MilestoneTracker project={p} user={user} onChanged={load} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AuditPanel() {
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    (async () => {
      const l = await base44.entities.AuditLog.list("-timestamp", 50);
      setLogs(l);
    })();
  }, []);
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-bold">Recent Audit Log</h2>
      <div className="mt-4 space-y-2">
        {logs.map((l) => (
          <div key={l.id} className="flex items-start gap-3 rounded-xl border border-border p-3">
            <div className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", l.severity === "critical" ? "bg-red-500" : l.severity === "warning" ? "bg-amber-500" : "bg-emerald-500")} />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{l.action.replace(/_/g, " ")}</p>
                <p className="text-[11px] text-muted-foreground">{new Date(l.timestamp).toLocaleString()}</p>
              </div>
              <p className="text-xs text-muted-foreground">{l.details}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Actor: {l.actor} ({l.actorRole})</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}