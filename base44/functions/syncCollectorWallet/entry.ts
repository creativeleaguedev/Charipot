import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { getCollectorAddress } from '../../shared/collectorWallet.ts';

// One-time setup: exposes the platform collector wallet (the address derived
// from COLLECTOR_WALLET_PRIVATE_KEY, where every payment first lands on-chain)
// as a public PlatformWallet record so it shows on the public wallets page.
// Idempotent — safe to run repeatedly.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const address = getCollectorAddress();
    if (!address) {
      return Response.json({ error: 'Collector wallet not configured' }, { status: 500 });
    }

    const list = await svc.entities.PlatformWallet.list('order', 100);
    const existing = list.find((w) => w.address && w.address.toLowerCase() === address.toLowerCase());

    if (existing) {
      if (!existing.isPublic) {
        await svc.entities.PlatformWallet.update(existing.id, {
          isPublic: true,
          description: existing.description || 'The platform deposit address where every ticket, donation and pass-purchase payment first lands on-chain before being swept to the custody wallets.',
        });
        return Response.json({ success: true, action: 'publicized', id: existing.id, address });
      }
      return Response.json({ success: true, action: 'exists', id: existing.id, address });
    }

    const created = await svc.entities.PlatformWallet.create({
      key: 'collector',
      label: 'Platform Collector Wallet',
      category: 'reserve',
      address,
      isPublic: true,
      description: 'The platform deposit address where every ticket, donation and pass-purchase payment first lands on-chain before being swept to the custody wallets.',
      ledgerBalance: 0,
      order: 0,
    });
    return Response.json({ success: true, action: 'created', id: created.id, address });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}