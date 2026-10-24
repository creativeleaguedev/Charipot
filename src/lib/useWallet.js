import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

// Hook: returns the current user's wallet record, creating one if missing.
// Also returns a refresh function and the current user.
export function useWallet() {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);
      const existing = await base44.entities.Wallet.filter({ userId: me.id });
      if (existing && existing.length > 0) {
        setWallet(existing[0]);
      } else {
        const created = await base44.entities.Wallet.create({
          userId: me.id,
          fullName: me.full_name || me.email || "Participant",
          govBalance: 0,
          govBurned: 0,
          govCommitted: 0,
          prizeBalance: 0,
          totalReferralEarnings: 0,
          totalBonusEarnings: 0,
          isAgent: false,
          agentTier: "standard",
          ticketsSold: 0,
        });
        setWallet(created);
      }
    } catch (e) {
      console.error("useWallet error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { user, wallet, setWallet, loading, refresh };
}