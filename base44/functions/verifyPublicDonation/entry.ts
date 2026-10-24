import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getChain, verifyTreasuryTransfer, scanIncomingTransfers } from '../../shared/walletCrypto.ts';
import { computeDonationSplit } from '../../shared/walletAllocations.ts';
import { creditPendingAllocations } from '../../shared/allocationLedger.ts';
import { getCollectorAddress } from '../../shared/collectorWallet.ts';

// Donations now land in the platform collector wallet (same destination as
// ticket and pass payments), then auto-sweep to the seven custody wallets.
// Falls back to the legacy 'donation' PlatformWallet record if the collector
// key isn't configured.
const DONATION_FALLBACK = '0x52C2EBF9D6e589eB6a9F16b079Ee46f0AE83eC7f';
async function getDonationAddress(base44) {
  const collector = getCollectorAddress();
  if (collector) return collector;
  const w = (await base44.asServiceRole.entities.PlatformWallet.filter({ key: 'donation' }))[0];
  return w?.address || DONATION_FALLBACK;
}

// Revenue allocation defaults (mirror src/lib/configRegistry.js DEFAULT_PARAMS).
const CFG_DEFAULTS = { rev_charity: 50, rev_prize: 40, rev_platform: 8, rev_agent: 2, prize_5: 70, reserve_split: 10 };

async function loadAllocationConfig(base44) {
  const list = await base44.asServiceRole.entities.ConfigParameter.list('-key', 100);
  const map = { ...CFG_DEFAULTS };
  for (const p of list) {
    if (CFG_DEFAULTS[p.key] !== undefined) map[p.key] = p.value;
  }
  return map;
}

// Donation split is computed by computeDonationSplit (shared with ticket-sales
// allocation) so donations distribute across the 7 wallets identically.

// Public (no-auth) version of verifyDonationTx. Lets visitors on the public
// landing page donate crypto WITHOUT an account: they send USDC/USDT from their
// own wallet to the treasury, then verify the on-chain transfer here. A
// confirmed transfer is credited to the active draw's charity pool once
// (guarded against duplicate txHash) and recorded under an anonymous donor.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { chain, txHash, walletAddress } = body || {};
    const donationAddress = await getDonationAddress(base44);

    // Mode A: verify by transaction hash.
    if (txHash) {
      const c = getChain(chain || 'bnb');
      if (!c) return Response.json({ error: 'Unsupported chain' }, { status: 400 });
      const v = await verifyTreasuryTransfer(c, txHash, donationAddress);
      if (v.error) return Response.json({ error: v.error }, { status: 500 });
      if (v.pending) return Response.json({ mode: 'tx', pending: true });

      if (v.confirmed && v.toTreasury) {
        const existing = await base44.asServiceRole.entities.CryptoTransaction.filter({ txHash });
        if (!existing.length) {
          const draws = await base44.asServiceRole.entities.Draw.list('-drawNumber', 1);
          const draw = draws[0];
          await base44.asServiceRole.entities.CryptoTransaction.create({
            userId: 'anonymous',
            fullName: 'Anonymous donor',
            type: 'DONATION',
            chain: v.chain,
            token: v.token,
            amount: Number(v.amount),
            fromAddress: v.fromAddress,
            toAddress: donationAddress,
            status: 'CONFIRMED',
            txHash,
            blockNumber: v.blockNumber,
            reference: 'public_donation_draw_' + (draw?.drawNumber || ''),
            createdAt: new Date().toISOString(),
          });
          const cfg = await loadAllocationConfig(base44);
          const split = computeDonationSplit(Number(v.amount), cfg);
          // Credit each custody wallet's pending allocation ledger ("Allocated to
          // Date"). The on-chain distribution happens when the collector reaches
          // the $10 sweep threshold.
          await creditPendingAllocations(base44.asServiceRole, Number(v.amount));
          // Credit the active draw's charity / jackpot / reserve counters. The
          // on-chain distribution to the seven custody wallets happens in the
          // automatic collector-wallet sweep (donations now land there).
          if (draw) {
            await base44.asServiceRole.entities.Draw.update(draw.id, {
              charityContribution: +((draw.charityContribution || 0) + split.charity).toFixed(2),
              jackpotAmount: +((draw.jackpotAmount || 0) + split.jackpot_5).toFixed(2),
              reserveAllocation: +((draw.reserveAllocation || 0) + split.buffer).toFixed(2),
              reserveBalance: +((draw.reserveBalance || 0) + split.buffer).toFixed(2),
            });
          }
          // Trigger a collector-wallet sweep so the donated funds are
          // redistributed once the balance reaches the $10 threshold.
          await base44.functions.invoke('sweepCollectorWallet', {}).catch(() => null);
          await base44.asServiceRole.entities.Notification.create({
            title: 'Public donation verified on-chain',
            type: 'treasury',
            message: `Anonymous donor: ${v.amount} ${v.token} on ${v.chain} confirmed to the treasury and split across charity, jackpot, and reserve.`,
            createdAt: new Date().toISOString(),
          });
        }
      }
      return Response.json({ mode: 'tx', ...v });
    }

    // Mode B: verify by sender wallet address.
    if (walletAddress) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return Response.json({ error: 'Invalid wallet address' }, { status: 400 });
      }
      const all = await scanIncomingTransfers(donationAddress);
      const matches = all.filter((t) => t.fromAddress === walletAddress.toLowerCase());
      return Response.json({ mode: 'wallet', walletAddress, transfers: matches });
    }

    return Response.json({ error: 'Provide txHash or walletAddress' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}