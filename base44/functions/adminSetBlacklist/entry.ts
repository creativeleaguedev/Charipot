import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Blacklist or unblacklist a User or Wallet from the Admin Command Center.
// The built-in User entity can only be mutated by the "admin" role directly,
// so this elevates to the service role after verifying the caller is an admin
// or platform_admin. Writes an AuditLog entry and returns the updated record.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'platform_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await req.json();
    const { targetType, targetId, blacklisted, reason } = body || {};
    if (!targetId || !targetType) return Response.json({ error: 'targetType and targetId required' }, { status: 400 });

    const now = new Date().toISOString();
    const patch = blacklisted
      ? { isBlacklisted: true, blacklistReason: reason || '', blacklistedAt: now }
      : { isBlacklisted: false, blacklistReason: '', blacklistedAt: '' };

    let updated;
    if (targetType === 'user') {
      updated = await base44.asServiceRole.entities.User.update(targetId, patch);
      await base44.asServiceRole.entities.AuditLog.create({
        actor: user.full_name || user.email || 'Admin', actorRole: user.role,
        action: blacklisted ? 'USER_BLACKLISTED' : 'USER_UNBLACKLISTED',
        entityType: 'User', entityId: targetId,
        details: `${blacklisted ? 'Blacklisted' : 'Unblacklisted'} ${updated?.email || targetId}${blacklisted ? ': ' + (reason || '') : ''}`,
        timestamp: now, severity: blacklisted ? 'critical' : 'info',
      });
    } else if (targetType === 'wallet') {
      updated = await base44.asServiceRole.entities.Wallet.update(targetId, patch);
      await base44.asServiceRole.entities.AuditLog.create({
        actor: user.full_name || user.email || 'Admin', actorRole: user.role,
        action: blacklisted ? 'WALLET_BLACKLISTED' : 'WALLET_UNBLACKLISTED',
        entityType: 'Wallet', entityId: targetId,
        details: `${blacklisted ? 'Blacklisted' : 'Unblacklisted'} wallet ${updated?.walletAddress || targetId}${blacklisted ? ': ' + (reason || '') : ''}`,
        timestamp: now, severity: blacklisted ? 'critical' : 'info',
      });
    } else {
      return Response.json({ error: 'targetType must be user or wallet' }, { status: 400 });
    }
    return Response.json({ ok: true, updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}