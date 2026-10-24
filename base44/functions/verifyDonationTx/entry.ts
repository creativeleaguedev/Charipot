import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getChain, verifyTreasuryTransfer, scanIncomingTransfers } from '../../shared/walletCrypto.ts';
import { computeDonationSplit } from '../../shared/walletAllocations.ts';

// Donation wallet — destination every donation must reach on-chain. Looked
// up from the PlatformWallet registry (key 'donation') so the custody address
// can be rotated from the Admin Center without a code change.
const DONATION_FALLBACK = '0x52C2EBF9D6e589eB6a9F16b079Ee46f0AE83eC7f';
async function getDonationAddress(base44) {
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

// Verifies a direct donation actually reached the treasury wallet on-chain.
// Two modes:
//  - txHash + chain: fetches the receipt and confirms an ERC20 Transfer to the
//    treasury. On a confirmed match it credits the active draw's charity pool
//    once (guarded against duplicates by txHash).
//  - walletAddress: scans recent confirmed transfers TO the treasury from that
//    sender across all chains and returns the matches.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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
            userId: user.id,
            fullName: user.full_name || user.email,
            type: 'DONATION',
            chain: v.chain,
            token: v.token,
            amount: Number(v.amount),
            fromAddress: v.fromAddress,
            toAddress: donationAddress,
            status: 'CONFIRMED',
            txHash,
            blockNumber: v.blockNumber,
            reference: 'verified_donation_draw_' + (draw?.drawNumber || ''),
            createdAt: new Date().toISOString(),
          });
          const cfg = await loadAllocationConfig(base44);
          const split = computeDonationSplit(Number(v.amount), cfg);
          // Auto-distribute the donation across the 7 platform wallets by the
          // configured percentages once the on-chain transfer to the treasury
          // confirms — identical to how a ticket sale is routed at settlement.
          const platformWallets = await base44.asServiceRole.entities.PlatformWallet.list('order', 100);
          for (const pw of platformWallets) {
            const inc = split[pw.key];
            if (inc && inc > 0) {
              await base44.asServiceRole.entities.PlatformWallet.update(pw.id, {
                ledgerBalance: +((pw.ledgerBalance || 0) + inc).toFixed(2),
              });
            }
          }
          if (draw) {
            await base44.asServiceRole.entities.Draw.update(draw.id, {
              charityContribution: +((draw.charityContribution || 0) + split.charity).toFixed(2),
              jackpotAmount: +((draw.jackpotAmount || 0) + split.jackpot_5).toFixed(2),
              reserveAllocation: +((draw.reserveAllocation || 0) + split.buffer).toFixed(2),
              reserveBalance: +((draw.reserveBalance || 0) + split.buffer).toFixed(2),
            });
          }
          await base44.asServiceRole.entities.Notification.create({
            title: 'Direct donation verified on-chain',
            type: 'treasury',
            message: `${user.full_name || user.email}: ${v.amount} ${v.token} on ${v.chain} confirmed to the treasury and split across charity, jackpot, and reserve like ticket sales.`,
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