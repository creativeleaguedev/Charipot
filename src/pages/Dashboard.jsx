import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/useWallet";
import { useJackpotTotal } from "@/lib/useJackpotTotal";
import { fmtUSD, fmtNum, parseNumbers } from "@/lib/configRegistry";
import { useLang } from "@/lib/LanguageContext";
import NumberBall from "@/components/ui/NumberBall";
import StatCard from "@/components/ui/StatCard";
import {
  Coins, Ticket, Flame, Vote, Heart, Trophy, Award,
  ArrowRight, Gavel, Wallet as WalletIcon,
} from "lucide-react";

const ACTION_TILES = [
  { to: "/play", icon: Ticket, titleKey: "dash.action.play", descKey: "dash.action.play_desc", tone: "bg-primary/10 text-primary" },
  { to: "/funding-rounds", icon: Vote, titleKey: "dash.action.vote", descKey: "dash.action.vote_desc", tone: "bg-accent/15 text-accent" },
  { to: "/marketplace", icon: Gavel, titleKey: "dash.action.gov_market", descKey: "dash.action.gov_market_desc", tone: "bg-emerald-500/10 text-emerald-600" },
  { to: "/wallet", icon: WalletIcon, titleKey: "dash.action.wallet", descKey: "dash.action.wallet_desc", tone: "bg-sky-500/10 text-sky-600" },
];

