import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Admin-only verification gate for prize payouts. After a draw completes,
// winning prizes are held as PrizePayout records in PENDING_VERIFICATION
// status. An admin reviews each winner here and either releases the prize
// (credits the winner's wallet + records the payout transaction) or rejects
// it. If the winner's wallet or user account is blacklisted, approval is
// blocked automatically and the payout is marked BLACKLISTED.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { payoutId, action, reason } = body || {};
    if (!payoutId || !['approve', 'reject'].includes(action)) {
      return Response.json({ error: 'payoutId and action (approve|reject) are required' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    let payout;
    try {
      payout = (await svc.entities.PrizePayout.filter({ id: payoutId }))[0];
    } catch (_) {
      return Response.json({ error: 'Payout not found' }, { status: 404 });
    }
    if (!payout) return Response.json({ error: 'Payout not found' }, { status: 404 });
    if (payout.status !== 'PENDING_VERIFICATION') {
      return Response.json({ error: `Payout already ${payout.status}` }, { status: 400 });
    }

    const wallet =
      (payout.walletId && (await svc.entities.Wallet.filter({ id: payout.walletId }))[0]) ||
      (await svc.entities.Wallet.filter({ userId: payout.userId }))[0];
    if (!wallet) return Response.json({ error: 'Winner wallet not found' }, { status: 404 });
    const winnerUser = (await svc.entities.User.filter({ id: payout.userId }))[0];
    const blacklisted = !!(wallet.isBlacklisted || winnerUser?.isBlacklisted);
    const reviewer = user.full_name || user.email || 'Admin';

    if (action === 'approve') {
      if (blacklisted) {
        await svc.entities.PrizePayout.update(payout.id, {
          status: 'BLACKLISTED',
          reviewedBy: reviewer,
          reviewedAt: new Date().toISOString(),
          rejectionReason: 'Winner wallet or account is blacklisted',
        });
        await svc.entities.AuditLog.create({
          actor: reviewer, actorRole: 'admin', action: 'PAYOUT_BLACKLISTED',
          entityType: 'PrizePayout', entityId: payout.id,
          details: `Draw #${payout.drawNumber} ${payout.tier} payout of ${payout.amount} to ${payout.fullName || payout.userId} BLOCKED — winner blacklisted.`,
          timestamp: new Date().toISOString(), severity: 'critical',
        });
        return Response.json({ blacklisted: true, status: 'BLACKLISTED' });
      }

      // Release the prize: credit the winner's spendable prize balance and
      // record the payout as a confirmed on-chain movement.
      await svc.entities.Wallet.update(wallet.id, {
        prizeBalance: +((wallet.prizeBalance || 0) + payout.amount).toFixed(2),
      });
      await svc.entities.CryptoTransaction.create({
        type: 'PRIZE_PAYOUT',
        chain: 'bnb',
        token: 'USDC',
        amount: payout.amount,
        userId: payout.userId,
        fullName: payout.fullName,
        status: 'CONFIRMED',
        toAddress: wallet.walletAddress || '',
        reference: `prize_draw_${payout.drawNumber}_ticket_${payout.ticketNumber}`,
        createdAt: new Date().toISOString(),
      });
      await svc.entities.PrizePayout.update(payout.id, {
        status: 'PAID',
        reviewedBy: reviewer,
        reviewedAt: new Date().toISOString(),
      });
      await svc.entities.AuditLog.create({
        actor: reviewer, actorRole: 'admin', action: 'PAYOUT_RELEASED',
        entityType: 'PrizePayout', entityId: payout.id,
        details: `Draw #${payout.drawNumber} ${payout.tier} prize ${payout.amount} released to ${payout.fullName || payout.userId}.`,
        timestamp: new Date().toISOString(), severity: 'warning',
      });
      return Response.json({ status: 'PAID', amount: payout.amount });
    }

    // reject
    const rejReason = reason || 'Rejected by admin';
    await svc.entities.PrizePayout.update(payout.id, {
      status: 'REJECTED',
      reviewedBy: reviewer,
      reviewedAt: new Date().toISOString(),
      rejectionReason: rejReason,
    });
    await svc.entities.AuditLog.create({
      actor: reviewer, actorRole: 'admin', action: 'PAYOUT_REJECTED',
      entityType: 'PrizePayout', entityId: payout.id,
      details: `Draw #${payout.drawNumber} ${payout.tier} payout of ${payout.amount} to ${payout.fullName || payout.userId} rejected: ${rejReason}.`,
      timestamp: new Date().toISOString(), severity: 'warning',
    });
    return Response.json({ status: 'REJECTED' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}