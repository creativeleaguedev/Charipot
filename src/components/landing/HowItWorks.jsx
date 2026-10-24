import React from "react";
import { ChevronRight } from "lucide-react";

// "How Charipot Works" — four circular icon steps in alternating brand colors,
// separated by chevrons. Driven by the landing step translation keys.
const COLORS = [
  { ring: "bg-[#1EA454]/10", icon: "text-[#1EA454]" },
  { ring: "bg-[#F26522]/10", icon: "text-[#F26522]" },
  { ring: "bg-[#2D7FF9]/10", icon: "text-[#2D7FF9]" },
  { ring: "bg-[#8B5CF6]/10", icon: "text-[#8B5CF6]" },
];

export default function HowItWorks({ t, steps }) {
  return (
    <section id="how" className="scroll-mt-20 bg-secondary border-y border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <div className="text-center mb-12">
          <p className="text-sm font-bold uppercase tracking-widest text-[#F26522]">{t("landing.how.eyebrow")}</p>
          <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold text-foreground">{t("landing.how.title")}</h2>
          <p className="mt-2 text-muted-foreground">{t("landing.how.subtitle")}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-stretch gap-8 sm:gap-2">
          {steps.map((st, i) => {
            const c = COLORS[i % COLORS.length];
            return (
              <React.Fragment key={st.title}>
                {i > 0 && (
                  <div className="hidden sm:flex items-center self-center text-muted-foreground/40">
                    <ChevronRight className="h-6 w-6" />
                  </div>
                )}
                <div className="flex-1 text-center px-2">
                  <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${c.ring}`}>
                    <st.icon className={`h-7 w-7 ${c.icon}`} />
                  </div>
                  <div className="mt-3 text-xs font-bold uppercase tracking-widest text-[#F26522]">Step {i + 1}</div>
                  <h3 className="mt-1 font-bold text-foreground">{st.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{st.text}</p>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
}