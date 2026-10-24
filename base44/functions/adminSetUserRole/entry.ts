import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Change a user's role from the Admin Command Center.
// The built-in User entity can only be mutated by the "admin" role directly,
// so this elevates to the service role after verifying the caller is an admin
// or platform_admin. Allowed target roles: "user" and "admin".
// Writes an AuditLog entry and returns the updated user (minus sensitive fields).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (caller.role !== 'admin' && caller.role !== 'platform_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await req.json();
    const { userId, role } = body || {};
    if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });
    const ALLOWED = ['user', 'admin'];
    if (!ALLOWED.includes(role)) {
      return Response.json({ error: `role must be one of: ${ALLOWED.join(', ')}` }, { status: 400 });
    }
    // Prevent self-demotion lockout: don't let an admin remove their own admin role.
    if (userId === caller.id) {
      return Response.json({ error: 'You cannot change your own role' }, { status: 400 });
    }

    const updated = await base44.asServiceRole.entities.User.update(userId, { role });
    await base44.asServiceRole.entities.AuditLog.create({
      actor: caller.full_name || caller.email || 'Admin',
      actorRole: caller.role,
      action: 'USER_ROLE_CHANGED',
      entityType: 'User',
      entityId: userId,
      details: `Set ${updated?.email || userId} role to "${role}"`,
      timestamp: new Date().toISOString(),
      severity: 'critical',
    });
    return Response.json({
      ok: true,
      user: {
        id: updated.id,
        email: updated.email,
        full_name: updated.full_name,
        role: updated.role,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}