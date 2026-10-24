import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Admin-only: returns every PassPurchase record across all users (or a single
// user when userId is supplied), so the admin Command Center and the per-user
// history page can track each user's pass packages, timelines to expiry, and
// on-chain payment proof. PassPurchase reads are owner-scoped by RLS, so this
// service-role read is required for cross-user visibility.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'platform_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const userId = body.userId ? String(body.userId) : null;
    const list = userId
      ? await svc.entities.PassPurchase.filter({ userId })
      : await svc.entities.PassPurchase.list('-purchasedAt', 500);
    list.sort((a: any, b: any) => new Date(b.purchasedAt || 0).getTime() - new Date(a.purchasedAt || 0).getTime());
    return Response.json({ purchases: list });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}