import React, { useMemo } from "react";
import { fmtUSD, fmtNum } from "@/lib/configRegistry";
import { BarChart3, TrendingUp, Trophy, Ticket } from "lucide-react";

// Visual analytics for the Sales Agent Portal: a monthly sales-volume bar
// chart (tickets attributed to this agent's code, by month) plus a summary of
// earned bonus amounts broken down by referral vs Winning Agent Bonus.
// Uses a lightweight CSS/SVG chart (no external chart dep) so it loads
// reliably. Derives everything from the already-loaded `tickets` and `bonuses`.
export default function AgentAnalytics({ tickets = [], bonuses = [] }) {
  // Monthly sales volume: count of attributed tickets per calendar month.
  const monthly = useMemo(() => {
    const map = new Map();
    const now = new Date();
    // Seed the last 6 months (including current) so the chart always shows a
    // continuous timeline even with sparse data.
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, { key, label: d.toLocaleString(undefined, { month: "short" }), tickets: 0, volume: 0 });
    }
    for (const t of tickets) {
      const ts = t.createdAt ? new Date(t.createdAt) : null;
      if (!ts || isNaN(ts)) continue;
      const key = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}`;
      const entry = map.get(key);
      if (entry) {
        entry.tickets += 1;
        entry.volume += t.price || 1;
      }
    }
    return Array.from(map.values());
  }, [tickets]);

  const referralBonuses = bonuses.filter((b) => b.type === "REFERRAL");
  const winningBonuses = bonuses.filter((b) => b.type === "WINNING_BONUS");
  const referralTotal = referralBonuses.reduce((s, b) => s + (b.amount || 0), 0);
  const winningTotal = winningBonuses.reduce((s, b) => s + (b.amount || 0), 0);
  const pending = bonuses.filter((b) => b.status === "ACCRUED").reduce((s, b) => s + (b.amount || 0), 0);
  const settled = bonuses.filter((b) => b.status === "PAID" || b.status === "SETTLED").reduce((s, b) => s + (b.amount || 0), 0);

  const summary = [
    { label: "Referral Earnings", value: fmtUSD(referralTotal), icon: TrendingUp, color: "text-primary" },
    { label: "Winning Agent Bonus", value: fmtUSD(winningTotal), icon: Trophy, color: "text-accent" },
    { label: "Accrued (pending)", value: fmtUSD(pending), icon: Ticket, color: "text-muted-foreground" },
    { label: "Settled / Paid", value: fmtUSD(settled), icon: BarChart3, color: "text-emerald-600" },
  ];

  const maxTickets = Math.max(1, ...monthly.map((m) => m.tickets));
  const totalTickets = tickets.length;
  const peakIdx = monthly.findIndex((m) => m.tickets === maxTickets && m.tickets > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Monthly sales volume chart */}
      <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Monthly Sales Volume</h2>
          </div>
          <span className="text-xs text-muted-foreground">Last 6 months · {fmtNum(totalTickets)} tickets total</span>
        </div>

        <div className="mt-6 flex h-64 items-end justify-between gap-2 sm:gap-4">
          {monthly.map((m, i) => {
            const h = Math.round((m.tickets / maxTickets) * 100);
            const isPeak = i === peakIdx;
            return (
              <div key={m.key} className="group flex flex-1 flex-col items-center gap-2">
                <div className="relative flex w-full flex-1 items-end justify-center">
                  <div className="pointer-events-none absolute -top-1 z-10 rounded-md bg-foreground px-1.5 py-1 text-[10px] font-semibold text-background opacity-0 shadow transition-opacity group-hover:opacity-100">
                    {fmtNum(m.tickets)} · {fmtUSD(m.volume)}
                  </div>
                  <div
                    className={`w-full max-w-[44px] rounded-t-md transition-all duration-300 ${isPeak ? "bg-gold-gradient" : "bg-navy-gradient"} ${m.tickets === 0 ? "min-h-[3px] opacity-30" : ""}`}
                    style={{ height: `${m.tickets === 0 ? 2 : Math.max(6, h)}%` }}
                  />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground">{m.label}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Bars show the number of tickets attributed to your referral code each month. The gold bar marks your best month.</p>
      </div>

      {/* Earned bonus summary */}
      <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Trophy className="h-5 w-5 text-accent" /> Earned Bonus Summary</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {summary.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><s.icon className={`h-3.5 w-3.5 ${s.color}`} /> {s.label}</div>
              <p className="mt-1.5 text-xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-navy-gradient p-4 text-white">
          <p className="text-xs uppercase tracking-wide text-white/70">Total earned</p>
          <p className="mt-1 text-2xl font-bold text-accent">{fmtUSD(referralTotal + winningTotal)}</p>
          <p className="mt-1 text-[11px] text-white/60">{fmtNum(bonuses.length)} bonus records · {fmtNum(referralBonuses.length)} referrals + {fmtNum(winningBonuses.length)} winning</p>
        </div>
      </div>
    </div>
  );
}