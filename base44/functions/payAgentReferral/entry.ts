import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { sendTokenFromRawKey, checkGasForTransfers, getPendingNonce, readOnChainBalances } from '../../shared/walletCrypto.ts';
import { getCollectorKey, getCollectorAddress } from '../../shared/collectorWallet.ts';

// Admin-only on-chain payout of accrued agent referral earnings (the 2% agent
// fee share recorded on Wallet.totalReferralEarnings, which includes ticket
// referrals and the 2% pass-purchase bonus). The admin opens the Agent Payout
// panel, sees each agent's payable balance (totalReferralEarnings minus
// referralPaidOut), and clicks Pay — this function sends that amount as USDC
// from the platform collector wallet to the agent's platform-managed wallet
// address on BNB Smart Chain, records the on-chain movement, advances the
// wallet's referralPaidOut so the same earnings can never be paid twice, marks
// the agent's accrued AgentBonusRecords as PAID, and writes an audit entry.
const DIST_CHAIN = 'bnb';
const DIST_TOKEN = 'USDC';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { walletId } = body || {};
    if (!walletId) return Response.json({ error: 'walletId is required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const wallet = (await svc.entities.Wallet.filter({ id: walletId }))[0];
    if (!wallet) return Response.json({ error: 'Agent wallet not found' }, { status: 404 });

    const dest = wallet.walletAddress;
    if (!dest || !/^0x[a-fA-F0-9]{40}$/.test(dest)) {
      return Response.json({ error: 'Agent has no valid wallet address' }, { status: 400 });
    }
    if (wallet.isBlacklisted) {
      return Response.json({ error: 'Agent wallet is blacklisted — payout blocked' }, { status: 403 });
    }

    const accrued = Number(wallet.totalReferralEarnings || 0);
    const paid = Number(wallet.referralPaidOut || 0);
    const amount = +(accrued - paid).toFixed(2);
    if (amount <= 0) {
      return Response.json({ error: 'No payable referral earnings', payable: 0, accrued, paidOut: paid });
    }

    const rawKey = getCollectorKey();
    const collectorAddress = getCollectorAddress();
    if (!rawKey || !collectorAddress) {
      return Response.json({ error: 'Collector wallet not configured' }, { status: 500 });
    }

    // Confirm the collector holds enough USDC to honour the payout.
    const chains = await readOnChainBalances(collectorAddress);
    const cb = chains.find((c) => c.chain === DIST_CHAIN);
    const usdcBalance = Number(cb?.balances?.USDC ?? 0);
    if (usdcBalance < amount) {
      return Response.json({ error: 'insufficient_usdc', chain: DIST_CHAIN, required: amount, balance: usdcBalance, message: `Collector holds ${usdcBalance} USDC but the payout is ${amount} USDC. Top up the collector or wait for more purchases.` }, { status: 400 });
    }

    // Gas check (1 transfer).
    const gas = await checkGasForTransfers(DIST_CHAIN, collectorAddress, 1);
    if (!gas.ok) {
      return Response.json({ error: 'insufficient_gas', chain: DIST_CHAIN, required: gas.required, balance: gas.nativeBalance, message: 'Collector needs native BNB gas to send the payout.' }, { status: 400 });
    }

    const reviewer = user.full_name || user.email || 'Admin';
    const nonce = await getPendingNonce(DIST_CHAIN, collectorAddress);
    const tx = await sendTokenFromRawKey(DIST_CHAIN, DIST_TOKEN, rawKey, dest, amount, nonce);

    // Record the on-chain movement.
    await svc.entities.CryptoTransaction.create({
      userId: wallet.userId,
      fullName: wallet.fullName || '',
      type: 'REFERRAL',
      chain: DIST_CHAIN,
      token: DIST_TOKEN,
      amount,
      txHash: tx.txHash,
      fromAddress: collectorAddress,
      toAddress: dest,
      status: 'CONFIRMED',
      reference: `agent_referral_payout_${wallet.id}`,
      createdAt: new Date().toISOString(),
    });

    // Advance the paid-out ledger so the same earnings can never be paid twice.
    await svc.entities.Wallet.update(wallet.id, { referralPaidOut: +accrued.toFixed(2) });

    // Mark the agent's accrued referral bonus records as PAID.
    if (wallet.agentCode) {
      const records = await svc.entities.AgentBonusRecord.filter({ agentCode: wallet.agentCode, type: 'REFERRAL' });
      const open = records.filter((r: any) => r.status !== 'PAID');
      if (open.length) {
        await svc.entities.AgentBonusRecord.bulkUpdate(
          open.map((r: any) => ({ id: r.id, status: 'PAID' })),
        );
      }
    }

    await svc.entities.AuditLog.create({
      actor: reviewer, actorRole: 'admin', action: 'AGENT_REFERRAL_PAID_ONCHAIN',
      entityType: 'Wallet', entityId: wallet.id,
      details: `Referral payout of ${amount} USDC sent on-chain to agent ${wallet.fullName || wallet.userId} (${dest}). Tx: ${tx.txHash}`,
      timestamp: new Date().toISOString(), severity: 'warning',
    });

    return Response.json({ status: 'PAID', paidTxHash: tx.txHash, amount, to: dest, chain: DIST_CHAIN, token: DIST_TOKEN, explorer: tx.explorer });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}