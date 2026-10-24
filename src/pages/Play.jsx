import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/useWallet";
import { useJackpotTotal } from "@/lib/useJackpotTotal";
import { loadConfig, parseNumbers, fmtUSD, fmtNum } from "@/lib/configRegistry";
import { useLang } from "@/lib/LanguageContext";
import NumberBall from "@/components/ui/NumberBall";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Ticket, Check, Heart, ListChecks, FileCode2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import TicketBuilder from "@/components/TicketBuilder";
import ReferralCodeCard from "@/components/ReferralCodeCard";
import RotaryMark from "@/components/ui/RotaryMark";

// Resolve the draw a user can buy into. If the active draw is already full
// (ticketCount >= target), the auto-execute that should have fired after the
// last purchase may have failed silently — so complete it now and open the
// next draw. Play never stalls on "Draw sold out" with no way forward.
async function resolveActiveDraw(cfg) {
  let all = await base44.entities.Draw.list("-drawNumber", 1000);
  let active = all.find((d) => ["BUILDING", "MINIMUM_REACHED", "TARGET_REACHED"].includes(d.status));
  if (active && (active.ticketCount || 0) >= (active.targetTickets || 0)) {
    try { await base44.functions.invoke("executeDraw", {}); } catch (_) {}
    all = await base44.entities.Draw.list("-drawNumber", 1000);
    active = all.find((d) =>
      ["BUILDING", "MINIMUM_REACHED", "TARGET_REACHED"].includes(d.status) &&
      (d.ticketCount || 0) < (d.targetTickets || 0)
    );
  }
  if (!active) {
    const last = all[0];
    const nextNumber = (last?.drawNumber || 0) + 1;
    const won = last && (last.winners5 || 0) > 0;
    const rollover = last && !won ? last.jackpotAmount || 0 : 0;
    const reserveSeed = last && won ? last.reserveBalance || 0 : 0;
    active = await base44.entities.Draw.create({
      drawNumber: nextNumber,
      status: "BUILDING",
      jackpotAmount: +(rollover + reserveSeed).toFixed(2),
      targetTickets: cfg?.draw_target?.value || 5,
      minThreshold: cfg?.min_jackpot?.value || 3500,
      rolloverFrom: rollover > 0 ? last.drawNumber : undefined,
      reserveBalance: won ? 0 : last?.reserveBalance || 0,
      reserveAllocation: 0,
      createdAt: new Date().toISOString(),
    });
    all = await base44.entities.Draw.list("-drawNumber", 1000);
  }
  return { draws: all, draw: active };
}

