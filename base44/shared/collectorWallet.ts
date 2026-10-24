import { Wallet as EthersWallet } from 'npm:ethers@6.13.4';
import { secrets } from 'base44:runtime';

// Single platform collector wallet (BNB Chain). ALL ticket, donation and
// pass-purchase payments land here; the balance is auto-swept to the seven
// custody wallets once it reaches $10 (see sweepCollectorWallet). The address
// is derived from the private key so no PlatformWallet record is needed.
export function getCollectorKey(): string | null {
  const k = secrets.get('COLLECTOR_WALLET_PRIVATE_KEY');
  return k || null;
}

export function getCollectorAddress(): string | null {
  const k = getCollectorKey();
  if (!k) return null;
  try {
    return new EthersWallet(k).address;
  } catch (_) {
    return null;
  }
}