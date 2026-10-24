import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { fmtUSD, fmtNum } from "@/lib/configRegistry";
import { useToast } from "@/components/ui/use-toast";
import { parseAttachments, AttachmentGallery } from "@/components/support/AttachmentUpload";
import ImageCarousel from "@/components/projects/ImageCarousel";
import {
  ShieldCheck, Check, X, FileSearch, MessageSquareWarning, Send, Loader2,
  Clock, Building2, Wallet, Paperclip, AlertTriangle, Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  SUBMITTED: "bg-blue-100 text-blue-700",
  UNDER_REVIEW: "bg-amber-100 text-amber-700",
  INFORMATION_REQUIRED: "bg-orange-100 text-orange-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
  VOTING: "bg-accent/15 text-accent",
};

const parseArr = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; }
};
const parseObj = (v) => {
  if (!v || typeof v !== "string") return v && typeof v === "object" ? v : {};
  try { return JSON.parse(v) || {}; } catch { return {}; }
};
const galleryImages = (p) => parseAttachments(p.mediaGallery).filter((a) => a.kind === "image").map((a) => a.url);

export default function ProjectReviewPanel({ user }) {
  const { toast } = useToast();
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("queue");

  const load = async () => {
    const all = await base44.entities.Project.list("-submittedAt", 200);
    setProjects(all.filter((p) => ["SUBMITTED", "UNDER_REVIEW", "INFORMATION_REQUIRED", "APPROVED", "REJECTED", "VOTING", "SELECTED", "FUNDING_APPROVED", "FUNDING_IN_PROGRESS", "COMPLETED"].includes(p.status)));
  };
  useEffect(() => { load(); }, []);

  const queue = projects.filter((p) => ["SUBMITTED", "UNDER_REVIEW", "INFORMATION_REQUIRED"].includes(p.status));
  const approved = projects.filter((p) => p.status === "APPROVED");
  const rejected = projects.filter((p) => p.status === "REJECTED");
  const live = projects.filter((p) => ["VOTING", "SELECTED", "FUNDING_APPROVED", "FUNDING_IN_PROGRESS", "COMPLETED"].includes(p.status));
  const list = filter === "queue" ? queue : filter === "approved" ? approved : filter === "live" ? live : rejected;

  const counts = {
    new: projects.filter((p) => p.status === "SUBMITTED").length,
    review: projects.filter((p) => p.status === "UNDER_REVIEW").length,
    info: projects.filter((p) => p.status === "INFORMATION_REQUIRED").length,
    approved: approved.length,
    rejected: rejected.length,
  };

  const act = async (p, status, opts = {}) => {
    setBusy(true);
    try {
      const update = { status };
      if (status === "APPROVED") update.approvedAt = new Date().toISOString();
      await base44.entities.Project.update(p.id, update);
      await base44.entities.AuditLog.create({
        actor: user?.full_name || "Vetting Officer", actorRole: "vetting_officer", action: opts.auditAction,
        entityType: "Project", entityId: p.id,
        details: `${p.name} → ${status.replace(/_/g, " ")}${opts.noteText ? `. Note: ${opts.noteText}` : ""}`,
        timestamp: new Date().toISOString(), severity: opts.severity || "info",
      });
      if (opts.supportNote && p.submittedById) {
        // Reviewer note → deliver via a support ticket so it reaches the
        // submitter's support inbox, email, and notification bell (the
        // adminCreateSupportTicket function handles all three).
        try {
          await base44.functions.invoke("adminCreateSupportTicket", {
            userId: p.submittedById,
            subject: opts.supportSubject || opts.notifyTitle,
            body: opts.supportNote,
            category: "Projects",
          });
        } catch (_) {
          await base44.entities.Notification.create({
            userId: p.submittedById, title: opts.notifyTitle, message: opts.notifyMsg, type: "project", createdAt: new Date().toISOString(),
          });
        }
      } else if (p.submittedById) {
        await base44.entities.Notification.create({
          userId: p.submittedById, title: opts.notifyTitle, message: opts.notifyMsg, type: "project", createdAt: new Date().toISOString(),
        });
      }
      toast({ title: opts.actionLabel, description: p.name });
      setNote("");
      await load();
      if (selected?.id === p.id) setSelected(await base44.entities.Project.get(p.id));
    } catch (e) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const startReview = (p) => act(p, "UNDER_REVIEW", { auditAction: "PROJECT_REVIEW_STARTED", actionLabel: "Review started", notifyTitle: "Project under review", notifyMsg: `${p.name} is now under administrative review.` });
  const requestEdits = (p) => {
    if (!note.trim()) return toast({ title: "Add a note for the submitter", variant: "destructive" });
    act(p, "INFORMATION_REQUIRED", { auditAction: "PROJECT_INFO_REQUESTED", severity: "warning", actionLabel: "Edits requested", noteText: note.trim(), notifyTitle: "Edits requested on your project", notifyMsg: `${p.name}: ${note.trim()}`, supportSubject: `Edits requested on your project: ${p.name}`, supportNote: note.trim() });
  };
  const approve = (p) => act(p, "APPROVED", { auditAction: "PROJECT_APPROVED", actionLabel: "Project approved", notifyTitle: "Your project was approved", notifyMsg: `${p.name} passed vetting and is ready to go live for voting.` });
  const publish = (p) => act(p, "VOTING", { auditAction: "PROJECT_PUBLISHED", actionLabel: "Published to voting", notifyTitle: "Your project is live for voting", notifyMsg: `${p.name} is now open for GOV voting.` });
  const reject = (p) => {
    if (!note.trim()) return toast({ title: "Add a rejection reason", variant: "destructive" });
    act(p, "REJECTED", { auditAction: "PROJECT_REJECTED", severity: "warning", actionLabel: "Project rejected", noteText: note.trim(), notifyTitle: "Your project was not approved", notifyMsg: `${p.name}: ${note.trim()}`, supportSubject: `Your project was not approved: ${p.name}`, supportNote: note.trim() });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="h-5 w-5 text-primary" /> Project Review Dashboard</h2>
        <p className="text-sm text-muted-foreground">Verify, approve, or request edits on submitted charity projects before they go live for voting. Every decision is audited and notifies the submitter.</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "New", value: counts.new, tone: "bg-blue-50 text-blue-700" },
          { label: "In review", value: counts.review, tone: "bg-amber-50 text-amber-700" },
          { label: "Awaiting info", value: counts.info, tone: "bg-orange-50 text-orange-700" },
          { label: "Approved", value: counts.approved, tone: "bg-emerald-50 text-emerald-700" },
          { label: "Rejected", value: counts.rejected, tone: "bg-red-50 text-red-700" },
        ].map((s) => (
          <div key={s.label} className={cn("rounded-xl border border-border p-3", s.tone)}>
            <p className="text-[11px] font-medium opacity-80">{s.label}</p>
            <p className="mt-0.5 text-xl font-bold">{fmtNum(s.value)}</p>
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2">
        {[
          { key: "queue", label: `Queue (${fmtNum(queue.length)})` },
          { key: "approved", label: `Approved (${fmtNum(approved.length)})` },
          { key: "live", label: `Live (${fmtNum(live.length)})` },
          { key: "rejected", label: `Rejected (${fmtNum(rejected.length)})` },
        ].map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={cn("rounded-full px-4 py-1.5 text-sm font-medium", filter === f.key ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:bg-muted")}>{f.label}</button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Queue list */}
        <div className="space-y-2 lg:col-span-1">
          {list.length === 0 && <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">No projects in this view.</div>}
          {list.map((p) => (
            <button key={p.id} onClick={() => setSelected(p)} className={cn("w-full rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/40", selected?.id === p.id ? "border-primary ring-1 ring-primary" : "border-border")}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold">{p.name}</p>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLES[p.status] || "bg-muted text-muted-foreground")}>{p.status.replace(/_/g, " ")}</span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{p.clubName} · {p.category}</p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{fmtUSD(p.requestedFunding)}</span>
                <span>{p.submittedAt ? new Date(p.submittedAt).toLocaleDateString() : "—"}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              <FileSearch className="h-10 w-10 text-muted-foreground/60" />
              <p className="mt-3">Select a project to review its full submission.</p>
            </div>
          ) : (
            <ReviewDetail
              p={selected}
              busy={busy}
              note={note}
              setNote={setNote}
              onStartReview={() => startReview(selected)}
              onRequestEdits={() => requestEdits(selected)}
              onApprove={() => approve(selected)}
              onPublish={() => publish(selected)}
              onReject={() => reject(selected)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-2 space-y-1.5 text-sm">{children}</div>
    </div>
  );
}
function Row({ label, value }) {
  return <div className="flex justify-between gap-3"><span className="shrink-0 text-muted-foreground">{label}</span><span className="text-right font-medium">{value ?? "—"}</span></div>;
}

function ReviewDetail({ p, busy, note, setNote, onStartReview, onRequestEdits, onApprove, onPublish, onReject }) {
  const org = parseObj(p.orgDetails);
  const bd = parseObj(p.beneficiaryBreakdown);
  const fs = parseObj(p.fundingSources);
  const imgs = galleryImages(p);
  const canEdit = (arr, keys) => Array.isArray(arr) && arr.length > 0;

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold">{p.name}</h3>
            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", STATUS_STYLES[p.status] || "bg-muted text-muted-foreground")}>{p.status.replace(/_/g, " ")}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{p.clubName} · {p.category} · {p.region || p.location}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Ref {p.projectReference || "—"} · Submitted by {p.submittedBy || "—"} on {p.submittedAt ? new Date(p.submittedAt).toLocaleString() : "—"}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">Requested</p>
          <p className="text-lg font-bold">{fmtUSD(p.requestedFunding)}</p>
          <p className="text-[11px] text-muted-foreground">Beneficiaries {fmtNum(p.beneficiaries)}</p>
        </div>
      </div>

      {/* Media gallery */}
      {imgs.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <ImageCarousel images={imgs} className="h-44 w-full" />
        </div>
      )}

      {/* Overview */}
      <Section title="Overview">
        <Row label="Short description" value={p.shortDescription || p.description} />
        <Row label="Timeline" value={p.timeline || [p.startDate, p.expectedCompletionDate].filter(Boolean).join(" → ")} />
        <Row label="Funding model" value={p.fundingModel} />
        <Row label="Total project cost" value={fmtUSD(p.totalProjectCost || p.budget)} />
      </Section>

      {/* Need & beneficiaries */}
      <Section title="Problem & Beneficiaries">
        <Row label="Problem statement" value={p.problemStatement} />
        <Row label="Community need" value={p.communityNeed} />
        <Row label="Why this project" value={p.whyThisProject} />
        <Row label="Existing alternatives" value={p.existingAlternatives} />
        <Row label="Primary beneficiaries" value={p.primaryBeneficiaries} />
        <Row label="Estimated number" value={p.estimatedNumber} />
        <Row label="Vulnerable groups" value={p.vulnerableGroups} />
        <Row label="Selection method" value={p.selectionMethod} />
        <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
          {[["Total", bd.total], ["Male", bd.male], ["Female", bd.female], ["Children", bd.children], ["Youth", bd.youth], ["Adults", bd.adults], ["Disabilities", bd.disabilities]].map(([k, v]) => v != null && v !== "" && (
            <span key={k} className="rounded-md bg-muted px-2 py-0.5">{k}: {v}</span>
          ))}
        </div>
      </Section>

      {/* Objectives & plan */}
      {(canEdit(parseArr(p.objectives)) || canEdit(parseArr(p.activities))) && (
        <Section title="Objectives & Plan">
          {parseArr(p.objectives).map((o, i) => (
            <div key={i} className="rounded-lg bg-muted/40 p-2">
              <p className="font-medium">{i + 1}. {o.objective}</p>
              <p className="text-xs text-muted-foreground">Target: {o.target} · Measure: {o.measurement}</p>
            </div>
          ))}
          {parseArr(p.activities).map((a, i) => (
            <div key={i} className="rounded-lg bg-muted/40 p-2">
              <p className="font-medium">{a.activity}</p>
              <p className="text-xs text-muted-foreground">{a.description} · Qty {a.quantity} · {a.timeline} · {a.responsible}</p>
            </div>
          ))}
        </Section>
      )}

      {/* Budget */}
      <Section title="Budget">
        <Row label="Requested from platform" value={fmtUSD(p.requestedFunding)} />
        <Row label="Minimum viable funding" value={fmtUSD(p.minimumViableFunding)} />
        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
          {[["Charity Organization", fs.rotaryContribution], ["Community", fs.communityContribution], ["Other donors", fs.otherDonors], ["Government", fs.govtContribution], ["Other", fs.otherFunding], ["Already secured", fs.alreadySecured], ["Funding gap", fs.fundingGap]].map(([k, v]) => (
            <div key={k} className="rounded-md bg-muted/40 px-2 py-1 text-xs"><span className="text-muted-foreground">{k}</span><br /><b>{fmtUSD(Number(v) || 0)}</b></div>
          ))}
        </div>
        {parseArr(p.detailedBudget).length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground"><tr><th className="p-2 text-left">Item</th><th className="p-2 text-left">Description</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Unit</th><th className="p-2 text-right">Total</th></tr></thead>
              <tbody>
                {parseArr(p.detailedBudget).map((r, i) => (
                  <tr key={i} className="border-t border-border"><td className="p-2">{r.item}</td><td className="p-2">{r.description}</td><td className="p-2 text-right">{r.quantity}</td><td className="p-2 text-right">{fmtUSD(Number(r.unitCost) || 0)}</td><td className="p-2 text-right font-semibold">{fmtUSD(Number(r.total) || 0)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Impact & sustainability */}
      <Section title="Impact & Sustainability">
        <Row label="Outputs" value={p.impactOutputs} />
        <Row label="Outcomes" value={p.impactOutcomes} />
        <Row label="Long-term impact" value={p.impactLongTerm} />
        <Row label="Sustainability plan" value={p.sustainabilityPlan} />
        <Row label="Operator / Maintainer" value={[p.sustainabilityOperator, p.sustainabilityMaintainer].filter(Boolean).join(" / ")} />
        <Row label="Ongoing costs" value={p.ongoingCosts} />
        <Row label="Who pays" value={p.whoPays} />
      </Section>

      {/* Compliance */}
      <Section title="Compliance & Procurement">
        <Row label="Conflict of interest" value={p.coiDeclared === "yes" ? "Declared — see details" : "None declared"} />
        {parseArr(p.coiDetails).map((c, i) => (
          <div key={i} className="rounded-lg bg-muted/40 p-2 text-xs">{c.person} · {c.relationship} · {c.interest} — {c.explanation}</div>
        ))}
        <Row label="Procurement method" value={p.procurementMethod} />
        <Row label="Quotations available" value={p.procurementQuotes} />
        <Row label="Suppliers identified" value={p.procurementSuppliers} />
        <Row label="Competitive required" value={p.procurementCompetitive} />
      </Section>

      {/* Documents */}
      <Section title="Documents">
        <p className="text-[11px] text-muted-foreground">Verification documents</p>
        <AttachmentGallery value={p.verificationDocs} />
        <p className="pt-1 text-[11px] text-muted-foreground">Evidence of need</p>
        <AttachmentGallery value={p.evidenceOfNeed} />
        <p className="pt-1 text-[11px] text-muted-foreground">Public documents</p>
        <AttachmentGallery value={p.publicDocs} />
        <p className="pt-1 text-[11px] text-muted-foreground">Private / confidential documents</p>
        <AttachmentGallery value={p.privateDocs} />
        <p className="pt-1 text-[11px] text-muted-foreground">Procurement documents</p>
        <AttachmentGallery value={p.procurementDocs} />
      </Section>

      {/* Disbursement */}
      <Section title="Disbursement">
        <Row label="Wallet address" value={<span className="font-mono text-xs">{p.paymentWalletAddress}</span>} />
        <Row label="Network / Token" value={`${(p.paymentNetwork || "bnb").toUpperCase()} · ${p.paymentToken || "USDC"}`} />
        <Row label="Bank details" value={p.paymentBankDetails} />
      </Section>

      {/* Reviewer note */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Reviewer note to submitter (required for Request edits & Reject)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Please add a detailed budget breakdown and upload the signed authorization letter." className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
      </div>

      {/* Action bar */}
      <div className="sticky bottom-0 flex flex-wrap gap-2 rounded-xl border border-border bg-card p-3">
        {p.status === "SUBMITTED" && (
          <button onClick={onStartReview} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"><FileSearch className="h-4 w-4" /> Start review</button>
        )}
        {(p.status === "UNDER_REVIEW" || p.status === "INFORMATION_REQUIRED") && (
          <button onClick={onRequestEdits} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"><MessageSquareWarning className="h-4 w-4" /> Request edits</button>
        )}
        {p.status !== "APPROVED" && p.status !== "VOTING" && (
          <button onClick={onApprove} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Check className="h-4 w-4" /> Approve</button>
        )}
        {p.status === "APPROVED" && (
          <button onClick={onPublish} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-3 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"><Trophy className="h-4 w-4" /> Publish to voting</button>
        )}
        {p.status !== "REJECTED" && p.status !== "VOTING" && (
          <button onClick={onReject} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"><X className="h-4 w-4" /> Reject</button>
        )}
        {busy && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {p.status === "INFORMATION_REQUIRED" && (
          <p className="ml-auto self-center text-[11px] text-orange-600"><AlertTriangle className="mr-1 inline h-3 w-3" />Awaiting submitter edits.</p>
        )}
      </div>
    </div>
  );
}