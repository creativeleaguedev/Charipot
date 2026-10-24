import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { fmtUSD, fmtNum } from "@/lib/configRegistry";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Check, Loader2, Target, Trash2, ArrowRightCircle, ShieldCheck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS = {
  PENDING: { label: "Pending", tone: "bg-slate-100 text-slate-600", dot: "bg-slate-300", ring: "ring-slate-300" },
  IN_PROGRESS: { label: "In progress", tone: "bg-amber-100 text-amber-700", dot: "bg-amber-400", ring: "ring-amber-400" },
  VERIFIED: { label: "Verified", tone: "bg-blue-100 text-blue-700", dot: "bg-blue-500", ring: "ring-blue-500" },
  DISBURSED: { label: "Disbursed", tone: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", ring: "ring-emerald-500" },
  BLOCKED: { label: "Blocked", tone: "bg-red-100 text-red-700", dot: "bg-red-500", ring: "ring-red-500" },
};

// Visual milestone tracker for a single project. Shows each funding target as
// a step on a progress bar; admins can mark milestones verified and release the
// disbursement for a milestone once its cumulative target is covered by the
// project's allocated funding.
export default function MilestoneTracker({ project, user, onChanged }) {
  const { toast } = useToast();
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", amount: "", deadline: "" });

  const load = async () => {
    if (!project?.id) return;
    setLoading(true);
    try {
      const list = await base44.entities.Milestone.filter({ projectId: project.id }, "order", 200);
      list.sort((a, b) => (a.order || 0) - (b.order || 0));
      setMilestones(list);
    } catch (e) { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, [project?.id]);

  const allocated = project?.fundingAllocated || 0;
  const disbursed = project?.fundingDisbursed || 0;

  // Cumulative funding targets per milestone (each milestone "unlocks" when the
  // project allocation covers its cumulative target).
  let cum = 0;
  const enriched = milestones.map((m) => {
    const start = cum;
    const end = cum + (m.amount || 0);
    cum = end;
    const targetMet = allocated + 0.0001 >= end;
    return { ...m, start, end, targetMet };
  });
  const totalTarget = cum;
  const overallPct = totalTarget > 0 ? Math.min(100, (allocated / totalTarget) * 100) : 0;
  const releasedTotal = milestones.filter((m) => m.status === "DISBURSED").reduce((s, m) => s + (m.amount || 0), 0);

  const addMilestone = async () => {
    if (!form.title.trim() || !form.amount) {
      toast({ title: "Title and target amount are required", variant: "destructive" });
      return;
    }
    setBusy("add");
    try {
      await base44.entities.Milestone.create({
        projectId: project.id,
        projectName: project.name,
        title: form.title.trim(),
        description: form.description.trim(),
        amount: Math.max(0, Number(form.amount) || 0),
        deadline: form.deadline || undefined,
        status: "PENDING",
        order: milestones.length,
      });
      await base44.entities.AuditLog.create({
        actor: user?.full_name || "Treasury Admin", actorRole: "treasury_admin",
        action: "MILESTONE_CREATED", entityType: "Project", entityId: project.id,
        details: `Milestone "${form.title}" (target ${fmtUSD(Number(form.amount) || 0)}) added to ${project.name}`,
        timestamp: new Date().toISOString(), severity: "info",
      });
      setForm({ title: "", description: "", amount: "", deadline: "" });
      setShowAdd(false);
      await load();
      toast({ title: "Milestone added", description: form.title });
    } catch (e) {
      toast({ title: "Failed to add milestone", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const setStatus = async (m, status, auditAction, msg) => {
    setBusy(m.id);
    try {
      const update = { status };
      if (status === "VERIFIED" || status === "DISBURSED") update.completedAt = new Date().toISOString();
      await base44.entities.Milestone.update(m.id, update);
      await base44.entities.AuditLog.create({
        actor: user?.full_name || "Treasury Admin", actorRole: "treasury_admin",
        action: auditAction, entityType: "Milestone", entityId: m.id,
        details: `${project.name} → milestone "${m.title}" ${msg}`,
        timestamp: new Date().toISOString(), severity: "info",
      });
      await load();
      toast({ title: `Milestone ${msg}` });
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const release = async (m) => {
    if (!m.targetMet) {
      toast({ title: "Funding target not met", description: `Allocate at least ${fmtUSD(m.end)} before releasing this milestone.`, variant: "destructive" });
      return;
    }
    setBusy(m.id);
    try {
      await base44.entities.Milestone.update(m.id, { status: "DISBURSED", completedAt: new Date().toISOString() });
      const newDisbursed = +(disbursed + (m.amount || 0)).toFixed(2);
      await base44.entities.Project.update(project.id, { fundingDisbursed: newDisbursed });
      await base44.entities.AuditLog.create({
        actor: user?.full_name || "Treasury Admin", actorRole: "treasury_admin",
        action: "MILESTONE_DISBURSED", entityType: "Milestone", entityId: m.id,
        details: `${fmtUSD(m.amount || 0)} released for milestone "${m.title}" on ${project.name}. Project disbursed total now ${fmtUSD(newDisbursed)}.`,
        timestamp: new Date().toISOString(), severity: "warning",
      });
      await load();
      onChanged?.();
      toast({ title: "Disbursement released", description: `${fmtUSD(m.amount || 0)} for "${m.title}"` });
    } catch (e) {
      toast({ title: "Release failed", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const remove = async (m) => {
    if (m.status === "DISBURSED") {
      toast({ title: "Cannot remove a disbursed milestone", variant: "destructive" });
      return;
    }
    setBusy(m.id);
    try {
      await base44.entities.Milestone.delete(m.id);
      await load();
      toast({ title: "Milestone removed" });
    } catch (e) {
      toast({ title: "Failed to remove", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-accent" />
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Milestone Tracker</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>Allocated <b className="text-foreground">{fmtUSD(allocated)}</b></span>
          <span>Released <b className="text-emerald-600">{fmtUSD(releasedTotal)}</b></span>
          <span>Targets <b className="text-foreground">{fmtUSD(totalTarget)}</b></span>
        </div>
      </div>

      {/* Overall progress bar with milestone markers */}
      {totalTarget > 0 && (
        <div className="mt-3">
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="absolute inset-y-0 left-0 rounded-full bg-gold-gradient transition-all" style={{ width: `${overallPct}%` }} />
            {enriched.map((m, i) => {
              const left = (m.end / totalTarget) * 100;
              const reached = allocated + 0.0001 >= m.end;
              return (
                <div key={m.id} title={`${m.title}: ${fmtUSD(m.end)} cumulative`}
                  className={cn("absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full", reached ? "bg-emerald-600" : "bg-slate-500")}
                  style={{ left: `calc(${left}% - 2px)` }} />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{fmtUSD(0)}</span>
            <span>{overallPct.toFixed(0)}% of targets funded</span>
            <span>{fmtUSD(totalTarget)}</span>
          </div>
        </div>
      )}

      {/* Milestone list */}
      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading milestones…</div>
        ) : enriched.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
            No milestones yet. Add funding targets below to track and release disbursements as they're met.
          </div>
        ) : enriched.map((m, i) => {
          const st = STATUS[m.status] || STATUS.PENDING;
          const pctOfTarget = m.amount > 0 ? Math.min(100, Math.max(0, ((Math.min(allocated, m.end) - m.start) / m.amount) * 100)) : 0;
          return (
            <div key={m.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-2", st.ring, "bg-card")}>{i + 1}</span>
                    <p className="truncate text-sm font-semibold">{m.title}</p>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", st.tone)}>{st.label}</span>
                  </div>
                  {m.description && <p className="mt-1 pl-8 text-xs text-muted-foreground">{m.description}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-8 text-[11px] text-muted-foreground">
                    <span>Target <b className="text-foreground">{fmtUSD(m.amount)}</b></span>
                    <span>Cumulative <b className="text-foreground">{fmtUSD(m.end)}</b></span>
                    {m.deadline && <span>Due {new Date(m.deadline).toLocaleDateString()}</span>}
                    {m.targetMet ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="h-3 w-3" /> Funding target met</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" /> Needs {fmtUSD(m.end - allocated)} more</span>
                    )}
                  </div>
                  {/* Per-milestone fill */}
                  <div className="mt-2 pl-8">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className={cn("h-full rounded-full transition-all", m.status === "DISBURSED" ? "bg-emerald-500" : "bg-primary")} style={{ width: `${pctOfTarget}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {m.status === "DISBURSED" ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" /> Released</span>
                  ) : (
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {m.status === "PENDING" && (
                        <button onClick={() => setStatus(m, "IN_PROGRESS", "MILESTONE_STARTED", "marked in progress")} disabled={busy === m.id}
                          className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">Start</button>
                      )}
                      {(m.status === "PENDING" || m.status === "IN_PROGRESS") && (
                        <button onClick={() => setStatus(m, "VERIFIED", "MILESTONE_VERIFIED", "verified")} disabled={busy === m.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"><ShieldCheck className="h-3.5 w-3.5" /> Verify</button>
                      )}
                      {(m.status === "PENDING" || m.status === "IN_PROGRESS" || m.status === "VERIFIED") && (
                        <button onClick={() => release(m)} disabled={busy === m.id || !m.targetMet}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                          {busy === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightCircle className="h-3.5 w-3.5" />} Release {fmtUSD(m.amount)}
                        </button>
                      )}
                      {m.status !== "DISBURSED" && (
                        <button onClick={() => remove(m)} disabled={busy === m.id} title="Remove milestone"
                          className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add milestone form */}
      {showAdd ? (
        <div className="mt-3 rounded-lg border border-border bg-card p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Milestone title (e.g. Phase 1 — Borehole drilling)"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary sm:col-span-2" />
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary sm:col-span-2" />
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Target amount (USD)"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
            <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">Cancel</button>
            <button onClick={addMilestone} disabled={busy === "add"} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add milestone
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
          <Plus className="h-3.5 w-3.5" /> Add funding milestone
        </button>
      )}
    </div>
  );
}