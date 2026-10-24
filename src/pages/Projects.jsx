import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/useWallet";
import { fmtUSD, fmtNum } from "@/lib/configRegistry";
import { useToast } from "@/components/ui/use-toast";
import { useLang } from "@/lib/LanguageContext";
import { Heart, Users, MapPin, CheckCircle2, Clock, FileText, X, Plus, Upload, Pencil, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseAttachments } from "@/components/support/AttachmentUpload";
import ProjectSubmissionWizard from "@/components/projects/ProjectSubmissionWizard";
import ImageCarousel from "@/components/projects/ImageCarousel";
import ProjectRankingBoard from "@/components/projects/ProjectRankingBoard";
import ProjectFullDetails from "@/components/projects/ProjectFullDetails";

// Extract the sliding-gallery image URLs for a project (media gallery images, fallback to cover).
const projectImages = (p) => {
  const imgs = parseAttachments(p.mediaGallery).filter((a) => a.kind === "image").map((a) => a.url);
  if (imgs.length) return imgs;
  return p.imageUrl ? [p.imageUrl] : [];
};

const CATEGORIES = ["Water & Sanitation", "Education", "Healthcare", "Maternal & Child Health", "Food Security", "Environment", "Economic Empowerment", "Youth", "Community Infrastructure", "Disaster Relief", "Other"];

const STATUS_STYLES = {
  SUBMITTED: "bg-blue-100 text-blue-700",
  UNDER_REVIEW: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  VOTING: "bg-accent/15 text-accent",
  FUNDING_IN_PROGRESS: "bg-purple-100 text-purple-700",
  COMPLETED: "bg-primary/10 text-primary",
  REJECTED: "bg-red-100 text-red-700",
  DRAFT: "bg-muted text-muted-foreground",
  INFORMATION_REQUIRED: "bg-orange-100 text-orange-700",
};



