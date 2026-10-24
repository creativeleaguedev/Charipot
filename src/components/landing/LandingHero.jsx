import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { ArrowRight, Heart, Droplets, GraduationCap, Sprout } from "lucide-react";
import { fmtUSD, fmtNum } from "@/lib/configRegistry";
import JackpotCountdown from "@/components/landing/JackpotCountdown";

const HERO_IMG = "https://media.base44.com/images/public/6a9fd1112d3233a0a31bca58/b1b67a550_generated_image.png";

// Hero: photo background with the headline + Play/Donate CTAs and social proof
// on the left, dark-teal "Charity Jackpot" card (live jackpot, draw progress,
// countdown, revenue split) on the right. Theme-aware overlay so copy reads on
// both the light and dark themes.
export default function LandingHero({ t, loading, jackpot, tickets, target, pct, draw, countdownTo }) {
  return (
    <section id="home" className="relative overflow-hidden bg-background scroll-mt-20">
      <Image
        src={HERO_IMG}
        alt="A smiling child from a community supported by Charipot"
        fittingType="fill"
        focalPointX={0.55}
        focalPointY={0.4}
        className="absolute inset-0 h-full w-full" />
      
      <div className="absolute inset-0 bg-background/85" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-14 sm:py-20 grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
        <div>
          <h1 className="text-4xl sm:text-5xl font-extrabold leading-[1.1] text-foreground font-heading">
            Communities Thrive When We{" "}
            <span className="relative inline-block text-[#27AE60]">
              Act Together.
              <span className="absolute left-0 -bottom-1 h-[3px] w-full rounded-full bg-[#F59D3D]" />
            </span>
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-xl">
            Charipot brings people together to support life-changing projects in our communities. Play our charitable
            sweepstakes or donate directly — every contribution funds real projects in education, health, water,
            livelihoods and more.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-[#F26522] hover:bg-[#e05a1c] text-white font-semibold">
              <Link to="/play">{t("landing.play_now")} <ArrowRight className="ml-2" style={{ width: 18, height: 18 }} /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-[#F26522] text-[#F26522] hover:bg-[#F26522]/10">
              <Link to="/donate"><Heart className="mr-1.5" style={{ width: 18, height: 18 }} /> {t("landing.donate")}</Link>
            </Button>
          </div>
          <div className="mt-8 flex items-center gap-3">
            <div className="flex -space-x-2">
              {[
              { Icon: Droplets, bg: "#1EA454" },
              { Icon: GraduationCap, bg: "#F06E2E" },
              { Icon: Sprout, bg: "#F5A845" }].
              map(({ Icon, bg }, i) =>
              <span key={i} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-background" style={{ background: bg }}>
                  <Icon className="h-5 w-5 text-white" />
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{fmtNum(tickets)}+</span> people playing &amp; giving for a brighter tomorrow
            </p>
          </div>
        </div>

        <div className="rounded-3xl bg-[#0D4D4D] text-white p-7 sm:p-9 shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-white/60">{t("landing.current_jackpot")}</span>
            <span className="rounded-full bg-[#27AE60]/20 px-2.5 py-1 text-[11px] font-semibold text-[#27AE60]">LIVE</span>
          </div>
          {loading ?
          <div className="h-16 my-5 rounded-lg bg-white/10 animate-pulse" /> :

          <p className="mt-4 text-5xl sm:text-6xl font-extrabold tracking-tight text-[#FF6B35]">{fmtUSD(jackpot)}</p>
          }

          <div className="mt-6">
            <div className="flex justify-between text-xs text-white/50 mb-2">
              <span>{t("landing.draw_progress")}</span>
              <span>{pct.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-[#FF6B35] transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 text-xs text-white/50">{fmtNum(tickets)} / {fmtNum(target)} {t("landing.tickets")}</div>
          </div>

          {countdownTo &&
          <div className="mt-6">
              <p className="mb-2 text-center text-xs text-white/50">Next draw in</p>
              <JackpotCountdown target={countdownTo} />
            </div>
          }

          <Button asChild className="mt-7 w-full bg-[#FF6B35] hover:bg-[#e05a1c] text-white font-semibold">
            <Link to="/play">{t("landing.play_now")} <ArrowRight className="ml-2" style={{ width: 16, height: 16 }} /></Link>
          </Button>
          

          
          <p className="mt-2 text-center text-xs text-white/40">{t("landing.draw")} #{draw?.drawNumber || "—"}</p>
        </div>
      </div>
    </section>);

}