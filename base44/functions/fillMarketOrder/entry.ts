import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { sendToken, readOnChainBalances, checkGasForTransfers } from '../../shared/walletCrypto.ts';
import { cryptoEscrowOf, subCryptoEscrow } from '../../shared/escrow.ts';

// Fills a GOV marketplace order (partial fills allowed). The buyer's crypto is
// sent DIRECTLY to the seller's wallet (peer-to-peer), not to the treasury.
//   sell order: creator = seller (GOV was reserved at creation); caller = buyer
//               paying crypto now from their available on-chain balance.
//   buy order:  creator = buyer (crypto reserved at creation on escrowChain/
//               escrowToken); caller = seller providing GOV now. The buyer's
//               reserved crypto is released and sent to the seller.
// GOV and crypto reservations are released as the fill is settled.

const CHAINS_NATIVE = { bnb: 'BNB', ethereum: 'ETH', polygon: 'MATIC' };

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const listingId = body.listingId;
    const fillAmount = Number(body.fillAmount);
    if (!listingId || !Number.isFinite(fillAmount) || fillAmount <= 0) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    const listings = await svc.entities.GovListing.filter({ id: listingId });
    const listing = listings[0];
    if (!listing) return Response.json({ error: 'Listing not found' }, { status: 404 });
    if (listing.status !== 'OPEN') return Response.json({ error: 'This order is no longer open' });

    const filled = Number(listing.filledAmount || 0);
    const totalAmount = Number(listing.amount);
    const remaining = +(totalAmount - filled).toFixed(6);
    if (fillAmount > remaining + 1e-6) {
      return Response.json({ error: `Only ${remaining} GOV remaining on this order` });
    }

    const cost = +(fillAmount * Number(listing.pricePerGov)).toFixed(6);
    const isSellOrder = !listing.side || listing.side === 'sell';
    // sell order: creator = seller, caller = buyer (pays crypto)
    // buy order:  creator = buyer,  caller = seller (provides GOV)
    const sellerId = isSellOrder ? listing.sellerId : user.id;
    const buyerId = isSellOrder ? user.id : listing.sellerId;
    const sellerName = isSellOrder ? listing.sellerName : (user.full_name || user.email);
    const buyerName = isSellOrder ? (user.full_name || user.email) : listing.sellerName;

    if (sellerId === buyerId) return Response.json({ error: "You can't trade on your own order" });

    const sellerWallets = await svc.entities.Wallet.filter({ userId: sellerId });
    const sellerWallet = sellerWallets[0];
    const buyerWallets = await svc.entities.Wallet.filter({ userId: buyerId });
    const buyerWallet = buyerWallets[0];
    if (!sellerWallet || !sellerWallet.walletAddress) return Response.json({ error: 'Seller wallet not found' });
    if (!buyerWallet || !buyerWallet.walletAddress || !buyerWallet.encryptedPrivateKey) {
      return Response.json({ error: 'Buyer wallet not found', needsWallet: true });
    }
    if (sellerWallet.isBlacklisted || buyerWallet.isBlacklisted) {
      return Response.json({ error: 'blacklisted', message: 'A wallet is blacklisted.' }, { status: 403 });
    }

    // ---- GOV sufficiency check (before any crypto moves) ----
    // sell order: GOV was reserved at creation; legacy orders (pre-escrow) fall
    //   back to the seller's spendable balance.
    // buy order: the caller (seller) must hold the GOV being sold into the bid.
    const sellerGovEscrowed = Number(sellerWallet.govEscrowed || 0);
    const sellOrderGovFromEscrow = isSellOrder && sellerGovEscrowed >= fillAmount - 1e-6;
    if (isSellOrder && !sellOrderGovFromEscrow) {
      // legacy sell order — need spendable balance
      if ((Number(sellerWallet.govBalance) || 0) < fillAmount - 1e-6) {
        return Response.json({ error: 'The seller does not have enough GOV balance to fill this order' });
      }
    }
    if (!isSellOrder) {
      if ((Number(sellerWallet.govBalance) || 0) < fillAmount - 1e-6) {
        return Response.json({ error: 'You do not have enough GOV to sell into this order' });
      }
    }

    // ---- Choose the payment chain/token ----
    let payChain = null, payToken = null;
    if (!isSellOrder && listing.escrowChain && listing.escrowToken) {
      // Buy order with reserved crypto: settle on the reserved chain/token.
      payChain = listing.escrowChain;
      payToken = listing.escrowToken;
      const chains = await readOnChainBalances(buyerWallet.walletAddress);
      const cb = chains.find((c) => c.chain === payChain);
      if (Number(cb?.balances?.[payToken] || 0) < cost - 1e-6) {
        return Response.json({ error: 'insufficient', balance: Number(cb?.balances?.[payToken] || 0), needed: cost, token: payToken, chain: payChain });
      }
    } else {
      // Sell order (buyer pays now), or legacy buy order without escrow:
      // auto-pick the buyer's chain/token whose AVAILABLE balance covers cost.
      const chains = await readOnChainBalances(buyerWallet.walletAddress);
      for (const c of chains) {
        const usdcAvail = Number(c.balances?.USDC || 0) - cryptoEscrowOf(buyerWallet, c.chain, 'USDC');
        if (usdcAvail >= cost) { payChain = c.chain; payToken = 'USDC'; break; }
        const usdtAvail = Number(c.balances?.USDT || 0) - cryptoEscrowOf(buyerWallet, c.chain, 'USDT');
        if (usdtAvail >= cost) { payChain = c.chain; payToken = 'USDT'; break; }
      }
      if (!payChain) {
        const best = chains.reduce((m, c) => Math.max(m, Number(c.balances?.USDC) || 0, Number(c.balances?.USDT) || 0), 0);
        return Response.json({ error: 'insufficient', balance: best, needed: cost });
      }
    }

    // Pre-check gas for the single settlement transfer (buyer's wallet signs).
    const gas = await checkGasForTransfers(payChain, buyerWallet.walletAddress, 1);
    if (!gas.ok) {
      return Response.json({ error: 'insufficient_gas', chain: payChain, native: CHAINS_NATIVE[payChain] || 'BNB', required: gas.required, balance: gas.nativeBalance });
    }

    // ---- On-chain settlement: buyer → seller (direct P2P) ----
    const pass = secrets.get('WALLET_ENCRYPTION_KEY');
    let tx;
    try {
      tx = await sendToken(payChain, payToken, buyerWallet.encryptedPrivateKey, sellerWallet.walletAddress, cost, pass);
    } catch (sendErr) {
      const msg = (sendErr?.message || sendErr?.shortMessage || String(sendErr)).toLowerCase();
      const isGas = /gas|intrinsic|insufficient funds|-32000|nonce|underpriced|fee/i.test(msg);
      if (isGas) return Response.json({ error: 'insufficient_gas', chain: payChain, native: CHAINS_NATIVE[payChain] || 'BNB' });
      return Response.json({ error: sendErr?.message || 'Transfer failed' });
    }

    // ---- Release escrow + move GOV ----
    if (isSellOrder) {
      if (sellOrderGovFromEscrow) {
        await svc.entities.Wallet.updateMany({ id: sellerWallet.id }, { $inc: { govEscrowed: -fillAmount } });
      } else {
        // legacy order: debit the seller's spendable GOV
        await svc.entities.Wallet.updateMany(
          { id: sellerWallet.id, govBalance: { $gte: fillAmount } },
          { $inc: { govBalance: -fillAmount } },
        );
      }
      await svc.entities.Wallet.updateMany({ id: buyerWallet.id }, { $inc: { govBalance: fillAmount } });
    } else {
      // Buy order: release the buyer's reserved crypto; move GOV seller → buyer.
      const freshBuyer = (await svc.entities.Wallet.filter({ id: buyerWallet.id }))[0] || buyerWallet;
      const newEscrow = subCryptoEscrow(freshBuyer, payChain, payToken, cost);
      await svc.entities.Wallet.update(buyerWallet.id, { cryptoEscrowed: newEscrow });
      await svc.entities.Wallet.updateMany(
        { id: sellerWallet.id, govBalance: { $gte: fillAmount } },
        { $inc: { govBalance: -fillAmount } },
      );
      await svc.entities.Wallet.updateMany({ id: buyerWallet.id }, { $inc: { govBalance: fillAmount } });
    }

    const newFilled = +(filled + fillAmount).toFixed(6);
    const fullyFilled = newFilled >= totalAmount - 1e-6;
    await svc.entities.GovListing.update(listing.id, {
      filledAmount: newFilled,
      status: fullyFilled ? 'SOLD' : 'OPEN',
      ...(fullyFilled ? { buyerId: user.id, buyerName: user.full_name || user.email, soldAt: new Date().toISOString() } : {}),
    });

    const ref = 'p2p_' + listing.id + '_' + Date.now();
    await svc.entities.GovTransaction.create({
      fromUserId: sellerId, fromName: sellerName,
      toUserId: buyerId, toName: buyerName,
      amount: fillAmount, type: 'PURCHASE',
      reference: ref, createdAt: new Date().toISOString(),
    });
    await svc.entities.GovTransaction.create({
      fromUserId: buyerId, fromName: buyerName,
      toUserId: sellerId, toName: sellerName,
      amount: cost, type: 'SALE',
      reference: ref, createdAt: new Date().toISOString(),
    });
    await svc.entities.CryptoTransaction.create({
      userId: buyerId, fullName: buyerName,
      type: 'GOV_PURCHASE', chain: payChain, token: payToken, amount: cost,
      txHash: tx.txHash, fromAddress: buyerWallet.walletAddress, toAddress: sellerWallet.walletAddress,
      status: 'PENDING', reference: ref, createdAt: new Date().toISOString(),
    });
    // Record the incoming payment for the seller so it appears in their wallet activity.
    await svc.entities.CryptoTransaction.create({
      userId: sellerId, fullName: sellerName,
      type: 'GOV_SALE', chain: payChain, token: payToken, amount: cost,
      txHash: tx.txHash, fromAddress: buyerWallet.walletAddress, toAddress: sellerWallet.walletAddress,
      status: 'CONFIRMED', reference: ref, createdAt: new Date().toISOString(),
    });

    return Response.json({
      success: true, txHash: tx.txHash, fillAmount, cost,
      chain: payChain, token: payToken, fullyFilled,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}