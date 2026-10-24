import React, { useState } from "react";
import NumberBall from "@/components/ui/NumberBall";
import { quickPick, normalizeNumbers, fmtUSD } from "@/lib/configRegistry";
import { Shuffle, Plus, Trash2, Pencil, X, Ticket, Heart, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const POOL = Array.from({ length: 39 }, (_, i) => i + 1);
const MAX_TICKETS = 10;

// Play for Charity ticket builder modal. Used by both the regular Play page and
// the agent on-behalf flow. In `passMode`, each ticket costs 1 pass instead of
// crypto: the footer shows passes to redeem (capped by passBalance) and the
// parent's onCheckout routes to redeemPasses instead of payToTreasury.
export default function TicketBuilder({ open, onOpenChange, price, config, payMethod, setPayMethod, buying, onCheckout, defaultAgentCode = "", insufficient = false, remainingTickets = null, passMode = false, passBalance = 0 }) {
  const [current, setCurrent] = useState([]);
  const [cart, setCart] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [agentCode, setAgentCode] = useState(defaultAgentCode || "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const reset = () => { setCurrent([]); setCart([]); setEditingId(null); setAgentCode(defaultAgentCode || ""); setError(""); setSuccess(false); };
  const close = () => { reset(); onOpenChange(false); };

  const govPerTicket = config?.gov_mint_ratio?.value ?? 1;
  // Cap the cart to remaining draw slots AND (in pass mode) to the pass balance.
  const drawCap = remainingTickets != null ? Math.min(MAX_TICKETS, Math.max(0, remainingTickets)) : MAX_TICKETS;
  const passCap = passMode ? Math.max(0, passBalance) : MAX_TICKETS;
  const cap = Math.min(drawCap, passCap);
  const cartFull = (cart.length >= cap || cap === 0) && !editingId;

  const toggleNumber = (n) => {
    setError("");
    setCurrent((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : cur.length < 5 ? [...cur, n] : cur));
  };
  const doQuickPick = () => { setError(""); setCurrent(quickPick()); };
  const clearCurrent = () => { setCurrent([]); setEditingId(null); setError(""); };

  const addTicket = () => {
    if (current.length !== 5) { setError("Pick exactly 5 numbers first."); return; }
    const sorted = [...current].sort((a, b) => a - b);
    if (editingId) {
      setCart((cs) => cs.map((t) => (t.id === editingId ? { ...t, numbers: sorted } : t)));
      setEditingId(null);
    } else {
      if (cart.length >= cap || cap === 0) { setError(cap === 0 ? (passMode ? "No passes available." : "This draw is sold out.") : `Only ${cap} ticket${cap === 1 ? "" : "s"} left.`); return; }
      setCart((cs) => [...cs, { id: Date.now() + Math.random(), numbers: sorted }]);
    }
    setCurrent([]);
  };

  const editTicket = (t) => { setEditingId(t.id); setCurrent([...t.numbers]); setError(""); };
  const removeTicket = (id) => {
    setCart((cs) => cs.filter((t) => t.id !== id));
    if (editingId === id) { setEditingId(null); setCurrent([]); }
  };
  const clearCart = () => { setCart([]); setEditingId(null); setCurrent([]); setError(""); };

  const pay = async () => {
    if (cart.length === 0) { setError("Add at least one ticket first."); return; }
    setError("");
    const combos = cart.map((t) => normalizeNumbers(t.numbers));
    const res = await onCheckout(combos, agentCode);
    if (res?.error) { setError(res.error); return; }
    setSuccess(true);
    setTimeout(() => { reset(); onOpenChange(false); }, 1400);
  };

  if (!open) return null;

  const summary = passMode
    ? `${cart.length} ticket${cart.length === 1 ? "" : "s"} · 1 pass each · +${govPerTicket * cart.length} GOV`
    : `${cart.length} ticket${cart.length === 1 ? "" : "s"} × ${fmtUSD(price)} · +${govPerTicket * cart.length} GOV`;
  const totalLabel = passMode ? `${cart.length} pass${cart.length === 1 ? "" : "es"}` : fmtUSD(+(price * cart.length).toFixed(2));
  const payLabel = passMode ? `Redeem ${cart.length} Pass${cart.length === 1 ? "" : "es"}` : `Pay Total · ${fmtUSD(+(price * cart.length).toFixed(2))}`;
  const payDisabled = buying || cart.length === 0 || success || (!passMode && insufficient);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:p-6" onClick={close}>
      <div className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative bg-navy-gradient p-3 text-white">
          <button onClick={close} className="absolute right-3 top-3 rounded-md p-1 text-white/80 hover:bg-white/10 hover:text-white"><X className="h-3.5 w-3.5" /></button>
          <h2 className="flex items-center gap-1.5 text-base font-bold"><Heart className="h-4 w-4 text-accent" /> Play for Charity</h2>
          <p className="mt-0.5 text-[11px] text-white/70">
            {passMode
              ? `Build your tickets and redeem with passes. 1 pass per ticket · 50% funds charity projects. You have ${passBalance} pass${passBalance === 1 ? "" : "es"}.`
              : `Build your tickets, pick your numbers, and pay once. ${fmtUSD(price)} per ticket · 50% funds charity projects.`}
          </p>
        </div>

        <div className="space-y-3 p-3">
          {/* Current ticket builder */}
          <div className="rounded-xl border border-border bg-card p-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold">{editingId ? "Edit ticket" : `Ticket ${cart.length + 1}`} — pick 5</h3>
              <div className="flex gap-1.5">
                <button onClick={doQuickPick} disabled={cartFull} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                  <Shuffle className="h-3 w-3" /> Quick Pick
                </button>
                <button onClick={clearCurrent} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted">
                  <X className="h-3 w-3" /> Clear
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-center gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <NumberBall key={i} n={current[i]} size="sm" variant={current[i] ? "gold" : "navy"} />
              ))}
            </div>

            <div className="mt-2 grid grid-cols-10 gap-1">
              {POOL.map((n) => {
                const active = current.includes(n);
                return (
                  <button key={n} onClick={() => toggleNumber(n)} disabled={cartFull || (!active && current.length >= 5)}
                    className={cn("flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition-all",
                      active ? "bg-gold-gradient text-primary-foreground shadow-md scale-110" : "border border-border bg-background hover:border-primary hover:bg-muted disabled:opacity-40")}>
                    {n}
                  </button>
                );
              })}
            </div>

            {cartFull ? (
              <div className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-amber-400/60 bg-amber-50 py-1.5 text-[11px] font-semibold text-amber-700">
                <Ticket className="h-3.5 w-3.5" /> {cap === 0 ? (passMode ? "No passes available." : "Draw sold out.") : `Cart full — ${cap} left.`}
              </div>
            ) : (
              <button onClick={addTicket} disabled={current.length !== 5}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-1.5 text-xs font-semibold text-primary-foreground shadow-md hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                <Plus className="h-3.5 w-3.5" /> {editingId ? "Update Ticket" : "Submit"}
              </button>
            )}
            {error && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-red-500/60 bg-red-500 px-2.5 py-1.5 text-white neon-red">
                <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-white/25 font-bold text-[10px]">!</span>
                <p className="text-[11px] font-semibold leading-snug">{error}</p>
              </div>
            )}
          </div>

          {/* Cart */}
          {cart.length > 0 ? (
            <div className="rounded-xl border border-border bg-card p-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold">Your tickets ({cart.length})</h3>
                <button onClick={clearCart} className="text-[11px] text-muted-foreground hover:text-destructive">Clear all</button>
              </div>
              <div className="mt-1.5 space-y-1.5">
                {cart.map((t, idx) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-muted-foreground">#{idx + 1}</span>
                      <div className="flex gap-0.5">
                        {t.numbers.map((n, i) => <NumberBall key={i} n={n} size="sm" />)}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => editTicket(t)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-primary"><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => removeTicket(t.id)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-center text-[11px] text-muted-foreground">
              No tickets yet. Pick 5 numbers above and tap <b>Submit</b>.
            </div>
          )}
        </div>

        {/* Footer / Pay Total */}
        <div className="border-t border-border bg-card p-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{summary}</span>
            <span className="text-base font-bold">{totalLabel}</span>
          </div>
          <button onClick={pay} disabled={payDisabled}
            className={cn("flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold text-primary-foreground shadow-md transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100",
              passMode ? "bg-emerald-600" : "bg-gold-gradient")}>
            {buying ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> : <Ticket className="h-3.5 w-3.5" />}
            {buying ? "Processing…" : payLabel}
          </button>
        </div>

        {success && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-emerald-500/95 p-6 text-center neon-green">
            <div>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-[0_0_24px_rgba(255,255,255,0.8)]">
                <Check className="h-8 w-8 text-emerald-600" />
              </div>
              <p className="mt-4 text-xl font-bold text-white">{passMode ? "Passes Redeemed!" : "Purchase Successful!"}</p>
              <p className="mt-1 text-sm text-white/90">Your tickets are confirmed and GOV is on its way.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}