export default function Projects() {
  const { user } = useWallet();
  const { t } = useLang();
  const { toast } = useToast();
  const [projects, setProjects] = useState([]);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const [showFull, setShowFull] = useState(null);

  const load = async () => {
    const list = await base44.entities.Project.list("-totalCommittedGov", 100);
    setProjects(list);
  };
  useEffect(() => { load(); }, []);

  // Live ranking: refresh the list automatically when votes are cast or projects update
  // in the current governance round.
  useEffect(() => {
    const refresh = () => load();
    const unsubVotes = base44.entities.Vote.subscribe(refresh);
    const unsubProjects = base44.entities.Project.subscribe(refresh);
    return () => { unsubVotes?.(); unsubProjects?.(); };
  }, []);

  const openProject = async (p) => {
    setSelected(p);
    const m = await base44.entities.Milestone.filter({ projectId: p.id });
    setMilestones(m.sort((a, b) => a.order - b.order));
  };

  const myProjects = projects.filter((p) => p.submittedById === user?.id);
  const publicProjects = projects.filter((p) => ["APPROVED", "VOTING", "FUNDING_IN_PROGRESS", "COMPLETED"].includes(p.status));
  const votingProjects = projects.filter((p) => p.status === "VOTING").sort((a, b) => (b.totalCommittedGov || 0) - (a.totalCommittedGov || 0));
  const filtered = filter === "mine" ? myProjects : filter === "ranking" ? votingProjects : filter === "all" ? publicProjects : publicProjects.filter((p) => p.status === filter);
  const categories = ["all", "mine", "ranking", "VOTING", "FUNDING_IN_PROGRESS", "COMPLETED"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("proj.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("proj.subtitle")}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 btn-grass">
          <Plus className="h-4 w-4" /> {t("proj.submit")}
        </button>
      </div>

      {/* My submissions summary */}
      {myProjects.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("proj.my_submissions", { n: fmtNum(myProjects.length) })}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myProjects.slice(0, 6).map((p) => (
              <div key={p.id} onClick={() => openProject(p)} className="text-left rounded-xl border border-border p-3 transition-colors hover:bg-muted/40 cursor-pointer">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLES[p.status] || "bg-muted text-muted-foreground")}>{p.status.replace(/_/g, " ")}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{p.clubName} · {fmtUSD(p.requestedFunding)}</p>
                {(p.status === "DRAFT" || p.status === "INFORMATION_REQUIRED") && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditProject(p); }}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <Pencil className="h-3 w-3" /> {p.status === "INFORMATION_REQUIRED" ? t("proj.edit_resubmit") : t("proj.edit_draft")}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button key={c} onClick={() => setFilter(c)} className={cn("rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors", filter === c ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:bg-muted")}>
            {c === "all" ? t("proj.all") : c === "mine" ? t("proj.mine") : c === "ranking" ? t("proj.ranking") : c.replace(/_/g, " ").toLowerCase()}
          </button>
        ))}
      </div>

      {filter === "ranking" ? (
        <ProjectRankingBoard projects={votingProjects} onOpen={openProject} />
      ) : (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <div key={p.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
            <div className="relative h-44 overflow-hidden bg-muted">
              <ImageCarousel images={projectImages(p)} className="h-full w-full" />
              <span className={cn("absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_STYLES[p.status] || "bg-muted text-muted-foreground")}>
                {p.status.replace(/_/g, " ")}
              </span>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-accent">{p.category}</span>
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {p.region}</span>
              </div>
              <h3 className="mt-2 font-bold leading-tight">{p.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{p.clubName}</p>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="font-bold">{fmtUSD(p.requestedFunding)}</p>
                  <p className="text-muted-foreground">{t("proj.requested")}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="font-bold">{fmtNum(p.beneficiaries)}</p>
                  <p className="text-muted-foreground">{t("proj.people")}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="font-bold">{fmtNum(p.totalCommittedGov)}</p>
                  <p className="text-muted-foreground">{t("proj.gov")}</p>
                </div>
                </div>
                <button onClick={() => openProject(p)} className="mt-4 w-full rounded-lg border border-border py-2 text-sm font-semibold hover:bg-muted btn-grass">{t("proj.view_details")}</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">{t("proj.no_projects")}</div>}
      </div>
      )}

      {/* Submission wizard */}
      {showForm && (
        <ProjectSubmissionWizard
          user={user}
          onClose={() => setShowForm(false)}
          onSubmitted={() => { setShowForm(false); load(); }}
        />
      )}
      {/* Edit existing draft */}
      {editProject && (
        <ProjectSubmissionWizard
          user={user}
          existingProject={editProject}
          onClose={() => setEditProject(null)}
          onSubmitted={() => { setEditProject(null); load(); }}
        />
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelected(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="relative h-48 overflow-hidden rounded-t-2xl bg-muted">
              <ImageCarousel images={projectImages(selected)} className="h-full w-full" />
              <button onClick={() => setSelected(null)} className="absolute right-3 top-3 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between">
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_STYLES[selected.status])}>{selected.status.replace(/_/g, " ")}</span>
                <span className="text-xs text-muted-foreground">{selected.timeline}</span>
              </div>
              <h2 className="mt-3 text-xl font-bold">{selected.name}</h2>
              <p className="text-sm text-muted-foreground">{selected.clubName} · {selected.region}</p>
              {(selected.status === "DRAFT" || selected.status === "INFORMATION_REQUIRED") && (
                <button
                  onClick={() => { setEditProject(selected); setSelected(null); }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Pencil className="h-3.5 w-3.5" /> {selected.status === "INFORMATION_REQUIRED" ? t("proj.edit_resubmit") : t("proj.edit_draft")}
                </button>
              )}
              <p className="mt-3 text-sm">{selected.description}</p>
              <div className="mt-4 rounded-xl bg-muted/40 p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">{t("proj.problem_statement")}</p>
                <p className="mt-1 text-sm">{selected.problemStatement}</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div><p className="text-xs text-muted-foreground">{t("proj.requested")}</p><p className="font-bold">{fmtUSD(selected.requestedFunding)}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("proj.allocated")}</p><p className="font-bold">{fmtUSD(selected.fundingAllocated)}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("proj.disbursed")}</p><p className="font-bold">{fmtUSD(selected.fundingDisbursed)}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("proj.beneficiaries")}</p><p className="font-bold">{fmtNum(selected.beneficiaries)}</p></div>
              </div>

              <button
                onClick={() => setShowFull(selected)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 btn-grass"
              >
                {t("proj.more_details")} <ArrowRight className="h-4 w-4" />
              </button>

              {milestones.length > 0 && (
                <div className="mt-5">
                  <p className="text-sm font-bold">{t("proj.milestones")}</p>
                  <div className="mt-3 space-y-2">
                    {milestones.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                        {m.status === "DISBURSED" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : m.status === "IN_PROGRESS" ? <Clock className="h-5 w-5 text-amber-500" /> : <FileText className="h-5 w-5 text-muted-foreground" />}
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{m.title}</p>
                          <p className="text-xs text-muted-foreground">{m.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">{fmtUSD(m.amount)}</p>
                          <p className="text-[11px] text-muted-foreground">{m.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.impactSummary && (
                <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-700"><Heart className="h-4 w-4" /> {t("proj.impact_report")}</p>
                  <p className="mt-1 text-sm text-emerald-800">{selected.impactSummary}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showFull && (
        <ProjectFullDetails project={showFull} onClose={() => setShowFull(null)} isAdmin={user?.role === "admin"} />
      )}
    </div>
  );
}