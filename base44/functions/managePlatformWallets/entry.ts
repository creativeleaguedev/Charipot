import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { readOnChainBalances } from '../../shared/walletCrypto.ts';
import { getCollectorAddress } from '../../shared/collectorWallet.ts';
import { pendingAllocationTotal, DESTINATION_KEYS } from '../../shared/allocationLedger.ts';

// Admin operation for the 7 platform wallets. Runs as the service role (bypasses
// the admin-only RLS on PlatformWallet), validates EVM custody addresses, and
// writes every change to the audit log. The Admin Center UI is the front gate;
// this function is the data gatekeeper.
//   action: "list"   -> returns every wallet with its current address + ledger
//   action: "update" -> { walletId, address } validates + sets the custody address
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === 'list') {
      const wallets = await svc.entities.PlatformWallet.list('order', 100);
      const out = wallets.map((w: any) => ({
        id: w.id,
        key: w.key,
        label: w.label,
        description: w.description,
        category: w.category,
        isPublic: w.isPublic,
        address: w.address || '',
        ledgerBalance: w.ledgerBalance || 0,
        autoRolloverAmount: w.autoRolloverAmount || 0,
        order: w.order || 0,
      }));

      // Collector status for the distribution dashboard: live on-chain balance,
      // current-cycle pending allocation, threshold, and ready/accumulating
      // status. The pending allocation is the sum of the seven destination
      // wallets' ledgerBalances (the amount the next sweep will distribute).
      const collectorAddr = getCollectorAddress();
      let collectorBalance = 0;
      let collectorUsdc = 0;
      let collectorUsdt = 0;
      if (collectorAddr) {
        try {
          const ch = (await readOnChainBalances(collectorAddr)).find((c) => c.chain === 'bnb');
          collectorUsdc = Number(ch?.balances?.USDC ?? 0);
          collectorUsdt = Number(ch?.balances?.USDT ?? 0);
          collectorBalance = +(collectorUsdc + collectorUsdt).toFixed(2);
        } catch (_) {}
      }
      const pendingAllocation = pendingAllocationTotal(wallets);

      // Recent completed sweep cycles (permanent distribution history).
      const sweepHistory = await svc.entities.SweepRecord.list('-cycleNumber', 10);

      return Response.json({
        wallets: out,
        collector: { address: collectorAddr, balance: collectorBalance, usdc: collectorUsdc, usdt: collectorUsdt, threshold: 10, pendingAllocation, ready: collectorBalance >= 10 },
        sweepHistory,
      });
    }

    if (action === 'update') {
      const { walletId, address } = body;
      if (!walletId) return Response.json({ error: 'walletId required' }, { status: 400 });
      const addr = String(address || '').trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        return Response.json({ error: 'Invalid EVM address' }, { status: 400 });
      }
      const wallets = await svc.entities.PlatformWallet.list('order', 100);
      const w = wallets.find((x: any) => x.id === walletId);
      if (!w) return Response.json({ error: 'Wallet not found' }, { status: 404 });

      await svc.entities.PlatformWallet.update(walletId, { address: addr });
      await svc.entities.AuditLog.create({
        actor: user.full_name || user.email || 'Admin',
        actorRole: user.role || 'admin',
        action: 'WALLET_ADDRESS_UPDATED',
        entityType: 'PlatformWallet',
        entityId: walletId,
        details: `${w.label} custody address set to ${addr.slice(0, 8)}…${addr.slice(-6)}`,
        timestamp: new Date().toISOString(),
        severity: 'warning',
      });
      return Response.json({ success: true, walletId, address: addr });
    }

    if (action === 'setBufferRollover') {
      const amount = Math.max(0, Number(body.amount) || 0);
      const wallets = await svc.entities.PlatformWallet.list('order', 100);
      const buf = wallets.find((x: any) => x.key === 'buffer');
      if (!buf) return Response.json({ error: 'Buffer wallet not found' }, { status: 404 });
      await svc.entities.PlatformWallet.update(buf.id, { autoRolloverAmount: +amount.toFixed(2) });
      await svc.entities.AuditLog.create({
        actor: user.full_name || user.email || 'Admin',
        actorRole: user.role || 'admin',
        action: 'BUFFER_ROLLOVER_SET',
        entityType: 'PlatformWallet',
        entityId: buf.id,
        details: `Per-draw buffer auto-rollover set to $${amount.toFixed(2)} (into the 5/5 jackpot wallet).`,
        timestamp: new Date().toISOString(),
        severity: 'warning',
      });
      return Response.json({ success: true, autoRolloverAmount: +amount.toFixed(2) });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}