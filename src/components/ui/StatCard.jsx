import React from "react";
import { cn } from "@/lib/utils";

export default function StatCard({ icon: Icon, label, value, sub, accent, className }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn("mt-2 text-2xl font-bold tracking-tight", accent ? "text-gold" : "text-foreground")}>{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
        {Icon && (
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", accent ? "bg-accent/15 text-accent" : "bg-primary/10 text-primary")}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}