export default function Dashboard() {
  const { user, wallet, loading } = useWallet();
  const { jackpotTotal } = useJackpotTotal();
  const { t } = useLang();
  const [tickets, setTickets] = useState([]);
  const [votes, setVotes] = useState([]);
  const [draws, setDraws] = useState([]);
  const [ticketLimit, setTicketLimit] = useState(4);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const allTickets = await base44.entities.Ticket.filter({ userId: user.id });
      setTickets(allTickets.sort((a, b) => b.drawNumber - a.drawNumber));
      setVotes(await base44.entities.Vote.filter({ userId: user.id }));
      const d = await base44.entities.Draw.list("-drawNumber", 1000);
      setDraws(d.sort((a, b) => b.drawNumber - a.drawNumber));
    })();
  }, [user]);

  const activeTickets = useMemo(() => tickets.filter((tk) => tk.status === "ACTIVE"), [tickets]);
  const projectsSupported = useMemo(() => new Set(votes.map((v) => v.projectId)).size, [votes]);
  const govVoted = useMemo(() => votes.reduce((s, v) => s + (v.govAmount || 0), 0), [votes]);

  // Map each completed draw to its winning-number set so a ticket's matched
  // numbers can be highlighted green (even a single match lights up).
  const winningMap = useMemo(() => {
    const m = {};
    draws.forEach((d) => { if (d.winningNumbers) m[d.drawNumber] = new Set(parseNumbers(d.winningNumbers)); });
    return m;
  }, [draws]);

  const lastDraw = useMemo(() => draws.find((d) => d.winningNumbers), [draws]);
  const visibleTickets = tickets.slice(0, ticketLimit);
  const remainingTickets = tickets.length - visibleTickets.length;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="overflow-hidden rounded-2xl bg-navy-gradient p-6 text-white shadow-sm sm:p-8">
        <p className="text-xs font-medium uppercase tracking-wide text-white/60">{t("dash.welcome")}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{user?.full_name || user?.email}</h1>
        <p className="mt-1 text-sm text-white/70">{t("dash.subtitle")}</p>
      </div>

      {/* Core balances */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Trophy} label={t("dash.jackpot")} value={jackpotTotal != null ? fmtUSD(jackpotTotal) : "—"} sub={t("dash.jackpot_sub")} accent />
        <StatCard icon={Coins} label={t("dash.gov_balance")} value={fmtNum(wallet?.govBalance || 0)} sub={t("dash.gov_sub")} />
        <StatCard icon={Ticket} label={t("dash.active_tickets")} value={fmtNum(activeTickets.length)} sub={t("dash.total_purchased", { n: fmtNum(tickets.length) })} />
        <StatCard icon={Award} label={t("dash.prize_balance")} value={fmtUSD(wallet?.prizeBalance || 0)} sub={t("dash.prize_sub")} />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-lg font-bold">{t("dash.quick_actions")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ACTION_TILES.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md btn-grass"
            >
              <div className="flex items-center gap-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${a.tone}`}>
                  <a.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{t(a.titleKey)}</p>
                  <p className="truncate text-xs text-muted-foreground">{t(a.descKey)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Latest tickets + side cards */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Latest tickets — 4 shown, rest behind a "show more" toggle */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{t("dash.latest_tickets")}</h2>
            <Link to="/play" className="text-sm font-medium text-primary hover:underline">{t("dash.buy_more")} →</Link>
          </div>
          {tickets.length === 0 ? (
            <div className="mt-6 rounded-xl bg-muted/40 p-8 text-center">
              <Ticket className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">{t("dash.no_tickets")}</p>
              <Link to="/play" className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground btn-grass">{t("dash.play_now")}</Link>
            </div>
          ) : (
            <div className="mt-4 max-h-[440px] space-y-3 overflow-y-auto pr-1">
              {visibleTickets.map((tk) => {
                const wSet = winningMap[tk.drawNumber];
                return (
                  <div key={tk.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1.5">
                        {parseNumbers(tk.numbers).map((n, i) => (
                          <NumberBall key={i} n={n} size="sm" variant={wSet?.has(n) ? "green" : "gold"} />
                        ))}
                      </div>
                      <div>
                        <p className="text-xs font-medium">{t("dash.draw_no", { draw: tk.drawNumber, ticket: tk.ticketNumber })}</p>
                        <p className="text-[11px] text-muted-foreground">{tk.agentCode ? t("dash.agent", { code: tk.agentCode }) : t("dash.direct")}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tk.status === "ACTIVE" ? "bg-primary/10 text-primary" : tk.status === "WINNING" || tk.status === "SETTLED" ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"}`}>
                        {tk.status}
                      </span>
                      {tk.prizeTier !== "none" && <p className="mt-1 text-xs font-bold text-accent">{tk.prizeTier} · {fmtUSD(tk.prizeAmount)}</p>}
                    </div>
                  </div>
                );
              })}
              {tickets.length > 4 && (
                <button
                  onClick={() => setTicketLimit((n) => (n >= tickets.length ? 4 : n + 4))}
                  className="mt-1 w-full rounded-lg border border-border py-2 text-sm font-semibold text-primary hover:bg-muted btn-grass"
                >
                  {remainingTickets > 0 ? t("dash.show_more", { n: remainingTickets }) : t("dash.show_less")}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Side column */}
        <div className="space-y-6">
          {/* Impact summary */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{t("dash.my_impact")}</h2>
              <Link to="/governance" className="text-sm font-medium text-primary hover:underline">{t("dash.open")} →</Link>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-muted/50 p-3">
                <Flame className="mx-auto h-5 w-5 text-accent" />
                <p className="mt-1 text-base font-bold">{fmtNum(wallet?.govBurned || 0)}</p>
                <p className="text-[10px] text-muted-foreground">{t("dash.gov_burned")}</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3">
                <Heart className="mx-auto h-5 w-5 text-primary" />
                <p className="mt-1 text-base font-bold">{projectsSupported}</p>
                <p className="text-[10px] text-muted-foreground">{t("dash.projects")}</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3">
                <Vote className="mx-auto h-5 w-5 text-emerald-600" />
                <p className="mt-1 text-base font-bold">{fmtNum(govVoted)}</p>
                <p className="text-[10px] text-muted-foreground">{t("dash.gov_voted")}</p>
              </div>
            </div>
          </div>

          {/* Latest draw result */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{t("dash.latest_result")}</h2>
              <Link to="/play" className="text-sm font-medium text-primary hover:underline">{t("dash.all_draws")} →</Link>
            </div>
            {lastDraw ? (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground">{t("dash.draw_no", { draw: lastDraw.drawNumber, ticket: "" }).replace(" · #", "")}</p>
                <div className="mt-2 flex gap-1.5">
                  {parseNumbers(lastDraw.winningNumbers).map((n, i) => (
                    <NumberBall key={i} n={n} size="sm" variant="navy" />
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("dash.jackpot_label")}</span>
                  <span className="font-semibold">{fmtUSD((lastDraw.jackpotAmount || 0) + (lastDraw.prizePool || 0))}</span>
                </div>
                <span className="mt-2 inline-block rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium">{lastDraw.status}</span>
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-muted/40 p-6 text-center">
                <Trophy className="mx-auto h-7 w-7 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">{t("dash.no_completed")}</p>
                <Link to="/play" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  {t("dash.play_current")} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}