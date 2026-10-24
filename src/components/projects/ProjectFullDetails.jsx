import React from "react";
import { X, MapPin, Users, DollarSign, Target, TrendingUp, ShieldCheck, Paperclip, Heart, Calendar } from "lucide-react";
import { fmtUSD, fmtNum } from "@/lib/configRegistry";
import { parseAttachments, AttachmentGallery } from "@/components/support/AttachmentUpload";
import ImageCarousel from "@/components/projects/ImageCarousel";
import { cn } from "@/lib/utils";

const parseArr = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; }
};
const parseObj = (v) => {
  if (!v) return {};
  if (typeof v === "object") return v;
  try { return JSON.parse(v) || {}; } catch { return {}; }
};
const has = (v) => v != null && String(v).trim() !== "";
const galleryImages = (p) => parseAttachments(p.mediaGallery).filter((a) => a.kind === "image").map((a) => a.url);

function Section({ icon: Icon, title, children }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-accent" />}
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      </div>
      <div className="mt-3 space-y-2 text-sm">{children}</div>
    </div>
  );
}
function Row({ label, value }) {
  if (!has(value)) return null;
  return (
    <div className="flex justify-between gap-3 border-b border-border/60 pb-1.5">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

// Full public project details. Excludes sensitive personal data: submitter
// name, official email/phone, authorized officer/president names, club contact,
// wallet addresses, bank details, team member names/contacts, and COI person names.
// Supporting documents (verification, evidence, procurement) are admin-only.
export default function ProjectFullDetails({ project: p, onClose, isAdmin }) {
  if (!p) return null;
  const org = parseObj(p.orgDetails);
  const bd = parseObj(p.beneficiaryBreakdown);
  const fs = parseObj(p.fundingSources);
  const imgs = galleryImages(p);
  const objectives = parseArr(p.objectives);
  const activities = parseArr(p.activities);
  const timeline = parseArr(p.implementationTimeline);
  const team = parseArr(p.implementationTeam);
  const budget = parseArr(p.detailedBudget);
  const kpis = parseArr(p.impactKpis);
  const phases = parseArr(p.phases);
  const coi = parseArr(p.coiDetails);

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-background">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold sm:text-xl">{p.name}</h2>
          <p className="truncate text-xs text-muted-foreground">{p.clubName} · {p.category} · {p.region || p.location}</p>
        </div>
        <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
          <X className="h-4 w-4" /> Close
        </button>
      </div>

      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
        {/* Cover gallery */}
        {imgs.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-border">
            <ImageCarousel images={imgs} className="h-56 w-full sm:h-72" />
          </div>
        )}

        {/* Overview */}
        <Section icon={Target} title="Overview">
          <Row label="Status" value={p.status?.replace(/_/g, " ")} />
          <Row label="Reference" value={p.projectReference} />
          <Row label="Short description" value={p.shortDescription || p.description} />
          <Row label="Location" value={p.location || p.region} />
          <Row label="Timeline" value={p.timeline || [p.startDate, p.expectedCompletionDate].filter(Boolean).join(" → ")} />
          <Row label="Funding model" value={p.fundingModel} />
          <Row label="Total project cost" value={fmtUSD(p.totalProjectCost || p.budget)} />
          <Row label="Requested from platform" value={fmtUSD(p.requestedFunding)} />
          <Row label="Minimum viable funding" value={fmtUSD(p.minimumViableFunding)} />
          <Row label="Allocated" value={fmtUSD(p.fundingAllocated)} />
          <Row label="Disbursed" value={fmtUSD(p.fundingDisbursed)} />
        </Section>

        {/* Organization (non-personal) */}
        <Section icon={ShieldCheck} title="Organization">
          <Row label="Rotary Club / organization" value={p.clubName} />
          <Row label="District" value={org.district} />
          <Row label="Country" value={org.orgCountry} />
          <Row label="Registration / identification" value={org.registrationId} />
        </Section>

        {/* Problem & beneficiaries */}
        <Section icon={Heart} title="Problem & Beneficiaries">
          <Row label="Problem statement" value={p.problemStatement} />
          <Row label="Community need" value={p.communityNeed} />
          <Row label="Why this project" value={p.whyThisProject} />
          <Row label="Existing alternatives" value={p.existingAlternatives} />
          <Row label="Primary beneficiaries" value={p.primaryBeneficiaries} />
          <Row label="Estimated number" value={p.estimatedNumber} />
          <Row label="Secondary beneficiaries" value={p.secondaryBeneficiaries} />
          <Row label="Geographic area" value={p.beneficiaryArea} />
          <Row label="Vulnerable groups" value={p.vulnerableGroups} />
          <Row label="Selection method" value={p.selectionMethod} />
          <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
            {[["Total", bd.total], ["Male", bd.male], ["Female", bd.female], ["Children", bd.children], ["Youth", bd.youth], ["Adults", bd.adults], ["Disabilities", bd.disabilities], ["Other", bd.other]].map(([k, v]) => has(v) && (
              <span key={k} className="rounded-md bg-muted px-2 py-0.5">{k}: {v}</span>
            ))}
          </div>
        </Section>

        {/* Objectives & activities */}
        {(objectives.length > 0 || activities.length > 0) && (
          <Section icon={Target} title="Objectives & Activities">
            {objectives.map((o, i) => (
              <div key={i} className="rounded-lg bg-muted/40 p-3">
                <p className="font-medium">{i + 1}. {o.objective}</p>
                <p className="text-xs text-muted-foreground">Target: {o.target} · Measure: {o.measurement}</p>
              </div>
            ))}
            {activities.map((a, i) => (
              <div key={i} className="rounded-lg bg-muted/40 p-3">
                <p className="font-medium">{a.activity}</p>
                <p className="text-xs text-muted-foreground">{a.description} · Qty {a.quantity} · {a.timeline} · {a.responsible}</p>
                <p className="text-xs text-muted-foreground">Expected output: {a.expectedOutput}</p>
              </div>
            ))}
          </Section>
        )}

        {/* Implementation timeline */}
        {timeline.length > 0 && (
          <Section icon={Calendar} title="Implementation Timeline">
            {timeline.map((m, i) => (
              <div key={i} className="rounded-lg bg-muted/40 p-3">
                <p className="font-medium">{m.milestone}</p>
                <p className="text-xs text-muted-foreground">{m.start} → {m.end} · Expected result: {m.result}</p>
              </div>
            ))}
          </Section>
        )}

        {/* Implementation team (names & contacts excluded) */}
        {team.length > 0 && (
          <Section icon={Users} title="Implementation Team">
            {team.map((t, i) => (
              <div key={i} className="rounded-lg bg-muted/40 p-3">
                <p className="font-medium">{t.position} · {t.organization}</p>
                <p className="text-xs text-muted-foreground">Responsibility: {t.responsibility}</p>
                <p className="text-xs text-muted-foreground">Relevant experience: {t.experience}</p>
              </div>
            ))}
          </Section>
        )}

        {/* Budget */}
        <Section icon={DollarSign} title="Budget">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[["Rotary", fs.rotaryContribution], ["Community", fs.communityContribution], ["Other donors", fs.otherDonors], ["Government", fs.govtContribution], ["Other", fs.otherFunding], ["Already secured", fs.alreadySecured], ["Funding gap", fs.fundingGap]].map(([k, v]) => (
              <div key={k} className="rounded-md bg-muted/40 px-2 py-1 text-xs"><span className="text-muted-foreground">{k}</span><br /><b>{fmtUSD(Number(v) || 0)}</b></div>
            ))}
          </div>
          {phases.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
              {phases.map((ph, i) => <span key={i} className="rounded-md bg-muted px-2 py-0.5">{ph.phase}: {fmtUSD(Number(ph.amount) || 0)}</span>)}
            </div>
          )}
          {budget.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground"><tr><th className="p-2 text-left">Item</th><th className="p-2 text-left">Description</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Unit</th><th className="p-2 text-right">Total</th></tr></thead>
                <tbody>
                  {budget.map((r, i) => (
                    <tr key={i} className="border-t border-border"><td className="p-2">{r.item}</td><td className="p-2">{r.description}</td><td className="p-2 text-right">{r.quantity}</td><td className="p-2 text-right">{fmtUSD(Number(r.unitCost) || 0)}</td><td className="p-2 text-right font-semibold">{fmtUSD(Number(r.total) || 0)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Impact & sustainability */}
        <Section icon={TrendingUp} title="Impact & Sustainability">
          <Row label="Outputs" value={p.impactOutputs} />
          <Row label="Outcomes" value={p.impactOutcomes} />
          <Row label="Long-term impact" value={p.impactLongTerm} />
          {kpis.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {kpis.map((k, i) => (
                <div key={i} className="rounded-lg bg-muted/40 p-2 text-xs">
                  <p className="font-medium">{k.kpi}</p>
                  <p className="text-muted-foreground">Baseline: {k.baseline} · Target: {k.target} · Measure: {k.measurement}</p>
                </div>
              ))}
            </div>
          )}
          <Row label="Sustainability plan" value={p.sustainabilityPlan} />
          <Row label="Operator" value={p.sustainabilityOperator} />
          <Row label="Maintainer" value={p.sustainabilityMaintainer} />
          <Row label="Ongoing costs" value={p.ongoingCosts} />
          <Row label="Who pays" value={p.whoPays} />
          <Row label="Revenue / maintenance model" value={p.revenueModel} />
          <Row label="Plan if no further funding" value={p.ifNoFunding} />
        </Section>

        {/* Compliance (COI person names excluded) */}
        <Section icon={ShieldCheck} title="Compliance & Procurement">
          <Row label="Conflict of interest" value={p.coiDeclared === "yes" ? "Declared" : "None declared"} />
          {coi.length > 0 && coi.map((c, i) => (
            <div key={i} className="rounded-lg bg-muted/40 p-2 text-xs">
              <p>Relationship: {c.relationship}</p>
              <p className="text-muted-foreground">Interest: {c.interest} — {c.explanation}</p>
            </div>
          ))}
          <Row label="Procurement method" value={p.procurementMethod} />
          <Row label="Quotations available" value={p.procurementQuotes} />
          <Row label="Suppliers identified" value={p.procurementSuppliers} />
          <Row label="Competitive required" value={p.procurementCompetitive} />
        </Section>

        {/* Public documents only — verification, evidence and procurement
            documents are sensitive and are never shown on the project info view. */}
        {isAdmin && (
        <Section icon={Paperclip} title="Documents">
          <p className="text-[11px] font-medium text-muted-foreground">Public documents</p>
          <AttachmentGallery value={p.publicDocs} />
        </Section>
        )}

        {/* Disbursement (wallet address & bank excluded) */}
        <Section icon={DollarSign} title="Disbursement">
          <Row label="Network" value={(p.paymentNetwork || "bnb").toUpperCase()} />
          <Row label="Token" value={p.paymentToken || "USDC"} />
        </Section>

        {p.impactSummary && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-700"><Heart className="h-4 w-4" /> Impact Report</p>
            <p className="mt-1 text-sm text-emerald-800">{p.impactSummary}</p>
          </div>
        )}

        <div className="flex justify-center pb-4">
          <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-6 py-2.5 text-sm font-semibold hover:bg-muted">
            <X className="h-4 w-4" /> Close details
          </button>
        </div>
      </div>
    </div>
  );
}