import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { readOnChainBalances, readErc20Token } from '../../shared/walletCrypto.ts';

// Reads live USDC/USDT (and native gas) balances for the user's
// platform-managed wallet across BNB, Ethereum and Polygon, and
// caches the snapshot on the Wallet entity.
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

    const chains = await readOnChainBalances(wallet.walletAddress);

    // Read live balances for user-added custom ERC20 tokens.
    const custom = [];
    let customList = [];
    try { customList = JSON.parse(wallet.customTokens || '[]'); } catch (_) {}
    if (Array.isArray(customList)) {
      for (const ct of customList) {
        try {
          const info = await readErc20Token(ct.chain, ct.address, wallet.walletAddress);
          custom.push({ chain: ct.chain, address: ct.address, symbol: info.symbol, name: info.name, decimals: info.decimals, balance: info.balance });
        } catch (_) {
          custom.push({ chain: ct.chain, address: ct.address, symbol: ct.symbol, name: ct.name, decimals: ct.decimals, balance: '0' });
        }
      }
    }

    await base44.entities.Wallet.update(wallet.id, {
      cryptoBalances: JSON.stringify(chains),
      lastSyncAt: new Date().toISOString(),
    });

    return Response.json({ address: wallet.walletAddress, chains, custom });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}