export default function Play() {
  const { user, wallet, refresh } = useWallet();
  const { jackpotTotal, refresh: refreshJackpot } = useJackpotTotal();
  const { t } = useLang();
  const [config, setConfig] = useState(null);
  const [draw, setDraw] = useState(null);
  const [draws, setDraws] = useState([]);
  const [buying, setBuying] = useState(false);
  const [lastTickets, setLastTickets] = useState([]);
  const [overflowTickets, setOverflowTickets] = useState([]);
  const [lastOverflowDraw, setLastOverflowDraw] = useState(null);
  const [myTickets, setMyTickets] = useState([]);
  const [showAllTickets, setShowAllTickets] = useState(false);
  const [payMethod, setPayMethod] = useState({ chain: "bnb", token: "USDC" });
  const [builderOpen, setBuilderOpen] = useState(false);
  const [passMode, setPassMode] = useState(false);
  // The referrer is the invitation code locked on the user's wallet (permanent).
  // Fall back to the ?ref= invite link, then the house agent code so every
  // ticket still attributes the 2% referral revenue to a designated agent.
  const HOUSE_CODE = "CHARITY-DEN-33";
  const refParam = (() => { try { return new URLSearchParams(window.location.search).get("ref"); } catch (_) { return null; } })();
  const activeReferrerCode = wallet?.referrerCode || refParam || HOUSE_CODE;
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const cfg = await loadConfig();
      setConfig(cfg);
      const { draws: all, draw: active } = await resolveActiveDraw(cfg);
      setDraws(all);
      setDraw(active);
    })();
  }, []);

  // Auto-select the chain/token with the highest live balance so the user pays
  // from the wallet most likely to cover the cart. `insufficient` is true only
  // when NO wallet holds at least one ticket price — the pre-check prompt shows
  // then; otherwise checkout proceeds (the cart total is validated at payment).
  const [balances, setBalances] = useState(null);
  useEffect(() => {
    if (!wallet?.walletAddress) return;
    (async () => {
      try {
        const res = await base44.functions.invoke("getWalletBalances", {});
        const d = res.data;
        if (!d?.chains) return;
        setBalances(d);
        const entries = [];
        for (const c of d.chains) {
          for (const tok of ["USDC", "USDT"]) {
            const bal = Number(c.balances?.[tok] || 0);
            if (bal > 0) entries.push({ chain: c.chain, token: tok, bal });
          }
        }
        if (entries.length) {
          entries.sort((a, b) => b.bal - a.bal);
          setPayMethod({ chain: entries[0].chain, token: entries[0].token });
        }
      } catch (_) {}
    })();
  }, [wallet?.walletAddress]);

  const ticketPrice = config?.ticket_price?.value ?? 0.1;
  const maxBalance = balances?.chains
    ? Math.max(0, ...balances.chains.flatMap((c) => [Number(c.balances?.USDC || 0), Number(c.balances?.USDT || 0)]))
    : 0;
  const insufficient = balances != null && maxBalance < ticketPrice;

  const loadMyTickets = async () => {
    if (!user?.id) return;
    try {
      const list = await base44.entities.Ticket.filter(
        { userId: user.id }, "-createdAt", 1000
      );
      setMyTickets(list);
    } catch (_) {}
  };

  useEffect(() => {
    loadMyTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // One payment for the whole cart. `combos` is an array of normalized
  // "dd-dd-dd-dd-dd" strings built in the TicketBuilder modal. Selection is
  // temporary (client-side cart only); tickets are only created server-side
  // AFTER the on-chain payment is confirmed, so payment-confirmation order —
  // not selection time — decides which tickets enter the current draw.
  const handleCheckout = async (combos, agentCode, usePasses = false) => {
    if (!draw || !wallet) return { error: "Wallet or draw not ready." };
    setBuying(true);
    try {
      // Pass mode: redeem prepaid passes for free ticket plays (no on-chain
      // payment — the passes were already paid for in the Ticket Pass market).
      if (usePasses) {
        const r = await base44.functions.invoke("redeemPasses", { combos, agentCode });
        const ad = r.data;
        if (ad?.error === "insufficient_passes") {
          toast({ title: t("play.not_enough_passes_title"), description: t("play.not_enough_passes_desc", { balance: ad.balance, needed: ad.needed }), variant: "destructive" });
          return { error: `Not enough passes (have ${ad.balance}, need ${ad.needed}).` };
        }
        if (ad?.error) {
          toast({ title: t("play.pass_failed_title"), description: ad.error, variant: "destructive" });
          return { error: ad.error };
        }
        const parse = (tk) => ({ ...tk, numbers: parseNumbers(tk.numbers) });
        const cur = (ad.currentTickets || []).map(parse);
        const ovf = (ad.overflowTickets || []).map(parse);
        setLastTickets(cur);
        setOverflowTickets(ovf);
        setLastOverflowDraw(ad.overflowDrawNumber);
        refresh();
        loadMyTickets();
        refreshJackpot();
        const { draws: draws2, draw: next } = await resolveActiveDraw(config);
        setDraws(draws2);
        if (next) setDraw(next);
        const total = ad.currentCount + ad.overflowCount;
        toast({ title: t("play.pass_redeemed_title", { n: total }), description: t("play.pass_redeemed_desc", { n: ad.passesSpent, m: ad.govMinted }) });
        return { success: true };
      }

      const price = config.ticket_price.value;
      const total = +(price * combos.length).toFixed(2);

      // 1. Pay first — on-chain transfer to the treasury. This blocks until the
      // transfer is confirmed, so the subsequent allocation runs in
      // payment-confirmation order.
      const payRes = await base44.functions.invoke("payToTreasury", {
        amount: total, chain: payMethod.chain, token: payMethod.token,
        purpose: "LOTTERY_BUY", reference: "ticket", agentCode,
      });
      const pd = payRes.data;
      if (pd?.needsWallet) return { error: t("play.no_wallet_err") };
      if (pd?.error === "insufficient") {
        toast({ title: t("play.insufficient_title"), description: t("play.insufficient_desc", { balance: pd.balance, token: pd.token, chain: pd.chain, needed: pd.needed }), variant: "destructive" });
        return { error: `Insufficient balance: you have ${pd.balance} ${pd.token} on ${pd.chain}, need ${pd.needed}.` };
      }
      if (pd?.error === "insufficient_gas") {
        toast({ title: t("play.gas_title"), description: t("play.gas_desc", { native: pd.native }), variant: "destructive" });
        return { error: `Insufficient gas fee — deposit a small amount of ${pd.native} to your wallet.` };
      }
      if (pd?.error === "blacklisted") {
        toast({ title: t("play.blacklisted_title"), description: t("play.blacklisted_desc"), variant: "destructive" });
        return { error: "Your account or wallet is blacklisted." };
      }
      if (pd?.error) {
        toast({ title: t("play.payment_failed_title"), description: pd.error, variant: "destructive" });
        return { error: pd.error };
      }

      // 2. Allocate atomically server-side. The engine claims one slot per
      // ticket against the draw's fixed capacity; any tickets that don't fit
      // roll over to the next draw.
      const allocRes = await base44.functions.invoke("allocateTickets", {
        combos, agentCode, payRef: pd.txHash,
      });
      const ad = allocRes.data;
      if (ad?.error) {
        toast({ title: t("play.allocation_failed_title"), description: ad.error, variant: "destructive" });
        return { error: ad.error };
      }

      // 3. Show the user exactly which tickets entered the current draw and
      // which rolled over.
      const parse = (tk) => ({ ...tk, numbers: parseNumbers(tk.numbers) });
      const cur = (ad.currentTickets || []).map(parse);
      const ovf = (ad.overflowTickets || []).map(parse);
      setLastTickets(cur);
      setOverflowTickets(ovf);
      setLastOverflowDraw(ad.overflowDrawNumber);

      refresh();
      loadMyTickets();
      refreshJackpot();
      const { draws: draws2, draw: next } = await resolveActiveDraw(config);
      setDraws(draws2);
      if (next) setDraw(next);

      if (ovf.length > 0) {
        toast({
          title: t("play.confirmed_rolled_title", { cur: cur.length, ovf: ovf.length }),
          description: t("play.confirmed_rolled_desc", { cur: cur.length, cd: ad.currentDrawNumber, ovf: ovf.length, od: ad.overflowDrawNumber }),
        });
      } else {
        toast({ title: t("play.purchased_title", { n: cur.length }), description: t("play.purchased_desc", { gov: ad.govMinted }) });
      }
      return { success: true };
    } catch (e) {
      const m = String(e?.message || e).toLowerCase();
      if (/gas|intrinsic|-32000|nonce|underpriced|fee|insufficient funds/i.test(m)) {
        toast({ title: t("play.gas_title"), description: t("play.gas_desc2"), variant: "destructive" });
        return { error: "Insufficient gas fee — deposit native gas to your wallet." };
      }
      toast({ title: t("play.payment_failed_title"), description: String(e?.message || e), variant: "destructive" });
      return { error: e.message };
    } finally {
      setBuying(false);
    }
  };

  if (!config || !draw) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" /></div>;

  const price = config.ticket_price.value;
  const winningMap = {};
  draws.forEach((d) => { if (d.winningNumbers) winningMap[d.drawNumber] = new Set(parseNumbers(d.winningNumbers)); });

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ReferralCodeCard wallet={wallet} onLocked={refresh} />
      </div>
      <div className="rounded-2xl bg-navy-gradient p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-accent">{t("play.draw_status", { n: draw.drawNumber, status: draw.status })}</p>
            <h1 className="mt-1 text-3xl font-bold">{t("play.jackpot")} {jackpotTotal != null ? fmtUSD(jackpotTotal) : "—"}</h1>
            <p className="mt-1 text-sm text-white/70">{t("play.tickets_sold", { n: fmtNum(draw.ticketCount), m: fmtNum(draw.targetTickets) })}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/60">{t("play.charity_raised")}</p>
            <p className="text-xl font-bold text-accent">{fmtUSD(draw.charityContribution)}</p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-gold-gradient" style={{ width: `${Math.min(100, (draw.ticketCount / draw.targetTickets) * 100)}%` }} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold"><Heart className="h-5 w-5 text-accent" /> {t("play.play_charity")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("play.build_desc", { price: fmtUSD(price) })}
              {(wallet?.passBalance || 0) > 0
                ? <> {t("play.passes_have", { n: wallet.passBalance })} <Link to="/passes" className="font-semibold text-emerald-700 underline">{t("play.buy_more")} →</Link></>
                : ` ${t("play.no_passes")}`}
            </p>
          </div>
          <button onClick={() => { setPassMode((wallet?.passBalance || 0) > 0); setBuilderOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold-gradient px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg transition-transform hover:scale-[1.01] btn-ripple">
            <Ticket className="h-4 w-4" /> {t("play.build_btn")}
          </button>
        </div>
      </div>

      {lastTickets.length > 0 && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-emerald-500/50 bg-emerald-500/10 p-5 neon-green">
            <div className="flex items-center gap-2 text-emerald-600">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.7)]"><Check className="h-4 w-4" /></span>
              <p className="text-lg font-bold text-emerald-700">{t("play.confirmed", { n: lastTickets.length, d: draw.drawNumber })}</p>
              <p className="text-xs text-emerald-700/80">{t("play.referred_by", { code: activeReferrerCode })}</p>
            </div>
            <div className="mt-3 space-y-3">
              {lastTickets.map((tk) => (
                <div key={tk.id} className="rounded-xl border border-emerald-400/40 bg-white p-3">
                  <p className="text-xs font-medium text-emerald-700/80">{t("play.ticket_no", { n: tk.ticketNumber, d: tk.drawNumber })}</p>
                  <div className="mt-2 flex justify-center gap-2">
                    {tk.numbers.map((n, i) => <NumberBall key={i} n={n} size="sm" />)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {overflowTickets.length > 0 && (
            <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-5 neon-gold">
              <div className="flex items-center gap-2 text-amber-600">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-white shadow-[0_0_12px_rgba(245,158,11,0.7)]"><ArrowRight className="h-4 w-4" /></span>
                <p className="text-lg font-bold text-amber-700">{t("play.rolled_over", { n: overflowTickets.length, d: lastOverflowDraw })}</p>
              </div>
              <div className="mt-3 space-y-3">
                {overflowTickets.map((tk) => (
                  <div key={tk.id} className="rounded-xl border border-amber-400/40 bg-white p-3">
                    <p className="text-xs font-medium text-amber-700/80">{t("play.ticket_no", { n: tk.ticketNumber, d: tk.drawNumber })}</p>
                    <div className="mt-2 flex justify-center gap-2">
                      {tk.numbers.map((n, i) => <NumberBall key={i} n={n} size="sm" variant="navy" />)}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-center text-xs text-amber-700/80">{t("play.rollover_note")}</p>
            </div>
          )}

          <p className="text-center text-sm font-semibold text-emerald-700">{t("play.gov_minted", { n: config.gov_mint_ratio.value * (lastTickets.length + overflowTickets.length) })}</p>
        </div>
      )}

      {myTickets.length > 0 && (() => {
        const PREVIEW = 5;
        const visible = showAllTickets ? myTickets : myTickets.slice(0, PREVIEW);
        const collapsedCount = myTickets.length - PREVIEW;
        return (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold"><ListChecks className="h-5 w-5 text-primary" /> {t("play.my_tickets")}</h2>
              <Badge variant="secondary">{t("play.ticket_count", { n: myTickets.length })}</Badge>
            </div>
            <div className={cn("mt-4 space-y-3", showAllTickets && "max-h-96 overflow-y-auto pr-1")}>
              {visible.map((tk) => (
                <div key={tk.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center gap-1.5">
                    {parseNumbers(tk.numbers).map((n, i) => {
                      const wSet = winningMap[tk.drawNumber];
                      return (
                        <NumberBall key={i} n={n} size="sm" variant={wSet?.has(n) ? "green" : tk.status === "WINNING" ? "gold" : "navy"} />
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{t("play.ref", { code: tk.agentCode || HOUSE_CODE })}</span>
                    <span className="text-xs text-muted-foreground">{t("dash.draw_no", { draw: tk.drawNumber, ticket: tk.ticketNumber })}</span>
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                      tk.status === "WINNING" ? "bg-accent/20 text-accent" :
                      tk.status === "SETTLED" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")}>
                      {tk.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {myTickets.length > PREVIEW && (
              <button onClick={() => setShowAllTickets((s) => !s)}
                className="mt-3 w-full rounded-lg border border-border bg-background py-2 text-xs font-semibold text-primary hover:bg-muted">
                {showAllTickets ? t("play.show_less") : t("play.show_more", { n: collapsedCount })}
              </button>
            )}
          </div>
        );
      })()}

      <div className="rounded-2xl border border-border bg-muted/30 p-5 text-sm text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-foreground"><RotaryMark className="h-4 w-4 text-accent" /> {t("play.how_title")}</p>
        <p className="mt-2">{t("play.how_desc", { n: fmtNum(config.draw_target.value) })}</p>
      </div>

      <Link to="/contracts" className="group flex items-center justify-between gap-4 rounded-2xl border border-sky-500/40 bg-sky-500/5 p-5 transition-colors hover:bg-sky-500/10 btn-ripple">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-gradient text-accent neon-navy">
            <FileCode2 className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold text-foreground">{t("play.view_contracts")}</p>
            <p className="text-xs text-muted-foreground">{t("play.contracts_desc")}</p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-sky-600 transition-transform group-hover:translate-x-1" />
      </Link>

      <TicketBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        price={price}
        config={config}
        payMethod={payMethod}
        setPayMethod={setPayMethod}
        buying={buying}
        onCheckout={(combos, agentCode) => handleCheckout(combos, agentCode, passMode)}
        defaultAgentCode={activeReferrerCode}
        insufficient={insufficient}
        remainingTickets={Math.max(0, (draw.targetTickets || 0) - (draw.ticketCount || 0))}
        passMode={passMode}
        passBalance={wallet?.passBalance || 0}
      />
    </div>
  );
}