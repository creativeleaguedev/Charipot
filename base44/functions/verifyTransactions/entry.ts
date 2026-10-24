import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getTxStatus } from '../../shared/walletCrypto.ts';

// Verifies the user's PENDING transactions (withdrawals and any others with a
// txHash) against the blockchain explorer source of truth for each chain. For
// each pending record it fetches the on-chain receipt: status 1 => CONFIRMED
// (Success), status 0 => FAILED, no receipt yet => stays PENDING. Updated
// statuses persist so the Recent Transactions list reflects real on-chain
// outcome.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const pending = await base44.entities.CryptoTransaction.filter({
      userId: user.id,
      status: 'PENDING',
    });

    let updated = 0;
    const results = [];
    for (const tx of pending) {
      if (!tx.txHash) continue;
      const st = await getTxStatus(tx.chain, tx.txHash);
      if (st.pending) {
        results.push({ id: tx.id, txHash: tx.txHash, status: 'PENDING' });
        continue;
      }
      const newStatus = st.confirmed ? 'CONFIRMED' : 'FAILED';
      await base44.entities.CryptoTransaction.update(tx.id, {
        status: newStatus,
        blockNumber: st.blockNumber ?? tx.blockNumber,
      });
      updated++;
      results.push({ id: tx.id, txHash: tx.txHash, status: newStatus });
    }

    return Response.json({ checked: results.length, updated, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}