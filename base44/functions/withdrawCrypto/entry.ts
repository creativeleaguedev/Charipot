import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { sendToken, readOnChainBalances } from '../../shared/walletCrypto.ts';
import { cryptoEscrowOf } from '../../shared/escrow.ts';

// Withdraws USDC/USDT from the user's platform-managed wallet to an
// external address. Decrypts the private key server-side, signs and
// broadcasts the ERC20 transfer, and records a pending CryptoTransaction.
// The key is decrypted only in-memory for this call and never persisted
// in plaintext or returned to the client.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { chain, token, toAddress, amount } = body;
    if (!chain || !token || !toAddress || !amount) {
      return Response.json({ error: 'chain, token, toAddress and amount are required' }, { status: 400 });
    }
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return Response.json({ error: 'amount must be a positive number' }, { status: 400 });
    }

    const pass = secrets.get('WALLET_ENCRYPTION_KEY');
    if (!pass) return Response.json({ error: 'WALLET_ENCRYPTION_KEY not configured' }, { status: 500 });

    const wallets = await base44.entities.Wallet.filter({ userId: user.id });
    const wallet = wallets[0];
    if (!wallet || !wallet.walletAddress || !wallet.encryptedPrivateKey) {
      return Response.json({ error: 'No wallet found. Create a wallet first.' }, { status: 400 });
    }
    // Blacklist enforcement: blacklisted wallets and accounts cannot withdraw.
    if (wallet.isBlacklisted || user.isBlacklisted) {
      return Response.json({ error: 'Your wallet or account is blacklisted — withdrawals are disabled.' }, { status: 403 });
    }

    // Respect the soft reservation: cannot withdraw crypto reserved for open
    // marketplace buy orders. Available = on-chain minus escrowed.
    const chains = await readOnChainBalances(wallet.walletAddress);
    const cb = chains.find((c) => c.chain === chain);
    const onChain = Number(cb?.balances?.[token] ?? 0);
    const escrowed = cryptoEscrowOf(wallet, chain, token);
    if (onChain - escrowed < numAmount - 1e-6) {
      return Response.json({ error: 'insufficient', balance: +(onChain - escrowed).toFixed(6), needed: numAmount, escrowed }, { status: 400 });
    }

    const result = await sendToken(chain, token, wallet.encryptedPrivateKey, toAddress, String(numAmount), pass);

    await base44.entities.CryptoTransaction.create({
      userId: user.id,
      fullName: user.full_name || user.email,
      type: 'WITHDRAW',
      chain,
      token,
      amount: numAmount,
      txHash: result.txHash,
      fromAddress: wallet.walletAddress,
      toAddress,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });

    await base44.entities.AuditLog.create({
      actor: user.full_name || user.email,
      actorRole: user.role,
      action: 'CRYPTO_WITHDRAW',
      entityType: 'CryptoTransaction',
      details: `Withdraw ${numAmount} ${token} on ${chain} to ${toAddress}`,
      timestamp: new Date().toISOString(),
      severity: 'warning',
    });

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}