import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { readOnChainBalances } from '../../shared/walletCrypto.ts';

// Public read — no auth required. The live jackpot is the sum of the real
// balances held in the three prize wallets (5/5 jackpot, 4/5 winnings, 3/5
// winnings). On-chain USDC/USDT balances are the source of truth; the per-wallet
// ledger (cumulative allocations from every settled draw) is the fallback when
// the on-chain read is unavailable or zero.
const PRIZE_KEYS = ['jackpot_5', 'winnings_4', 'winnings_3'];
const LABELS: Record<string, string> = {
  jackpot_5: '5/5 Jackpot Wallet',
  winnings_4: '4/5 Winnings Wallet',
  winnings_3: '3/5 Winnings Wallet',
};

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const wallets = await svc.entities.PlatformWallet.list('order', 100);
    const prize = wallets.filter((w: any) => PRIZE_KEYS.includes(w.key));

    // Cache on-chain reads by address (the three prize wallets share custody).
    const addrCache = new Map<string, Promise<any>>();
    const readCached = (addr: string) => {
      if (addrCache.has(addr)) return addrCache.get(addr)!;
      const p = readOnChainBalances(addr);
      addrCache.set(addr, p);
      return p;
    };

    const breakdown = [];
    let liveTotal = 0;
    for (const w of prize) {
      let live = 0;
      try {
        const chains = await readCached(w.address);
        let usdc = 0, usdt = 0;
        for (const c of chains) {
          usdc += Number(c.balances?.USDC ?? 0);
          usdt += Number(c.balances?.USDT ?? 0);
        }
        live = +(usdc + usdt).toFixed(2);
      } catch (_) {}
      liveTotal += live;
      breakdown.push({
        key: w.key,
        label: LABELS[w.key] || w.label,
        address: w.address,
        liveTotal: live,
      });
    }

    // The jackpot is the sum of the real on-chain USDC + USDT balances held by
    // the three prize wallets (5/5 jackpot, 4/5 winnings, 3/5 winnings), read
    // directly from the blockchain. No ledger or draw-counter fallbacks.
    const total = +liveTotal.toFixed(2);

    return Response.json({
      total,
      liveTotal: total,
      breakdown,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}