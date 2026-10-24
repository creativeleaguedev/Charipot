import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { readErc20Token, getChain } from '../../shared/walletCrypto.ts';

// Add or remove a user-tracked custom ERC20 token. On "add" the contract is
// read on-chain (symbol/name/decimals + current balance) to validate it is a
// real ERC20, then stored on the Wallet entity as a JSON list so the wallet
// view can display its live balance alongside the built-in USDC/USDT rows.
function parseCustom(s) {
  try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; }
}
function isBuiltIn(chainKey, address) {
  const chain = getChain(chainKey);
  if (!chain) return false;
  const a = address.toLowerCase();
  return Object.values(chain.tokens).some((t) => t.address.toLowerCase() === a);
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, chain, address } = body;
    if (!action || !chain || !address) {
      return Response.json({ error: 'action, chain and address are required' }, { status: 400 });
    }
    if (!['add', 'remove'].includes(action)) {
      return Response.json({ error: 'action must be add or remove' }, { status: 400 });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return Response.json({ error: 'Invalid contract address' }, { status: 400 });
    }
    if (!getChain(chain)) {
      return Response.json({ error: 'Unsupported chain' }, { status: 400 });
    }

    const wallets = await base44.entities.Wallet.filter({ userId: user.id });
    const wallet = wallets[0];
    if (!wallet || !wallet.walletAddress) {
      return Response.json({ error: 'No wallet found. Create a wallet first.' }, { status: 400 });
    }

    const list = parseCustom(wallet.customTokens);
    const norm = address.toLowerCase();

    if (action === 'add') {
      if (isBuiltIn(chain, address)) {
        return Response.json({ error: 'This token is already tracked as a built-in.' });
      }
      if (list.some((t) => t.chain === chain && t.address.toLowerCase() === norm)) {
        return Response.json({ error: 'You already track this token.' });
      }
      let meta;
      try {
        meta = await readErc20Token(chain, address, wallet.walletAddress);
      } catch (e) {
        return Response.json({ error: 'Could not read token contract: ' + e.message }, { status: 400 });
      }
      const entry = { chain, address, symbol: meta.symbol, name: meta.name, decimals: meta.decimals };
      const next = [...list, entry];
      await base44.entities.Wallet.update(wallet.id, { customTokens: JSON.stringify(next) });
      return Response.json({ ...entry, balance: meta.balance });
    }

    // remove
    const next = list.filter((t) => !(t.chain === chain && t.address.toLowerCase() === norm));
    await base44.entities.Wallet.update(wallet.id, { customTokens: JSON.stringify(next) });
    return Response.json({ removed: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}