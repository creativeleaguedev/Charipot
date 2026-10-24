import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/useWallet";
import { loadConfig, fmtUSD, fmtNum } from "@/lib/configRegistry";
import { useToast } from "@/components/ui/use-toast";
import { friendlyWalletError } from "@/lib/walletErrors";
import { cn } from "@/lib/utils";
import {
  Tag, Ticket, Loader2, CheckCircle2, Wallet, ArrowRight, Clock,
} from "lucide-react";
import PassPackagesModal from "@/components/passes/PassPackagesModal";
import MyPassPackages from "@/components/passes/MyPassPackages";
import { useLang } from "@/lib/LanguageContext";

// Fallback tiers used only while admin packages load or if none exist.
const FALLBACK_TIERS = [
  { amount: 50, discount: 10 },
  { amount: 200, discount: 20 },
  { amount: 500, discount: 30 },
  { amount: 700, discount: 40 },
  { amount: 1000, discount: 50 },
];

export default function TicketMarketplace() {
  const { wallet, refresh } = useWallet();
  const { toast } = useToast();
  const { t } = useLang();
  const [config, setConfig] = useState(null);
  const [packages, setPackages] = useState([]);
  const [loadingPkgs, setLoadingPkgs] = useState(true);
  const [buying, setBuying] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    (async () => {
      setConfig(await loadConfig());
      try {
        const list = await base44.entities.PassPackage.filter({ active: true });
        list.sort((a, b) => (a.order || 0) - (b.order || 0) || (a.amount || 0) - (b.amount || 0));
        setPackages(list);
      } catch (_) { /* ignore — fallback below */ }
      setLoadingPkgs(false);
    })();
  }, []);

  const price = config?.ticket_price?.value ?? 0.1;
  const passPrice = (pkg) => (pkg.passPrice > 0 ? Number(pkg.passPrice) : +(price * (1 - (pkg.discount || 0) / 100)).toFixed(4));
  const passCount = (pkg) => Math.max(1, Math.round(Number(pkg.amount) / passPrice(pkg)));

  const tiers = packages.length > 0
    ? packages.map((p) => ({ id: p.id, label: p.label, amount: Number(p.amount), discount: Number(p.discount || 0), passPrice: passPrice(p), passes: passCount(p), validityDays: Number(p.validityDays || 0), bestValue: !!p.bestValue }))
    : FALLBACK_TIERS.map((t) => ({ label: `${t.discount}% off`, amount: t.amount, discount: t.discount, passPrice: +(price * (1 - t.discount / 100)).toFixed(4), passes: Math.max(1, Math.round(t.amount / (price * (1 - t.discount / 100)))), validityDays: 0, bestValue: t.amount === 1000 }));

  const buy = async (tier) => {
    setBuying(tier.amount);
    try {
      const payload = { amount: tier.amount, off: tier.discount };
      if (tier.id) payload.packageId = tier.id;
      const res = await base44.functions.invoke("buyTicketPasses", payload);
      const d = res.data;
      if (d?.error === "insufficient_gas") {
        toast({ title: "Insufficient gas fee", description: `No ${d.native} on ${d.chain}. Deposit a small amount of ${d.native}.`, variant: "destructive" });
      } else if (d?.error === "insufficient") {
        toast({ title: "Insufficient balance", description: `Need ${fmtUSD(d.needed)}. Wallet holds ${fmtUSD(d.balance || 0)} USDC/USDT.`, variant: "destructive" });
      } else if (d?.error === "blacklisted") {
        toast({ title: "Account restricted", variant: "destructive" });
      } else if (d?.needsWallet) {
        toast({ title: "Create your crypto wallet first", variant: "destructive" });
      } else if (d?.error) {
        toast({ title: "Purchase failed", description: d.error, variant: "destructive" });
      } else {
        toast({ title: "Passes purchased!", description: `${fmtNum(d.passes)} passes · ${fmtUSD(d.amount)} paid in ${d.paidWith.token} on ${d.paidWith.chain}` });
        setResult(d);
        refresh();
      }
    } catch (e) {
      toast({ ...friendlyWalletError(e, "Purchase failed"), variant: "destructive" });
    }
    setBuying(null);
  };

  return (
    <div className="space-y-6 overflow-x-clip">
      {/* Moving promo ticker — 50% OFF DISCOUNT badge style */}
      <div className="overflow-hidden bg-navy-gradient py-2 shadow-md sm:py-3">
        <div className="flex w-max animate-marquee items-center gap-4 whitespace-nowrap sm:gap-6">
          {[0, 1].map((k) => (
            <div key={k} className="flex items-center gap-4 sm:gap-6">
              <span className="relative inline-flex h-9 w-9 flex-col items-center justify-center rounded-full border-2 border-[#8B0000] bg-[#E60000] text-white shadow-[inset_0_0_12px_rgba(0,0,0,0.35)] sm:h-16 sm:w-16 sm:border-4">
                <span className="flex items-baseline leading-none">
                  <span className="text-sm font-black tracking-tight sm:text-2xl">50%</span>
                  <span className="ml-0.5 text-[7px] font-bold sm:text-[10px]">OFF</span>
                </span>
                <span className="mt-0.5 hidden rounded bg-[#8B0000] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-widest text-white sm:mt-1 sm:block sm:px-2 sm:text-[9px]">Discount</span>
              </span>
              <span className="text-xs font-bold text-white sm:text-sm">{t("passes.ticker")}</span>
              <span className="hidden items-center gap-2 text-sm font-semibold text-white/90 sm:flex">{t("passes.ticker_sub")}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 50% OFF banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-amber-400 p-4 text-white shadow-lg sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-white/20 blur-3xl sm:h-40 sm:w-40" />
        <div className="relative flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest sm:gap-2 sm:px-3 sm:py-1 sm:text-xs">
              <Tag className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> {t("passes.bulk_badge")}
            </div>
            <h1 className="mt-1.5 text-xl font-bold sm:mt-2 sm:text-3xl">{t("passes.banner_title")}</h1>
            <p className="mt-1 max-w-xl text-xs text-white/90 sm:text-sm">{t("passes.banner_desc")}</p>
          </div>
          <div className="rounded-xl bg-white/15 p-3 text-center backdrop-blur sm:rounded-2xl sm:p-4">
            <p className="text-[9px] uppercase tracking-wide text-white/70 sm:text-[11px]">{t("passes.your_passes")}</p>
            <p className="text-2xl font-bold sm:text-3xl">{fmtNum(wallet?.passBalance || 0)}</p>
            <Link to="/play" className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-white/90 btn-ripple sm:mt-2 sm:px-3 sm:py-1.5 sm:text-xs">
              {t("passes.play_with_passes")} <ArrowRight className="h-3 w-3" />
            </Link>
            <PassPackagesModal
              trigger={
                <button className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-emerald-700/90 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-700 btn-ripple sm:px-3 sm:py-1.5 sm:text-xs">
                  <Clock className="h-3 w-3" /> {t("passes.my_packages")}
                </button>
              }
            />
          </div>
        </div>
      </div>

      {/* Your pass packages & expiry — track remaining passes and when they burn */}
      <MyPassPackages />

      {loadingPkgs && (
        <div className="flex h-40 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" /></div>
      )}

      {/* Package cards */}
      {!loadingPkgs && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier, i) => {
            const amt = tier.amount;
            const pp = tier.passPrice;
            const passes = tier.passes;
            const worth = passes * price;
            const saving = +(worth - amt).toFixed(2);
            const best = tier.bestValue || (packages.length === 0 && amt === 1000);
            return (
              <div key={tier.id || i} className={cn("pricing-glow relative flex flex-col p-5 text-white shadow-sm", best && "ring-2 ring-emerald-400/60")}>
                {best && (
                  <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-emerald-400 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-950 shadow">{t("passes.best_value")}</span>
                )}
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/15 px-2 py-0.5 text-[11px] font-bold text-cyan-300">{tier.discount}% {t("passes.off")}</span>
                  <span className="text-[11px] text-white/50">{t("passes.save")} {fmtUSD(saving)}</span>
                </div>
                <p className="mt-1 text-sm font-semibold text-white/70">{tier.label}</p>
                <p className="mt-2 text-3xl font-extrabold">{fmtUSD(amt)}</p>
                <p className="text-sm text-white/60">{fmtNum(passes)} {t("passes.passes_word")} · {fmtUSD(pp)} each</p>
                {tier.validityDays > 0 && (
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-300"><Clock className="h-3 w-3" /> {t("passes.valid_for", { n: tier.validityDays })}</p>
                )}
                <div className="mt-3 space-y-1 rounded-lg bg-white/5 p-3 text-xs ring-1 ring-white/10">
                  <div className="flex justify-between"><span className="text-white/50">{t("passes.normal_value")}</span><span className="font-semibold text-white/70 line-through">{fmtUSD(worth)}</span></div>
                  <div className="flex justify-between"><span className="text-white/50">{t("passes.you_pay")}</span><span className="font-bold text-cyan-300">{fmtUSD(amt)}</span></div>
                  <div className="flex justify-between"><span className="text-white/50">{t("passes.equals")}</span><span className="font-semibold text-white">{fmtNum(passes)} {t("passes.ticket_plays")}</span></div>
                </div>
                <button onClick={() => buy(tier)} disabled={buying !== null}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold-gradient py-2.5 text-sm font-bold text-primary-foreground shadow-md transition-transform hover:scale-[1.01] btn-ripple disabled:cursor-not-allowed disabled:opacity-60">
                  {buying === amt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                  {buying === amt ? t("passes.processing") : `${t("passes.buy")} ${fmtNum(passes)} ${t("passes.passes_word")}`}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation */}
      {result && (
        <div className="rounded-2xl border border-emerald-300/60 bg-emerald-50/60 p-6 shadow-sm neon-green">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-emerald-700">{t("passes.confirm_title")}</h2>
          </div>
          <p className="mt-1 text-sm text-emerald-700/80">
            {fmtNum(result.passes)} passes purchased for {fmtUSD(result.amount)} in {result.paidWith.token} on {result.paidWith.chain}
            (tx {result.paidWith.txHash ? result.paidWith.txHash.slice(0, 10) + "…" : "—"}). Revenue split: {fmtUSD(result.split.charity)} charity · {fmtUSD(result.split.prize)} prize · {fmtUSD(result.split.platform)} platform · {fmtUSD(result.split.agentRef)} agent.
          </p>
          <div className="mt-3 rounded-xl bg-white p-4">
            <p className="text-xs text-muted-foreground">You now have <b className="text-emerald-700">{fmtNum((wallet?.passBalance) || 0)}</b> passes. Head to Play to redeem them — one pass per ticket, free.</p>
          </div>
          <div className="mt-4 flex gap-2">
            <Link to="/play" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 btn-ripple"><Ticket className="h-4 w-4" /> Play with passes</Link>
            <button onClick={() => setResult(null)} className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 btn-ripple">Done</button>
          </div>
        </div>
      )}

    </div>
  );
}