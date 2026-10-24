import React from "react";
import { fmtUSD, fmtNum } from "@/lib/configRegistry";
import { Trophy, Radio, Vote } from "lucide-react";
import { cn } from "@/lib/utils";

// Live ranking leaderboard for projects in the current governance round.
// `projects` should already be filtered to VOTING status; this sorts by GOV committed (highest first).
export default function ProjectRankingBoard({ projects, onOpen }) {
  const ranked = [...projects].sort((a, b) => (b.totalCommittedGov || 0) - (a.totalCommittedGov || 0));
  const total = ranked.reduce((s, p) => s + (p.totalCommittedGov || 0), 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Trophy className="h-5 w-5 text-accent" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Project Ranking</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          <Radio className="h-3 w-3 animate-pulse" /> Live
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">Ranked by GOV committed · highest first · updates as votes are cast</span>
      </div>

      {ranked.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          No projects are open for voting in the current governance round yet.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {ranked.map((p, i) => {
            const rank = i + 1;
            const share = total > 0 ? ((p.totalCommittedGov || 0) / total) * 100 : 0;
            return (
              <button
                key={p.id}
                onClick={() => onOpen?.(p)}
                className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-muted/40"
              >
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", rank === 1 ? "bg-gold-gradient text-primary-foreground" : rank === 2 ? "bg-slate-300 text-slate-800" : rank === 3 ? "bg-amber-200 text-amber-800" : "bg-muted text-muted-foreground")}>
                  {rank <= 3 ? <Trophy className="h-4 w-4" /> : `#${rank}`}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{p.clubName} · {p.category} · {p.region || p.location}</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gold-gradient transition-all duration-500" style={{ width: `${share}%` }} />
                  </div>
                </div>
                <div className="hidden w-28 shrink-0 text-right sm:block">
                  <p className="flex items-center justify-end gap-1 text-sm font-bold"><Vote className="h-3.5 w-3.5 text-accent" />{fmtNum(p.totalCommittedGov)}</p>
                  <p className="text-[10px] text-muted-foreground">{share.toFixed(1)}% share</p>
                </div>
                <div className="w-24 shrink-0 text-right">
                  <p className="text-sm font-bold">{fmtUSD(p.requestedFunding)}</p>
                  <p className="text-[10px] text-muted-foreground">{fmtNum(p.voterCount || 0)} voters</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}