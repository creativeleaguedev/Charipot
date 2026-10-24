import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { scanIncomingTransfers } from '../../shared/walletCrypto.ts';

// Verifies incoming USDC/USDT deposits to the user's platform-managed wallet
// by reading ERC20 Transfer logs from each chain's RPC (BNB, Ethereum,
// Polygon) — the blockchain explorer source of truth. Confirmed deposits
// (sufficient block confirmations) are recorded as CryptoTransaction entries
// with status CONFIRMED, so they appear in the wallet's recent transactions
// list as successful. Dedupes by txHash + chain + token.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const wallets = await base44.entities.Wallet.filter({ userId: user.id });
    const wallet = wallets[0];
    if (!wallet || !wallet.walletAddress) {
      return Response.json({ needsWallet: true });
    }

    const transfers = await scanIncomingTransfers(wallet.walletAddress);
    const confirmed = transfers.filter((t) => t.confirmed);

    const newDeposits = [];
    for (const t of confirmed) {
      const existing = await base44.entities.CryptoTransaction.filter({
        txHash: t.txHash,
        chain: t.chain,
        token: t.token,
      });
      if (existing.length > 0) {
        // Promote any previously-pending record for this deposit to CONFIRMED.
        const rec = existing[0];
        if (rec.status !== 'CONFIRMED') {
          await base44.entities.CryptoTransaction.update(rec.id, { status: 'CONFIRMED' });
        }
        continue;
      }
      const rec = await base44.entities.CryptoTransaction.create({
        userId: user.id,
        fullName: user.full_name || user.email,
        type: 'DEPOSIT',
        chain: t.chain,
        token: t.token,
        amount: Number(t.amount),
        txHash: t.txHash,
        fromAddress: t.fromAddress,
        toAddress: t.toAddress,
        blockNumber: t.blockNumber,
        status: 'CONFIRMED',
        reference: 'deposit',
        createdAt: new Date().toISOString(),
      });
      newDeposits.push(rec);
    }

    return Response.json({
      address: wallet.walletAddress,
      scanned: transfers.length,
      confirmed: confirmed.length,
      newDeposits: newDeposits.length,
      deposits: newDeposits,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}