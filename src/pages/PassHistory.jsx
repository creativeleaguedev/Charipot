import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Tag, ArrowLeft, Loader2 } from "lucide-react";
import { fmtNum } from "@/lib/configRegistry";
import PassPurchaseList from "@/components/passes/PassPurchaseList";

// Dedicated per-user pass purchase history page with the timeline + on-chain
// proof for every package. Shareable per-user view:
//   /pass-history        → the current user's own full purchase history
//   /pass-history/:userId → an admin viewing a specific user's history
export default function PassHistory() {
  const { userId } = useParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [owner, setOwner] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        let list;
        if (userId && userId !== me.id) {
          // Admin viewing another user — use the admin backend function.
          const res = await base44.functions.invoke("getAdminPassPurchases", { userId });
          list = res.data?.purchases || [];
          const u = await base44.entities.User.get(userId).catch(() => null);
          setOwner(u);
        } else {
          list = await base44.entities.PassPurchase.filter({ userId: me.id });
        }
        list.sort((a, b) => new Date(b.purchasedAt || 0) - new Date(a.purchasedAt || 0));
        setItems(list);
      } catch (_) { /* ignore */ }
      setLoading(false);
    })();
  }, [userId]);

  const activeCount = items
    .filter((p) => p.status === "active" && (p.remaining || 0) > 0)
    .reduce((s, p) => s + (p.remaining || 0), 0);
  const title = owner ? `${owner.full_name || owner.email}'s pass history` : "My pass history";
  const backTo = userId ? "/admin" : "/passes";

  return (
    <div className="space-y-6">
      <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div className="flex items-center gap-2">
        <Tag className="h-6 w-6 text-accent" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">Every pass package purchased — timeline to expiry and on-chain transaction proof.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><p className="text-xs text-muted-foreground">Total packages</p><p className="mt-1 text-xl font-bold">{fmtNum(items.length)}</p></div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><p className="text-xs text-muted-foreground">Active unused passes</p><p className="mt-1 text-xl font-bold text-emerald-600">{fmtNum(activeCount)}</p></div>
      </div>
      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">No pass packages purchased yet.</div>
      ) : (
        <PassPurchaseList items={items} />
      )}
    </div>
  );
}