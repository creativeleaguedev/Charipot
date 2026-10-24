import { JsonRpcProvider, Contract, formatUnits, parseUnits, Wallet as EthersWallet } from 'npm:ethers@6.13.4';
import { secrets } from 'base44:runtime';

// One EVM private key derives the SAME address on every EVM chain,
// so a single platform-managed wallet covers BNB, Ethereum and Polygon.
export const CHAINS = [
  {
    key: 'bnb', id: 56, name: 'BNB Smart Chain', native: 'BNB',
    explorer: 'https://bscscan.com',
    publicRpc: 'https://bsc-dataseed.binance.org',
    alchemyPath: 'bnb-mainnet.g.alchemy.com/v2',
    tokens: {
      USDC: { address: '0x8AC76A51cc950d9822D68b83fE1Ad97b32cD580d', decimals: 18 },
      USDT: { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
    },
  },
  {
    key: 'ethereum', id: 1, name: 'Ethereum', native: 'ETH',
    explorer: 'https://etherscan.io',
    publicRpc: 'https://cloudflare-eth.com',
    alchemyPath: 'eth-mainnet.g.alchemy.com/v2',
    tokens: {
      USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
      USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    },
  },
  {
    key: 'polygon', id: 137, name: 'Polygon', native: 'MATIC',
    explorer: 'https://polygonscan.com',
    publicRpc: 'https://polygon-rpc.com',
    alchemyPath: 'polygon-mainnet.g.alchemy.com/v2',
    tokens: {
      USDC: { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
      USDT: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    },
  },
];

const ERC20_ABI = ['function balanceOf(address) view returns (uint256)', 'function transfer(address,uint256) returns (bool)'];

export function getChain(key) {
  return CHAINS.find((c) => c.key === key);
}

function rpcUrl(chain) {
  const key = secrets.get('RPC_API_KEY');
  if (key) return `https://${chain.alchemyPath}/${key}`;
  return chain.publicRpc;
}

// ---- Private-key encryption (AES-256-GCM, key derived from WALLET_ENCRYPTION_KEY) ----
async function deriveKey(pass) {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('rotary-crypto-wallet-salt'), iterations: 100000, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptPrivateKey(privKey, pass) {
  const key = await deriveKey(pass);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(privKey));
  const bytes = new Uint8Array(iv.length + ct.byteLength);
  bytes.set(iv, 0);
  bytes.set(new Uint8Array(ct), iv.length);
  return btoa(String.fromCharCode(...bytes));
}

export async function decryptPrivateKey(b64, pass) {
  const key = await deriveKey(pass);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ---- On-chain reads ----
export async function readOnChainBalances(address) {
  const result = [];
  for (const chain of CHAINS) {
    const provider = new JsonRpcProvider(rpcUrl(chain));
    const balances = { native: '0.0', USDC: '0', USDT: '0' };
    try {
      balances.native = formatUnits(await provider.getBalance(address), 18);
    } catch (_) {}
    for (const [sym, tok] of Object.entries(chain.tokens)) {
      try {
        const c = new Contract(tok.address, ERC20_ABI, provider);
        balances[sym] = formatUnits(await c.balanceOf(address), tok.decimals);
      } catch (_) {
        balances[sym] = '0';
      }
    }
    result.push({
      chain: chain.key,
      name: chain.name,
      native: chain.native,
      explorer: chain.explorer,
      balances,
    });
  }
  return result;
}

// ---- Arbitrary ERC20 read (user-added custom tokens) ----
const ERC20_META_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
];

// Reads symbol/name/decimals + the live balance of any ERC20 token for a
// wallet address on a supported chain. Used to let users track custom tokens.
export async function readErc20Token(chainKey, tokenAddress, walletAddress) {
  const chain = getChain(chainKey);
  if (!chain) throw new Error('Unsupported chain');
  if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) throw new Error('Invalid token address');
  const provider = new JsonRpcProvider(rpcUrl(chain));
  const c = new Contract(tokenAddress, ERC20_META_ABI, provider);
  const [balance, symbol, name, decimals] = await Promise.all([
    c.balanceOf(walletAddress),
    c.symbol().catch(() => 'TOKEN'),
    c.name().catch(() => ''),
    c.decimals().catch(() => 18),
  ]);
  const dec = Number(decimals);
  return {
    symbol: String(symbol || 'TOKEN'),
    name: String(name || symbol || 'Unknown token'),
    decimals: dec,
    balance: formatUnits(balance, dec),
  };
}

// ---- On-chain send (withdrawal from the platform-managed wallet) ----
export async function sendToken(chainKey, tokenSym, encryptedKey, toAddress, amount, pass) {
  const chain = getChain(chainKey);
  if (!chain) throw new Error('Unsupported chain');
  const tok = chain.tokens[tokenSym];
  if (!tok) throw new Error('Unsupported token');
  if (!/^0x[a-fA-F0-9]{40}$/.test(toAddress)) throw new Error('Invalid destination address');
  const privKey = await decryptPrivateKey(encryptedKey, pass);
  const provider = new JsonRpcProvider(rpcUrl(chain));
  const signer = new EthersWallet(privKey, provider);
  const c = new Contract(tok.address, ERC20_ABI, signer);
  const tx = await c.transfer(toAddress, parseUnits(String(amount), tok.decimals));
  return {
    txHash: tx.hash,
    chain: chain.key,
    token: tokenSym,
    amount: String(amount),
    to: toAddress,
    explorer: chain.explorer,
  };
}

// Same as sendToken but signs with a raw EVM private key (used for platform
// custody wallets whose key is held in a secret, not the encrypted user-wallet
// store). One EVM key derives the same address on every EVM chain.
// Pending nonce for an address on a chain. Callers that broadcast several
// transactions in a tight loop must fetch this once and pass explicit,
// incrementing nonces to each send — otherwise ethers re-queries the provider
// for every send and public BSC nodes (which don't track pending nonces
// accurately) hand two sends the same nonce, dropping one.
export async function getPendingNonce(chainKey, address) {
  const chain = getChain(chainKey);
  if (!chain) throw new Error('Unsupported chain');
  const provider = new JsonRpcProvider(rpcUrl(chain));
  return await provider.getTransactionCount(address, 'pending');
}

export async function sendTokenFromRawKey(chainKey, tokenSym, rawPrivKey, toAddress, amount, nonce) {
  const chain = getChain(chainKey);
  if (!chain) throw new Error('Unsupported chain');
  const tok = chain.tokens[tokenSym];
  if (!tok) throw new Error('Unsupported token');
  if (!/^0x[a-fA-F0-9]{40}$/.test(toAddress)) throw new Error('Invalid destination address');
  const provider = new JsonRpcProvider(rpcUrl(chain));
  const signer = new EthersWallet(rawPrivKey, provider);
  const c = new Contract(tok.address, ERC20_ABI, signer);
  const overrides = typeof nonce === 'number' ? { nonce } : {};
  const tx = await c.transfer(toAddress, parseUnits(String(amount), tok.decimals), overrides);
  return {
    txHash: tx.hash,
    chain: chain.key,
    token: tokenSym,
    amount: String(amount),
    to: toAddress,
    explorer: chain.explorer,
  };
}

// ---- Incoming transfer scan (deposit verification via on-chain logs) ----
// Reads ERC20 Transfer events whose `to` is the wallet address directly from
// each chain's RPC (the blockchain explorer source of truth). A log only exists
// in a mined/successful transaction, so presence + block confirmations => the
// deposit succeeded on-chain.
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11696f2064d6f5c6c1c';
const MIN_CONFIRMATIONS = { bnb: 12, ethereum: 12, polygon: 128 };
const LOOKBACK_BLOCKS = { bnb: 14400, ethereum: 7200, polygon: 21600 };
const CHUNK = 5000;

function paddedTopic(addr) {
  return '0x' + addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

export async function scanIncomingTransfers(address) {
  const out = [];
  const addr = address.toLowerCase();
  const toTopic = paddedTopic(addr);
  for (const chain of CHAINS) {
    const provider = new JsonRpcProvider(rpcUrl(chain));
    let currentBlock;
    try { currentBlock = await provider.getBlockNumber(); } catch (_) { continue; }
    const lookback = LOOKBACK_BLOCKS[chain.key] ?? 5000;
    const fromBlock = Math.max(0, currentBlock - lookback);
    const minConf = MIN_CONFIRMATIONS[chain.key] ?? 12;
    for (const [sym, tok] of Object.entries(chain.tokens)) {
      let logs = [];
      let from = fromBlock;
      while (from <= currentBlock) {
        const chunkTo = Math.min(from + CHUNK - 1, currentBlock);
        try {
          const part = await provider.getLogs({
            address: tok.address,
            topics: [TRANSFER_TOPIC, null, toTopic],
            fromBlock: from,
            toBlock: chunkTo,
          });
          logs = logs.concat(part);
        } catch (_) {}
        from = chunkTo + 1;
      }
      for (const log of logs) {
        const confirmations = currentBlock - log.blockNumber;
        let raw = '0';
        try { raw = BigInt(log.data).toString(); } catch (_) {}
        const fromAddr = '0x' + (log.topics[1] || '').slice(26).toLowerCase();
        out.push({
          chain: chain.key,
          token: sym,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
          fromAddress: fromAddr,
          toAddress: addr,
          amount: formatUnits(raw, tok.decimals),
          confirmations,
          confirmed: confirmations >= minConf,
        });
      }
    }
  }
  return out;
}

// ---- Outgoing transaction status (verify a withdrawal by its txHash on-chain) ----
// Looks up the transaction receipt on the chain's RPC (the blockchain explorer
// source of truth). A mined receipt with status 1 => success; status 0 => the
// transaction reverted (failed). No receipt yet => still pending on-chain.
// Verifies a given transaction hash actually moved ERC20 funds to the treasury
// wallet on the chosen chain, by parsing the Transfer event log from the receipt.
export async function verifyTreasuryTransfer(chain, txHash, treasuryAddress) {
  const provider = new JsonRpcProvider(rpcUrl(chain));
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return { pending: true };
    const toTopic = paddedTopic(treasuryAddress);
    for (const log of receipt.logs) {
      if (log.topics[0] !== TRANSFER_TOPIC) continue;
      if (log.topics[2] !== toTopic) continue;
      const logAddr = log.address.toLowerCase();
      let token = null;
      let decimals = 6;
      for (const [sym, tok] of Object.entries(chain.tokens)) {
        if (tok.address.toLowerCase() === logAddr) { token = sym; decimals = tok.decimals; break; }
      }
      if (!token) continue;
      const raw = (() => { try { return BigInt(log.data).toString(); } catch (_) { return '0'; } })();
      const fromAddr = '0x' + (log.topics[1] || '').slice(26).toLowerCase();
      return {
        pending: false,
        confirmed: receipt.status === 1,
        failed: receipt.status === 0,
        toTreasury: true,
        chain: chain.key,
        token,
        amount: formatUnits(raw, decimals),
        fromAddress: fromAddr,
        toAddress: treasuryAddress.toLowerCase(),
        txHash,
        blockNumber: receipt.blockNumber,
      };
    }
    return { pending: false, confirmed: receipt.status === 1, failed: receipt.status === 0, toTreasury: false };
  } catch (e) {
    return { pending: true, error: e.message };
  }
}

// Verifies an on-chain ERC20 transfer to a specific recipient by parsing the
// tx receipt's Transfer event logs. Used by distributePrize to confirm a
// multisig custody-wallet transaction actually delivered USDC to the winner
// (custody wallets are multisig, so the platform cannot sign the transfer —
// the admin executes it externally and submits the tx hash).
export async function verifyTransferToRecipient(chainKey, txHash, recipientAddress) {
  const chain = getChain(chainKey);
  if (!chain) return { pending: true, error: 'Unsupported chain' };
  const provider = new JsonRpcProvider(rpcUrl(chain));
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return { pending: true };
    const toTopic = paddedTopic(recipientAddress);
    for (const log of receipt.logs) {
      if (log.topics[0] !== TRANSFER_TOPIC) continue;
      if (log.topics[2] !== toTopic) continue;
      const logAddr = log.address.toLowerCase();
      let token = null;
      let decimals = 6;
      for (const [sym, tok] of Object.entries(chain.tokens)) {
        if (tok.address.toLowerCase() === logAddr) { token = sym; decimals = tok.decimals; break; }
      }
      if (!token) continue;
      const raw = (() => { try { return BigInt(log.data).toString(); } catch (_) { return '0'; } })();
      const fromAddr = '0x' + (log.topics[1] || '').slice(26).toLowerCase();
      return {
        pending: false,
        confirmed: receipt.status === 1,
        failed: receipt.status === 0,
        chain: chain.key,
        token,
        amount: formatUnits(raw, decimals),
        fromAddress: fromAddr,
        toAddress: recipientAddress.toLowerCase(),
        txHash,
        blockNumber: receipt.blockNumber,
      };
    }
    return { pending: false, confirmed: receipt.status === 1, failed: receipt.status === 0, matched: false };
  } catch (e) {
    return { pending: true, error: e.message };
  }
}

