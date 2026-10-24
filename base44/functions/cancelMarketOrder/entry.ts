import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { subCryptoEscrow } from '../../shared/escrow.ts';

// Cancels one of the caller's open marketplace orders and releases the reserved
// (escrowed) asset back to their available balance:
//   sell order → return the remaining reserved GOV to govBalance.
//   buy order  → release the remaining reserved crypto from cryptoEscrowed.
// Only the order creator can cancel; only OPEN orders can be cancelled.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const listingId = body.listingId;
    if (!listingId) return Response.json({ error: 'listingId required' }, { status: 400 });

    const listings = await svc.entities.GovListing.filter({ id: listingId });
    const listing = listings[0];
    if (!listing) return Response.json({ error: 'Listing not found' }, { status: 404 });
    if (listing.sellerId !== user.id) return Response.json({ error: 'You can only cancel your own order' }, { status: 403 });
    if (listing.status !== 'OPEN') return Response.json({ error: 'Order is no longer open' });

    const remaining = +(Number(listing.amount) - Number(listing.filledAmount || 0)).toFixed(6);
    const isSellOrder = !listing.side || listing.side === 'sell';

    if (remaining > 0) {
      const wallets = await svc.entities.Wallet.filter({ userId: user.id });
      const wallet = wallets[0];
      if (isSellOrder) {
        // Return reserved GOV to spendable balance.
        await svc.entities.Wallet.updateMany(
          { id: wallet.id, govEscrowed: { $gte: remaining } },
          { $inc: { govBalance: remaining, govEscrowed: -remaining } },
        );
      } else if (listing.escrowChain && listing.escrowToken) {
        const cost = +(remaining * Number(listing.pricePerGov)).toFixed(6);
        const fresh = (await svc.entities.Wallet.filter({ id: wallet.id }))[0] || wallet;
        const newEscrow = subCryptoEscrow(fresh, listing.escrowChain, listing.escrowToken, cost);
        await svc.entities.Wallet.update(wallet.id, { cryptoEscrowed: newEscrow });
      }
    }

    await svc.entities.GovListing.update(listing.id, { status: 'CANCELLED' });
    return Response.json({
      success: true,
      released: isSellOrder
        ? { gov: remaining }
        : { chain: listing.escrowChain, token: listing.escrowToken, amount: +(remaining * Number(listing.pricePerGov)).toFixed(6) },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}