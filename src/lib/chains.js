// Client-side chain/token metadata (display + transaction helpers).
// Mirrors the server config in base44/shared/walletCrypto.ts; the
// bundling boundary forbids importing base44/ from the client.

export const CHAINS = [
  {
    key: "bnb",
    id: 56,
    name: "BNB Smart Chain",
    native: "BNB",
    explorer: "https://bscscan.com",
    color: "#F3BA2F",
    logo: "https://assets.coingecko.com/coins/images/825/standard/bnb-icon2_2x.png",
    nativeLogo: "https://assets.coingecko.com/coins/images/825/standard/bnb-icon2_2x.png",
    tokens: ["USDC", "USDT"],
  },
  {
    key: "ethereum",
    id: 1,
    name: "Ethereum",
    native: "ETH",
    explorer: "https://etherscan.io",
    color: "#627EEA",
    logo: "https://assets.coingecko.com/coins/images/279/standard/ethereum.png",
    nativeLogo: "https://assets.coingecko.com/coins/images/279/standard/ethereum.png",
    tokens: ["USDC", "USDT"],
  },
  {
    key: "polygon",
    id: 137,
    name: "Polygon",
    native: "MATIC",
    explorer: "https://polygonscan.com",
    color: "#8247E5",
    logo: "https://assets.coingecko.com/coins/images/32440/standard/pol.png",
    nativeLogo: "https://assets.coingecko.com/coins/images/32440/standard/pol.png",
    tokens: ["USDC", "USDT"],
  },
];

export const TOKEN_LOGOS = {
  USDC: "https://assets.coingecko.com/coins/images/6319/standard/USDC.png",
  USDT: "https://assets.coingecko.com/coins/images/325/standard/Tether.png",
};

// CoinGecko contract endpoint per chain (free, CORS-enabled). Used client-side
// to fetch a custom ERC20's logo + current USD price so the wallet can show its
// icon and live value. Best-effort: returns nulls on any error / rate limit.
const CG_PLATFORM = { bnb: "binance-smart-chain", ethereum: "ethereum", polygon: "polygon-pos" };
export async function fetchCoinGeckoToken(chainKey, address) {
  const platform = CG_PLATFORM[chainKey];
  if (!platform) return { logo: null, priceUsd: null };
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${platform}/contract/${address}`);
    if (!r.ok) return { logo: null, priceUsd: null };
    const d = await r.json();
    const price = d?.market_data?.current_price?.usd;
    return {
      logo: d?.image?.small || d?.image?.thumb || null,
      priceUsd: typeof price === "number" ? price : null,
    };
  } catch (_) {
    return { logo: null, priceUsd: null };
  }
}

export const getChain = (key) => CHAINS.find((c) => c.key === key);

export const fmtToken = (val, decimals = 4) => {
  const n = Number(val);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
};

export const txUrl = (chainKey, hash) => `${getChain(chainKey)?.explorer}/tx/${hash}`;
export const addrUrl = (chainKey, addr) => `${getChain(chainKey)?.explorer}/address/${addr}`;

export const shortAddr = (addr) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "");