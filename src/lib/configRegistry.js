import { base44 } from "@/api/base44Client";

// Cache of config params to avoid refetching on every render
let _cache = null;
let _promise = null;

export const DEFAULT_PARAMS = {
  // Revenue split (must sum to 100)
  rev_charity: { value: 50, min: 20, max: 80, unit: "%", highImpact: true, timelockHours: 168, category: "revenue_split", label: "Charity Fund %" },
  rev_prize: { value: 40, min: 20, max: 70, unit: "%", highImpact: true, timelockHours: 168, category: "revenue_split", label: "Prize Pool %" },
  rev_platform: { value: 8, min: 2, max: 20, unit: "%", highImpact: true, timelockHours: 168, category: "revenue_split", label: "Platform Fee %" },
  rev_agent: { value: 2, min: 0, max: 5, unit: "%", highImpact: true, timelockHours: 168, category: "revenue_split", label: "Agent Referral %" },
  // Prize split (must sum to 100)
  prize_5: { value: 70, min: 40, max: 90, unit: "%", highImpact: true, timelockHours: 168, category: "prize_split", label: "5/5 Jackpot %" },
  prize_4: { value: 20, min: 5, max: 40, unit: "%", highImpact: true, timelockHours: 168, category: "prize_split", label: "4/5 Match Pool %" },
  prize_3: { value: 10, min: 5, max: 30, unit: "%", highImpact: true, timelockHours: 168, category: "prize_split", label: "3/5 Match Pool %" },
  // Lottery
  ticket_price: { value: 0.1, min: 0.01, max: 10, unit: "USD", highImpact: false, timelockHours: 48, category: "lottery", label: "Ticket Price" },
  draw_target: { value: 5, min: 1, max: 1000000, unit: "tickets", highImpact: false, timelockHours: 48, category: "lottery", label: "Draw Ticket Target" },
  starting_jackpot: { value: 0.25, min: 0, max: 10000, unit: "USD", highImpact: false, timelockHours: 48, category: "lottery", label: "Starting Jackpot (Base)" },
  min_jackpot: { value: 3500, min: 500, max: 50000, unit: "USD", highImpact: false, timelockHours: 48, category: "lottery", label: "Minimum Jackpot Activation" },
  max_period_days: { value: 7, min: 1, max: 30, unit: "days", highImpact: false, timelockHours: 48, category: "lottery", label: "Max Draw Period" },
  reserve_split: { value: 10, min: 0, max: 50, unit: "%", highImpact: false, timelockHours: 48, category: "lottery", label: "Reserve Split %" },
  claim_fee: { value: 2, min: 0, max: 10, unit: "%", highImpact: false, timelockHours: 48, category: "prize_split", label: "Prize Claim Fee %" },
  // Agent
  agent_referral_rate: { value: 2, min: 0, max: 5, unit: "%", highImpact: true, timelockHours: 168, category: "agent", label: "Per-Ticket Referral Rate" },
  winning_agent_bonus: { value: 1, min: 0, max: 3, unit: "%", highImpact: true, timelockHours: 168, category: "agent", label: "Winning Agent Bonus Rate" },
  unused_agent_redirect: { value: 1, min: 0, max: 1, unit: "target", highImpact: false, timelockHours: 48, category: "agent", label: "Unused Agent Share Redirect" },
  // Governance
  gov_mint_ratio: { value: 1, min: 0.1, max: 5, unit: "GOV/ticket", highImpact: true, timelockHours: 168, category: "governance", label: "GOV Mint Ratio" },
  gov_round_days: { value: 14, min: 3, max: 60, unit: "days", highImpact: false, timelockHours: 48, category: "governance", label: "Governance Round Duration" },
  // Project
  max_project_funding: { value: 100000, min: 5000, max: 1000000, unit: "USD", highImpact: false, timelockHours: 48, category: "project", label: "Max Funding Per Project" },
  project_min_funding: { value: 500, min: 0, max: 50000, unit: "USD", highImpact: false, timelockHours: 48, category: "project", label: "Minimum Funding Allocation" },
  // Treasury / sweep
  sweep_threshold: { value: 10, min: 0, max: 100000, unit: "USD", highImpact: false, timelockHours: 48, category: "lottery", label: "Collector Sweep Threshold" },
};

