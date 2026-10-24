import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/useWallet";
import { fmtUSD, fmtNum } from "@/lib/configRegistry";
import { useToast } from "@/components/ui/use-toast";
import StatCard from "@/components/ui/StatCard";
import { InteractiveInput } from "@/components/ui/interactive-input";
import { Plus, FolderKanban, DollarSign, CheckCircle2, FileText, Upload, Building2 } from "lucide-react";

const CATEGORIES = ["Education", "Healthcare", "Water & Sanitation", "Food Security", "Youth Development", "Economic Empowerment", "Disaster Response", "Community Infrastructure", "Environment", "Other"];

export default function ClubPanel() {
  const { user, wallet } = useWallet();
  const [projects, setProjects] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", clubName: "", region: "", category: "Education", description: "", problemStatement: "", beneficiaries: 0, requestedFunding: 0, timeline: "" });
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    const list = await base44.entities.Project.list("-submittedAt", 50);
    setProjects(list);
    const c = await base44.entities.RotaryClub.list("-fundingReceived", 20);
    setClubs(c);
  };
  useEffect(() => { load(); }, []);

  const submitProject = async () => {
    if (!form.name || !form.clubName || !form.requestedFunding) return toast({ title: "Fill required fields", variant: "destructive" });
    setBusy(true);
    try {
      await base44.entities.Project.create({
        ...form,
        beneficiaries: Number(form.beneficiaries) || 0,
        requestedFunding: Number(form.requestedFunding),
        budget: Number(form.requestedFunding),
        status: "SUBMITTED",
        submittedBy: user?.full_name || user?.email,
        submittedById: user?.id,
        submittedAt: new Date().toISOString(),
        conflictOfInterest: "None declared",
      });
      setShowForm(false);
      setForm({ name: "", clubName: "", region: "", category: "Education", description: "", problemStatement: "", beneficiaries: 0, requestedFunding: 0, timeline: "" });
      load();
      toast({ title: "Project submitted", description: "Your project is now pending vetting officer review." });
    } catch (e) {
      toast({ title: "Submission failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const myProjects = projects.filter((p) => p.submittedById === user?.id);
  const totalFunding = myProjects.reduce((s, p) => s + (p.fundingDisbursed || 0), 0);
  const completed = myProjects.filter((p) => p.status === "COMPLETED").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Club & Project Officer Panel</h1>
          <p className="text-sm text-muted-foreground">Submit projects, track milestones, and report impact.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 btn-dna">
          <Plus className="h-4 w-4" /> Submit Project
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FolderKanban} label="My Projects" value={fmtNum(myProjects.length)} />
        <StatCard icon={DollarSign} label="Funding Disbursed" value={fmtUSD(totalFunding)} accent />
        <StatCard icon={CheckCircle2} label="Completed" value={fmtNum(completed)} />
        <StatCard icon={Building2} label="Active Clubs" value={fmtNum(clubs.filter((c) => c.status === "ACTIVE").length)} />
      </div>

      {/* Projects table */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">Project Pipeline</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Project</th>
                <th className="pb-2 font-medium">Category</th>
                <th className="pb-2 font-medium">Requested</th>
                <th className="pb-2 font-medium">Disbursed</th>
                <th className="pb-2 font-medium">Milestones</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {myProjects.map((p) => (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="py-3">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">{p.clubName}</p>
                  </td>
                  <td className="py-3 text-muted-foreground">{p.category}</td>
                  <td className="py-3 font-semibold">{fmtUSD(p.requestedFunding)}</td>
                  <td className="py-3 font-semibold text-accent">{fmtUSD(p.fundingDisbursed)}</td>
                  <td className="py-3 text-muted-foreground">{p.milestonesCompleted}/{p.milestonesTotal}</td>
                  <td className="py-3"><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{p.status.replace(/_/g, " ")}</span></td>
                </tr>
              ))}
              {myProjects.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No projects submitted yet. Click "Submit Project" to begin.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clubs */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">Registered Charity Organizations</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.map((c) => (
            <div key={c.id} className="rounded-xl border border-border p-4">
              <p className="font-semibold">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.region}</p>
              <div className="mt-3 flex justify-between text-xs">
                <span className="text-muted-foreground">{c.projectsCount} projects</span>
                <span className="font-semibold text-accent">{fmtUSD(c.fundingReceived)} received</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Submit form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Submit a New Project</h2>
            <p className="text-sm text-muted-foreground">All submissions enter the vetting pipeline before DAO voting.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Project name *</label>
                <InteractiveInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Charity Organization *</label>
                  <InteractiveInput value={form.clubName} onChange={(e) => setForm({ ...form, clubName: e.target.value })} className="mt-1 w-full" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Region</label>
                  <InteractiveInput value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="mt-1 w-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Category</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary">
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Timeline</label>
                  <InteractiveInput value={form.timeline} onChange={(e) => setForm({ ...form, timeline: e.target.value })} placeholder="e.g. 6 months" className="mt-1 w-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Requested funding (USD) *</label>
                  <InteractiveInput type="number" value={form.requestedFunding} onChange={(e) => setForm({ ...form, requestedFunding: e.target.value })} className="mt-1 w-full" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Beneficiaries</label>
                  <InteractiveInput type="number" value={form.beneficiaries} onChange={(e) => setForm({ ...form, beneficiaries: e.target.value })} className="mt-1 w-full" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1 w-full" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Problem statement</label>
                <textarea value={form.problemStatement} onChange={(e) => setForm({ ...form, problemStatement: e.target.value })} rows={2} className="mt-1 w-full" />
              </div>
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
                <Upload className="mx-auto mb-1 h-5 w-5" /> Supporting documents (budget, evidence) — attach after submission during vetting
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-semibold hover:bg-muted btn-dna">Cancel</button>
              <button onClick={submitProject} disabled={busy} className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 btn-dna disabled:opacity-50">{busy ? "Submitting…" : "Submit for vetting"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}