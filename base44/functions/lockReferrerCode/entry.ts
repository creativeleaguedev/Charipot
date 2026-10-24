import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Locks the caller's referrer (the agent whose invitation code introduced them).
// The referrer is permanent: once set on the wallet it cannot be changed. The
// code is validated against existing agent codes, or accepted as the house code.
// Stored on the wallet so every subsequent ticket attributes its 2% referral
// (and 1% winning bonus) to this agent.
const HOUSE_CODE = 'ROTARY-DEN-33';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!code) return Response.json({ error: 'Enter a referral code' }, { status: 400 });

    const wallets = await svc.entities.Wallet.filter({ userId: user.id });
    const wallet = wallets[0];
    if (!wallet) return Response.json({ error: 'No wallet found' }, { status: 404 });

    // Permanent: once locked the referrer cannot be changed.
    if (wallet.referrerCode && wallet.referrerCode.trim() !== '') {
      return Response.json({ error: 'already_locked', referrerCode: wallet.referrerCode });
    }

    // Validate the code against existing agent codes, or accept the house code.
    if (code !== HOUSE_CODE) {
      const found = await svc.entities.Wallet.filter({ agentCode: code });
      if (!found.length) return Response.json({ error: 'invalid_code' });
      if (found[0].userId === user.id) return Response.json({ error: 'own_code' });
    }

    await svc.entities.Wallet.update(wallet.id, { referrerCode: code });
    return Response.json({ success: true, referrerCode: code });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}