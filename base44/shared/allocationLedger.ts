import { computeAmountShares } from './walletAllocations.ts';

// The seven destination custody wallets that receive a share of every payment
// that lands in the collector. The collector itself and the legacy 'donation'
// record are NOT destination wallets.
export const DESTINATION_KEYS = [
  'charity', 'jackpot_5', 'winnings_4', 'winnings_3', 'buffer', 'treasury', 'agent_fee',
] as const;

// Credits each destination wallet's ledgerBalance ("Allocated to Date" / pending
// allocation) with its fixed percentage share of `amount`. Called at purchase
// and donation time — the on-chain money stays in the collector until the $10
// sweep threshold; the sweep later distributes these accumulated ledgers and
// resets them to zero. Uses atomic $inc so concurrent purchases don't race.
export async function creditPendingAllocations(svc: any, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return { credited: 0, shares: {} };
  const shares = computeAmountShares(amount, {});
  let credited = 0;
  for (const key of DESTINATION_KEYS) {
    const inc = +(shares[key] || 0).toFixed(4);
    if (inc <= 0) continue;
    await svc.entities.PlatformWallet.updateMany({ key }, { $inc: { ledgerBalance: inc } });
    credited += inc;
  }
  return { credited: +credited.toFixed(4), shares };
}

// Resets every destination wallet's ledgerBalance to 0 after a successful sweep,
// closing the cycle so new purchases start a fresh allocation accumulator.
export async function resetPendingAllocations(svc: any) {
  for (const key of DESTINATION_KEYS) {
    await svc.entities.PlatformWallet.updateMany({ key }, { $set: { ledgerBalance: 0 } });
  }
}

// Sum of the current cycle's pending allocations across the seven destination
// wallets — the total USD the next sweep will distribute.
export function pendingAllocationTotal(wallets: any[]): number {
  return wallets
    .filter((w) => (DESTINATION_KEYS as readonly string[]).includes(w.key))
    .reduce((s, w) => s + (w.ledgerBalance || 0), 0);
}