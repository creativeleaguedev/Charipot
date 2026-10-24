import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { readOnChainBalances, checkGasForTransfers } from '../../shared/walletCrypto.ts';
import { addCryptoEscrow } from '../../shared/escrow.ts';

// Creates a GOV marketplace order and reserves (escrows) the offered asset up
// front so it cannot be spent elsewhere while the order is open:
//   sell order → reserve GOV:  debit govBalance, hold in govEscrowed.
//   buy order  → reserve crypto: pick a funded chain/token, verify gas for the
//                future settlement transfer, and record the reservation in
//                cryptoEscrowed. The chosen chain/token is stored on the listing
//                so the fill knows where to settle.
// Because the platform holds the wallet's private key, every other spend path
// (payToTreasury, withdrawCrypto, fillMarketOrder) enforces
// `available = onChain − escrowed`, making the soft reservation effective.

const CHAINS_NATIVE = { bnb: 'BNB', ethereum: 'ETH', polygon: 'MATIC' };

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const side = body.side === 'buy' ? 'buy' : 'sell';
    const amount = Number(body.amount);
    const price = Number(body.pricePerGov);
    if (!Number.isFinite(amount) || amount <= 0) return Response.json({ error: 'Enter a valid amount' }, { status: 400 });
    if (!Number.isFinite(price) || price <= 0) return Response.json({ error: 'Enter a valid price' }, { status: 400 });

    const wallets = await base44.entities.Wallet.filter({ userId: user.id });
    const wallet = wallets[0];
    if (!wallet || !wallet.walletAddress) return Response.json({ error: 'No wallet', needsWallet: true });
    if (wallet.isBlacklisted) return Response.json({ error: 'blacklisted', message: 'Your wallet is blacklisted.' }, { status: 403 });

    const total = +((amount * price).toFixed(6));
    const now = new Date().toISOString();

    if (side === 'sell') {
      // Reserve GOV atomically: only debit if the spendable balance covers it.
      const res = await svc.entities.Wallet.updateMany(
        { id: wallet.id, govBalance: { $gte: amount } },
        { $inc: { govBalance: -amount, govEscrowed: amount } },
      );
      if (!res || res.updated !== 1) {
        return Response.json({ error: 'insufficient_gov', have: Number(wallet.govBalance || 0), need: amount });
      }
      const listing = await svc.entities.GovListing.create({
        sellerId: user.id, sellerName: user.full_name || user.email,
        side: 'sell', amount, filledAmount: 0, pricePerGov: price, total,
        status: 'OPEN', createdAt: now,
      });
      return Response.json({ success: true, listing, reserved: { gov: amount } });
    }

    // Buy order: reserve crypto on a funded chain/token with enough gas.
    const chains = await readOnChainBalances(wallet.walletAddress);
    let payChain = null, payToken = null;
    for (const c of chains) {
      if (Number(c.balances?.USDC) >= total) { payChain = c.chain; payToken = 'USDC'; break; }
      if (Number(c.balances?.USDT) >= total) { payChain = c.chain; payToken = 'USDT'; break; }
    }
    if (!payChain) {
      const best = chains.reduce((m, c) => Math.max(m, Number(c.balances?.USDC) || 0, Number(c.balances?.USDT) || 0), 0);
      return Response.json({ error: 'insufficient', balance: best, needed: total });
    }
    const gas = await checkGasForTransfers(payChain, wallet.walletAddress, 1);
    if (!gas.ok) {
      return Response.json({ error: 'insufficient_gas', chain: payChain, native: CHAINS_NATIVE[payChain] || 'BNB', required: gas.required, balance: gas.nativeBalance });
    }
    // Re-fetch the wallet to avoid clobbering a concurrent reservation, then add.
    const fresh = (await base44.entities.Wallet.filter({ userId: user.id }))[0] || wallet;
    const newEscrow = addCryptoEscrow(fresh, payChain, payToken, total);
    await svc.entities.Wallet.update(wallet.id, { cryptoEscrowed: newEscrow });

    const listing = await svc.entities.GovListing.create({
      sellerId: user.id, sellerName: user.full_name || user.email,
      side: 'buy', amount, filledAmount: 0, pricePerGov: price, total,
      escrowChain: payChain, escrowToken: payToken,
      status: 'OPEN', createdAt: now,
    });
    return Response.json({ success: true, listing, reserved: { chain: payChain, token: payToken, amount: total } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}