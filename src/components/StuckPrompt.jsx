import React from "react";
import { useTour } from "@/lib/useTour";
import { useLang } from "@/lib/LanguageContext";
import { HelpCircle } from "lucide-react";

// Idle prompt: "Are you stuck?" — Yes runs the quick self walkthrough.
// No just dismisses for now; it will ask again after another 20s of inactivity.
// Copy reflects that the platform is actively updated, so a refresher helps.
export default function StuckPrompt() {
  const { stuck, answerStuck } = useTour();
  const { t } = useLang();
  if (!stuck) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[101] w-[320px] max-w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-bottom-2">
      <div className="rounded-2xl border border-accent/50 bg-card p-4 shadow-2xl neon-gold">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <HelpCircle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-foreground">{t("tour.welcome_title")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("tour.welcome_body")}</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => answerStuck(true)}
                className="rounded-lg bg-gold-gradient px-3 py-1.5 text-xs font-bold text-primary-foreground"
              >
                {t("tour.next")}
              </button>
              <button
                onClick={() => answerStuck(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                {t("tour.skip_all")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}