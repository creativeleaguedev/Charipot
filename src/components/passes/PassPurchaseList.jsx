import React, { useState, useEffect } from "react";
import { Clock, Flame, Link2, ExternalLink } from "lucide-react";
import { fmtNum, fmtUSD } from "@/lib/configRegistry";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/LanguageContext";
import { getChain, txUrl } from "@/lib/chains";

// Shared countdown + purchase-row used by both the marketplace page section
// and the "My pass packages" modal, so expiry tracking stays consistent.
// Each row shows: package meta, remaining/burned passes, a live countdown,
// a purchase→expiry timeline bar, and the on-chain transaction proof.

function calcRemaining(expiresAt) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return { expired: true };
  return {
    expired: false,
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
  };
}

export function useCountdown(expiresAt) {
  const [remaining, setRemaining] = useState(() => calcRemaining(expiresAt));
  useEffect(() => {
    setRemaining(calcRemaining(expiresAt));
    if (!expiresAt) return;
    const id = setInterval(() => setRemaining(calcRemaining(expiresAt)), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}

// Progress 0..100 from purchase date to expiry date (null when no expiry).
function timelinePct(purchasedAt, expiresAt) {
  if (!purchasedAt || !expiresAt) return null;
  const start = new Date(purchasedAt).getTime();
  const end = new Date(expiresAt).getTime();
  const now = Date.now();
  if (end <= start) return 100;
  return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
}

// Visual timeline bar tracking the package from the day it was bought to expiry.
function TimelineBar({ p, expired }) {
  const pct = timelinePct(p.purchasedAt, p.expiresAt);
  if (pct == null) return null;
  const left = p.purchasedAt ? new Date(p.purchasedAt).toLocaleDateString() : "—";
  const right = p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : "—";
  const fill = expired ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="mt-2">
      <div className="relative h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("absolute left-0 top-0 h-2 rounded-full transition-all", fill)} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Bought · {left}</span>
        <span className={cn("font-semibold", expired ? "text-red-500" : pct > 80 ? "text-amber-600" : "text-emerald-600")}>
          {expired ? "Expired" : `${Math.round(pct)}% elapsed`}
        </span>
        <span>Expiry · {right}</span>
      </div>
    </div>
  );
}

// On-chain transaction proof for the pass purchase (blockchain tracking).
function TxProofRow({ p }) {
  const chain = getChain(p.paidChain);
  if (!p.paidTxHash && !chain) return null;
  const url = p.paidTxHash && chain ? txUrl(p.paidChain, p.paidTxHash) : null;
  const short = p.paidTxHash ? `${p.paidTxHash.slice(0, 10)}…${p.paidTxHash.slice(-6)}` : "—";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-[11px]">
      <span className="font-semibold uppercase tracking-wide text-muted-foreground">On-chain</span>
      {chain && (
        <span className="inline-flex items-center gap-1 rounded-full bg-card px-1.5 py-0.5 text-[10px] font-medium">
          {chain.logo && <img src={chain.logo} alt={chain.name} className="h-3 w-3 rounded-full" />}
          {chain.name}
        </span>
      )}
      {p.paidToken && <span className="rounded-full bg-card px-1.5 py-0.5 text-[10px] font-medium">{p.paidToken}</span>}
      {p.amountPaid != null && <span className="font-semibold text-foreground">{fmtUSD(p.amountPaid)}</span>}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          <Link2 className="h-3 w-3" /> {short} <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="text-muted-foreground">{short}</span>
      )}
    </div>
  );
}

export function PassPurchaseRow({ p }) {
  const { t } = useLang();
  const cd = useCountdown(p.expiresAt);
  const expired = p.status === "burned" || cd?.expired;
  return (
    <div className={cn("rounded-xl border p-4", expired ? "border-muted bg-muted/30 opacity-70" : "border-border bg-card")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{p.packageLabel}</p>
          <p className="text-[11px] text-muted-foreground">
            {fmtNum(p.quantity)} {t("passes.passes_word")} · {fmtUSD(p.amountPaid)} · {p.purchasedAt ? new Date(p.purchasedAt).toLocaleDateString() : "—"}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", expired ? "bg-muted text-muted-foreground" : "bg-emerald-100 text-emerald-700")}>
          {expired ? t("passes.expired") : t("passes.active")}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {t("passes.remaining_passes")}: <b className="text-foreground">{fmtNum(p.remaining || 0)}</b> / {fmtNum(p.quantity)}
        </span>
        {Number(p.burnedQty) > 0 && (
          <span className="text-[11px] text-red-500">
            <Flame className="mr-1 inline h-3 w-3" />{fmtNum(p.burnedQty)} {t("passes.burned")}
          </span>
        )}
      </div>
      {p.expiresAt ? (
        <>
          <div className={cn("mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs", expired ? "bg-muted/50 text-muted-foreground" : "bg-amber-50 text-amber-700")}>
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {expired ? (
              <span>{t("passes.expired_on")} {new Date(p.expiresAt).toLocaleString()}</span>
            ) : (
              <span className="tabular-nums">
                {t("passes.expires_in")} {cd.d}d {String(cd.h).padStart(2, "0")}h {String(cd.m).padStart(2, "0")}m {String(cd.s).padStart(2, "0")}s · {new Date(p.expiresAt).toLocaleString()}
              </span>
            )}
          </div>
          <TimelineBar p={p} expired={expired} />
        </>
      ) : (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> {t("passes.no_expiry")}
        </div>
      )}
      <TxProofRow p={p} />
    </div>
  );
}

export default function PassPurchaseList({ items }) {
  return (
    <div className="space-y-3">
      {items.map((p) => <PassPurchaseRow key={p.id} p={p} />)}
    </div>
  );
}