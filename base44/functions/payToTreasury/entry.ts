import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets, waitUntil } from 'base44:runtime';
import { sendToken, readOnChainBalances, checkGasForTransfers } from '../../shared/walletCrypto.ts';
import { cryptoEscrowOf } from '../../shared/escrow.ts';
import { getCollectorAddress } from '../../shared/collectorWallet.ts';
import { computeAmountShares } from '../../shared/walletAllocations.ts';
import { creditPendingAllocations } from '../../shared/allocationLedger.ts';

// Charges the user's crypto wallet for a paid platform action (ticket purchase,
// pass purchase, donation). For ticket purchases with an attributed agent, the
// 2% agent referral is paid FIRST directly to the agent's personal wallet
// on-chain; the remaining amount then goes to the platform collector wallet.
// When there is no attributed agent, the full amount goes to the collector.
// The collector balance is auto-swept to the custody wallets once it reaches
// $10 on BNB — see sweepCollectorWallet.
const CHAINS_NATIVE = { bnb: 'BNB', ethereum: 'ETH', polygon: 'MATIC' };
const HOUSE_CODE = 'ROTARY-DEN-33';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    const chain = body.chain || 'bnb';
    const token = body.token || 'USDC';
    const purpose = body.purpose || 'LOTTERY_BUY';
    const reference = body.reference || '';
    const agentCode = typeof body.agentCode === 'string' ? body.agentCode.trim() : '';
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const wallets = await base44.entities.Wallet.filter({ userId: user.id });
    const wallet = wallets[0];
    if (!wallet || !wallet.walletAddress) {
      return Response.json({ error: 'No wallet', needsWallet: true });
    }
    if (user.isBlacklisted || wallet.isBlacklisted) {
      return Response.json({ error: 'blacklisted', message: 'Your account or wallet is blacklisted and cannot perform this payment.' }, { status: 403 });
    }

    const collectorAddress = getCollectorAddress();
    if (!collectorAddress || !/^0x[a-fA-F0-9]{40}$/.test(collectorAddress)) {
      return Response.json({ error: 'Collector wallet not configured' }, { status: 500 });
    }

    // Resolve the attributed agent's personal wallet so the 2% referral can be
    // paid directly to the agent on-chain. Falls back to "no agent" (full amount
    // to collector) when there is no agent, the agent has no on-chain wallet, or
    // the agent is the buyer (self-referral).
    let agentWallet = null;
    let agentDestAddr = null;
    if (agentCode && agentCode !== HOUSE_CODE) {
      const found = await svc.entities.Wallet.filter({ agentCode });
      agentWallet = found[0] || null;
      if (agentWallet?.walletAddress &&
          /^0x[a-fA-F0-9]{40}$/.test(agentWallet.walletAddress) &&
          agentWallet.walletAddress.toLowerCase() !== wallet.walletAddress.toLowerCase()) {
        agentDestAddr = agentWallet.walletAddress;
      }
    }

    // 2% agent referral (paid directly to the agent); remainder to collector.
    const shares = computeAmountShares(amount, {});
    const agentAmount = agentDestAddr ? +shares.agent_fee.toFixed(4) : 0;
    const collectorAmount = +(amount - agentAmount).toFixed(4);

    // Live on-chain balance check (source of truth).
    const chains = await readOnChainBalances(wallet.walletAddress);
    const cb = chains.find((c) => c.chain === chain);
    const onChain = Number(cb?.balances?.[token] ?? 0);
    const escrowed = cryptoEscrowOf(wallet, chain, token);
    const bal = +(onChain - escrowed).toFixed(6);
    if (bal < amount) {
      return Response.json({ error: 'insufficient', balance: bal, needed: amount, token, chain, escrowed });
    }

    const nTransfers = (agentAmount > 0 ? 1 : 0) + (collectorAmount > 0 ? 1 : 0);
    const gas = await checkGasForTransfers(chain, wallet.walletAddress, nTransfers);
    if (!gas.ok) {
      const native = CHAINS_NATIVE[chain] || 'BNB';
      return Response.json({ error: 'insufficient_gas', chain, native, required: gas.required, balance: gas.nativeBalance, transfers: nTransfers });
    }

    const pass = secrets.get('WALLET_ENCRYPTION_KEY');
    const results = [];
    const now = new Date().toISOString();

    // 1) Pay the agent referral directly to the agent's personal wallet.
    if (agentAmount > 0 && agentDestAddr) {
      let tx;
      try {
        tx = await sendToken(chain, token, wallet.encryptedPrivateKey, agentDestAddr, agentAmount, pass);
      } catch (sendErr) {
        const msg = (sendErr?.message || sendErr?.shortMessage || String(sendErr)).toLowerCase();
        const isGas = /gas|intrinsic|insufficient funds|-32000|nonce|underpriced|fee/i.test(msg);
        const native = CHAINS_NATIVE[chain] || 'BNB';
        if (isGas) return Response.json({ error: 'insufficient_gas', chain, native });
        return Response.json({ error: sendErr?.message || 'Agent transfer failed' });
      }
      await base44.entities.CryptoTransaction.create({
        userId: user.id,
        fullName: user.full_name || user.email,
        type: 'REFERRAL',
        chain, token, amount: agentAmount,
        txHash: tx.txHash,
        fromAddress: wallet.walletAddress,
        toAddress: agentDestAddr,
        status: 'PENDING',
        reference: reference ? `${reference}:agent` : 'agent',
        createdAt: now,
      });
      // Inbound REFERRAL record for the agent so it appears in their activity feed.
      if (agentWallet) {
        await svc.entities.CryptoTransaction.create({
          userId: agentWallet.userId,
          fullName: agentWallet.fullName || '',
          type: 'REFERRAL',
          chain, token, amount: agentAmount,
          txHash: tx.txHash,
          fromAddress: wallet.walletAddress,
          toAddress: agentDestAddr,
          status: 'PENDING',
          reference: 'referral',
          createdAt: now,
        });
      }
      results.push({ wallet: 'agent', address: agentDestAddr, amount: agentAmount, txHash: tx.txHash });
    }

    // 2) Send the remaining amount to the collector wallet.
    let collectorTx;
    try {
      collectorTx = await sendToken(chain, token, wallet.encryptedPrivateKey, collectorAddress, collectorAmount, pass);
    } catch (sendErr) {
      const msg = (sendErr?.message || sendErr?.shortMessage || String(sendErr)).toLowerCase();
      const isGas = /gas|intrinsic|insufficient funds|-32000|nonce|underpriced|fee/i.test(msg);
      const native = CHAINS_NATIVE[chain] || 'BNB';
      if (isGas) return Response.json({ error: 'insufficient_gas', chain, native, partial: results });
      return Response.json({ error: sendErr?.message || 'Transfer failed', partial: results });
    }
    await base44.entities.CryptoTransaction.create({
      userId: user.id,
      fullName: user.full_name || user.email,
      type: purpose,
      chain, token, amount: collectorAmount,
      txHash: collectorTx.txHash,
      fromAddress: wallet.walletAddress,
      toAddress: collectorAddress,
      status: 'PENDING',
      reference: reference || 'collector',
      createdAt: now,
    });
    results.push({ wallet: 'collector', address: collectorAddress, amount: collectorAmount, txHash: collectorTx.txHash });

    // Credit each custody wallet's "Allocated to Date" (pending allocation) with
    // its fixed share of the amount that entered the collector. The on-chain
    // money stays in the collector until the $10 sweep threshold; the sweep then
    // distributes these accumulated ledgers to the custody wallets on-chain.
    await creditPendingAllocations(svc, collectorAmount);

    // Trigger an automatic sweep of the collector wallet (BNB) after the
    // response. No-op below the $10 threshold.
    waitUntil(base44.functions.invoke('sweepCollectorWallet', {}).catch(() => null));

    return Response.json({
      success: true,
      amount,
      chain,
      token,
      destinationAddress: collectorAddress,
      txHash: collectorTx.txHash,
      splits: results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}