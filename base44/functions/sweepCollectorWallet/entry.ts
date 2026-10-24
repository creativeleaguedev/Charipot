import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { sendTokenFromRawKey, readOnChainBalances, checkGasForTransfers, getPendingNonce } from '../../shared/walletCrypto.ts';
import { getCollectorKey, getCollectorAddress } from '../../shared/collectorWallet.ts';
import { resetPendingAllocations, DESTINATION_KEYS } from '../../shared/allocationLedger.ts';
import { computeWalletPercents } from '../../shared/walletAllocations.ts';

// Sweeps the platform collector wallet on BNB. Every payment (ticket purchase,
// pass purchase, donation) first lands in the collector and credits each
// custody wallet's "Allocated to Date" (pending allocation) ledger at purchase
// time — see creditPendingAllocations. The on-chain money stays in the
// collector until EITHER its USDC or USDT balance reaches $10. At that point
// this function distributes the ACCUMULATED pending-allocation ledgers to the
// seven custody wallets on-chain (proportional per token so the full collector
// balance is always cleared), records a permanent SweepRecord, then resets all
// destination ledgers to zero so the next cycle starts fresh. Also invokable
// manually from the Admin Center.
const DEFAULT_SWEEP_THRESHOLD = 10;
const SWEEP_CHAIN = 'bnb';
const NATIVE = 'BNB';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const rawKey = getCollectorKey();
    const collectorAddress = getCollectorAddress();
    if (!rawKey || !collectorAddress) {
      return Response.json({ error: 'Collector wallet not configured' }, { status: 500 });
    }

    // Sweep threshold is admin-configurable via the Config Registry
    // (key: sweep_threshold). Falls back to 10 USD if unset or invalid.
    const cfgParams = await svc.entities.ConfigParameter.list('-key', 100);
    const sweepParam = cfgParams.find((p) => p.key === 'sweep_threshold');
    const SWEEP_THRESHOLD = Number(sweepParam?.value) > 0 ? Number(sweepParam.value) : DEFAULT_SWEEP_THRESHOLD;

    // Live on-chain USDC/USDT balance of the collector on BNB.
    const chains = await readOnChainBalances(collectorAddress);
    const cb = chains.find((c) => c.chain === SWEEP_CHAIN);
    const usdc = Number(cb?.balances?.USDC ?? 0);
    const usdt = Number(cb?.balances?.USDT ?? 0);
    const total = +(usdc + usdt).toFixed(2);
    const triggered = usdc >= SWEEP_THRESHOLD || usdt >= SWEEP_THRESHOLD;
    if (!triggered) {
      return Response.json({ swept: false, balance: total, usdc, usdt, threshold: SWEEP_THRESHOLD, chain: SWEEP_CHAIN });
    }

    // Destination custody wallets + their accumulated pending-allocation ledgers.
    const platformWallets = await svc.entities.PlatformWallet.list('order', 100);
    const byKey = {};
    platformWallets.forEach((pw) => { byKey[pw.key] = pw; });

    const destWallets = DESTINATION_KEYS.map((k) => byKey[k]).filter(Boolean);
    const totalLedger = +destWallets.reduce((s, w) => s + (w.ledgerBalance || 0), 0).toFixed(4);

    // If the ledgers are empty (e.g. funds arrived without crediting), fall back
    // to a clean percentage split so the collector is never stuck.
    const useFallback = totalLedger <= 0;
    const ledgerShare = (key) => (useFallback ? null : (byKey[key]?.ledgerBalance || 0) / totalLedger);

    // Tokens to distribute.
    const tokens = [];
    if (usdc > 0) tokens.push({ sym: 'USDC', balance: usdc });
    if (usdt > 0) tokens.push({ sym: 'USDT', balance: usdt });

    // Pre-check gas for the planned transfers (1 per destination wallet per token,
    // plus a residual to treasury per token).
    const nTransfers = tokens.length * (DESTINATION_KEYS.length + 1);
    const gas = await checkGasForTransfers(SWEEP_CHAIN, collectorAddress, nTransfers);
    if (!gas.ok) {
      return Response.json({ error: 'insufficient_gas', chain: SWEEP_CHAIN, native: NATIVE, required: gas.required, balance: gas.nativeBalance, transfers: nTransfers });
    }

    const results = [];
    let nonceCursor = await getPendingNonce(SWEEP_CHAIN, collectorAddress);

    for (const { sym, balance } of tokens) {
      // Per-token, each destination wallet receives a share proportional to its
      // pending-allocation ledger — so the full token balance is cleared and each
      // wallet's USD total matches its ledger (rounding dust → treasury).
      let accounted = 0;
      for (const key of DESTINATION_KEYS) {
        const pw = byKey[key];
        const addr = pw?.address;
        if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) continue;
        if (addr.toLowerCase() === collectorAddress.toLowerCase()) continue;
        const frac = useFallback ? null : ledgerShare(key);
        const amt = useFallback
          ? +((balance * (computeWalletPercents()[key] || 0)) / 100).toFixed(4)
          : +((frac * balance)).toFixed(4);
        if (amt <= 0) continue;
        try {
          const tx = await sendTokenFromRawKey(SWEEP_CHAIN, sym, rawKey, addr, amt, nonceCursor++);
          await svc.entities.CryptoTransaction.create({
            userId: 'platform',
            fullName: 'Platform Sweep',
            type: 'FEE',
            chain: SWEEP_CHAIN,
            token: sym,
            amount: amt,
            txHash: tx.txHash,
            fromAddress: collectorAddress,
            toAddress: addr,
            status: 'PENDING',
            reference: `sweep:${key}`,
            createdAt: new Date().toISOString(),
          });
          accounted = +(accounted + amt).toFixed(4);
          results.push({ key, token: sym, amount: amt, txHash: tx.txHash, address: addr });
        } catch (e) {
          return Response.json({ error: 'sweep_partial', token: sym, results, message: e?.message || 'Transfer failed' });
        }
      }
      // Roll rounding residual into treasury.
      const residual = +(balance - accounted).toFixed(4);
      if (residual > 0) {
        const pw = byKey['treasury'];
        const addr = pw?.address;
        if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr) && addr.toLowerCase() !== collectorAddress.toLowerCase()) {
          try {
            const tx = await sendTokenFromRawKey(SWEEP_CHAIN, sym, rawKey, addr, residual, nonceCursor++);
            await svc.entities.CryptoTransaction.create({
              userId: 'platform',
              fullName: 'Platform Sweep',
              type: 'FEE',
              chain: SWEEP_CHAIN,
              token: sym,
              amount: residual,
              txHash: tx.txHash,
              fromAddress: collectorAddress,
              toAddress: addr,
              status: 'PENDING',
              reference: 'sweep:treasury_residual',
              createdAt: new Date().toISOString(),
            });
            results.push({ key: 'treasury', token: sym, amount: residual, txHash: tx.txHash, address: addr, residual: true });
          } catch (e) {
            return Response.json({ error: 'sweep_partial', token: sym, results, message: e?.message || 'Residual transfer failed' });
          }
        }
      }
    }

    const totalDistributed = +results.reduce((s, r) => s + r.amount, 0).toFixed(4);

    // Record a permanent sweep-history entry.
    const sweepCount = await svc.entities.SweepRecord.list('-cycleNumber', 1);
    const nextCycle = ((sweepCount[0]?.cycleNumber || 0) + 1);
    await svc.entities.SweepRecord.create({
      cycleNumber: nextCycle,
      sweptAt: new Date().toISOString(),
      chain: SWEEP_CHAIN,
      collectorBalance: total,
      usdc,
      usdt,
      totalDistributed,
      transfers: JSON.stringify(results),
      status: 'COMPLETED',
      triggeredBy: 'auto',
    });
    await svc.entities.AuditLog.create({
      actor: 'System', actorRole: 'system', action: 'COLLECTOR_SWEEP_COMPLETED',
      entityType: 'SweepRecord', details: `Sweep cycle #${nextCycle}: ${fmtUSD(total)} distributed across ${DESTINATION_KEYS.length} custody wallets. Ledgers reset to 0.`,
      timestamp: new Date().toISOString(), severity: 'warning',
    });

    // Close the cycle: reset every destination wallet's pending allocation to 0.
    await resetPendingAllocations(svc);

    return Response.json({ swept: true, balance: total, chain: SWEEP_CHAIN, cycleNumber: nextCycle, splits: results, totalDistributed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function fmtUSD(n) { return `$${Number(n).toFixed(2)}`; }