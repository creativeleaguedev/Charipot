import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Clock, Loader2, ChevronDown } from "lucide-react";
import { fmtNum } from "@/lib/configRegistry";
import PassPurchaseList from "./PassPurchaseList";
import { useLang } from "@/lib/LanguageContext";

// Marketplace section that surfaces every pass package the current user has
// bought, with a live expiry countdown for packages whose passes expire. Lets
// users track remaining passes and see when unused passes will burn.
export default function MyPassPackages() {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        if (!me) { setLoading(false); return; }
        const list = await base44.entities.PassPurchase.filter({ userId: me.id });
        list.sort((a, b) => new Date(b.purchasedAt || 0) - new Date(a.purchasedAt || 0));
        setItems(list);
      } catch (_) { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const activeCount = items
    .filter((p) => p.status === "active" && (p.remaining || 0) > 0)
    .reduce((s, p) => s + (p.remaining || 0), 0);

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mb-3 flex w-full items-center gap-2 text-left"
        aria-expanded={expanded}
      >
        <Clock className="h-5 w-5 text-accent" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("passes.your_packages")}</h2>
        <span className="ml-auto text-[11px] text-muted-foreground">{fmtNum(activeCount)} {t("passes.unused")} · {fmtNum(items.length)} {t("passes.packages")}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && <PassPurchaseList items={items} />}
    </div>
  );
}