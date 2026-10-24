import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/useWallet";
import { fmtUSD, fmtNum } from "@/lib/configRegistry";
import { useToast } from "@/components/ui/use-toast";
import { Coins, Plus, ArrowLeftRight, AlertCircle, ShoppingCart, Gavel, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { friendlyWalletError as friendlyOrderError } from "@/lib/walletErrors";
import { InteractiveInput } from "@/components/ui/interactive-input";
import { useLang } from "@/lib/LanguageContext";

export default function Marketplace() {
  const { user, wallet, refresh } = useWallet();
  const { t } = useLang();
  const [listings, setListings] = useState([]);
  const [tab, setTab] = useState("buy");
  const [sellAmount, setSellAmount] = useState("");
  const [sellPrice, setSellPrice] = useState("0.05");
  const [buyAmount, setBuyAmount] = useState("");
  const [buyPrice, setBuyPrice] = useState("0.05");
  const [busy, setBusy] = useState(false);
  const [insufficient, setInsufficient] = useState(null);
  // partial-fill quantities: per listing id -> user-entered amount
  const [fillQty, setFillQty] = useState({});
  const { toast } = useToast();

  const load = async () => {
    const list = await base44.entities.GovListing.filter({ status: "OPEN" });
    list.sort((a, b) => {
      const ra = (a.amount - (a.filledAmount || 0));
      const rb = (b.amount - (b.filledAmount || 0));
      if (ra <= 0) return 1;
      if (rb <= 0) return -1;
      return a.pricePerGov - b.pricePerGov;
    });
    setListings(list);
  };
  useEffect(() => { load(); }, []);

  const sellOrders = listings.filter((l) => (!l.side || l.side === "sell") && (l.amount - (l.filledAmount || 0)) > 0);
  const buyOrders = listings.filter((l) => l.side === "buy" && (l.amount - (l.filledAmount || 0)) > 0 && l.sellerId !== user?.id);
  const mySellOrders = listings.filter((l) => (!l.side || l.side === "sell") && l.sellerId === user?.id);
  const myBuyOrders = listings.filter((l) => l.side === "buy" && l.sellerId === user?.id);

  // Check the caller's wallet can cover a USDC/USDT cost; returns {chain,token} or null.
  const checkBalance = async (cost) => {
    const balRes = await base44.functions.invoke("getWalletBalances", {});
    const bd = balRes.data;
    if (bd?.needsWallet) return { needsWallet: true };
    const chains = bd?.chains || [];
    for (const c of chains) {
      if (Number(c.balances?.USDC) >= cost) return { chain: c.chain, token: "USDC" };
      if (Number(c.balances?.USDT) >= cost) return { chain: c.chain, token: "USDT" };
    }
    const best = chains.reduce((m, c) => Math.max(m, Number(c.balances?.USDC) || 0, Number(c.balances?.USDT) || 0), 0);
    return { need: cost, have: best };
  };

  const createSellListing = async () => {
    const amt = Number(sellAmount);
    const price = Number(sellPrice);
    if (!amt || amt <= 0 || !price || price <= 0) return toast({ title: t("market.enter_valid"), variant: "destructive" });
    if (amt > (wallet?.govBalance || 0)) return toast({ title: t("market.insufficient_gov"), variant: "destructive" });
    setBusy(true);
    try {
      const res = await base44.functions.invoke("createMarketOrder", { side: "sell", amount: amt, pricePerGov: price });
      const d = res.data;
      if (d?.error === "insufficient_gov") { toast({ title: t("market.insufficient_gov"), description: t("market.insufficient_gov_desc", { have: fmtNum(d.have) }), variant: "destructive" }); setBusy(false); return; }
      if (d?.error === "blacklisted") { toast({ title: t("market.account_restricted"), description: d.message || t("market.blacklisted"), variant: "destructive" }); setBusy(false); return; }
      if (d?.error) { toast({ title: t("market.list_failed"), description: d.error, variant: "destructive" }); setBusy(false); return; }
      setSellAmount("");
      load();
      refresh();
      toast({ title: t("market.sell_listed"), description: t("market.sell_listed_desc", { amt, price: fmtUSD(price) }) });
    } catch (e) {
      toast({ ...friendlyOrderError(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const createBuyOrder = async () => {
    const amt = Number(buyAmount);
    const price = Number(buyPrice);
    if (!amt || amt <= 0 || !price || price <= 0) return toast({ title: t("market.enter_valid"), variant: "destructive" });
    const total = +(amt * price).toFixed(2);
    setBusy(true);
    try {
      const res = await base44.functions.invoke("createMarketOrder", { side: "buy", amount: amt, pricePerGov: price });
      const d = res.data;
      if (d?.needsWallet) { setInsufficient({ need: total, reason: "no_wallet" }); setBusy(false); return; }
      if (d?.error === "insufficient") { setInsufficient({ need: d.needed, have: d.balance || 0 }); setBusy(false); return; }
      if (d?.error === "insufficient_gas") { toast({ title: t("market.gas_title"), description: t("market.gas_desc", { native: d.native }), variant: "destructive" }); setBusy(false); return; }
      if (d?.error === "blacklisted") { toast({ title: t("market.account_restricted"), description: d.message || t("market.blacklisted"), variant: "destructive" }); setBusy(false); return; }
      if (d?.error) { toast({ title: t("market.buy_failed"), description: d.error, variant: "destructive" }); setBusy(false); return; }
      setBuyAmount("");
      load();
      refresh();
      toast({ title: t("market.buy_placed"), description: t("market.buy_placed_desc", { amt, price: fmtUSD(price), total: fmtUSD(total) }) });
    } catch (e) {
      toast({ ...friendlyOrderError(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // Fill any order (partial). For sell orders the caller buys GOV; for buy orders
  // the caller sells GOV into the bid. The server handles payment + GOV transfer.
  const fillOrder = async (l, isSellOrder) => {
    const remaining = +(l.amount - (l.filledAmount || 0)).toFixed(6);
    const qty = Number(fillQty[l.id] ?? remaining);
    if (!qty || qty <= 0) return toast({ title: t("market.enter_amount"), variant: "destructive" });
    if (qty > remaining + 1e-6) return toast({ title: t("market.max_avail", { n: remaining }), variant: "destructive" });
    if (!isSellOrder) {
      // selling GOV into a buy order — need the GOV
      if (qty > (wallet?.govBalance || 0)) return toast({ title: t("market.insufficient_gov"), variant: "destructive" });
    }
    setBusy(true);
    try {
      const res = await base44.functions.invoke("fillMarketOrder", { listingId: l.id, fillAmount: qty });
      const d = res.data;
      if (d?.needsWallet) { setInsufficient({ need: +(qty * l.pricePerGov).toFixed(2), reason: "no_wallet" }); setBusy(false); return; }
      if (d?.error === "insufficient") { setInsufficient({ need: d.needed, have: d.balance || 0 }); setBusy(false); return; }
      if (d?.error === "insufficient_gas") { toast({ title: t("market.gas_title"), description: t("market.gas_desc", { native: d.native }), variant: "destructive" }); setBusy(false); return; }
      if (d?.error) { toast({ title: t("market.order_failed"), description: d.error, variant: "destructive" }); setBusy(false); return; }
      setFillQty({ ...fillQty, [l.id]: "" });
      refresh();
      load();
      const verb = isSellOrder ? t("market.bought") : t("market.sold");
      toast({ title: `${verb} ${qty} GOV`, description: t("market.filled_desc", { cost: fmtUSD(d.cost), token: d.token, chain: d.chain, filled: d.fullyFilled ? t("market.order_filled") : "" }) });
    } catch (e) {
      toast({ ...friendlyOrderError(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async (l) => {
    if (!confirm(t("market.cancel_confirm"))) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke("cancelMarketOrder", { listingId: l.id });
      const d = res.data;
      if (d?.error) { toast({ title: t("market.cancel_failed"), description: d.error, variant: "destructive" }); setBusy(false); return; }
      load();
      refresh();
      toast({ title: t("market.cancelled"), description: t("market.cancelled_desc") });
    } catch (e) {
      toast({ title: t("market.cancel_failed"), description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const OrderCard = ({ l, actionLabel, actionIcon: Icon, isSellOrder, accent }) => {
    const remaining = +(l.amount - (l.filledAmount || 0)).toFixed(6);
    const filled = +(l.filledAmount || 0).toFixed(6);
    const q = fillQty[l.id] ?? remaining;
    const cost = +(Number(q || 0) * l.pricePerGov).toFixed(2);
    const mine = l.sellerId === user?.id;
    return (
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-gradient text-xs font-bold text-white">
              {(l.sellerName || "?").charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold">{l.sellerName}</p>
              <p className="text-[11px] text-muted-foreground">{isSellOrder ? t("market.selling_gov") : t("market.bidding_gov")}{mine ? ` · ${t("market.you")}` : ""}</p>
            </div>
          </div>
          <Coins className={cn("h-5 w-5", accent ? "text-accent" : "text-primary")} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{t("market.total")}: <b className="text-foreground">{fmtNum(l.amount)} GOV</b></span>
          <span>{t("market.filled")}: <b className="text-foreground">{fmtNum(filled)} GOV</b></span>
          <span>{t("market.remaining")}: <b className="text-foreground">{fmtNum(remaining)} GOV</b></span>
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-2xl font-bold">{fmtUSD(l.pricePerGov)}<span className="text-sm font-normal text-muted-foreground"> {t("market.per_gov")}</span></p>
          </div>
          <p className="text-lg font-bold text-accent">{fmtUSD(l.pricePerGov * remaining)}</p>
        </div>
        <div className="progress mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-gold-gradient" style={{ width: `${l.amount ? (filled / l.amount) * 100 : 0}%` }} />
        </div>
        {mine ? (
          <button onClick={() => cancelOrder(l)} disabled={busy} className="mt-4 w-full rounded-lg border border-border py-2.5 text-sm font-semibold hover:bg-muted btn-scratch disabled:opacity-50">
            {t("market.cancel_order")}
          </button>
        ) : (
          <div className="mt-4 flex gap-2">
            <InteractiveInput
              type="number"
              value={q}
              min="0"
              max={remaining}
              step="any"
              onChange={(e) => setFillQty({ ...fillQty, [l.id]: e.target.value })}
              placeholder={String(remaining)}
              className="w-full"
            />
            <button
              onClick={() => fillOrder(l, isSellOrder)}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 btn-scratch disabled:opacity-50"
            >
              <Icon className="h-4 w-4" /> {actionLabel}
            </button>
          </div>
        )}
        {q > 0 && !mine && (
          <p className="mt-2 text-right text-[11px] text-muted-foreground">{fmtNum(Number(q))} GOV · {fmtUSD(cost)}</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("market.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("market.subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("market.your_votes")}</p>
          <p className="mt-1 text-2xl font-bold text-accent">{fmtNum(wallet?.govBalance || 0)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("market.open_sell")}</p>
          <p className="mt-1 text-2xl font-bold">{fmtNum(sellOrders.reduce((s, l) => s + (l.amount - (l.filledAmount || 0)), 0))}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("market.open_buy")}</p>
          <p className="mt-1 text-2xl font-bold">{fmtNum(buyOrders.reduce((s, l) => s + (l.amount - (l.filledAmount || 0)), 0))}</p>
        </div>
      </div>

      <div className="inline-flex gap-1.5 rounded-xl border border-border bg-card p-1.5 shadow-sm">
        {[
          ["buy", t("market.buy_gov"), ShoppingCart, "bg-emerald-500 text-white shadow-sm"],
          ["sell", t("market.sell_gov"), Plus, "bg-accent text-primary-foreground shadow-sm"],
          ["buyOrders", t("market.buy_orders"), Gavel, "bg-primary text-primary-foreground shadow-sm"],
        ].map(([k, label, Ic, activeCls]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all duration-150",
            tab === k ? cn(activeCls, "scale-[1.02]") : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <Ic className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "buy" && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">{t("market.sell_orders_title")}</h2>
          {sellOrders.length === 0 ? (
            <div className="rounded-xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">{t("market.no_sell")}</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sellOrders.map((l) => <OrderCard key={l.id} l={l} actionLabel={t("market.buy_btn")} actionIcon={ShoppingCart} isSellOrder accent />)}
            </div>
          )}
        </div>
      )}

      {tab === "sell" && (
        <div className="space-y-6">
          <div className="max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-bold">{t("market.create_sell")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("market.sell_avail", { n: fmtNum(wallet?.govBalance || 0) })}{wallet?.govEscrowed ? t("market.locked_orders", { n: fmtNum(wallet.govEscrowed) }) : ""}. {t("market.sell_reserve_note")}</p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("market.amount_gov")}</label>
                <InteractiveInput type="number" step="any" value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} placeholder="100" className="mt-1.5 w-full" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("market.price_gov")}</label>
                <InteractiveInput type="number" step="0.001" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className="mt-1.5 w-full" />
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">{t("market.total_filled")}</span><span className="font-bold">{fmtUSD((Number(sellAmount) || 0) * (Number(sellPrice) || 0))}</span></div>
              </div>
              <button onClick={createSellListing} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold-gradient py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 btn-scratch disabled:opacity-50">
                <Plus className="h-4 w-4" /> {t("market.list_for_sale")}
              </button>
            </div>
          </div>
          {mySellOrders.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{t("market.your_sell")}</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {mySellOrders.map((l) => <OrderCard key={l.id} l={l} actionLabel={t("market.buy_btn")} actionIcon={ShoppingCart} isSellOrder accent />)}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "buyOrders" && (
        <div className="space-y-6">
          <div className="max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-bold">{t("market.place_buy")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("market.buy_desc")}</p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("market.amount_wanted")}</label>
                <InteractiveInput type="number" step="any" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} placeholder="100" className="mt-1.5 w-full" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("market.price_gov")}</label>
                <InteractiveInput type="number" step="0.001" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} className="mt-1.5 w-full" />
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">{t("market.total_bid")}</span><span className="font-bold">{fmtUSD((Number(buyAmount) || 0) * (Number(buyPrice) || 0))}</span></div>
              </div>
              <button onClick={createBuyOrder} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 btn-scratch disabled:opacity-50">
                <Gavel className="h-4 w-4" /> {t("market.place_buy_btn")}
              </button>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{t("market.open_buy_title")}</h3>
            {buyOrders.length === 0 ? (
              <div className="rounded-xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">{t("market.no_buy")}</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {buyOrders.map((l) => <OrderCard key={l.id} l={l} actionLabel={t("market.sell_btn")} actionIcon={ArrowLeftRight} isSellOrder={false} />)}
              </div>
            )}
          </div>

          {myBuyOrders.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{t("market.your_buy")}</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {myBuyOrders.map((l) => <OrderCard key={l.id} l={l} actionLabel={t("market.sell_btn")} actionIcon={ArrowLeftRight} isSellOrder={false} />)}
              </div>
            </div>
          )}
        </div>
      )}


      {insufficient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-rose-500/40 bg-card p-6 text-center shadow-2xl neon-red">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/15 text-rose-500">
              {insufficient.reason === "no_wallet" ? <AlertCircle className="h-7 w-7" /> : <X className="h-7 w-7" />}
            </div>
            <h3 className="mt-4 text-lg font-bold text-rose-600">{t("market.insufficient_title")}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {insufficient.reason === "no_wallet"
                ? t("market.no_wallet_trade")
                : t("market.insufficient_need", { need: fmtUSD(insufficient.need), have: fmtUSD(insufficient.have || 0) })}
            </p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setInsufficient(null)} className="flex-1 rounded-lg border border-border bg-background py-2.5 text-sm font-semibold hover:bg-muted btn-scratch">{t("market.close")}</button>
              <a href="/wallet" className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 btn-scratch">{t("market.add_funds")}</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}