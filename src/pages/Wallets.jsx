import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { fmtUSD, fmtNum } from "@/lib/configRegistry";
import { CHAINS, TOKEN_LOGOS, addrUrl } from "@/lib/chains";
import { Heart, Trophy, Ticket, Award, ArrowLeft, RefreshCw, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { loadConfig } from "@/lib/configRegistry";
import { useLang } from "@/lib/LanguageContext";
import BrandLogo from "@/components/ui/BrandLogo";
import RotaryMark from "@/components/ui/RotaryMark";

const ICONS = {
  charity: Heart,
  jackpot_5: Award,
  winnings_4: Trophy,
  winnings_3: Ticket,
};

// Public page showing the 4 public platform wallets in full detail: allocation
// %, ledger balance, live on-chain custody balance, shared custody address,
// and per-chain USDC/USDT breakdowns. No login required.
export default function Wallets() {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [config, setConfig] = useState(null);
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

  useEffect(() => { load(); loadConfig().then(setConfig); }, []);

  // Derive the live revenue split from the Configuration Registry so the
  // public page never shows stale/hardcoded percentages.
  const split = config ? (() => {
    const charity = config.rev_charity?.value ?? 50;
    const prize = config.rev_prize?.value ?? 40;
    const platform = config.rev_platform?.value ?? 8;
    const agent = config.rev_agent?.value ?? 2;
    const p5 = config.prize_5?.value ?? 70;
    const p4 = config.prize_4?.value ?? 20;
    const p3 = config.prize_3?.value ?? 10;
    const reserve = config.reserve_split?.value ?? 10;
    const claim = config.claim_fee?.value ?? 2;
    const jack = +((prize * p5) / 100).toFixed(1);
    const win4 = +((prize * p4) / 100).toFixed(1);
    const win3 = +((prize * p3) / 100).toFixed(1);
    const buffer = +((jack * reserve) / 100).toFixed(1);
    return { charity, jack, win4, win3, buffer, platform, agent, claim };
  })() : null;

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Address copied" });
  };

  const wallets = data?.wallets || [];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandLogo height={40} className="rounded-md shrink-0" />
            <div className="leading-tight">
              <p className="text-sm font-bold text-foreground">{t("landing.brand")}</p>
              <p className="text-[11px] text-muted-foreground">{t("landing.tagline")}</p>
            </div>
          </Link>
          <Button asChild variant="ghost" size="sm" className="btn-lantern"><Link to="/"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to home</Link></Button>
        </div>
      </header>

      <section className="bg-navy-gradient text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" /> Transparent & Auditable
          </div>
          <h1 className="mt-3 text-3xl sm:text-4xl font-bold">Public Platform Wallets</h1>
          <p className="mt-2 max-w-2xl text-white/80">Every ticket's revenue is split across seven auditable wallets. The four below are public — their on-chain custody address and per-wallet ledger balances are verifiable in real time.</p>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground">{wallets.length} public wallets</p>
          <button onClick={() => load(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted btn-lantern">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-56 rounded-2xl bg-muted animate-pulse" />)}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {wallets.map((w) => {
              const Icon = ICONS[w.key] || Trophy;
              return (
                <div key={w.key} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent"><Icon className="h-5 w-5" /></div>
                      <div>
                        <h2 className="text-base font-bold">{w.label}</h2>
                        <p className="text-[11px] text-muted-foreground">{w.description}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">{w.allocationPct}% of sales</span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-muted/40 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Allocated to date</p>
                      <p className="mt-0.5 text-2xl font-bold text-foreground">{fmtUSD(w.ledgerBalance)}</p>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Live custody balance</p>
                      <p className="mt-0.5 text-2xl font-bold text-accent">{fmtUSD(w.liveTotal)}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Custody address (shared, on-chain)</p>
                    <div className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                      <code className="flex-1 truncate text-xs">{w.address}</code>
                      <button onClick={() => copy(w.address)} className="rounded p-1 text-muted-foreground hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
                      <a href={addrUrl("bnb", w.address)} target="_blank" rel="noreferrer" className="rounded p-1 text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>
                    </div>
                  </div>

                  {w.chains?.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {w.chains.map((c) => {
                        const chain = CHAINS.find((x) => x.key === c.chain);
                        return (
                          <div key={c.chain} className="rounded-lg border border-border bg-background p-2.5">
                            <div className="flex items-center gap-1.5">
                              {chain?.logo && <img src={chain.logo} alt={c.chain} className="h-4 w-4 rounded-full" />}
                              <span className="text-[11px] font-semibold">{chain?.name || c.chain}</span>
                            </div>
                            <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
                              <p className="flex items-center gap-1"><img src={TOKEN_LOGOS.USDC} alt="" className="h-3 w-3" /> {fmtNum(Number(c.balances?.USDC || 0))}</p>
                              <p className="flex items-center gap-1"><img src={TOKEN_LOGOS.USDT} alt="" className="h-3 w-3" /> {fmtNum(Number(c.balances?.USDT || 0))}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 rounded-2xl border border-border bg-muted/30 p-5 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground"><RotaryMark className="h-4 w-4 text-accent" /> How allocations work</p>
          {split ? (
            <p className="mt-2">Each ticket sale is split: {split.charity}% Charity · {split.jack}% 5/5 Jackpot · {split.win4}% 4/5 Winnings · {split.win3}% 3/5 Winnings · {split.buffer}% Buffer (future jackpot seed) · {split.platform}% Treasury · {split.agent}% Agent Referral. A {split.claim}% claim fee on winnings also routes to the Treasury. Ledger balances accumulate per draw; the on-chain custody address holds the combined balances verifiably.</p>
          ) : (
            <p className="mt-2">Each ticket sale is split across the public wallets below according to the live Configuration Registry. Ledger balances accumulate per draw; the on-chain custody address holds the combined balances verifiably.</p>
          )}
        </div>
      </main>
    </div>
  );
}