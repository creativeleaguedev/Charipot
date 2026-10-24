import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { verifyTransferToRecipient } from '../../shared/walletCrypto.ts';

// Admin-only recording of an externally-executed on-chain prize distribution.
// The tier custody wallets (winnings_3 / winnings_4 / jackpot_5) are multi-
// signature wallets, so the platform cannot sign the transfer itself. The
// admin executes the multisig transaction through the wallet's own interface
// to send USDC from the matching custody wallet to the winner, then submits
// the resulting on-chain tx hash here. This function verifies the tx actually
// moved USDC from the tier custody wallet to the winner on BNB Smart Chain,
// records the movement, stamps the payout, and writes an audit entry. Re-
// running on an already-distributed payout (one with a paidTxHash) is
// rejected so a prize can never be recorded twice.
const DIST_CHAIN = 'bnb';

const TIER_SOURCE_KEY = {
  '3/5': 'winnings_3',
  '4/5': 'winnings_4',
  '5/5': 'jackpot_5',
};

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { payoutId, txHash } = body || {};
    if (!payoutId) return Response.json({ error: 'payoutId is required' }, { status: 400 });
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return Response.json({ error: 'txHash is required', message: 'Execute the multisig transaction to send USDC from the matching custody wallet to the winner, then paste the resulting on-chain tx hash.' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const payout = (await svc.entities.PrizePayout.filter({ id: payoutId }))[0];
    if (!payout) return Response.json({ error: 'Payout not found' }, { status: 404 });
    if (payout.status !== 'PAID') {
      return Response.json({ error: `Payout must be verified (PAID) before distribution. Current status: ${payout.status}` }, { status: 400 });
    }
    if (payout.paidTxHash) {
      return Response.json({ error: 'Payout already distributed on-chain', paidTxHash: payout.paidTxHash }, { status: 400 });
    }

    const sourceKey = TIER_SOURCE_KEY[payout.tier];
    if (!sourceKey) return Response.json({ error: `Unsupported prize tier: ${payout.tier}` }, { status: 400 });
    const sourceWallet = (await svc.entities.PlatformWallet.filter({ key: sourceKey }))[0];
    if (!sourceWallet?.address) {
      return Response.json({ error: `Source wallet '${sourceKey}' not configured` }, { status: 500 });
    }
    const sourceAddress = sourceWallet.address;

    // Resolve the winner's wallet + destination address.
    const wallet =
      (payout.walletId && (await svc.entities.Wallet.filter({ id: payout.walletId }))[0]) ||
      (await svc.entities.Wallet.filter({ userId: payout.userId }))[0];
    if (!wallet) return Response.json({ error: 'Winner wallet not found' }, { status: 404 });
    const dest = wallet.walletAddress;
    if (!dest || !/^0x[a-fA-F0-9]{40}$/.test(dest)) {
      return Response.json({ error: 'Winner has no valid wallet address' }, { status: 400 });
    }
    if (wallet.isBlacklisted) {
      return Response.json({ error: 'Winner wallet is blacklisted — distribution blocked' }, { status: 403 });
    }

    const amount = Number(payout.amount || 0);
    if (amount <= 0) return Response.json({ error: 'Payout amount is zero' }, { status: 400 });

    // Verify the multisig transaction on-chain: the receipt must exist and
    // succeed, and it must contain a USDC Transfer from the tier custody wallet
    // to the winner of at least the prize amount.
    const v = await verifyTransferToRecipient(DIST_CHAIN, txHash, dest);
    if (v.pending) {
      return Response.json({ error: 'tx_pending', txHash, message: 'Transaction not found or not confirmed on-chain yet. Wait for BNB confirmations and submit again.' }, { status: 400 });
    }
    if (v.failed) {
      return Response.json({ error: 'tx_failed', txHash, message: 'The on-chain transaction reverted.' }, { status: 400 });
    }
    if (!v.token) {
      return Response.json({ error: 'no_transfer_to_winner', txHash, winner: dest, message: `No USDC transfer to the winner (${dest}) found in this transaction.` }, { status: 400 });
    }
    if (v.token !== 'USDC' && v.token !== 'USDT') {
      return Response.json({ error: 'wrong_token', txHash, token: v.token, message: `Expected a USDC or USDT transfer but the transfer was ${v.token || 'an unsupported token'}.` }, { status: 400 });
    }
    const token = v.token;
    if (v.fromAddress.toLowerCase() !== sourceAddress.toLowerCase()) {
      return Response.json({ error: 'wrong_source', txHash, expectedFrom: sourceAddress, actualFrom: v.fromAddress, message: `Transfer came from ${v.fromAddress}, not the ${sourceKey} custody wallet (${sourceAddress}).` }, { status: 400 });
    }
    if (Number(v.amount) < amount) {
      return Response.json({ error: 'insufficient_amount', txHash, expected: amount, actual: v.amount, message: `Transfer sent ${v.amount} ${token} but the prize is ${amount} ${token}.` }, { status: 400 });
    }

    const reviewer = user.full_name || user.email || 'Admin';

    // Record the on-chain movement.
    await svc.entities.CryptoTransaction.create({
      userId: payout.userId,
      fullName: payout.fullName,
      type: 'PRIZE_PAYOUT',
      chain: DIST_CHAIN,
      token,
      amount,
      txHash,
      fromAddress: sourceAddress,
      toAddress: dest,
      status: 'CONFIRMED',
      reference: `prize_draw_${payout.drawNumber}_ticket_${payout.ticketNumber}`,
      createdAt: new Date().toISOString(),
    });

    // Stamp the payout with the on-chain tx hash.
    await svc.entities.PrizePayout.update(payout.id, { paidTxHash: txHash });

    await svc.entities.AuditLog.create({
      actor: reviewer, actorRole: 'admin', action: 'PRIZE_DISTRIBUTED_ONCHAIN',
      entityType: 'PrizePayout', entityId: payout.id,
      details: `Draw #${payout.drawNumber} ${payout.tier} prize of ${amount} ${token} sent via multisig from ${sourceWallet.label || sourceKey} (${sourceAddress}) to ${payout.fullName || payout.userId} (${dest}). Tx: ${txHash}`,
      timestamp: new Date().toISOString(), severity: 'warning',
    });

    return Response.json({ status: 'PAID', paidTxHash: txHash, amount, to: dest, from: sourceAddress, chain: DIST_CHAIN, token });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}