import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { readOnChainBalances } from '../../shared/walletCrypto.ts';
import { computeWalletPercents } from '../../shared/walletAllocations.ts';

// Public read — no auth required. Returns the public platform wallets with
// their allocation % (derived live from the Config Registry), their per-wallet
// ledger balances (accumulated allocations from every settled draw), and the
// live on-chain USDC/USDT balances of their shared custody address across
// BNB, Ethereum and Polygon (blockchain = source of truth).
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const wallets = await svc.entities.PlatformWallet.list('order', 100);
    const params = await svc.entities.ConfigParameter.list('-key', 100);
    const cfg: Record<string, number> = {};
    params.forEach((p: any) => { cfg[p.key] = Number(p.value); });
    const pcts = computeWalletPercents(cfg);

    const publicWallets = wallets.filter((w: any) => w.isPublic);
    // The Buffer wallet is non-public but its ledger balance is the source of
    // truth for the displayed current jackpot, so expose it separately.
    const bufferWallet = wallets.find((w: any) => w.key === 'buffer');

    // Cache on-chain reads by address so wallets sharing custody hit RPC once.
    const addrCache = new Map<string, Promise<any>>();
    const readCached = (addr: string) => {
      if (addrCache.has(addr)) return addrCache.get(addr)!;
      const p = readOnChainBalances(addr);
      addrCache.set(addr, p);
      return p;
    };

    const result = [];
    for (const w of publicWallets) {
      let chains: any[] = [];
      let liveTotal = 0;
      try {
        chains = await readCached(w.address);
        let usdc = 0, usdt = 0;
        for (const c of chains) {
          usdc += Number(c.balances?.USDC ?? 0);
          usdt += Number(c.balances?.USDT ?? 0);
        }
        liveTotal = +(usdc + usdt).toFixed(2);
      } catch (_) {}
      result.push({
        key: w.key,
        label: w.label,
        description: w.description,
        address: w.address,
        allocationPct: pcts[w.key] ?? 0,
        ledgerBalance: w.ledgerBalance || 0,
        chains,
        liveTotal,
      });
    }

    return Response.json({ wallets: result, bufferBalance: bufferWallet?.ledgerBalance || 0 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}