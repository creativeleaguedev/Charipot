import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { parseAttachments } from "@/components/support/AttachmentUpload";
import {
  Field, TextInput, TextArea, SelectInput, NumberInput, DateInput,
  Repeatable, FileUpload, SectionTitle,
  CATEGORIES, FUNDING_MODELS, NETWORKS, TOKENS,
} from "@/components/projects/wizardFields";
import { cn } from "@/lib/utils";
import {
  Building2, FolderKanban, Heart, Target, DollarSign, TrendingUp,
  ShieldCheck, Paperclip, Wallet, CheckCircle2, X, ChevronLeft, ChevronRight,
  Loader2, Info,
} from "lucide-react";

const EMPTY = {
  // Organization
  clubName: "", district: "", orgCountry: "", registrationId: "", clubContact: "",
  authorizedOfficer: "", president: "", officialEmail: "", officialPhone: "",
  // Project
  name: "", shortDescription: "", category: CATEGORIES[0], location: "",
  startDate: "", expectedCompletionDate: "",
  // Need
  problemStatement: "", communityNeed: "", evidenceOfNeed: "", whyThisProject: "",
  existingAlternatives: "",
  primaryBeneficiaries: "", estimatedNumber: "", secondaryBeneficiaries: "",
  beneficiaryArea: "", vulnerableGroups: "", selectionMethod: "",
  benTotal: "", benMale: "", benFemale: "", benChildren: "", benYouth: "",
  benAdults: "", benDisabilities: "", benOther: "",
  // Objectives, Activities & Implementation
  objectives: [], activities: [], implementationTimeline: [], implementationTeam: [],
  // Budget
  totalProjectCost: "", requestedFunding: "", detailedBudget: [],
  rotaryContribution: "", communityContribution: "", otherDonors: "",
  govtContribution: "", otherFunding: "", alreadySecured: "", fundingGap: "",
  fundingModel: "full", minimumViableFunding: "", phases: [],
  // Impact & Sustainability
  impactOutputs: "", impactOutcomes: "", impactLongTerm: "", impactKpis: [],
  sustainabilityPlan: "", sustainabilityOperator: "", sustainabilityMaintainer: "",
  ongoingCosts: "", whoPays: "", revenueModel: "", ifNoFunding: "",
  // Compliance
  coiDeclared: "no", coiDetails: [],
  procurementMethod: "", procurementQuotes: "", procurementSuppliers: "",
  procurementCompetitive: "", procurementDocs: "",
  // Documents
  verificationDocs: "", publicDocs: "", privateDocs: "", mediaGallery: "",
  // Disbursement
  paymentWalletAddress: "", paymentNetwork: "bnb", paymentToken: "USDC",
  paymentBankDetails: "",
  // Declaration
  declarationAgreed: false,
};

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

// Rebuild the flat wizard form from a saved Project record (so a draft can be reopened and edited).
const hydrate = (p) => {
  const org = parseObj(p.orgDetails);
  const bd = parseObj(p.beneficiaryBreakdown);
  const fs = parseObj(p.fundingSources);
  return {
    ...EMPTY,
    clubName: p.clubName || "",
    district: org.district || "", orgCountry: org.orgCountry || "",
    registrationId: org.registrationId || "", clubContact: org.clubContact || "",
    authorizedOfficer: org.authorizedOfficer || "", president: org.president || "",
    officialEmail: org.officialEmail || "", officialPhone: org.officialPhone || "",
    name: p.name || "", shortDescription: p.shortDescription || p.description || "",
    category: p.category || CATEGORIES[0], location: p.location || p.region || "",
    startDate: p.startDate || "", expectedCompletionDate: p.expectedCompletionDate || "",
    projectReference: p.projectReference || "",
    problemStatement: p.problemStatement || "", communityNeed: p.communityNeed || "",
    evidenceOfNeed: p.evidenceOfNeed || "", whyThisProject: p.whyThisProject || "",
    existingAlternatives: p.existingAlternatives || "",
    primaryBeneficiaries: p.primaryBeneficiaries || "", estimatedNumber: p.estimatedNumber || "",
    secondaryBeneficiaries: p.secondaryBeneficiaries || "", beneficiaryArea: p.beneficiaryArea || "",
    vulnerableGroups: p.vulnerableGroups || "", selectionMethod: p.selectionMethod || "",
    benTotal: bd.total != null ? String(bd.total) : "", benMale: bd.male != null ? String(bd.male) : "",
    benFemale: bd.female != null ? String(bd.female) : "", benChildren: bd.children != null ? String(bd.children) : "",
    benYouth: bd.youth != null ? String(bd.youth) : "", benAdults: bd.adults != null ? String(bd.adults) : "",
    benDisabilities: bd.disabilities != null ? String(bd.disabilities) : "", benOther: bd.other != null ? String(bd.other) : "",
    objectives: parseArr(p.objectives), activities: parseArr(p.activities),
    implementationTimeline: parseArr(p.implementationTimeline), implementationTeam: parseArr(p.implementationTeam),
    totalProjectCost: p.totalProjectCost != null ? String(p.totalProjectCost) : "",
    requestedFunding: p.requestedFunding != null ? String(p.requestedFunding) : "",
    detailedBudget: parseArr(p.detailedBudget),
    rotaryContribution: fs.rotaryContribution != null ? String(fs.rotaryContribution) : "",
    communityContribution: fs.communityContribution != null ? String(fs.communityContribution) : "",
    otherDonors: fs.otherDonors != null ? String(fs.otherDonors) : "",
    govtContribution: fs.govtContribution != null ? String(fs.govtContribution) : "",
    otherFunding: fs.otherFunding != null ? String(fs.otherFunding) : "",
    alreadySecured: fs.alreadySecured != null ? String(fs.alreadySecured) : "",
    fundingGap: fs.fundingGap != null ? String(fs.fundingGap) : "",
    fundingModel: p.fundingModel || "full",
    minimumViableFunding: p.minimumViableFunding != null ? String(p.minimumViableFunding) : "",
    phases: parseArr(p.phases),
    impactOutputs: p.impactOutputs || "", impactOutcomes: p.impactOutcomes || "",
    impactLongTerm: p.impactLongTerm || "", impactKpis: parseArr(p.impactKpis),
    sustainabilityPlan: p.sustainabilityPlan || "", sustainabilityOperator: p.sustainabilityOperator || "",
    sustainabilityMaintainer: p.sustainabilityMaintainer || "", ongoingCosts: p.ongoingCosts || "",
    whoPays: p.whoPays || "", revenueModel: p.revenueModel || "", ifNoFunding: p.ifNoFunding || "",
    coiDeclared: p.coiDeclared || "no", coiDetails: parseArr(p.coiDetails),
    procurementMethod: p.procurementMethod || "", procurementQuotes: p.procurementQuotes || "",
    procurementSuppliers: p.procurementSuppliers || "", procurementCompetitive: p.procurementCompetitive || "",
    procurementDocs: p.procurementDocs || "",
    verificationDocs: p.verificationDocs || "", publicDocs: p.publicDocs || "",
    privateDocs: p.privateDocs || "", mediaGallery: p.mediaGallery || "",
    paymentWalletAddress: p.paymentWalletAddress || "", paymentNetwork: p.paymentNetwork || "bnb",
    paymentToken: p.paymentToken || "USDC", paymentBankDetails: p.paymentBankDetails || "",
    declarationAgreed: !!p.declarationAgreed,
  };
};

