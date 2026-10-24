import React from "react";
import { Image } from "@/components/ui/image";

// Dark testimonial band — community-leader pull quote on the left, impact
// bullets on the right, over a photo of community members planting seedlings.
const BULLETS = [
  "Cleaner, healthier communities",
  "More children in school",
  "Improved healthcare access",
  "Stronger local economies",
];

export default function TestimonialSection() {
  return (
    <section className="relative overflow-hidden bg-[#1B1B1B] text-white">
      <Image
        src="https://media.base44.com/images/public/6a9fd1112d3233a0a31bca58/ec19dd375_generated_image.png"
        alt="Community members and children planting seedlings together"
        fittingType="fill"
        className="absolute inset-0 h-full w-full"
      />
      <div className="absolute inset-0 bg-[#1B1B1B]/80" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-[#F26522]">Real Stories, Real Impact</p>
          <blockquote className="mt-5 text-2xl sm:text-3xl font-bold leading-snug">
            “With the support from Charipot, our community now has clean water and our children are healthier.”
          </blockquote>
          <p className="mt-4 text-sm text-white/60">— Community Leader, Kalimani</p>
        </div>

        <ul className="space-y-3">
          {BULLETS.map((b) => (
            <li key={b} className="flex items-center gap-3 text-sm text-white/85">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#27AE60] text-[11px] font-bold text-white">✓</span>
              {b}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}