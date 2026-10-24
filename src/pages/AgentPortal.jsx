import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/useWallet";
import { fmtUSD, fmtNum, loadConfig } from "@/lib/configRegistry";
import { useToast } from "@/components/ui/use-toast";
import StatCard from "@/components/ui/StatCard";
import AgentAnalytics from "@/components/AgentAnalytics";
import AgentSellTickets from "@/components/AgentSellTickets";
import RotaryMark from "@/components/ui/RotaryMark";
import {
  Ticket, DollarSign, Trophy, Copy, Link2, UserCog,
  TrendingUp,
} from "lucide-react";
import { useLang } from "@/lib/LanguageContext";

export default function AgentPortal() {
  const { user, wallet, refresh } = useWallet();
  const { t } = useLang();
  const [bonuses, setBonuses] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [config, setConfig] = useState(null);
  const [bonusVisible, setBonusVisible] = useState(4);
  const [ticketVisible, setTicketVisible] = useState(4);
  const { toast } = useToast();

  const load = async () => {
    const cfg = await loadConfig();
    setConfig(cfg);
    if (!wallet) return;
    const code = wallet.agentCode;
    if (code) {
      const b = await base44.entities.AgentBonusRecord.filter({ agentCode: code });
      setBonuses(b.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt)));
      const t = await base44.entities.Ticket.filter({ agentCode: code });
      setTickets(t);
    }
  };
  useEffect(() => { load(); }, [wallet]);

  const registerAgent = async () => {
    const code = "CHARITY-" + (user?.full_name || user?.email || "AGENT").slice(0, 3).toUpperCase() + "-" + Math.floor(Math.random() * 90 + 10);
    await base44.entities.Wallet.update(wallet.id, { isAgent: true, agentCode: code, agentTier: "standard" });
    refresh();
    toast({ title: t("agent.registered_title"), description: t("agent.registered_desc", { code }) });
  };

  if (!wallet) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" /></div>;

  if (!wallet.isAgent) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl bg-navy-gradient p-6 text-white shadow-lg">
          <div className="flex items-center gap-3">
            <RotaryMark className="h-8 w-8 text-accent" />
            <div>
              <p className="text-xs uppercase tracking-widest text-accent">{t("agent.program")}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t("agent.portal")}</h1>
            </div>
          </div>
        </div>
        <div className="max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><UserCog className="h-7 w-7" /></div>
          <h2 className="mt-4 text-lg font-bold">{t("agent.become_title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("agent.become_desc", { referral: config?.agent_referral_rate?.value ?? 2, bonus: config?.winning_agent_bonus?.value ?? 1 })}</p>
          <button onClick={registerAgent} className="mt-5 rounded-xl bg-gold-gradient px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg hover:opacity-90 btn-dna">{t("agent.register")}</button>
        </div>
      </div>
    );
  }

  const referralTotal = bonuses.filter((b) => b.type === "REFERRAL").reduce((s, b) => s + b.amount, 0);
  const bonusTotal = bonuses.filter((b) => b.type === "WINNING_BONUS").reduce((s, b) => s + b.amount, 0);
  const ticketPrice = config?.ticket_price?.value ?? 0.1;
  const soldCount = wallet.ticketsSold || tickets.length;
  const generatedValue = soldCount * ticketPrice;
  const referralLink = `https://charipot.org/play?ref=${wallet.agentCode}`;

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast({ title: t("agent.copied") });
  };

  return (
    <div className="space-y-6">
      {/* Branded hero header */}
      <div className="overflow-hidden rounded-2xl bg-navy-gradient text-white shadow-lg">
        <div className="relative px-6 py-6 sm:px-8">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
                <RotaryMark className="h-9 w-9 text-accent" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-accent">{t("agent.program")}</p>
                <h1 className="mt-0.5 text-2xl font-bold tracking-tight sm:text-3xl">{t("agent.portal")}</h1>
                <p className="mt-1 max-w-xl text-sm text-white/70">{t("agent.portal_desc")}</p>
              </div>
            </div>
            <div className="min-w-[240px] flex-1 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
              <p className="text-[11px] uppercase tracking-widest text-accent">{t("agent.referral_code")}</p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-tight">{wallet.agentCode}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => copy(wallet.agentCode)} className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold backdrop-blur transition-colors hover:bg-white/25 btn-dna"><Copy className="h-3.5 w-3.5" /> {t("agent.copy_code")}</button>
                <button onClick={() => copy(referralLink)} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 btn-dna"><Link2 className="h-3.5 w-3.5" /> {t("agent.copy_link")}</button>
              </div>
              <p className="mt-2 break-all text-[10px] text-white/50">{referralLink}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sell on behalf */}
      <AgentSellTickets />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Ticket} label={t("agent.tickets_sold")} value={fmtNum(wallet.ticketsSold || tickets.length)} />
        <StatCard icon={DollarSign} label={t("agent.generated")} value={fmtUSD(generatedValue)} sub={`${fmtNum(soldCount)} × ${fmtUSD(ticketPrice)}`} />
        <StatCard icon={TrendingUp} label={t("agent.referral_earnings")} value={fmtUSD(referralTotal)} />
        <StatCard icon={Trophy} label={t("agent.winning_bonus")} value={fmtUSD(bonusTotal)} accent />
      </div>

      {/* Analytics */}
      <AgentAnalytics tickets={tickets} bonuses={bonuses} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bonus history */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-bold">{t("agent.earnings_history")}</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("agent.earnings_desc")}</p>
          <div className="mt-4 space-y-2">
            {bonuses.length === 0 ? <p className="text-sm text-muted-foreground">{t("agent.no_earnings")}</p> : bonuses.slice(0, bonusVisible).map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-xl border border-border p-3 transition-colors hover:bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${b.type === "WINNING_BONUS" ? "bg-accent/15 text-accent" : "bg-primary/10 text-primary"}`}>
                    {b.type === "WINNING_BONUS" ? <Trophy className="h-4 w-4" /> : <Ticket className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{b.type === "WINNING_BONUS" ? t("agent.winning_bonus_label") : t("agent.referral_label")}</p>
                    <p className="text-[11px] text-muted-foreground">Ticket #{b.ticketNumber} · Draw #{b.drawNumber}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-accent">+{fmtUSD(b.amount)}</p>
                  <span className="text-[11px] text-muted-foreground">{b.status}</span>
                </div>
              </div>
            ))}
          </div>
          {bonuses.length > bonusVisible && (
            <button onClick={() => setBonusVisible((v) => v + 4)} className="mt-3 w-full rounded-xl border border-border bg-muted/30 py-2 text-sm font-semibold text-primary hover:bg-muted">{t("agent.show_more", { n: bonuses.length - bonusVisible })}</button>
          )}
        </div>

        {/* Recent attributed tickets */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Recent Attributed Tickets</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">The latest tickets purchased through your referral code.</p>
          <div className="mt-4 space-y-2">
            {tickets.length === 0 ? <p className="text-sm text-muted-foreground">{t("agent.no_tickets_attr")}</p> : tickets.slice(0, ticketVisible).map((tk) => (
              <div key={tk.id} className="flex items-center justify-between rounded-xl border border-border p-3 transition-colors hover:bg-muted/30">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">#{tk.ticketNumber} · {tk.numbers}</p>
                  <p className="text-[11px] text-muted-foreground">Draw #{tk.drawNumber} · {tk.status}</p>
                </div>
                <p className="text-sm font-bold text-accent">+{fmtUSD(tk.agentReferral)}</p>
              </div>
            ))}
          </div>
          {tickets.length > ticketVisible && (
            <button onClick={() => setTicketVisible((v) => v + 4)} className="mt-3 w-full rounded-xl border border-border bg-muted/30 py-2 text-sm font-semibold text-primary hover:bg-muted">{t("agent.show_more", { n: tickets.length - ticketVisible })}</button>
          )}
        </div>
      </div>

    </div>
  );
}