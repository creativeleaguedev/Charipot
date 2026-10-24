import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { fmtUSD, fmtNum } from "@/lib/configRegistry";
import { useToast } from "@/components/ui/use-toast";
import { Landmark, Plus, Check, X, Lock, Play, Pause, Ban, ArrowRightCircle, AlertTriangle, Loader2, Trophy, Pencil, Calendar, Wallet } from "lucide-react";
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

export default function FundingRoundsPanel({ user }) {
  const { toast } = useToast();
  const [rounds, setRounds] = useState([]);
  const [pool, setPool] = useState([]); // eligible projects (APPROVED/PUBLISHED)
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", fundingAmount: "", endDate: "", selected: [] });
  const [edit, setEdit] = useState({ roundId: null, fundingAmount: "", endDate: "", reason: "" });

  const load = async () => {
    setLoading(true);
    try {
      const rs = await base44.entities.FundingRound.list("-created_date", 50);
      setRounds(rs);
      const eligible = await base44.entities.Project.filter({ status: "APPROVED" });
      const pub = await base44.entities.Project.filter({ status: "PUBLISHED" });
      const voting = await base44.entities.Project.filter({ status: "VOTING" });
      // De-duplicate by id in case a project appears in more than one status fetch.
      const seen = new Set();
      setPool([...eligible, ...pub, ...voting].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))));
    } catch (e) { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const log = (action, details, severity = "info") =>
    base44.entities.AuditLog.create({
      actor: user?.full_name || "Treasury Admin", actorRole: "treasury_admin",
      action, entityType: "FundingRound", details,
      timestamp: new Date().toISOString(), severity,
    });

  const createRound = async () => {
    if (!form.name.trim() || !form.fundingAmount || !form.endDate || form.selected.length === 0) {
      toast({ title: "Name, funding amount, end date and at least one project are required", variant: "destructive" });
      return;
    }
    setBusy("create");
    try {
      const now = new Date().toISOString();
      const round = await base44.entities.FundingRound.create({
        name: form.name.trim(), description: form.description.trim(),
        fundingAmount: Math.max(0, Number(form.fundingAmount) || 0),
        remainingAmount: Math.max(0, Number(form.fundingAmount) || 0),
        endDate: new Date(form.endDate).toISOString(),
        status: "DRAFT", createdById: user?.id, createdByName: user?.full_name || "Admin",
        editHistory: "[]", totalVotes: 0, voterCount: 0, createdAt: now,
      });
      const entries = form.selected.map((pid) => {
        const p = pool.find((x) => x.id === pid);
        return {
          fundingRoundId: round.id, projectId: p.id, projectName: p.name, clubName: p.clubName,
          region: p.region, category: p.category, description: p.description || p.shortDescription || "",
          requestedFunding: p.requestedFunding || 0, projectBudget: p.budget || p.totalProjectCost || 0,
          imageUrl: p.imageUrl || "", liveVotes: 0, voterCount: 0, finalVoteCount: 0, finalRank: 0,
          allocationAmount: 0, fundingStatus: "PENDING", createdAt: now,
        };
      });
      await base44.entities.FundingRoundProject.bulkCreate(entries);
      await log("FUNDING_ROUND_CREATED", `Round "${form.name}" created with ${fmtUSD(Number(form.fundingAmount))} and ${entries.length} project(s).`);
      setForm({ name: "", description: "", fundingAmount: "", endDate: "", selected: [] });
      setShowCreate(false);
      await load();
      toast({ title: "Funding round created", description: form.name });
    } catch (e) {
      toast({ title: "Failed to create round", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const toggleProject = (pid) =>
    setForm((f) => ({ ...f, selected: f.selected.includes(pid) ? f.selected.filter((x) => x !== pid) : [...f.selected, pid] }));

  const updateRound = async (id, patch, msg) => {
    const r = rounds.find((x) => x.id === id);
    await base44.entities.FundingRound.update(id, patch);
    if (msg) await log("FUNDING_ROUND_UPDATE", msg);
    await load();
  };

  const activate = async (r) => {
    setBusy(r.id);
    try {
      await updateRound(r.id, { status: "ACTIVE", startDate: new Date().toISOString() }, `Round "${r.name}" activated for voting.`);
      toast({ title: "Round is now active for voting" });
    } finally { setBusy(null); }
  };

  const closeVoting = async (r) => {
    setBusy(r.id);
    try {
      await updateRound(r.id, { status: "VOTING_CLOSED", closedAt: new Date().toISOString() }, `Voting closed for round "${r.name}".`);
      toast({ title: "Voting closed" });
    } finally { setBusy(null); }
  };

  const calculateAllocation = async (r) => {
    setBusy(r.id);
    try {
      const items = await base44.entities.FundingRoundProject.filter({ fundingRoundId: r.id });
      // Rank by live votes desc, tie-break by requested funding asc
      items.sort((a, b) => (b.liveVotes || 0) - (a.liveVotes || 0) || (a.requestedFunding || 0) - (b.requestedFunding || 0));
      let remaining = r.fundingAmount || 0;
      const updates = items.map((it, idx) => {
        let allocation = 0, status = "NOT_FUNDED";
        if (remaining > 0) {
          allocation = Math.min(it.requestedFunding || 0, remaining);
          status = allocation >= (it.requestedFunding || 0) - 0.01 ? "FULLY_FUNDED" : "PARTIALLY_FUNDED";
          remaining = +(remaining - allocation).toFixed(2);
        }
        return base44.entities.FundingRoundProject.update(it.id, {
          finalVoteCount: it.liveVotes || 0, finalRank: idx + 1, allocationAmount: +allocation.toFixed(2), fundingStatus: status,
        });
      });
      await Promise.all(updates);
      await updateRound(r.id, { status: "ALLOCATION_CALCULATED", remainingAmount: +remaining.toFixed(2) },
        `Allocation calculated for "${r.name}". ${items.length} project(s) ranked; ${fmtUSD(r.fundingAmount - remaining)} allocated, ${fmtUSD(remaining)} remaining.`);
      toast({ title: "Allocation calculated", description: "Review the ranking and approve to lock allocations." });
    } catch (e) {
      toast({ title: "Calculation failed", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const approveAllocation = async (r) => {
    setBusy(r.id);
    try {
      const items = await base44.entities.FundingRoundProject.filter({ fundingRoundId: r.id });
      // Funded projects move to SELECTED with fundingAllocated set; treasury picks them up.
      for (const it of items) {
        if (it.fundingStatus === "FULLY_FUNDED" || it.fundingStatus === "PARTIALLY_FUNDED") {
          await base44.entities.Project.update(it.projectId, { fundingAllocated: it.allocationAmount, status: "SELECTED" });
        }
      }
      await updateRound(r.id, { status: "ALLOCATION_APPROVED", allocationFinalizedAt: new Date().toISOString() },
        `Allocation approved for "${r.name}". Rankings and allocations are now immutable.`);
      toast({ title: "Allocation approved & locked", description: "Funded projects moved to the Treasury for disbursement." });
    } catch (e) {
      toast({ title: "Approval failed", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const startFunding = async (r) => {
    setBusy(r.id);
    try {
      const items = await base44.entities.FundingRoundProject.filter({ fundingRoundId: r.id });
      for (const it of items) {
        if (it.fundingStatus === "FULLY_FUNDED" || it.fundingStatus === "PARTIALLY_FUNDED") {
          await base44.entities.Project.update(it.projectId, { status: "FUNDING_APPROVED" });
        }
      }
      await updateRound(r.id, { status: "FUNDING_IN_PROGRESS" }, `Funding disbursement started for "${r.name}".`);
      toast({ title: "Funding in progress" });
    } finally { setBusy(null); }
  };

  const completeRound = async (r) => {
    setBusy(r.id);
    try {
      const items = await base44.entities.FundingRoundProject.filter({ fundingRoundId: r.id });
      const funded = items.filter((it) => it.fundingStatus === "FULLY_FUNDED" || it.fundingStatus === "PARTIALLY_FUNDED");
      const projs = await Promise.all(funded.map((it) => base44.entities.Project.get(it.projectId)));
      const allDisbursed = projs.every((p) => (p.fundingDisbursed || 0) >= (p.fundingAllocated || 0) - 0.01);
      if (!allDisbursed) {
        toast({ title: "Cannot complete yet", description: "Not all funded projects have been fully disbursed via the Treasury.", variant: "destructive" });
        return;
      }
      await updateRound(r.id, { status: "COMPLETED" }, `Round "${r.name}" completed — all allocations disbursed.`);
      toast({ title: "Round completed" });
    } finally { setBusy(null); }
  };

  const resume = async (r) => {
    setBusy(r.id);
    try {
      await updateRound(r.id, { status: "ACTIVE" }, `Round "${r.name}" resumed (unsuspended).`);
      toast({ title: "Round resumed", description: "Voting is active again." });
    } finally { setBusy(null); }
  };

  const suspendOrCancel = async (r, status) => {
    setBusy(r.id);
    try {
      await updateRound(r.id, { status }, `Round "${r.name}" marked ${status}.`);
      toast({ title: `Round ${status.toLowerCase()}` });
    } finally { setBusy(null); }
  };

  const saveEdit = async () => {
    const r = rounds.find((x) => x.id === edit.roundId);
    if (!r) return;
    setBusy("edit");
    try {
      const history = (() => { try { return JSON.parse(r.editHistory || "[]"); } catch { return []; } })();
      const newAmount = Number(edit.fundingAmount) || 0;
      const newEnd = new Date(edit.endDate).toISOString();
      const now = new Date().toISOString();
      if (newAmount !== r.fundingAmount) history.push({ field: "fundingAmount", from: r.fundingAmount, to: newAmount, admin: user?.full_name || "Admin", reason: edit.reason, timestamp: now });
      if (newEnd !== r.endDate) history.push({ field: "endDate", from: r.endDate, to: newEnd, admin: user?.full_name || "Admin", reason: edit.reason, timestamp: now });
      await base44.entities.FundingRound.update(r.id, { fundingAmount: newAmount, remainingAmount: newAmount, endDate: newEnd, editHistory: JSON.stringify(history) });
      await log("FUNDING_ROUND_EDITED", `Round "${r.name}" edited: amount→${fmtUSD(newAmount)}, end→${new Date(newEnd).toLocaleString()}. Reason: ${edit.reason || "—"}`);
      setEdit({ roundId: null, fundingAmount: "", endDate: "", reason: "" });
      await load();
      toast({ title: "Round updated", description: "Funding amount and end date saved." });
    } catch (e) {
      toast({ title: "Edit failed", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-bold">Funding Rounds</h2>
          <span className="text-xs text-muted-foreground">Governance-controlled charity allocation periods</span>
        </div>
        <button onClick={() => setShowCreate((s) => !s)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> New Funding Round
        </button>
      </div>

      {showCreate && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Create Funding Round</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Round name (e.g. October 2026 Community Fund)" className="rounded-lg border border-input bg-background px-3 py-2 text-sm sm:col-span-2" />
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description shown to voters" rows={2} className="rounded-lg border border-input bg-background px-3 py-2 text-sm sm:col-span-2" />
            <input type="number" min="0" step="0.01" value={form.fundingAmount} onChange={(e) => setForm({ ...form, fundingAmount: e.target.value })} placeholder="Funding amount (USD) from Charity Wallet" className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            <input type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div className="mt-3">
            <p className="text-xs font-semibold text-muted-foreground">Eligible projects (vetted/approved): {pool.length} available</p>
            <div className="mt-2 max-h-56 space-y-1.5 overflow-auto rounded-lg border border-border p-2">
              {pool.length === 0 && <p className="p-2 text-xs text-muted-foreground">No approved projects available. Approve projects via Project Vetting first.</p>}
              {pool.map((p) => (
                <label key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                  <input type="checkbox" checked={form.selected.includes(p.id)} onChange={() => toggleProject(p.id)} className="h-4 w-4" />
                  <span className="min-w-0 flex-1 truncate">{p.name} <span className="text-muted-foreground">· {p.clubName}</span></span>
                  <span className="text-xs text-muted-foreground">{fmtUSD(p.requestedFunding)}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
            <button onClick={createRound} disabled={busy === "create"} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Create Round
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading rounds…</div>
      ) : rounds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">No funding rounds yet. Create one to open governance-controlled charity allocation.</div>
      ) : (
        <div className="space-y-4">
          {rounds.map((r) => <RoundCard key={r.id} r={r} user={user} busy={busy} edit={edit} setEdit={setEdit} saveEdit={saveEdit}
            activate={activate} closeVoting={closeVoting} calculateAllocation={calculateAllocation} approveAllocation={approveAllocation}
            startFunding={startFunding} completeRound={completeRound} suspendOrCancel={suspendOrCancel} resume={resume} />)}
        </div>
      )}
    </div>
  );
}

function RoundCard({ r, user, busy, edit, setEdit, saveEdit, activate, closeVoting, calculateAllocation, approveAllocation, startFunding, completeRound, suspendOrCancel, resume }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const loadItems = async () => { const its = await base44.entities.FundingRoundProject.filter({ fundingRoundId: r.id }); setItems(its); };
  useEffect(() => { loadItems(); }, [r.id]);
  const st = STATUS[r.status] || STATUS.DRAFT;
  const ranked = [...items].sort((a, b) => (b.liveVotes || 0) - (a.liveVotes || 0));
  const canEdit = r.status === "ACTIVE";
  const editing = edit.roundId === r.id;
  const history = (() => { try { return JSON.parse(r.editHistory || "[]"); } catch { return []; } })();

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold">{r.name}</h3>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.tone)}>{st.label}</span>
          </div>
          {r.description && <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{r.description}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Wallet className="h-3 w-3" /> {fmtUSD(r.fundingAmount)} available</span>
            <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> ends {r.endDate ? new Date(r.endDate).toLocaleString() : "—"}</span>
            <span>{items.length} project(s)</span>
            <span>{fmtNum(r.totalVotes || 0)} GOV committed</span>
            {r.allocationFinalizedAt && <span className="inline-flex items-center gap-1 text-emerald-600"><Lock className="h-3 w-3" /> finalized {new Date(r.allocationFinalizedAt).toLocaleDateString()}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {r.status === "DRAFT" && <button onClick={() => activate(r)} disabled={busy === r.id} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Activate</button>}
          {r.status === "ACTIVE" && <button onClick={() => closeVoting(r)} disabled={busy === r.id} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">Close Voting</button>}
          {r.status === "VOTING_CLOSED" && <button onClick={() => calculateAllocation(r)} disabled={busy === r.id} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Calculate Allocation</button>}
          {r.status === "ALLOCATION_CALCULATED" && <button onClick={() => approveAllocation(r)} disabled={busy === r.id} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">Approve Allocation</button>}
          {r.status === "ALLOCATION_APPROVED" && <button onClick={() => startFunding(r)} disabled={busy === r.id} className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50">Start Funding</button>}
          {r.status === "FUNDING_IN_PROGRESS" && <button onClick={() => completeRound(r)} disabled={busy === r.id} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Mark Completed</button>}
          {r.status === "SUSPENDED" && <button onClick={() => resume(r)} disabled={busy === r.id} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Play className="h-3.5 w-3.5" /> Resume</button>}
          {(r.status === "ACTIVE" || r.status === "DRAFT") && <button onClick={() => suspendOrCancel(r, "SUSPENDED")} disabled={busy === r.id} className="rounded-lg border border-orange-300 px-2 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-50" title="Suspend"><Pause className="h-3.5 w-3.5" /></button>}
          {r.status !== "COMPLETED" && r.status !== "CANCELLED" && <button onClick={() => suspendOrCancel(r, "CANCELLED")} disabled={busy === r.id} className="rounded-lg border border-red-300 px-2 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" title="Cancel"><Ban className="h-3.5 w-3.5" /></button>}
          <button onClick={() => setOpen((o) => !o)} className="rounded-lg border border-border px-2 py-1.5 text-xs font-semibold hover:bg-muted">{open ? "Hide" : "Details"}</button>
        </div>
      </div>

      {/* Inline edit while active */}
      {canEdit && editing && (
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs font-semibold text-muted-foreground">Edit round (allowed only while Active)</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <input type="number" step="0.01" value={edit.fundingAmount} onChange={(e) => setEdit({ ...edit, fundingAmount: e.target.value })} placeholder={`Funding amount (was ${fmtUSD(r.fundingAmount)})`} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            <input type="datetime-local" value={edit.endDate} onChange={(e) => setEdit({ ...edit, endDate: e.target.value })} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            <input value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} placeholder="Reason for change (audit)" className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setEdit({ roundId: null, fundingAmount: "", endDate: "", reason: "" })} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">Cancel</button>
            <button onClick={saveEdit} disabled={busy === "edit"} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{busy === "edit" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save Changes</button>
          </div>
        </div>
      )}
      {canEdit && !editing && (
        <button onClick={() => setEdit({ roundId: r.id, fundingAmount: r.fundingAmount, endDate: r.endDate ? r.endDate.slice(0, 16) : "", reason: "" })} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Pencil className="h-3 w-3" /> Edit amount / end date</button>
      )}

      {/* Detail / allocation table */}
      {open && (
        <div className="mt-3 space-y-3">
          {history.length > 0 && (
            <div className="rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-xs">
              <p className="font-semibold text-amber-800">Edit history</p>
              <ul className="mt-1 space-y-0.5 text-amber-800">
                {history.map((h, i) => <li key={i}>{new Date(h.timestamp).toLocaleString()} — <b>{h.field}</b> {String(h.from)} → {String(h.to)} by {h.admin}. Reason: {h.reason || "—"}</li>)}
              </ul>
            </div>
          )}
          {items.length === 0 ? <p className="text-xs text-muted-foreground">No projects in this round.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-1.5 pr-2">Rank</th><th className="py-1.5 pr-2">Project</th><th className="py-1.5 pr-2">Request</th>
                    <th className="py-1.5 pr-2">GOV</th><th className="py-1.5 pr-2">Allocation</th><th className="py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((it) => (
                    <tr key={it.id} className="border-b border-border/60">
                      <td className="py-1.5 pr-2 font-semibold">{it.finalRank > 0 ? `#${it.finalRank}` : `#${ranked.indexOf(it) + 1}`}</td>
                      <td className="py-1.5 pr-2"><p className="font-medium">{it.projectName}</p><p className="text-[10px] text-muted-foreground">{it.clubName}</p></td>
                      <td className="py-1.5 pr-2">{fmtUSD(it.requestedFunding)}</td>
                      <td className="py-1.5 pr-2">{fmtNum(r.status === "ACTIVE" ? it.liveVotes : (it.finalVoteCount || it.liveVotes))}</td>
                      <td className="py-1.5 pr-2 font-semibold">{r.status === "ALLOCATION_CALCULATED" || r.status === "ALLOCATION_APPROVED" || r.status === "FUNDING_IN_PROGRESS" || r.status === "COMPLETED" ? fmtUSD(it.allocationAmount) : "—"}</td>
                      <td className="py-1.5">{it.fundingStatus !== "PENDING" && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", FUND_STATUS[it.fundingStatus])}>{it.fundingStatus.replace("_", " ").toLowerCase()}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}