const STEPS = [
  { key: "org", title: "Organization", icon: Building2, desc: "Charity Organization & authorized owner" },
  { key: "project", title: "Project", icon: FolderKanban, desc: "Name, category, location, dates" },
  { key: "need", title: "Need", icon: Heart, desc: "Problem, evidence, beneficiaries" },
  { key: "plan", title: "Objectives & Plan", icon: Target, desc: "Objectives, activities, team" },
  { key: "budget", title: "Budget", icon: DollarSign, desc: "Costs, funding sources, model" },
  { key: "impact", title: "Impact", icon: TrendingUp, desc: "Outputs, KPIs, sustainability" },
  { key: "compliance", title: "Compliance", icon: ShieldCheck, desc: "Conflicts, procurement" },
  { key: "documents", title: "Documents", icon: Paperclip, desc: "Evidence & media" },
  { key: "disbursement", title: "Disbursement", icon: Wallet, desc: "Wallet & network" },
  { key: "review", title: "Review", icon: CheckCircle2, desc: "Declaration & submit" },
];

export default function ProjectSubmissionWizard({ user, onClose, onSubmitted, existingProject }) {
  const { toast } = useToast();
  const editing = !!existingProject?.id;
  const [form, setForm] = useState(() => (existingProject ? hydrate(existingProject) : EMPTY));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existingProject) return; // keep hydrated reference when editing
    const ref = "RIV-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    setForm((f) => ({ ...f, projectReference: ref }));
  }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const num = (v) => Number(v) || 0;

  const buildPayload = (asDraft) => {
    const breakdown = {
      total: num(form.benTotal), male: num(form.benMale), female: num(form.benFemale),
      children: num(form.benChildren), youth: num(form.benYouth), adults: num(form.benAdults),
      disabilities: num(form.benDisabilities), other: num(form.benOther),
    };
    const fundingSources = {
      rotaryContribution: num(form.rotaryContribution),
      communityContribution: num(form.communityContribution),
      otherDonors: num(form.otherDonors), govtContribution: num(form.govtContribution),
      otherFunding: num(form.otherFunding), alreadySecured: num(form.alreadySecured),
      fundingGap: num(form.fundingGap),
    };
    const orgDetails = {
      district: form.district, orgCountry: form.orgCountry, registrationId: form.registrationId,
      clubContact: form.clubContact, authorizedOfficer: form.authorizedOfficer,
      president: form.president, officialEmail: form.officialEmail, officialPhone: form.officialPhone,
    };
    const media = parseAttachments(form.mediaGallery);
    return {
      name: form.name, clubName: form.clubName, region: form.location, category: form.category,
      description: form.shortDescription, problemStatement: form.problemStatement,
      beneficiaries: num(form.benTotal || form.estimatedNumber),
      requestedFunding: num(form.requestedFunding), budget: num(form.totalProjectCost || form.requestedFunding),
      timeline: form.startDate && form.expectedCompletionDate ? `${form.startDate} → ${form.expectedCompletionDate}` : "",
      status: asDraft ? "DRAFT" : "SUBMITTED",
      submittedBy: user?.full_name || user?.email, submittedById: user?.id,
      submittedAt: new Date().toISOString(),
      conflictOfInterest: form.coiDeclared === "yes" ? "Declared — see details" : "None declared",
      imageUrl: media[0]?.url || "",
      shortDescription: form.shortDescription, location: form.location,
      startDate: form.startDate, expectedCompletionDate: form.expectedCompletionDate,
      projectReference: form.projectReference, communityNeed: form.communityNeed,
      evidenceOfNeed: form.evidenceOfNeed, whyThisProject: form.whyThisProject,
      existingAlternatives: form.existingAlternatives,
      primaryBeneficiaries: form.primaryBeneficiaries, estimatedNumber: form.estimatedNumber,
      secondaryBeneficiaries: form.secondaryBeneficiaries, beneficiaryArea: form.beneficiaryArea,
      vulnerableGroups: form.vulnerableGroups, selectionMethod: form.selectionMethod,
      beneficiaryBreakdown: JSON.stringify(breakdown),
      objectives: JSON.stringify(form.objectives), activities: JSON.stringify(form.activities),
      implementationTimeline: JSON.stringify(form.implementationTimeline),
      implementationTeam: JSON.stringify(form.implementationTeam),
      detailedBudget: JSON.stringify(form.detailedBudget),
      fundingSources: JSON.stringify(fundingSources),
      totalProjectCost: num(form.totalProjectCost), fundingModel: form.fundingModel,
      minimumViableFunding: num(form.minimumViableFunding), phases: JSON.stringify(form.phases),
      orgDetails: JSON.stringify(orgDetails), verificationDocs: form.verificationDocs,
      coiDeclared: form.coiDeclared, coiDetails: JSON.stringify(form.coiDetails),
      procurementMethod: form.procurementMethod, procurementQuotes: form.procurementQuotes,
      procurementSuppliers: form.procurementSuppliers, procurementCompetitive: form.procurementCompetitive,
      procurementDocs: form.procurementDocs,
      sustainabilityPlan: form.sustainabilityPlan, sustainabilityOperator: form.sustainabilityOperator,
      sustainabilityMaintainer: form.sustainabilityMaintainer, ongoingCosts: form.ongoingCosts,
      whoPays: form.whoPays, revenueModel: form.revenueModel, ifNoFunding: form.ifNoFunding,
      impactOutputs: form.impactOutputs, impactOutcomes: form.impactOutcomes,
      impactLongTerm: form.impactLongTerm, impactKpis: JSON.stringify(form.impactKpis),
      publicDocs: form.publicDocs, privateDocs: form.privateDocs, mediaGallery: form.mediaGallery,
      paymentWalletAddress: form.paymentWalletAddress, paymentNetwork: form.paymentNetwork,
      paymentToken: form.paymentToken, paymentBankDetails: form.paymentBankDetails,
      declarationAgreed: !!form.declarationAgreed,
    };
  };

  const hasUpload = (v) => parseAttachments(v).length > 0;
  const filled = (v) => String(v ?? "").trim() !== "";
  const rowsOk = (arr, keys) => arr.length > 0 && arr.every((r) => keys.every((k) => filled(r[k])));

  const STEP_LABELS = [
    "Organization", "Project", "Need & Beneficiaries", "Objectives & Plan",
    "Budget", "Impact & Sustainability", "Compliance", "Documents",
    "Disbursement", "Review",
  ];

  // Returns the list of missing required-field labels for a given step.
  // Only the essentials are mandatory; everything else is optional so a
  // project can be submitted with just the core details and refined later.
  const stepMissing = (i) => {
    const m = [];
    const r = (cond, label) => { if (!cond) m.push(label); };
    switch (i) {
      case 1:
        r(filled(form.name), "Project name");
        break;
      case 4:
        r(filled(form.requestedFunding), "Requested funding");
        break;
      case 8:
        r(filled(form.paymentWalletAddress), "Wallet address for payment");
        break;
      case 9:
        r(form.declarationAgreed, "Agree to the declaration");
        break;
    }
    return m;
  };

  const reportMissing = (i, missing) => {
    const extra = missing.length > 3 ? ` +${missing.length - 3} more` : "";
    toast({ title: `${STEP_LABELS[i]} — required fields missing`, description: missing.slice(0, 3).join(", ") + extra, variant: "destructive" });
  };

  const goNext = () => {
    const missing = stepMissing(step);
    if (missing.length) { reportMissing(step, missing); return; }
    setStep((s) => s + 1);
  };

  const submit = async (asDraft) => {
    if (!asDraft) {
      for (let i = 0; i < STEPS.length; i++) {
        const missing = stepMissing(i);
        if (missing.length) { setStep(i); reportMissing(i, missing); return; }
      }
    }
    setBusy(true);
    try {
      if (editing) {
        await base44.entities.Project.update(existingProject.id, buildPayload(asDraft));
      } else {
        await base44.entities.Project.create(buildPayload(asDraft));
      }
      toast({ title: asDraft ? "Draft saved" : editing ? "Project updated" : "Project submitted", description: asDraft ? "Saved as draft — you can finish it later." : editing ? "Your changes have been saved." : "Your project is now pending admin review." });
      onSubmitted();
    } catch (e) {
      toast({ title: "Submission failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const isLast = step === STEPS.length - 1;
  const meta = STEPS[step];
  const Icon = meta.icon;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold sm:text-lg">{editing ? "Edit Project" : "Submit a Project"}</h2>
            <p className="truncate text-xs text-muted-foreground">Ref {form.projectReference} · Step {step + 1} of {STEPS.length}</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
          <Info className="h-3.5 w-3.5" /> Admin verifies eligibility; the DAO decides funding allocation.
        </div>
      </div>

      {/* Stepper */}
      <div className="flex gap-1 overflow-x-auto border-b border-border bg-muted/30 px-3 py-2 sm:px-6">
        {STEPS.map((s, i) => {
          const SIcon = s.icon;
          const done = i < step;
          const active = i === step;
          return (
            <button
              key={s.key}
              onClick={() => setStep(i)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : done ? "bg-emerald-100 text-emerald-700" : "text-muted-foreground hover:bg-muted"
              )}
              title={s.title}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <SIcon className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{s.title}</span>
              <span className="sm:hidden">{i + 1}</span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Only a few essentials are required (project name, requested funding, payment wallet, declaration). Everything else is optional — you can save a draft anytime and finish later.
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
            <div>
              <h3 className="text-lg font-bold">{meta.title}</h3>
              <p className="text-xs text-muted-foreground">{meta.desc}</p>
            </div>
          </div>

          {step === 0 && <StepOrganization form={form} set={set} />}
          {step === 1 && <StepProject form={form} set={set} />}
          {step === 2 && <StepNeed form={form} set={set} />}
          {step === 3 && <StepPlan form={form} set={set} />}
          {step === 4 && <StepBudget form={form} set={set} />}
          {step === 5 && <StepImpact form={form} set={set} />}
          {step === 6 && <StepCompliance form={form} set={set} />}
          {step === 7 && <StepDocuments form={form} set={set} />}
          {step === 8 && <StepDisbursement form={form} set={set} />}
          {step === 9 && <StepReview form={form} set={set} />}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 sm:px-6">
        <button
          onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}
        </button>
        <button
          onClick={() => submit(true)}
          disabled={busy}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          Save draft
        </button>
        {!isLast ? (
          <button
            onClick={goNext}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={() => submit(false)}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg bg-gold-gradient px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {busy ? "Submitting…" : "Submit for vetting"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Step components ---------- */

function StepOrganization({ form, set }) {
  return (
    <div className="space-y-4">
      <SectionTitle desc="Link the project to an organization, not just an individual.">Organization Details</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Charity Organization name"><TextInput value={form.clubName} onChange={(e) => set({ clubName: e.target.value })} /></Field>
        <Field label="Charity Organization district"><TextInput value={form.district} onChange={(e) => set({ district: e.target.value })} /></Field>
        <Field label="Country"><TextInput value={form.orgCountry} onChange={(e) => set({ orgCountry: e.target.value })} /></Field>
        <Field label="Club registration / identification"><TextInput value={form.registrationId} onChange={(e) => set({ registrationId: e.target.value })} /></Field>
        <Field label="Club contact"><TextInput value={form.clubContact} onChange={(e) => set({ clubContact: e.target.value })} /></Field>
        <Field label="Authorized project officer"><TextInput value={form.authorizedOfficer} onChange={(e) => set({ authorizedOfficer: e.target.value })} /></Field>
        <Field label="President / authorized signatory"><TextInput value={form.president} onChange={(e) => set({ president: e.target.value })} /></Field>
        <Field label="Official email"><TextInput type="email" value={form.officialEmail} onChange={(e) => set({ officialEmail: e.target.value })} /></Field>
        <Field label="Official phone"><TextInput value={form.officialPhone} onChange={(e) => set({ officialPhone: e.target.value })} /></Field>
      </div>
    </div>
  );
}

function StepProject({ form, set }) {
  return (
    <div className="space-y-4">
      <SectionTitle desc="Identify the project and its timeframe.">Project Identification</SectionTitle>
      <Field label="Project name" required><TextInput value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Short description (250–500 chars)" hint={`${form.shortDescription.length} chars`}>
        <TextArea rows={3} maxLength={500} value={form.shortDescription} onChange={(e) => set({ shortDescription: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category">
          <SelectInput options={CATEGORIES} value={form.category} onChange={(e) => set({ category: e.target.value })} />
        </Field>
        <Field label="Location (country / county / city / community)">
          <TextInput value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Kisumu County, Kenya" />
        </Field>
        <Field label="Project start date"><DateInput value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
        <Field label="Expected completion date"><DateInput value={form.expectedCompletionDate} onChange={(e) => set({ expectedCompletionDate: e.target.value })} /></Field>
      </div>
      <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Project status is set automatically (Draft / Submitted) and a reference number (<span className="font-mono">{form.projectReference}</span>) is generated for you.
      </p>
    </div>
  );
}

function StepNeed({ form, set }) {
  return (
    <div className="space-y-4">
      <SectionTitle desc="Why this project exists and who benefits.">Problem & Beneficiaries</SectionTitle>
      <Field label="Problem statement" hint="What problem is the project intended to solve?">
        <TextArea rows={3} value={form.problemStatement} onChange={(e) => set({ problemStatement: e.target.value })} />
      </Field>
      <Field label="Community need" hint="Describe the current situation and why intervention is necessary.">
        <TextArea rows={3} value={form.communityNeed} onChange={(e) => set({ communityNeed: e.target.value })} />
      </Field>
      <Field label="Evidence of need" hint="Upload community assessments, surveys, reports, photos, letters.">
        <FileUpload value={form.evidenceOfNeed} onChange={(v) => set({ evidenceOfNeed: v })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Why this project?" hint="Why this intervention is appropriate.">
          <TextArea rows={2} value={form.whyThisProject} onChange={(e) => set({ whyThisProject: e.target.value })} />
        </Field>
        <Field label="Existing alternatives" hint="Other initiatives and how this complements them.">
          <TextArea rows={2} value={form.existingAlternatives} onChange={(e) => set({ existingAlternatives: e.target.value })} />
        </Field>
      </div>

      <SectionTitle desc="Capture exactly who will benefit.">Beneficiaries</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Primary beneficiaries"><TextInput value={form.primaryBeneficiaries} onChange={(e) => set({ primaryBeneficiaries: e.target.value })} placeholder="e.g. Children aged 6–14" /></Field>
        <Field label="Estimated number"><TextInput value={form.estimatedNumber} onChange={(e) => set({ estimatedNumber: e.target.value })} placeholder="e.g. 2500" /></Field>
        <Field label="Secondary beneficiaries"><TextInput value={form.secondaryBeneficiaries} onChange={(e) => set({ secondaryBeneficiaries: e.target.value })} /></Field>
        <Field label="Geographic area"><TextInput value={form.beneficiaryArea} onChange={(e) => set({ beneficiaryArea: e.target.value })} /></Field>
        <Field label="Vulnerable groups"><TextInput value={form.vulnerableGroups} onChange={(e) => set({ vulnerableGroups: e.target.value })} /></Field>
        <Field label="Beneficiary selection method"><TextInput value={form.selectionMethod} onChange={(e) => set({ selectionMethod: e.target.value })} placeholder="e.g. School / community registration" /></Field>
      </div>
      <Field label="Beneficiary breakdown (used later for impact measurement)">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="Total"><NumberInput value={form.benTotal} onChange={(e) => set({ benTotal: e.target.value })} /></Field>
          <Field label="Male"><NumberInput value={form.benMale} onChange={(e) => set({ benMale: e.target.value })} /></Field>
          <Field label="Female"><NumberInput value={form.benFemale} onChange={(e) => set({ benFemale: e.target.value })} /></Field>
          <Field label="Children"><NumberInput value={form.benChildren} onChange={(e) => set({ benChildren: e.target.value })} /></Field>
          <Field label="Youth"><NumberInput value={form.benYouth} onChange={(e) => set({ benYouth: e.target.value })} /></Field>
          <Field label="Adults"><NumberInput value={form.benAdults} onChange={(e) => set({ benAdults: e.target.value })} /></Field>
          <Field label="Disabilities"><NumberInput value={form.benDisabilities} onChange={(e) => set({ benDisabilities: e.target.value })} /></Field>
          <Field label="Other"><NumberInput value={form.benOther} onChange={(e) => set({ benOther: e.target.value })} /></Field>
        </div>
      </Field>
    </div>
  );
}

function StepPlan({ form, set }) {
  return (
    <div className="space-y-4">
      <SectionTitle desc="3–5 measurable objectives.">Project Objectives</SectionTitle>
      <Repeatable
        items={form.objectives} onChange={(v) => set({ objectives: v })}
        template={() => ({ objective: "", target: "", measurement: "" })}
        addLabel="Add objective"
        columns="grid-cols-1 sm:grid-cols-3"
        render={(r, up) => (
          <>
            <Field label="Objective"><TextInput value={r.objective} onChange={(e) => up({ objective: e.target.value })} /></Field>
            <Field label="Target"><TextInput value={r.target} onChange={(e) => up({ target: e.target.value })} /></Field>
            <Field label="Measurement"><TextInput value={r.measurement} onChange={(e) => up({ measurement: e.target.value })} /></Field>
          </>
        )}
      />

      <SectionTitle desc="What will actually be done.">Project Activities</SectionTitle>
      <Repeatable
        items={form.activities} onChange={(v) => set({ activities: v })}
        template={() => ({ activity: "", description: "", quantity: "", timeline: "", responsible: "", expectedOutput: "" })}
        addLabel="Add activity"
        columns="grid-cols-1 sm:grid-cols-3"
        render={(r, up) => (
          <>
            <Field label="Activity"><TextInput value={r.activity} onChange={(e) => up({ activity: e.target.value })} /></Field>
            <Field label="Description"><TextInput value={r.description} onChange={(e) => up({ description: e.target.value })} /></Field>
            <Field label="Quantity"><TextInput value={r.quantity} onChange={(e) => up({ quantity: e.target.value })} /></Field>
            <Field label="Timeline"><TextInput value={r.timeline} onChange={(e) => up({ timeline: e.target.value })} placeholder="e.g. Jan–Mar 2027" /></Field>
            <Field label="Responsible person"><TextInput value={r.responsible} onChange={(e) => up({ responsible: e.target.value })} /></Field>
            <Field label="Expected output"><TextInput value={r.expectedOutput} onChange={(e) => up({ expectedOutput: e.target.value })} /></Field>
          </>
        )}
      />

      <SectionTitle desc="Key milestones and dates.">Implementation Timeline</SectionTitle>
      <Repeatable
        items={form.implementationTimeline} onChange={(v) => set({ implementationTimeline: v })}
        template={() => ({ milestone: "", start: "", end: "", result: "" })}
        addLabel="Add milestone"
        columns="grid-cols-1 sm:grid-cols-4"
        render={(r, up) => (
          <>
            <Field label="Milestone"><TextInput value={r.milestone} onChange={(e) => up({ milestone: e.target.value })} /></Field>
            <Field label="Start"><DateInput value={r.start} onChange={(e) => up({ start: e.target.value })} /></Field>
            <Field label="End"><DateInput value={r.end} onChange={(e) => up({ end: e.target.value })} /></Field>
            <Field label="Expected result"><TextInput value={r.result} onChange={(e) => up({ result: e.target.value })} /></Field>
          </>
        )}
      />

      <SectionTitle desc="Key people delivering the project.">Implementation Team</SectionTitle>
      <Repeatable
        items={form.implementationTeam} onChange={(v) => set({ implementationTeam: v })}
        template={() => ({ name: "", position: "", organization: "", responsibility: "", contact: "", experience: "" })}
        addLabel="Add team member"
        columns="grid-cols-1 sm:grid-cols-3"
        render={(r, up) => (
          <>
            <Field label="Name"><TextInput value={r.name} onChange={(e) => up({ name: e.target.value })} /></Field>
            <Field label="Position"><TextInput value={r.position} onChange={(e) => up({ position: e.target.value })} /></Field>
            <Field label="Organization"><TextInput value={r.organization} onChange={(e) => up({ organization: e.target.value })} /></Field>
            <Field label="Responsibility"><TextInput value={r.responsibility} onChange={(e) => up({ responsibility: e.target.value })} /></Field>
            <Field label="Contact"><TextInput value={r.contact} onChange={(e) => up({ contact: e.target.value })} /></Field>
            <Field label="Relevant experience"><TextInput value={r.experience} onChange={(e) => up({ experience: e.target.value })} /></Field>
          </>
        )}
      />
    </div>
  );
}

function StepBudget({ form, set }) {
  return (
    <div className="space-y-4">
      <SectionTitle desc="The DAO ultimately allocates Charity Fund resources — be precise.">Project Budget</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Total project cost (USD)"><NumberInput value={form.totalProjectCost} onChange={(e) => set({ totalProjectCost: e.target.value })} /></Field>
        <Field label="Amount requested from platform (USD)" required><NumberInput value={form.requestedFunding} onChange={(e) => set({ requestedFunding: e.target.value })} /></Field>
      </div>

      <SectionTitle desc="Line items making up the total.">Detailed Budget</SectionTitle>
      <Repeatable
        items={form.detailedBudget} onChange={(v) => set({ detailedBudget: v })}
        template={() => ({ item: "", description: "", quantity: "", unitCost: "", total: "" })}
        addLabel="Add budget line"
        columns="grid-cols-1 sm:grid-cols-5"
        render={(r, up) => (
          <>
            <Field label="Item"><TextInput value={r.item} onChange={(e) => up({ item: e.target.value })} /></Field>
            <Field label="Description"><TextInput value={r.description} onChange={(e) => up({ description: e.target.value })} /></Field>
            <Field label="Quantity"><NumberInput value={r.quantity} onChange={(e) => up({ quantity: e.target.value })} /></Field>
            <Field label="Unit cost"><NumberInput value={r.unitCost} onChange={(e) => up({ unitCost: e.target.value })} /></Field>
            <Field label="Total"><NumberInput value={r.total} onChange={(e) => up({ total: e.target.value })} /></Field>
          </>
        )}
      />

      <SectionTitle desc="Where the rest of the money comes from.">Funding Sources</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Charity Organization contribution"><NumberInput value={form.rotaryContribution} onChange={(e) => set({ rotaryContribution: e.target.value })} /></Field>
        <Field label="Community contribution"><NumberInput value={form.communityContribution} onChange={(e) => set({ communityContribution: e.target.value })} /></Field>
        <Field label="Other donors"><NumberInput value={form.otherDonors} onChange={(e) => set({ otherDonors: e.target.value })} /></Field>
        <Field label="Government contribution"><NumberInput value={form.govtContribution} onChange={(e) => set({ govtContribution: e.target.value })} /></Field>
        <Field label="Other funding"><NumberInput value={form.otherFunding} onChange={(e) => set({ otherFunding: e.target.value })} /></Field>
        <Field label="Already secured"><NumberInput value={form.alreadySecured} onChange={(e) => set({ alreadySecured: e.target.value })} /></Field>
        <Field label="Funding gap"><NumberInput value={form.fundingGap} onChange={(e) => set({ fundingGap: e.target.value })} /></Field>
      </div>

      <SectionTitle desc="How funding should be structured.">Funding Structure</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Preferred funding model">
          <SelectInput options={FUNDING_MODELS} value={form.fundingModel} onChange={(e) => set({ fundingModel: e.target.value })} />
        </Field>
        <Field label="Minimum viable funding (USD)" hint="Minimum needed for meaningful results.">
          <NumberInput value={form.minimumViableFunding} onChange={(e) => set({ minimumViableFunding: e.target.value })} />
        </Field>
      </div>
      <Repeatable
        items={form.phases} onChange={(v) => set({ phases: v })}
        template={() => ({ phase: "", amount: "" })}
        addLabel="Add phase"
        columns="grid-cols-1 sm:grid-cols-2"
        render={(r, up) => (
          <>
            <Field label="Phase"><TextInput value={r.phase} onChange={(e) => up({ phase: e.target.value })} placeholder="e.g. Phase 1" /></Field>
            <Field label="Amount (USD)"><NumberInput value={r.amount} onChange={(e) => up({ amount: e.target.value })} /></Field>
          </>
        )}
      />
    </div>
  );
}

function StepImpact({ form, set }) {
  return (
    <div className="space-y-4">
      <SectionTitle desc="Define measurable outcomes.">Expected Impact</SectionTitle>
      <Field label="Outputs — what will be delivered?"><TextArea rows={2} value={form.impactOutputs} onChange={(e) => set({ impactOutputs: e.target.value })} placeholder="e.g. 10 water points constructed." /></Field>
      <Field label="Outcomes — what changes because of the project?"><TextArea rows={2} value={form.impactOutcomes} onChange={(e) => set({ impactOutcomes: e.target.value })} placeholder="e.g. 1,000 households gain reliable clean water." /></Field>
      <Field label="Impact — longer-term change expected"><TextArea rows={2} value={form.impactLongTerm} onChange={(e) => set({ impactLongTerm: e.target.value })} placeholder="e.g. Reduction in waterborne diseases." /></Field>

      <SectionTitle desc="Indicators that become the basis for the impact report.">Impact KPIs</SectionTitle>
      <Repeatable
        items={form.impactKpis} onChange={(v) => set({ impactKpis: v })}
        template={() => ({ kpi: "", baseline: "", target: "", measurement: "" })}
        addLabel="Add KPI"
        columns="grid-cols-1 sm:grid-cols-4"
        render={(r, up) => (
          <>
            <Field label="KPI"><TextInput value={r.kpi} onChange={(e) => up({ kpi: e.target.value })} /></Field>
            <Field label="Baseline"><TextInput value={r.baseline} onChange={(e) => up({ baseline: e.target.value })} /></Field>
            <Field label="Target"><TextInput value={r.target} onChange={(e) => up({ target: e.target.value })} /></Field>
            <Field label="Measurement"><TextInput value={r.measurement} onChange={(e) => up({ measurement: e.target.value })} /></Field>
          </>
        )}
      />

      <SectionTitle desc="Charity Fund money should create enduring impact.">Sustainability</SectionTitle>
      <Field label="How will the project continue after funding ends?"><TextArea rows={2} value={form.sustainabilityPlan} onChange={(e) => set({ sustainabilityPlan: e.target.value })} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Who will operate it?"><TextInput value={form.sustainabilityOperator} onChange={(e) => set({ sustainabilityOperator: e.target.value })} /></Field>
        <Field label="Who will maintain it?"><TextInput value={form.sustainabilityMaintainer} onChange={(e) => set({ sustainabilityMaintainer: e.target.value })} /></Field>
        <Field label="What are the ongoing costs?"><TextInput value={form.ongoingCosts} onChange={(e) => set({ ongoingCosts: e.target.value })} /></Field>
        <Field label="Who will pay those costs?"><TextInput value={form.whoPays} onChange={(e) => set({ whoPays: e.target.value })} /></Field>
        <Field label="Revenue / maintenance model"><TextInput value={form.revenueModel} onChange={(e) => set({ revenueModel: e.target.value })} /></Field>
        <Field label="What if additional funding is unavailable?"><TextInput value={form.ifNoFunding} onChange={(e) => set({ ifNoFunding: e.target.value })} /></Field>
      </div>
    </div>
  );
}

function StepCompliance({ form, set }) {
  return (
    <div className="space-y-4">
      <SectionTitle desc="Mandatory declarations.">Conflict of Interest</SectionTitle>
      <Field label="Does any owner, officer, supplier, contractor, beneficiary representative or related party have a financial or personal interest in the project?">
        <div className="flex gap-2">
          {[["no", "No"], ["yes", "Yes"]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => set({ coiDeclared: v })}
              className={cn("flex-1 rounded-lg border px-3 py-2 text-sm font-semibold",
                form.coiDeclared === v ? "bg-primary text-primary-foreground border-transparent" : "border-border hover:bg-muted")}>
              {l}
            </button>
          ))}
        </div>
      </Field>
      {form.coiDeclared === "yes" && (
        <Repeatable
          items={form.coiDetails} onChange={(v) => set({ coiDetails: v })}
          template={() => ({ person: "", relationship: "", interest: "", explanation: "" })}
          addLabel="Add interest"
          columns="grid-cols-1 sm:grid-cols-2"
          render={(r, up) => (
            <>
              <Field label="Person / entity"><TextInput value={r.person} onChange={(e) => up({ person: e.target.value })} /></Field>
              <Field label="Nature of relationship"><TextInput value={r.relationship} onChange={(e) => up({ relationship: e.target.value })} /></Field>
              <Field label="Financial interest"><TextInput value={r.interest} onChange={(e) => up({ interest: e.target.value })} /></Field>
              <Field label="Explanation"><TextInput value={r.explanation} onChange={(e) => up({ explanation: e.target.value })} /></Field>
            </>
          )}
        />
      )}

      <SectionTitle desc="How suppliers are selected.">Procurement</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="How will suppliers be selected?"><TextInput value={form.procurementMethod} onChange={(e) => set({ procurementMethod: e.target.value })} /></Field>
        <Field label="Are quotations available?"><TextInput value={form.procurementQuotes} onChange={(e) => set({ procurementQuotes: e.target.value })} placeholder="Yes / No" /></Field>
        <Field label="Are suppliers already identified?"><TextInput value={form.procurementSuppliers} onChange={(e) => set({ procurementSuppliers: e.target.value })} placeholder="Yes / No" /></Field>
        <Field label="Is competitive procurement required?"><TextInput value={form.procurementCompetitive} onChange={(e) => set({ procurementCompetitive: e.target.value })} placeholder="Yes / No" /></Field>
      </div>
      <Field label="Procurement documents (quotations, proposals, contracts)"><FileUpload value={form.procurementDocs} onChange={(v) => set({ procurementDocs: v })} /></Field>
    </div>
  );
}

function StepDocuments({ form, set }) {
  return (
    <div className="space-y-4">
      <SectionTitle desc="Charity Organization affiliation, registration, authorization, compliance.">Verification Documents</SectionTitle>
      <FileUpload value={form.verificationDocs} onChange={(v) => set({ verificationDocs: v })} />

      <SectionTitle desc="Can be displayed on the project page.">Public Documents</SectionTitle>
      <FileUpload value={form.publicDocs} onChange={(v) => set({ publicDocs: v })} />

      <SectionTitle desc="Visible only to authorized administrators.">Private / Confidential Documents</SectionTitle>
      <FileUpload value={form.privateDocs} onChange={(v) => set({ privateDocs: v })} />

      <SectionTitle desc="Upload at least 2 images — they will be shown as a sliding gallery on your project page. The first image is the cover.">Media Gallery</SectionTitle>
      <FileUpload value={form.mediaGallery} onChange={(v) => set({ mediaGallery: v })} />
    </div>
  );
}

function StepDisbursement({ form, set }) {
  return (
    <div className="space-y-4">
      <SectionTitle desc="Where approved funds will be sent.">Disbursement Details</SectionTitle>
      <div className="flex items-start gap-2 rounded-lg border border-accent/50 bg-accent/15 px-3 py-2.5 text-xs text-foreground">
        <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p>Approved funds are disbursed in stablecoin (<b className="text-accent">USDC</b> or <b className="text-accent">USDT</b>) to the wallet address you provide on the selected network. Ensure the address is correct and that you control it — incorrect addresses cannot be recovered.</p>
      </div>
      <Field label="Wallet address for payment" required hint="The EVM wallet that will receive disbursements.">
        <TextInput value={form.paymentWalletAddress} onChange={(e) => set({ paymentWalletAddress: e.target.value })} placeholder="0x…" className="font-mono" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Network">
          <SelectInput options={NETWORKS} value={form.paymentNetwork} onChange={(e) => set({ paymentNetwork: e.target.value })} />
        </Field>
        <Field label="Token">
          <SelectInput options={TOKENS} value={form.paymentToken} onChange={(e) => set({ paymentToken: e.target.value })} />
        </Field>
      </div>
      <Field label="Bank account / alternative payment details (optional)" hint="For jurisdictions where on-chain disbursement is not possible.">
        <TextArea rows={3} value={form.paymentBankDetails} onChange={(e) => set({ paymentBankDetails: e.target.value })} />
      </Field>
    </div>
  );
}

function StepReview({ form, set }) {
  const summary = useMemo(() => [
    ["Project", `${form.name || "—"} (${form.category})`],
    ["Location", form.location || "—"],
    ["Organization", form.clubName || "—"],
    ["Timeline", `${form.startDate || "—"} → ${form.expectedCompletionDate || "—"}`],
    ["Total cost", form.totalProjectCost ? `$${form.totalProjectCost}` : "—"],
    ["Requested", form.requestedFunding ? `$${form.requestedFunding}` : "—"],
    ["Beneficiaries", form.benTotal || form.estimatedNumber || "—"],
    ["Objectives", `${form.objectives.length} defined`],
    ["Activities", `${form.activities.length} defined`],
    ["Funding model", FUNDING_MODELS.find((m) => m.value === form.fundingModel)?.label || "—"],
    ["Conflict of interest", form.coiDeclared === "yes" ? "Declared" : "None"],
    ["Disbursement", `${form.paymentNetwork.toUpperCase()} · ${form.paymentToken} · ${form.paymentWalletAddress ? form.paymentWalletAddress.slice(0, 10) + "…" : "—"}`],
  ], [form]);

  return (
    <div className="space-y-4">
      <SectionTitle desc="Confirm everything looks right.">Summary</SectionTitle>
      <div className="overflow-hidden rounded-xl border border-border">
        {summary.map(([k, v], i) => (
          <div key={k} className={cn("flex items-center justify-between gap-3 px-4 py-2.5 text-sm", i % 2 ? "bg-muted/30" : "bg-card")}>
            <span className="text-muted-foreground">{k}</span>
            <span className="text-right font-medium">{v}</span>
          </div>
        ))}
      </div>

      <SectionTitle desc="Read and agree before submission.">Declaration & Certification</SectionTitle>
      <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs leading-relaxed text-muted-foreground">
        <p className="font-semibold text-foreground">I confirm that:</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>The information provided is accurate.</li>
          <li>The project is genuinely intended for charitable / community benefit.</li>
          <li>The submitted budget is accurate to the best of my knowledge.</li>
          <li>Uploaded documents are authentic.</li>
          <li>Conflicts of interest have been disclosed.</li>
          <li>Funds will be used only for the approved project.</li>
          <li>I will provide progress and financial reports.</li>
          <li>The platform may conduct verification and monitoring.</li>
          <li>Funding is subject to the platform's governance process and is not guaranteed.</li>
        </ul>
      </div>
      <label className="flex items-start gap-2.5 rounded-xl border border-border p-3 hover:bg-muted/30">
        <input type="checkbox" checked={form.declarationAgreed} onChange={(e) => set({ declarationAgreed: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-input" />
        <span className="text-sm font-medium">I agree to the declaration above.</span>
      </label>

      <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">What happens next</p>
        <p className="mt-1">Draft → Submitted → Administrative Review → Information Required / Rejected / Approved for Vetting → Published for Voting → Voting → Selected → Funding Approved → Disbursement → Milestone Reporting → Completed → Impact Report. Admin verifies eligibility; the DAO decides allocation.</p>
      </div>
    </div>
  );
}