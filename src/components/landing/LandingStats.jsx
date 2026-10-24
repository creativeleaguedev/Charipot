import React from "react";

// Horizontal impact-stats bar — icon + big value + label. Values come from the
// landing data (charity raised, beneficiaries, draws, clubs).
export default function LandingStats({ stats }) {
  return (
    <section id="impact" className="scroll-mt-20 bg-background border-y border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 grid grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1EA454]/10">
              <s.icon className="h-6 w-6 text-[#1EA454]" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-foreground leading-none">{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}