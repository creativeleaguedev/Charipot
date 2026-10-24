import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

// Module-level cache shared across every useJackpotTotal() instance. This
// prevents the "flicker back to the stale fallback" glitch when navigating
// between Home / Play / Dashboard: the first successful fetch is retained, so
// any new mount immediately shows the last known live value instead of null,
// then refreshes in the background.
let cachedTotal = null;

// Hook: returns the live jackpot total — the sum of the real balances held by
// the three prize wallets (5/5 Jackpot + 4/5 Winnings + 3/5 Winnings). This is
// read from the platform wallets (blockchain = source of truth, falling back to
// the per-wallet ledger balance), so it updates automatically as wallet
// balances change — independent of the per-draw accrual fields on the Draw
// entity. Call `refresh()` after any action that moves prize funds (ticket
// purchase, draw settlement, buffer rollover, payout) to re-read the wallets.
export function useJackpotTotal() {
  const [total, setTotal] = useState(cachedTotal);
  const [loading, setLoading] = useState(cachedTotal == null);

  const refresh = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("getJackpotTotal", {});
      if (res?.data?.total != null) {
        cachedTotal = res.data.total;
        setTotal(res.data.total);
      }
    } catch (e) {
      console.error("useJackpotTotal error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-read the prize wallets whenever a prize-moving event lands: ticket
  // purchases, draw completions, prize payouts, or donations that seed the
  // jackpot. This keeps the displayed jackpot in sync with the wallet balances
  // without a manual refresh.
  useEffect(() => {
    const unsubTx = base44.entities.CryptoTransaction.subscribe((event) => {
      const t = event?.data;
      if (["LOTTERY_BUY", "PRIZE_PAYOUT", "DONATION"].includes(t?.type)) refresh();
    });
    const unsubDraw = base44.entities.Draw.subscribe(() => refresh());
    return () => { unsubTx?.(); unsubDraw?.(); };
  }, [refresh]);

  return { jackpotTotal: total, loading, refresh };
}