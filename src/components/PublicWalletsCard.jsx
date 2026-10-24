import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { fmtUSD } from "@/lib/configRegistry";
import { shortAddr, addrUrl } from "@/lib/chains";
import { Heart, Trophy, Ticket, Award, ArrowRight, RefreshCw, Copy, ExternalLink } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// Wallets whose on-chain address should only be visible to admins.
// The platform collector and donation wallets are hidden from regular users
// and public visitors; admins still see everything.
const ADMIN_ONLY_KEYS = ["collector", "donation"];

const ICONS = {
  charity: Heart,
  jackpot_5: Award,
  winnings_4: Trophy,
  winnings_3: Ticket,
};

// Compact public summary of the 4 public platform wallets (Charity, 5/5
// Jackpot, 4/5 Winnings, 3/5 Winnings). Shows each wallet's allocation %,
// ledger balance, and shared custody address. Links to /wallets for full
// per-chain breakdowns. Used on the public Landing and logged-in Home pages.
export default function PublicWalletsCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const { toast } = useToast();

  const load = async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const res = await base44.functions.invoke("getPlatformWallets", {});
      if (res.data?.wallets) setData(res.data);
    } catch (_) {}
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    load();
    (async () => {
      try {
        const authed = await base44.auth.isAuthenticated();
        if (authed) {
          const u = await base44.auth.me();
          setIsAdmin(u?.role === "admin");
        }
      } catch (_) {}
    })();
  }, []);

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Address copied" });
  };

  if (loading) {
    return (
      <div className="rounded-2xl border-2 border-accent/60 bg-accent/5 p-5 shadow-sm neon-gold">
        <div className="h-24 animate-pulse rounded-lg bg-muted/60" />
      </div>
    );
  }

  const wallets = (data?.wallets || []).filter((w) => isAdmin || !ADMIN_ONLY_KEYS.includes(w.key));

  return (
    <div className="rounded-2xl border-2 border-accent/60 bg-accent/5 p-5 shadow-sm neon-gold">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold">Public Platform Wallets · Live on-chain</h3>
          <p className="text-[11px] text-muted-foreground">Every ticket's revenue is split across these auditable wallets.</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => load(true)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-accent" title="Refresh balances">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <Link to="/wallets" className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-primary hover:bg-muted">
            Details <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {wallets.map((w) => {
          const Icon = ICONS[w.key] || Trophy;
          return (
            <div key={w.key} className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold"><Icon className="h-4 w-4 text-accent" /> {w.label}</span>
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">{w.allocationPct}%</span>
              </div>
              <p className="mt-1.5 text-lg font-bold text-foreground">{fmtUSD(w.liveTotal)}</p>
              <p className="text-[10px] text-muted-foreground">Live on-chain custody · allocated to date {fmtUSD(w.ledgerBalance)}</p>
              <div className="mt-2 flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 py-1">
                <code className="flex-1 truncate text-[10px]">{shortAddr(w.address)}</code>
                <button onClick={() => copy(w.address)} className="rounded p-1 text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button>
                <a href={addrUrl("bnb", w.address)} target="_blank" rel="noreferrer" className="rounded p-1 text-muted-foreground hover:text-foreground"><ExternalLink className="h-3 w-3" /></a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}