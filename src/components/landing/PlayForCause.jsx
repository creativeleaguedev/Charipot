import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import NumberBall from "@/components/ui/NumberBall";
import { ArrowRight } from "lucide-react";

// "Play for a Cause" CTA — lottery balls on the left, headline + buttons in the
// middle, and the three perk bullets on the right.
const PERKS = ["Win exciting prizes", "Support real projects", "Be part of the decision"];

export default function PlayForCause({ t }) {
  return (
    <section id="play" className="scroll-mt-20 mx-auto max-w-7xl px-4 sm:px-6 py-16">
      <div className="rounded-3xl bg-secondary border border-border p-8 sm:p-12">
        <div className="grid lg:grid-cols-3 gap-10 lg:gap-8 items-center">
          <div className="flex flex-wrap gap-3 justify-center">
            {[7, 12, 3, 5].map((n) => <NumberBall key={n} n={n} size="lg" />)}
          </div>

          <div className="text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-[#F26522]">{t("landing.cta.eyebrow")}</p>
            <h2 className="mt-2 text-3xl font-extrabold text-foreground leading-tight">{t("landing.cta.title")}</h2>
            <p className="mt-3 text-muted-foreground">{t("landing.cta.desc")}</p>
            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              <Button asChild size="lg" className="bg-[#F26522] hover:bg-[#e05a1c] text-white font-semibold">
                <Link to="/play">{t("landing.play_now")} <ArrowRight className="ml-2" style={{ width: 18, height: 18 }} /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-[#F26522] text-[#F26522] hover:bg-[#F26522]/10">
                <a href="#how">{t("landing.how_link")}</a>
              </Button>
            </div>
          </div>

          <ul className="space-y-3 lg:justify-self-end">
            {PERKS.map((p) => (
              <li key={p} className="flex items-center gap-3 text-sm text-foreground/80">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#27AE60] text-[11px] font-bold text-white">✓</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}