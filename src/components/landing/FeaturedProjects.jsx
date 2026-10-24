import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Building2, Users, ArrowRight } from "lucide-react";
import { fmtUSD, fmtNum } from "@/lib/configRegistry";

// Featured projects grid — image (with icon fallback), green category tag,
// description, and a funding progress bar ($raised / $goal). Links to the full
// projects page; each card reflects real Project entity data.
export default function FeaturedProjects({ t, loading, projects }) {
  return (
    <section id="projects" className="scroll-mt-20 mx-auto max-w-7xl px-4 sm:px-6 py-16">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-[#F26522]">{t("landing.featured.title")}</p>
          <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold text-foreground">{t("landing.featured.subtitle")}</h2>
        </div>
        <Button asChild variant="outline" className="border-[#F26522] text-[#F26522] hover:bg-[#F26522]/10">
          <Link to="/projects">{t("landing.view_all")} <ArrowRight className="ml-1.5" style={{ width: 16, height: 16 }} /></Link>
        </Button>
      </div>
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => <div key={i} className="h-72 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : projects?.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p) => {
            const raised = Number(p.fundingAllocated || 0);
            const goal = Number(p.requestedFunding || p.budget || 0) || 1;
            const prog = Math.min(100, (raised / goal) * 100);
            return (
              <div key={p.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow">
                <div className="h-40 relative bg-[#1B1B1B]">
                  <div className="absolute inset-0 flex items-center justify-center text-white/30"><Building2 className="h-10 w-10" /></div>
                  {p.imageUrl && (
                    <img src={p.imageUrl} alt={p.name} className="absolute inset-0 h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  )}
                  <span className="absolute top-3 left-3 rounded-full bg-[#27AE60] px-2.5 py-1 text-[11px] font-semibold text-white">{p.category}</span>
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-foreground line-clamp-1">{p.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.clubName} · {p.region}</p>
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                  <div className="mt-4">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-[#F26522]" style={{ width: `${prog}%` }} />
                    </div>
                    <div className="mt-1.5 flex justify-between text-xs">
                      <span className="font-bold text-foreground">{fmtUSD(raised)} raised</span>
                      <span className="text-muted-foreground">{fmtUSD(goal)} goal</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" /> {fmtNum(p.beneficiaries || 0)} beneficiaries</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-12 text-center text-muted-foreground">{t("landing.no_featured")}</div>
      )}
    </section>
  );
}