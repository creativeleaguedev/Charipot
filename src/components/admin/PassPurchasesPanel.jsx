import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { fmtNum } from "@/lib/configRegistry";
import { Search, Loader2, History } from "lucide-react";
import { PassPurchaseRow } from "@/components/passes/PassPurchaseList";

// Admin overview of EVERY user's pass purchases — package, timeline to expiry,
// remaining/burned passes, and on-chain payment proof. Reuses the shared
// PassPurchaseRow so each row matches what the user sees on the marketplace.
export default function PassPurchasesPanel({ user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("getAdminPassPurchases", {});
      setItems(res.data?.purchases || []);
    } catch (_) { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = query.trim()
    ? items.filter((p) => {
        const q = query.toLowerCase();
        return (p.fullName || "").toLowerCase().includes(q)
          || (p.userEmail || "").toLowerCase().includes(q)
          || (p.packageLabel || "").toLowerCase().includes(q);
      })
    : items;

  const activePasses = filtered
    .filter((p) => p.status === "active" && (p.remaining || 0) > 0)
    .reduce((s, p) => s + (p.remaining || 0), 0);
  const expiringSoon = filtered.filter((p) => {
    if (!p.expiresAt || p.status !== "active") return false;
    const ms = new Date(p.expiresAt).getTime() - Date.now();
    return ms > 0 && ms < 48 * 3600 * 1000;
  }).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-accent" />
        <p className="text-sm text-muted-foreground">Track every user's pass packages — purchase date, timeline to expiry, remaining passes, and the on-chain payment proof for each purchase.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><p className="text-xs text-muted-foreground">Total purchases</p><p className="mt-1 text-xl font-bold">{fmtNum(filtered.length)}</p></div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><p className="text-xs text-muted-foreground">Active unused passes</p><p className="mt-1 text-xl font-bold text-emerald-600">{fmtNum(activePasses)}</p></div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><p className="text-xs text-muted-foreground">Expiring in 48h</p><p className="mt-1 text-xl font-bold text-amber-600">{fmtNum(expiringSoon)}</p></div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by user name, email, or package…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">No pass purchases found.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{p.fullName || "—"}</p>
                  <p className="text-[11px] text-muted-foreground">{p.userEmail || ""}</p>
                </div>
                <span className="text-[11px] text-muted-foreground">{p.purchasedAt ? new Date(p.purchasedAt).toLocaleString() : "—"}</span>
              </div>
              <PassPurchaseRow p={p} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}