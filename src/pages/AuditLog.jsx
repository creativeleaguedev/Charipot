import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { Download, Filter } from "lucide-react";

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    (async () => {
      const l = await base44.entities.AuditLog.list("-timestamp", 100);
      setLogs(l);
    })();
  }, []);

  const actions = ["all", ...new Set(logs.map((l) => l.action))];
  const filtered = filter === "all" ? logs : logs.filter((l) => l.action === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-sm text-muted-foreground">Immutable, exportable record of every platform, configuration, treasury, and draw action.</p>
        </div>
        <button onClick={() => {
          const csv = ["timestamp,actor,role,action,details,severity", ...filtered.map((l) => `"${l.timestamp}","${l.actor}","${l.actorRole}","${l.action}","${l.details.replace(/"/g, "'")}","${l.severity}"`)].join("\n");
          const blob = new Blob([csv], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url; a.download = "audit-log.csv"; a.click();
        }} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"><Download className="h-4 w-4" /> Export CSV</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {actions.map((a) => (
          <button key={a} onClick={() => setFilter(a)} className={cn("rounded-full px-3 py-1 text-xs font-medium", filter === a ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:bg-muted")}>
            {a === "all" ? "All actions" : a.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          {filtered.map((l) => (
            <div key={l.id} className="flex items-start gap-3 rounded-xl border border-border p-3">
              <div className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", l.severity === "critical" ? "bg-red-500" : l.severity === "warning" ? "bg-amber-500" : "bg-emerald-500")} />
              <div className="flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{l.action.replace(/_/g, " ")}</p>
                  <p className="text-[11px] text-muted-foreground">{new Date(l.timestamp).toLocaleString()}</p>
                </div>
                <p className="text-xs text-muted-foreground">{l.details}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Actor: {l.actor} · Role: {l.actorRole} · {l.entityType}: {l.entityId}</p>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No log entries match this filter.</p>}
        </div>
      </div>
    </div>
  );
}