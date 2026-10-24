// Fixed per-wallet allocation percentages for the platform. Every crypto
// payment (ticket purchase, donation, pass purchase) is split on-chain to the
// seven custody wallets in these exact proportions, and the draw ledger is
// credited to match so payouts are always funded:
//   Charity 50% · 5/5 Jackpot 25.2% · 4/5 Winnings 8% · 3/5 Winnings 4%
//   · Buffer 2.8% · Treasury 8% · Agent Fee 2%  (= 100%)
// Public wallets: Charity, 5/5 Jackpot, 4/5 Winnings, 3/5 Winnings.

export const WALLET_KEYS = [
  'charity', 'jackpot_5', 'winnings_4', 'winnings_3', 'buffer', 'treasury', 'agent_fee',
] as const;

// Fixed platform wallet split — every crypto payment (ticket purchase,
// donation, pass purchase) is transferred on-chain to these seven custody
// wallets in exactly these proportions. Each value is the percentage the
// wallet actually receives (the 5/5 jackpot share is NET of the buffer):
//   Charity 50% · 5/5 Jackpot 25.2% · 4/5 Winnings 8% · 3/5 Winnings 4%
//   · Buffer 2.8% · Treasury 8% · Agent Fee 2%  (= 100%)
// These are the source of truth; the Config Registry no longer drifts the
// per-wallet split.
export function computeWalletPercents(_cfg: Record<string, number> = {}): Record<string, number> {
  return {
    charity: 50,
    jackpot_5: 25.2,
    winnings_4: 8,
    winnings_3: 4,
    buffer: 2.8,
    treasury: 8,
    agent_fee: 2,
  };
}

// Per-amount dollar split across the seven wallets, using the fixed platform
// percentages. `prize` and `pool` are convenience totals (prize = 5/5 net +
// 4/5 + 3/5 + buffer = 40%; pool = 4/5 + 3/5 = 12%) for draw-ledger crediting.
export function computeAmountShares(amount: number, _cfg: Record<string, number> = {}): Record<string, number> {
  const pcts = computeWalletPercents();
  const share = (p: number) => +((amount * p) / 100).toFixed(4);
  return {
    charity: share(pcts.charity),
    jackpot_5: share(pcts.jackpot_5),
    winnings_4: share(pcts.winnings_4),
    winnings_3: share(pcts.winnings_3),
    buffer: share(pcts.buffer),
    treasury: share(pcts.treasury),
    agent_fee: share(pcts.agent_fee),
    prize: share(pcts.jackpot_5 + pcts.winnings_4 + pcts.winnings_3 + pcts.buffer),
    pool: share(pcts.winnings_4 + pcts.winnings_3),
  };
}

// Per-draw inflow to each wallet, computed from the draw's tickets plus the
// already-calculated 4/5 and 3/5 prize pools. The claim fee (routed to the
// Treasury) is added on top of the ticket platform-fee inflow. Each tier wallet
// receives its own this-draw contribution; unwon pots are NOT collapsed into the
// jackpot — they stay in their wallet and carry over to the next draw's tier
// pot (tracked on the Draw entity), so the pots grow until the tier is won.
export function computeDrawInflows(
  tickets: any[],
  cfg: Record<string, number>,
  pool4: number,
  pool3: number,
  claimFee: number = 0,
): Record<string, number> {
  const totalCharity = tickets.reduce((s, t) => s + (t.charityContribution || 0), 0);
  const totalPlatform = tickets.reduce((s, t) => s + (t.platformFee || 0), 0);
  const totalAgent = tickets.reduce((s, t) => s + (t.agentReferral || 0), 0);
  const grossPrize = tickets.reduce((s, t) => s + (t.prizeContribution || 0), 0);

  const prize5 = cfg.prize_5 ?? 70;
  const reserveSplit = cfg.reserve_split ?? 10;
  const jackpotGross = +((grossPrize * prize5) / 100).toFixed(2);
  const bufferInflow = +((jackpotGross * reserveSplit) / 100).toFixed(2);
  const jackpotInflow = +(jackpotGross - bufferInflow).toFixed(2);

  return {
    charity: +totalCharity.toFixed(2),
    jackpot_5: jackpotInflow,
    winnings_4: +pool4.toFixed(2),
    winnings_3: +pool3.toFixed(2),
    buffer: bufferInflow,
    treasury: +(totalPlatform + claimFee).toFixed(2),
    agent_fee: +totalAgent.toFixed(2),
  };
}

// Per-wallet split of a lump donation amount, using the fixed platform
// percentages. The 7 shares sum to 100% of the donation:
//   Charity 50% · 5/5 Jackpot 25.2% · Buffer 2.8% · 4/5 8% · 3/5 4%
//   · Treasury 8% · Agent 2%
export function computeDonationSplit(amount: number, cfg: Record<string, number>): Record<string, number> {
  const shares = computeAmountShares(amount, cfg);
  return {
    charity: shares.charity,
    jackpot_5: shares.jackpot_5,
    buffer: shares.buffer,
    winnings_4: shares.winnings_4,
    winnings_3: shares.winnings_3,
    treasury: shares.treasury,
    agent_fee: shares.agent_fee,
  };
}