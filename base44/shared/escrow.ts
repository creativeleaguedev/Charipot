// Ledger-level reservation (escrow) for the GOV P2P marketplace. When a user
// opens an order, the offered asset is reserved on their wallet so it can't be
// spent elsewhere (tickets, passes, donations, withdrawals, other orders) while
// the order is live. The platform holds every wallet's private key, so each
// spend path (payToTreasury, withdrawCrypto, fillMarketOrder, createMarketOrder)
// enforces `available = onChain − escrowed` before signing a transfer — that is
// enough to prevent double-spending without an on-chain lock contract.
//
//   Sell order → GOV reserved:   govBalance is debited up front and the locked
//                                amount is tracked in `govEscrowed`.
//   Buy order  → crypto reserved: `cryptoEscrowed` JSON tracks the per-chain
//                                USDC/USDT held for open buy orders.
//
// On fill, the reservation is released and the real on-chain transfer runs
// (buyer → seller, direct). On cancel, the reservation returns to available.

export function parseCryptoEscrow(raw) {
  const base = { bnb: { USDC: 0, USDT: 0 }, ethereum: { USDC: 0, USDT: 0 }, polygon: { USDC: 0, USDT: 0 } };
  if (!raw) return base;
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (p && typeof p === 'object') {
      for (const k of Object.keys(base)) {
        if (p[k]) {
          base[k].USDC = Number(p[k].USDC) || 0;
          base[k].USDT = Number(p[k].USDT) || 0;
        }
      }
    }
  } catch (_) {}
  return base;
}

export function cryptoEscrowOf(wallet, chain, token) {
  const e = parseCryptoEscrow(wallet?.cryptoEscrowed);
  return Number(e?.[chain]?.[token] || 0);
}

// Returns the new JSON string for wallet.cryptoEscrowed after adding `amt` to
// the given chain/token. The caller writes it back via Wallet.update. Re-fetch
// the wallet before calling to avoid clobbering a concurrent reservation.
export function addCryptoEscrow(wallet, chain, token, amt) {
  const e = parseCryptoEscrow(wallet?.cryptoEscrowed);
  if (!e[chain]) e[chain] = { USDC: 0, USDT: 0 };
  e[chain][token] = +(((Number(e[chain][token]) || 0) + Number(amt)).toFixed(6));
  return JSON.stringify(e);
}

export function subCryptoEscrow(wallet, chain, token, amt) {
  const e = parseCryptoEscrow(wallet?.cryptoEscrowed);
  if (!e[chain]) e[chain] = { USDC: 0, USDT: 0 };
  e[chain][token] = +Math.max(0, (Number(e[chain][token]) || 0) - Number(amt)).toFixed(6);
  return JSON.stringify(e);
}

// Sum of all reserved crypto across every chain/token (for display).
export function totalCryptoEscrow(wallet) {
  const e = parseCryptoEscrow(wallet?.cryptoEscrowed);
  let s = 0;
  for (const k of Object.keys(e)) s += (e[k].USDC || 0) + (e[k].USDT || 0);
  return +s.toFixed(6);
}