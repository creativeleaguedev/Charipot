import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { readOnChainBalances } from '../../shared/walletCrypto.ts';

// Charity wallet — looked up from the PlatformWallet registry (key 'charity')
// so the custody address can be rotated from the Admin Center without a code
// change. Its live USDC/USDT balance is readable by anyone.
const CHARITY_FALLBACK = '0x52C2EBF9D6e589eB6a9F16b079Ee46f0AE83eC7f';

// Public read — no auth required. Returns the charity wallet address plus its
// live USDC/USDT (and native gas) balances across BNB, Ethereum and Polygon,
// read directly from each chain's RPC (blockchain = source of truth).
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const w = (await base44.asServiceRole.entities.PlatformWallet.filter({ key: 'charity' }))[0];
    const charityAddress = w?.address || CHARITY_FALLBACK;
    const chains = await readOnChainBalances(charityAddress);
    let totalUsdc = 0;
    let totalUsdt = 0;
    for (const c of chains) {
      totalUsdc += Number(c.balances?.USDC ?? 0);
      totalUsdt += Number(c.balances?.USDT ?? 0);
    }
    const total = +(totalUsdc + totalUsdt).toFixed(2);
    return Response.json({
      address: charityAddress,
      chains,
      totalUsdc: +totalUsdc.toFixed(2),
      totalUsdt: +totalUsdt.toFixed(2),
      total,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}