import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { getCollectorAddress, getCollectorKey } from '../../shared/collectorWallet.ts';

// Admin-only diagnostic: returns the on-chain address derived from the
// COLLECTOR_WALLET_PRIVATE_KEY secret (never exposes the key itself), so the
// admin can confirm the secret matches the intended collector address.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const hasKey = !!getCollectorKey();
    const address = getCollectorAddress();
    return Response.json({ hasKey, address });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}