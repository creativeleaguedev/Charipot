import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { loadConfig, fmtUSD, fmtNum, parseNumbers } from "@/lib/configRegistry";
import { useJackpotTotal } from "@/lib/useJackpotTotal";
import { useLang } from "@/lib/LanguageContext";
import NumberBall from "@/components/ui/NumberBall";
import StatCard from "@/components/ui/StatCard";
import PublicWalletsCard from "@/components/PublicWalletsCard";
import AgentApplyCard from "@/components/AgentApplyCard";
import { Ticket, Heart, Vote, Trophy, TrendingUp, Users, Building2, ShieldCheck, ArrowRight } from "lucide-react";
import RotaryMark from "@/components/ui/RotaryMark";
import MadeByTrays from "@/components/MadeByTrays";

export default function Home() {
  const { t } = useLang();
  const { jackpotTotal } = useJackpotTotal();
  const [draw, setDraw] = useState(null);
  const [config, setConfig] = useState(null);
  const [projects, setProjects] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [completedDraws, setCompletedDraws] = useState([]);
  const [charityLive, setCharityLive] = useState(0);
  const [orgsSupported, setOrgsSupported] = useState(0);
  const [beneficiariesReached, setBeneficiariesReached] = useState(0);
  const [totalPrizesPaid, setTotalPrizesPaid] = useState(0);

  useEffect(() => {
    (async () => {
      const cfg = await loadConfig();
      setConfig(cfg);
      const draws = await base44.entities.Draw.list("-drawNumber", 10);
      const active = draws.find((d) => d.status === "BUILDING" || d.status === "MINIMUM_REACHED" || d.status === "TARGET_REACHED") || draws[0];
      setDraw(active);
      setCompletedDraws(draws.filter((d) => d.status === "COMPLETED").slice(0, 3));
      const projs = await base44.entities.Project.list("-totalCommittedGov", 20);
      setProjects(projs.filter((p) => ["VOTING", "FUNDING_IN_PROGRESS", "COMPLETED", "APPROVED"].includes(p.status)).slice(0, 6));
      const c = await base44.entities.RotaryClub.list("-fundingReceived", 20);
      setClubs(c);
      // Source-of-truth figures from project + draw data (no dummy values).
      const allProjs = await base44.entities.Project.list("-totalCommittedGov", 500);
      // Charity organizations supported = distinct clubs with an approved / voting / funded project.
      const supportedStatuses = ["APPROVED", "VOTING", "FUNDING_IN_PROGRESS", "FUNDING_APPROVED", "SELECTED", "COMPLETED"];
      const orgSet = new Set(
        allProjs.filter((p) => supportedStatuses.includes(p.status)).map((p) => (p.clubName || "").trim()).filter(Boolean)
      );
      setOrgsSupported(orgSet.size);
      // Beneficiaries reached = sum of the beneficiaries field across every project.
      setBeneficiariesReached(allProjs.reduce((s, p) => s + (p.beneficiaries || 0), 0));
      // Total prizes paid = paid payouts + settled draw prizes.
      const paidPayouts = await base44.entities.PrizePayout.filter({ status: "PAID" });
      const drawPrizes = draws.filter((d) => d.status === "COMPLETED").reduce((s, d) => s + (d.totalPrizesPaid || 0), 0);
      setTotalPrizesPaid(paidPayouts.reduce((s, p) => s + (p.amount || 0), 0) + drawPrizes);
      try {
        const pw = await base44.functions.invoke("getPlatformWallets", {});
        const charity = (pw?.data?.wallets || []).find((w) => w.key === "charity");
        setCharityLive(charity?.liveTotal ?? 0);
      } catch (_) {}
    })();
  }, []);

  const progressPct = draw ? Math.min(100, Math.round(draw.ticketCount / draw.targetTickets * 100)) : 0;
  const totalRaised = charityLive;

  const howItWorks = [
    { icon: Ticket, title: t("home.how.play.title"), desc: t("home.how.play.desc"), color: "text-primary" },
    { icon: Vote, title: t("home.how.participate.title"), desc: t("home.how.participate.desc"), color: "text-accent" },
    { icon: Heart, title: t("home.how.impact.title"), desc: t("home.how.impact.desc"), color: "text-primary" },
  ];

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section data-tour="hero" className="relative overflow-hidden rounded-2xl bg-navy-gradient p-5 text-white shadow-xl sm:p-8 lg:p-12">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-white/5 blur-2xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium text-accent backdrop-blur sm:text-xs">
              <RotaryMark className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> {t("home.badge")}
            </div>
            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:mt-4 sm:text-4xl lg:text-5xl">
              {t("home.hero.title1")}<br />
              <span className="text-accent">{t("home.hero.title2")}</span> {t("home.hero.title3")}
            </h1>
            <p className="mt-3 max-w-xl text-sm text-white/80 sm:mt-4 sm:text-base">
              {t("home.hero.desc")}
            </p>
            <div data-tour="quick-actions" className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:grid-cols-4 sm:gap-3">
              <Link to="/play" className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gold-gradient px-3 py-2.5 text-xs font-bold text-primary-foreground shadow-lg transition-transform hover:scale-[1.02] hover-jelly sm:px-6 sm:py-3 sm:text-sm">
                <Ticket className="h-4 w-4 sm:h-5 sm:w-5" fill="currentColor" stroke="currentColor" strokeWidth={1.5} /> {t("home.cta.buy")}
              </Link>
              <Link to="/dashboard" className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3 py-2.5 text-xs font-semibold text-white backdrop-blur hover:bg-white/20 hover-jelly sm:px-6 sm:py-3 sm:text-sm">
                <Ticket className="h-4 w-4 sm:h-5 sm:w-5" fill="currentColor" stroke="currentColor" strokeWidth={1.5} /> {t("home.cta.tickets")}
              </Link>
              <Link to="/donate" className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-accent/50 bg-accent/15 px-3 py-2.5 text-xs font-semibold text-accent backdrop-blur hover:bg-accent/25 hover-jelly sm:px-6 sm:py-3 sm:text-sm">
                <Heart className="h-4 w-4 sm:h-5 sm:w-5" fill="currentColor" stroke="currentColor" strokeWidth={1.5} /> {t("home.cta.donate")}
              </Link>
              <Link to="/projects" className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3 py-2.5 text-xs font-semibold text-white backdrop-blur hover:bg-white/20 hover-jelly sm:px-6 sm:py-3 sm:text-sm">
                {t("home.cta.impact")} <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" fill="currentColor" stroke="currentColor" strokeWidth={2} />
              </Link>
            </div>
          </div>

          {/* Jackpot card */}
          <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-md sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-accent sm:text-xs">{t("home.jackpot")}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight sm:text-5xl">{jackpotTotal != null ? fmtUSD(jackpotTotal) : "—"}</p>
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-white/80">
                <span>{t("home.draw_progress")}</span>
                <span>{draw ? `${fmtNum(draw.ticketCount)} / ${fmtNum(draw.targetTickets)}` : ""}</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-gold-gradient transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              <p className="mt-2 text-xs text-white/70">{progressPct}{t("home.pct_to_target")} · {t("home.draw_label")} #{draw?.drawNumber}</p>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-white/60">{t("home.charity_fund")}</p>
                <p className="font-bold text-accent">{fmtUSD(charityLive)}</p>
              </div>
              <div>
                <p className="text-xs text-white/60">{t("home.ticket_price")}</p>
                <p className="font-bold">{config ? fmtUSD(config.ticket_price.value) : "$0.10"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Become a Sales Agent — apply directly from the hero */}
        <div className="relative mt-6">
          <AgentApplyCard />
        </div>
      </section>

      {/* Public platform wallets — live on-chain */}
      <div data-tour="wallets"><PublicWalletsCard /></div>

      {/* How it works */}
      <section data-tour="how-it-works" className="grid gap-4 sm:grid-cols-3">
        {howItWorks.map((s) =>
        <div key={s.title} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-muted sm:h-12 sm:w-12 ${s.color}`}>
              <s.icon className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <h3 className="mt-3 text-base font-bold tracking-tight sm:mt-4 sm:text-lg">{s.title}</h3>
            <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">{s.desc}</p>
          </div>
        )}
      </section>

      {/* Proof of impact */}
      <section data-tour="proof-impact">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight sm:text-xl">{t("home.proof.title")}</h2>
          <Link to="/projects" className="text-xs font-medium text-primary hover:underline sm:text-sm">{t("home.view_projects")} →</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Heart} label={t("home.stat.raised")} value={fmtUSD(totalRaised)} accent />
          <StatCard icon={Building2} label={t("home.stat.clubs")} value={fmtNum(orgsSupported)} />
          <StatCard icon={Users} label={t("home.stat.beneficiaries")} value={fmtNum(beneficiariesReached)} />
          <StatCard icon={Trophy} label={t("home.stat.prizes")} value={fmtUSD(totalPrizesPaid)} />
        </div>
      </section>

      {/* Recent winning numbers */}
      {completedDraws.length > 0 &&
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <h2 className="text-base font-bold tracking-tight sm:text-lg">{t("home.recent.title")}</h2>
          <div className="mt-4 space-y-4">
            {completedDraws.map((d) =>
          <div key={d.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-muted/50 p-4">
                <div>
                  <p className="text-sm font-semibold">{t("home.draw_label")} #{d.drawNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.winners5 > 0 ? `${d.winners5} ${t("home.jackpot_winners")}` : t("home.no_jackpot")} · {fmtUSD(d.jackpotAmount)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {parseNumbers(d.winningNumbers).map((n, i) =>
              <NumberBall key={i} n={n} size="sm" variant="navy" />
              )}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{t("home.proof_label")} {d.randomnessProof?.slice(0, 14)}…</p>
                  <p>{fmtNum(d.ticketCount)} {t("home.tickets")}</p>
                </div>
              </div>
          )}
          </div>
        </section>
      }

      {/* Featured projects */}
      <section data-tour="featured">
        <h2 className="mb-3 text-lg font-bold tracking-tight sm:mb-4 sm:text-xl">{t("home.featured.title")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) =>
          <Link key={p.id} to="/projects" className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
              <div className="h-40 overflow-hidden bg-muted">
                {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-semibold text-accent">{p.category}</span>
                  <span className="text-xs text-muted-foreground">{p.clubName}</span>
                </div>
                <h3 className="mt-2 font-bold leading-tight">{p.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="font-semibold text-primary">{fmtUSD(p.requestedFunding)}</span>
                  <span className="text-muted-foreground">{fmtNum(p.totalCommittedGov)} {t("home.gov_committed")}</span>
                </div>
              </div>
            </Link>
          )}
        </div>
      </section>

      <MadeByTrays />
    </div>);
}