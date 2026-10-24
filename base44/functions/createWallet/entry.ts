import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { Wallet as EthersWallet } from 'npm:ethers@6.13.4';
import { secrets } from 'base44:runtime';
import { encryptPrivateKey } from '../../shared/walletCrypto.ts';

// Generates a platform-managed EVM keypair for the authenticated user.
// The private key is AES-256-GCM encrypted at rest with WALLET_ENCRYPTION_KEY
// and is NEVER returned to the client. Only the public address is exposed.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const pass = secrets.get('WALLET_ENCRYPTION_KEY');
    if (!pass) return Response.json({ error: 'WALLET_ENCRYPTION_KEY not configured' }, { status: 500 });

    const existing = await base44.entities.Wallet.filter({ userId: user.id });
    if (existing.length && existing[0].walletAddress) {
      return Response.json({ address: existing[0].walletAddress, existing: true });
    }

    const w = EthersWallet.createRandom();
    const encryptedPrivateKey = await encryptPrivateKey(w.privateKey, pass);

    if (existing.length) {
      await base44.entities.Wallet.update(existing[0].id, {
        walletAddress: w.address,
        encryptedPrivateKey,
      });
    } else {
      await base44.entities.Wallet.create({
        userId: user.id,
        fullName: user.full_name || user.email,
        walletAddress: w.address,
        encryptedPrivateKey,
        govBalance: 0,
      });
    }

    await base44.entities.AuditLog.create({
      actor: user.full_name || user.email,
      actorRole: user.role,
      action: 'WALLET_CREATED',
      entityType: 'Wallet',
      details: `Crypto wallet generated for ${user.email}`,
      timestamp: new Date().toISOString(),
      severity: 'info',
    });

    return Response.json({ address: w.address, existing: false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}