import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTour } from "@/lib/useTour";
import { getTourSteps, TOUR_STEPS_COUNT } from "@/lib/tourSteps";
import { useLang } from "@/lib/LanguageContext";
import { X, ChevronLeft, ChevronRight, Check } from "lucide-react";

const PAD = 14;
const TIP_MAXW = 320;
const ARROW = "hsl(43 74% 50%)"; // gold arrow, kept visible per request

function visibleRect(el) {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  // Off-screen (e.g. mobile sidebar slid away) → fall back to centered tooltip.
  const vw = window.innerWidth, vh = window.innerHeight;
  if (r.right < 8 || r.bottom < 8 || r.left > vw - 8 || r.top > vh - 8) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
}

export default function TourOverlay() {
  const tour = useTour();
  const { t } = useLang();
  const { active, index, viewport, next, prev, skip, paused, setPaused, autoMs } = tour;
  const steps = getTourSteps(t);
  const step = steps[index];
  const [rect, setRect] = useState(null);
  const [pos, setPos] = useState(null);
  const tipRef = useRef(null);

  // Navigate to the step's route if needed, then locate the target element.
  useEffect(() => {
    if (!active || !step) return;
    let cancelled = false;
    setRect(null);
    setPos(null);

    if (step.route && tour.location.pathname !== step.route) {
      tour.navigate(step.route);
      return; // re-run after the route change
    }
    if (step.centered) return;

    let tries = 0;
    const find = () => {
      if (cancelled) return;
      const el = document.querySelector(step.selector);
      if (el) {
        // Scroll the target into view FIRST — even when the section is hidden
        // below the fold or inside a scroll container — then measure and
        // spotlight it once the smooth scroll has settled.
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        setTimeout(() => { if (!cancelled) setRect(visibleRect(el)); }, 480);
        return;
      }
      if (++tries < 30) setTimeout(find, 80); // wait for page to render
    };
    find();
    return () => { cancelled = true; };
  }, [active, index, step?.selector, step?.route, step?.centered, tour.location.pathname]);

  // Keep the spotlight glued to the target on scroll / resize.
  useEffect(() => {
    if (!active || !step || step.centered) return;
    let t;
    const update = () => {
      const el = document.querySelector(step.selector);
      if (el) { const r = visibleRect(el); if (r) setRect(r); }
    };
    const onScroll = () => { clearTimeout(t); t = setTimeout(update, 120); };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => { clearTimeout(t); window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onScroll); };
  }, [active, index, step?.selector, step?.centered]);

  // Always center the tooltip on screen. When a target element exists and is
  // not under the tooltip, draw an arrow from the tooltip edge toward it.
  useLayoutEffect(() => {
    if (!active) return;
    const tip = tipRef.current;
    if (!tip) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const tw = Math.min(TIP_MAXW, vw - 32);
    const th = tip.offsetHeight;

    if (step.centered) { setPos({ centered: true }); return; }

    const left = Math.max(12, Math.min((vw - tw) / 2, vw - tw - 12));
    let top = Math.max(12, Math.min((vh - th) / 2, vh - th - 12));
    let placement = "center";

    let arrow = null;
    if (rect) {
      const rcx = rect.left + rect.width / 2;
      const rcy = rect.top + rect.height / 2;
      const overlaps = rect.left < left + tw && rect.right > left && rect.top < top + th && rect.bottom > top;
      if (overlaps) {
        // Centered box would cover the target — slide to the opposite edge so
        // the highlighted buttons stay visible, and point an arrow at them.
        if (rcy < vh / 2) {
          top = Math.max(12, vh - th - 16); // move to bottom
          placement = "bottom";
          arrow = { side: "top", p: Math.min(Math.max(rcx - left, 10), tw - 10) };
        } else {
          top = 16; // move to top
          placement = "top";
          arrow = { side: "bottom", p: Math.min(Math.max(rcx - left, 10), tw - 10) };
        }
      } else {
        const dx = rcx - (left + tw / 2);
        const dy = rcy - (top + th / 2);
        const side = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "bottom" : "top");
        const p = (side === "top" || side === "bottom")
          ? Math.min(Math.max(rcx - left, 10), tw - 10)
          : Math.min(Math.max(rcy - top, 10), th - 10);
        arrow = { side, p };
      }
    }
    setPos({ top, left, width: tw, placement, arrow });
  }, [rect, active, step?.centered]);

  if (!active || !step) return null;

  const isLast = index === TOUR_STEPS_COUNT - 1;
  const centered = !rect || step.centered || !pos || pos.centered;

  const arrowStyle = pos && !pos.centered && pos.arrow && {
    position: "absolute",
    width: 0, height: 0,
    ...(pos.arrow.side === "top" && { top: -9, left: pos.arrow.p - 8, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderBottom: `9px solid ${ARROW}` }),
    ...(pos.arrow.side === "bottom" && { bottom: -9, left: pos.arrow.p - 8, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: `9px solid ${ARROW}` }),
    ...(pos.arrow.side === "left" && { left: -9, top: pos.arrow.p - 8, borderTop: "8px solid transparent", borderBottom: "8px solid transparent", borderRight: `9px solid ${ARROW}` }),
    ...(pos.arrow.side === "right" && { right: -9, top: pos.arrow.p - 8, borderTop: "8px solid transparent", borderBottom: "8px solid transparent", borderLeft: `9px solid ${ARROW}` }),
  };

  return (
    <div className="fixed inset-0 z-[100]" style={{ pointerEvents: "none" }}>
      {/* Full-screen click blocker + darkening */}
      <div
        className="fixed inset-0"
        style={{ pointerEvents: "auto", background: centered ? "rgba(8,12,24,0.66)" : "transparent" }}
      />
      {/* Spotlight (box-shadow darkens everything outside the target) */}
      {!centered && rect && (
        <div
          className="fixed"
          style={{
            pointerEvents: "none",
            top: rect.top - 6, left: rect.left - 6,
            width: rect.width + 12, height: rect.height + 12,
            borderRadius: 16,
            boxShadow: "0 0 0 9999px rgba(8,12,24,0.66)",
            border: `2px solid ${ARROW}`,
            transition: "all 0.25s ease",
          }}
        />
      )}
      {/* Tooltip */}
      <div
        ref={tipRef}
        className="fixed"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        style={
          centered
            ? { pointerEvents: "auto", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: Math.min(TIP_MAXW, window.innerWidth - 32) }
            : pos && !pos.centered
              ? { pointerEvents: "auto", top: pos.top, left: pos.left, width: pos.width }
              : { pointerEvents: "none", visibility: "hidden" }
        }
      >
        <div className="relative rounded-2xl border border-accent/50 bg-card p-4 shadow-2xl">
          {arrowStyle && <div style={arrowStyle} />}
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-bold text-foreground">{step.title}</h3>
            <button onClick={skip} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title={t("tour.skip_tour")}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
          {/* self-advance progress bar (pause on hover) */}
          {!isLast && (
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted" title={t("tour.progress_title")}>
              <div
                key={index}
                style={{ animation: `tour-progress ${autoMs}ms linear forwards`, animationPlayState: paused ? "paused" : "running" }}
                className="h-full rounded-full bg-gold-gradient"
              />
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-muted-foreground capitalize">{index + 1} / {TOUR_STEPS_COUNT} · {viewport}</span>
            <div className="flex items-center gap-2">
              {index > 0 && (
                <button onClick={prev} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                  <ChevronLeft className="h-3.5 w-3.5" /> {t("tour.back")}
                </button>
              )}
              <button onClick={skip} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">{t("tour.skip_all")}</button>
              {isLast ? (
                <button onClick={next} className="inline-flex items-center gap-1 rounded-lg bg-gold-gradient px-3 py-1.5 text-xs font-bold text-primary-foreground">
                  <Check className="h-3.5 w-3.5" /> {t("tour.done")}
                </button>
              ) : (
                <button onClick={next} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
                  {t("tour.next")} <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}