import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import NumberBall from "@/components/ui/NumberBall";
import { parseNumbers, fmtUSD } from "@/lib/configRegistry";
import { Trophy, X } from "lucide-react";

// Subscribes to Draw entity changes in real time. The instant a draw flips
// to COMPLETED, this shows a prominent centered on-screen popup with the
// winning numbers, winners per tier, and jackpot status — then auto-dismisses
// after 7 seconds. Renders nothing otherwise.
export default function DrawCompletePopup() {
  const [active, setActive] = useState(null);
  const [jackpotTotal, setJackpotTotal] = useState(null);
  const shownRef = useRef(new Set());
  const timerRef = useRef(null);

  useEffect(() => {
    // Seed with already-completed draws so we don't re-popup historical ones.
    (async () => {
      try {
        const done = await base44.entities.Draw.filter({ status: "COMPLETED" }, "-drawNumber", 20);
        done.forEach((d) => shownRef.current.add(d.drawNumber));
      } catch (_) {}
    })();

    const unsubscribe = base44.entities.Draw.subscribe((event) => {
      if (event?.type !== "update") return;
      const d = event.data;
      if (!d || d.status !== "COMPLETED") return;
      if (shownRef.current.has(d.drawNumber)) return;
      shownRef.current.add(d.drawNumber);
      setActive(d);
    });
    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setActive(null), 7000);
    // The jackpot shown is the real prize-wallet balance (same source as Home /
    // Dashboard), not the draw's accrual fields.
    base44.functions.invoke("getJackpotTotal", {}).then((r) => {
      setJackpotTotal(r?.total ?? null);
    }).catch(() => {});
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [active]);

  if (!active) return null;

  const numbers = parseNumbers(active.winningNumbers);
  const won = (active.winners5 || 0) > 0;

  return (
    <div className="fixed left-1/2 top-6 z-[120] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="overflow-hidden rounded-2xl border-2 border-accent bg-card shadow-2xl neon-gold">
        <div className="relative bg-navy-gradient px-5 py-4 text-white">
          <button
            onClick={() => setActive(null)}
            className="absolute right-3 top-3 rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-primary-foreground shadow-[0_0_14px_rgba(245,158,11,0.7)]">
              <Trophy className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-bold">Draw #{active.drawNumber} Completed!</p>
              <p className="text-[11px] text-white/70">Winning numbers are in</p>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="flex justify-center gap-2">
            {numbers.length > 0 ? numbers.map((n, i) => <NumberBall key={i} n={n} size="md" />) : (
              <p className="text-sm text-muted-foreground">Numbers pending…</p>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-accent/10 py-2">
              <p className="text-lg font-bold text-accent">{active.winners5 || 0}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">5/5 Winners</p>
            </div>
            <div className="rounded-xl bg-muted py-2">
              <p className="text-lg font-bold">{active.winners4 || 0}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">4/5 Winners</p>
            </div>
            <div className="rounded-xl bg-muted py-2">
              <p className="text-lg font-bold">{active.winners3 || 0}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">3/5 Winners</p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Jackpot</p>
              <p className="text-lg font-bold text-accent">{fmtUSD(jackpotTotal != null ? jackpotTotal : ((active.jackpotAmount || 0) + (active.prizePool || 0)))}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Prizes Paid</p>
              <p className="text-lg font-bold">{fmtUSD(active.totalPrizesPaid || 0)}</p>
            </div>
          </div>

          <p className={`mt-3 text-center text-xs font-semibold ${won ? "text-accent" : "text-muted-foreground"}`}>
            {won ? `Jackpot WON by ${active.winners5} ticket${active.winners5 === 1 ? "" : "s"}!` : "No 5/5 winner — jackpot rolls over"}
          </p>
        </div>
      </div>
    </div>
  );
}