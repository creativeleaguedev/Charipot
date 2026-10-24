import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Returns all users + their wallets for the Admin Command Center.
// The built-in User entity can only be listed by the "admin" role (platform
// restriction), so platform_admin accounts hit an empty list. This function
// elevates to the service role to fetch every user, after verifying the caller
// is either an admin or platform_admin. Wallets are returned alongside so the
// panels can render wallet-linked columns without a second privileged call.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'platform_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const [users, wallets] = await Promise.all([
      base44.asServiceRole.entities.User.list('-created_date', 500),
      base44.asServiceRole.entities.Wallet.list('-created_date', 500),
    ]);
    return Response.json({ users, wallets });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}