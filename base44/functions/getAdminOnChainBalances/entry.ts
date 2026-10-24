import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { readOnChainBalances } from '../../shared/walletCrypto.ts';

// Admin-only: reads live USDC/USDT/native balances for ANY user's
// platform-managed wallet (by walletId), caches the snapshot on the Wallet
// entity, and returns the per-chain balances. Used by the Admin Command
// Center to show a user's real on-chain balance instead of summing deposits.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const walletId = String(body.walletId || '');
    if (!walletId) return Response.json({ error: 'walletId is required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const wallet = await svc.entities.Wallet.get(walletId);
    if (!wallet) return Response.json({ error: 'Wallet not found' }, { status: 404 });
    if (!wallet.walletAddress) return Response.json({ error: 'This wallet has no on-chain address' }, { status: 400 });

    const chains = await readOnChainBalances(wallet.walletAddress);
    const now = new Date().toISOString();
    await svc.entities.Wallet.update(wallet.id, {
      cryptoBalances: JSON.stringify(chains),
      lastSyncAt: now,
    });

    return Response.json({ address: wallet.walletAddress, chains, lastSyncAt: now });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}