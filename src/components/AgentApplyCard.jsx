import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/useWallet";
import { useToast } from "@/components/ui/use-toast";
import { useLang } from "@/lib/LanguageContext";
import { loadConfig } from "@/lib/configRegistry";
import { UserCog, ArrowRight, Loader2, BadgeCheck } from "lucide-react";

// Home-page entry point to become a Sales Agent. Applying registers the user
// as an agent (sets their referral code); on success the Agent Portal unlocks
// in the sidebar. Admins already have the portal.
export default function AgentApplyCard() {
  const { user, wallet, refresh } = useWallet();
  const { toast } = useToast();
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState(null);

  useEffect(() => { loadConfig().then(setConfig); }, []);
  const referralRate = config?.agent_referral_rate?.value ?? 2;
  const winningBonus = config?.winning_agent_bonus?.value ?? 1;

  const isAgent = !!wallet?.isAgent;

  const apply = async () => {
    if (!wallet || isAgent) return;
    setBusy(true);
    try {
      const code =
        "CHARITY-" +
        (user?.full_name || user?.email || "AGENT").slice(0, 3).toUpperCase() +
        "-" +
        Math.floor(Math.random() * 90 + 10);
      await base44.entities.Wallet.update(wallet.id, {
        isAgent: true,
        agentCode: code,
        agentTier: "standard",
      });
      await base44.auth.updateMe({ role: "agent" }).catch(() => {});
      refresh();
      toast({
        title: t("agent.apply_success_title"),
        description: t("agent.apply_success_desc", { code }),
      });
    } catch (e) {
      toast({ title: t("agent.apply_failed"), description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <UserCog className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold tracking-tight sm:text-lg">{t("agent.become_title")}</h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {t("agent.become_desc", { referral: referralRate, bonus: winningBonus })}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          {isAgent ? (
            <Link
              to="/agent"
              className="inline-flex items-center gap-1.5 rounded-xl bg-gold-gradient px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg hover:opacity-90"
            >
              <BadgeCheck className="h-4 w-4" /> {t("agent.agent_portal_link")} <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <button
              onClick={apply}
              disabled={busy || !wallet}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCog className="h-4 w-4" />}
              {busy ? t("agent.applying") : t("agent.apply_now")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}