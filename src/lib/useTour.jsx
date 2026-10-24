import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TOUR_STEPS_COUNT } from "@/lib/tourSteps";

const IDLE_MS = 20000; // linger this long → ask "are you stuck?"
const AUTO_MS = 6000; // self-advance per step (fast walkthrough)
const LS_SKIP = "riv_tour_skipped";
const LS_DONE = "riv_tour_completed";

const TourContext = createContext(null);

export function getViewport() {
  const w = typeof window !== "undefined" ? window.innerWidth : 1280;
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

function readFlag(k) { try { return localStorage.getItem(k) === "1"; } catch { return false; } }
function writeFlag(k, v) { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* ignore */ } }

export function TourProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [viewport, setViewport] = useState(getViewport());
  const [paused, setPaused] = useState(false);
  const [stuck, setStuck] = useState(false);
  const lastActivity = useRef(Date.now());

  // Track viewport (mobile / tablet / desktop)
  useEffect(() => {
    const onResize = () => setViewport(getViewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Track user activity for the idle "stuck" check
  useEffect(() => {
    const mark = () => { lastActivity.current = Date.now(); };
    const ev = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    ev.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    return () => ev.forEach((e) => window.removeEventListener(e, mark));
  }, []);

  // Reset the idle clock on route change and dismiss any pending prompt
  useEffect(() => { lastActivity.current = Date.now(); setStuck(false); }, [location.pathname]);

  // First-time walkthrough: auto-start the tour when a new user lands on Home
  // and they have neither completed nor skipped it before.
  useEffect(() => {
    if (active) return;
    if (readFlag(LS_DONE) || readFlag(LS_SKIP)) return;
    if (location.pathname !== "/home") return;
    const t = setTimeout(() => start(), 1200); // let Home finish rendering
    return () => clearTimeout(t);
  }, [location.pathname, active]);

  // Idle → "Are you stuck?" prompt. Re-triggers after every 20s of inactivity,
  // even if the tour has already been shown or completed before.
  useEffect(() => {
    const id = setInterval(() => {
      if (!active && !stuck && Date.now() - lastActivity.current > IDLE_MS) {
        setStuck(true);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [active, stuck]);

  const start = useCallback(() => { setIndex(0); setActive(true); setPaused(false); }, []);
  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= TOUR_STEPS_COUNT - 1) { setActive(false); writeFlag(LS_DONE, true); return i; }
      return i + 1;
    });
  }, []);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const skip = useCallback(() => { writeFlag(LS_SKIP, true); setActive(false); }, []);
  const answerStuck = useCallback((yes) => {
    setStuck(false);
    lastActivity.current = Date.now(); // reset idle clock so it asks again later
    if (yes) start();
  }, []);

  // Self-running fast walkthrough: auto-advance each step.
  const isLast = index >= TOUR_STEPS_COUNT - 1;
  useEffect(() => {
    if (!active || isLast || paused) return;
    const t = setTimeout(() => next(), AUTO_MS);
    return () => clearTimeout(t);
  }, [active, index, paused, isLast]);

  const value = {
    active, index, viewport, total: TOUR_STEPS_COUNT,
    start, next, prev, skip, navigate, location,
    paused, setPaused, stuck, answerStuck, autoMs: AUTO_MS,
  };
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

export { IDLE_MS, AUTO_MS };