export async function getTxStatus(chainKey, txHash) {
  const chain = getChain(chainKey);
  if (!chain) return { pending: true };
  const provider = new JsonRpcProvider(rpcUrl(chain));
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return { pending: true };
    return {
      pending: false,
      confirmed: receipt.status === 1,
      failed: receipt.status === 0,
      blockNumber: receipt.blockNumber,
    };
  } catch (_) {
    return { pending: true };
  }
}

// Estimates whether the wallet holds enough native gas to fund nTransfers
// ERC20 transfers on the given chain. Used by payToTreasury to pre-check gas
// before splitting a payment across several custody wallets, so the split
// cannot fail halfway through because the wallet ran out of native gas.
const DEFAULT_GAS_PRICE = { bnb: 3e9, ethereum: 2e9, polygon: 30e9 };
const ERC20_TRANSFER_GAS = 60000n;

export async function checkGasForTransfers(chainKey, address, nTransfers) {
  const chain = getChain(chainKey);
  if (!chain) return { ok: false, error: 'Unsupported chain' };
  const provider = new JsonRpcProvider(rpcUrl(chain));
  let nativeBalance = 0n;
  let gasPrice = 0n;
  try { nativeBalance = await provider.getBalance(address); } catch (_) {}
  try {
    const fee = await provider.getFeeData();
    gasPrice = fee.gasPrice || fee.maxFeePerGas || 0n;
  } catch (_) {}
  if (!gasPrice) gasPrice = BigInt(DEFAULT_GAS_PRICE[chainKey] || 3e9);
  const required = ERC20_TRANSFER_GAS * BigInt(nTransfers) * gasPrice;
  return {
    ok: nativeBalance >= required,
    nativeBalance: formatUnits(nativeBalance, 18),
    required: formatUnits(required, 18),
    nTransfers,
  };
}