export async function loadConfig(force = false) {
  if (_cache && !force) return _cache;
  if (_promise && !force) return _promise;
  _promise = (async () => {
    try {
      const list = await base44.entities.ConfigParameter.list("-key", 100);
      const map = {};
      list.forEach((p) => { map[p.key] = p; });
      // Fill defaults for any missing
      Object.keys(DEFAULT_PARAMS).forEach((k) => {
        if (!map[k]) map[k] = { key: k, ...DEFAULT_PARAMS[k], value: DEFAULT_PARAMS[k].value };
      });
      _cache = map;
      return map;
    } catch (e) {
      // Fall back to defaults
      const map = {};
      Object.keys(DEFAULT_PARAMS).forEach((k) => { map[k] = { key: k, ...DEFAULT_PARAMS[k], value: DEFAULT_PARAMS[k].value }; });
      _cache = map;
      return map;
    } finally {
      _promise = null;
    }
  })();
  return _promise;
}

export function getConfigSync() {
  return _cache;
}

// ---- Lottery helpers ----
export function normalizeNumbers(nums) {
  return nums
    .map((n) => String(n).padStart(2, "0"))
    .sort((a, b) => Number(a) - Number(b))
    .join("-");
}

export function quickPick() {
  const pool = Array.from({ length: 39 }, (_, i) => i + 1);
  const picked = [];
  for (let i = 0; i < 5; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked.sort((a, b) => a - b);
}

export function parseNumbers(str) {
  if (!str) return [];
  return str.split("-").map((n) => Number(n));
}

export function countMatches(ticketStr, winningStr) {
  const t = parseNumbers(ticketStr);
  const w = new Set(parseNumbers(winningStr));
  return t.filter((n) => w.has(n)).length;
}

export function prizeTier(matches) {
  if (matches === 5) return "5/5";
  if (matches === 4) return "4/5";
  if (matches === 3) return "3/5";
  return "none";
}

// Verifiable randomness simulation (deterministic from a seed)
export function generateWinningNumbers(seed) {
  // Simple deterministic PRNG (mulberry32) — represents VRF/drand output
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  const rng = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = Array.from({ length: 39 }, (_, i) => i + 1);
  const picked = [];
  for (let i = 0; i < 5; i++) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked.sort((a, b) => a - b);
}

export function makeRandomnessProof() {
  return "vrf_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Splits an incoming amount (ticket price or donation) across the configured
// revenue allocations identically to ticket sales. `hasAgent` controls whether
// the agent referral share is carved out (donations have no agent attribution).
export function allocateRevenue(amount, config, { hasAgent = false } = {}) {
  // The 2% agent referral is always carved out — it goes to the attributed
  // agent's wallet, or to the house agent wallet when unattributed. The split
  // always sums to 100% with no redirect.
  const agent = +((amount * config.rev_agent.value) / 100).toFixed(2);
  const charity = +((amount * config.rev_charity.value) / 100).toFixed(2);
  const platform = +((amount * config.rev_platform.value) / 100).toFixed(2);
  const prize = +((amount * config.rev_prize.value) / 100).toFixed(2);
  // Buffer/reserve = reserve_split% of the 5/5 jackpot share (10% of 28% =
  // 2.8%); the remainder seeds the current jackpot.
  const jackpotShare = +((prize * config.prize_5.value) / 100).toFixed(2);
  const reserveSplit = config.reserve_split?.value ?? 0;
  const reservePortion = +((jackpotShare * reserveSplit) / 100).toFixed(2);
  const jackpotAdd = +(jackpotShare - reservePortion).toFixed(2);
  const netPrize = +(prize - reservePortion).toFixed(2);
  return { charity, prize, platform, agent, reservePortion, netPrize, jackpotAdd };
}

export function fmtUSD(n) {
  return "$" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtNum(n) {
  return Number(n || 0).toLocaleString();
}

// Parses the cached on-chain balance snapshot stored on a Wallet
// (wallet.cryptoBalances is a JSON string produced by readOnChainBalances).
// Returns { total, chains } where total is the sum of USDC + USDT across
// every chain — used for admin "live on-chain balance" displays.
export function parseOnChainBalances(json) {
  if (!json) return { total: 0, chains: [] };
  try {
    const chains = typeof json === "string" ? JSON.parse(json) : json;
    let total = 0;
    (chains || []).forEach((c) => {
      total += Number(c?.balances?.USDC) || 0;
      total += Number(c?.balances?.USDT) || 0;
    });
    return { total, chains: chains || [] };
  } catch (_) {
    return { total: 0, chains: [] };
  }
}