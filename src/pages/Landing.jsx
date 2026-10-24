import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useLang } from "@/lib/LanguageContext";
import { useJackpotTotal } from "@/lib/useJackpotTotal";
import { parseNumbers, fmtUSD, fmtNum } from "@/lib/configRegistry";
import NumberBall from "@/components/ui/NumberBall";
import PublicWalletsCard from "@/components/PublicWalletsCard";
import RotaryMark from "@/components/ui/RotaryMark";
import MadeByTrays from "@/components/MadeByTrays";
import { Ticket, Heart, Users, Trophy, Building2, Vote, TrendingUp } from "lucide-react";
import PublicHeader from "@/components/landing/PublicHeader";
import LandingHero from "@/components/landing/LandingHero";
import LandingStats from "@/components/landing/LandingStats";
import FeaturedProjects from "@/components/landing/FeaturedProjects";
import HowItWorks from "@/components/landing/HowItWorks";
import TestimonialSection from "@/components/landing/TestimonialSection";
import PlayForCause from "@/components/landing/PlayForCause";

export default function Landing() {
  const { t } = useLang();
  const { jackpotTotal } = useJackpotTotal();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = () =>
    base44.functions.invoke("getLandingData", {}).then((res) => setData(res.data)).catch(() => {});

  useEffect(() => {
    let mounted = true;
    base44.functions
      .invoke("getLandingData", {})
      .then((res) => { if (mounted) setData(res.data); })
      .catch(() => {})
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  // Real-time: refetch landing stats when a DONATION transaction is confirmed.
  useEffect(() => {
    const unsub = base44.entities.CryptoTransaction.subscribe((event) => {
      const tx = event?.data;
      if (tx?.type === "DONATION") loadData();
    });
    return unsub;
  }, []);

  const draw = data?.currentDraw;
  const jackpot = jackpotTotal;
  const tickets = draw?.ticketCount || 0;
  const target = draw?.targetTickets || 50000;
  const pct = target ? Math.min(100, (tickets / target) * 100) : 0;

  // Countdown target — the weekly draw cadence (7 days from the draw's creation),
  // rolled forward to the next future occurrence.
  const countdownTo = (() => {
    if (!draw?.createdAt) return null;
    const WEEK = 7 * 24 * 3600 * 1000;
    let next = new Date(draw.createdAt).getTime() + WEEK;
    while (next <= Date.now()) next += WEEK;
    return new Date(next).toISOString();
  })();

  const stats = [
    { label: t("landing.stat.charity"), value: fmtUSD(data?.totalCharityRaised || 0), icon: Heart },
    { label: t("landing.stat.beneficiaries"), value: fmtNum(data?.totalBeneficiaries || 0), icon: Users },
    { label: t("landing.stat.draws"), value: fmtNum(draw?.drawNumber || 0), icon: Trophy },
    { label: t("landing.stat.orgs"), value: fmtNum(data?.clubsCount || 0), icon: Building2 },
  ];

  const steps = [
    { icon: Ticket, title: t("landing.step1.title"), text: t("landing.step1.text") },
    { icon: Heart, title: t("landing.step2.title"), text: t("landing.step2.text") },
    { icon: Vote, title: t("landing.step3.title"), text: t("landing.step3.text") },
    { icon: TrendingUp, title: t("landing.step4.title"), text: t("landing.step4.text") },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader t={t} />

      <LandingHero
        t={t}
        loading={loading}
        jackpot={jackpot}
        tickets={tickets}
        target={target}
        pct={pct}
        draw={draw}
        countdownTo={countdownTo}
      />

      <LandingStats stats={stats} />

      <FeaturedProjects t={t} loading={loading} projects={data?.featuredProjects} />

      {/* Public platform wallets */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
        <PublicWalletsCard />
      </section>

      <HowItWorks t={t} steps={steps} />

      {/* Recent winning numbers */}
      {data?.recentWinners?.length > 0 && (
        <section className="bg-secondary border-y border-border">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-14">
            <h2 className="text-2xl font-extrabold text-foreground mb-6 text-center">{t("landing.recent.title")}</h2>
            <div className="grid sm:grid-cols-3 gap-5">
              {data.recentWinners.map((d) => (
                <div key={d.id} className="rounded-2xl border border-border bg-card p-5 text-center shadow-sm">
                  <div className="text-sm text-muted-foreground mb-3">{t("landing.draw")} #{d.drawNumber}</div>
                  <div className="flex items-center justify-center gap-2">
                    {parseNumbers(d.winningNumbers).map((n, i) => (
                      <NumberBall key={i} n={n} size="sm" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <TestimonialSection />

      <PlayForCause t={t} />

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#1B1B1B] flex items-center justify-center text-[#F26522]">
              <RotaryMark style={{ width: 15, height: 15 }} />
            </div>
            <span className="font-medium text-foreground">{t("landing.brand")}</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/projects" className="hover:text-[#F26522]">{t("landing.footer_projects")}</Link>
            <Link to="/donate" className="hover:text-[#F26522] flex items-center gap-1"><Heart style={{ width: 13, height: 13 }} /> {t("landing.donate")}</Link>
            <Link to="/login" className="hover:text-[#F26522]">{t("landing.signin")}</Link>
            <Link to="/register" className="hover:text-[#F26522]">{t("landing.register")}</Link>
          </div>
          <div>{t("landing.copyright", { year: new Date().getFullYear() })}</div>
        </div>
        <MadeByTrays className="pb-5" />
      </footer>
    </div>
  );
}