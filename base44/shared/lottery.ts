// Shared lottery helpers used by backend draw-execution functions.
// Mirrors the frontend src/lib/configRegistry randomness logic so settlement
// runs server-side and stays auditable.

export function normalizeNumbers(nums: number[]): string {
  return nums
    .map((n) => String(n).padStart(2, "0"))
    .sort((a, b) => Number(a) - Number(b))
    .join("-");
}

export function parseNumbers(str: string): number[] {
  if (!str) return [];
  return str.split("-").map((n) => Number(n));
}

export function countMatches(ticketStr: string, winningStr: string): number {
  const t = parseNumbers(ticketStr);
  const w = new Set(parseNumbers(winningStr));
  return t.filter((n) => w.has(n)).length;
}

export function prizeTier(matches: number): string {
  if (matches === 5) return "5/5";
  if (matches === 4) return "4/5";
  if (matches === 3) return "3/5";
  return "none";
}

// Verifiable-randomness simulation (deterministic from a seed). Represents the
// VRF/drand output; the same proof reproduces the same winning numbers.
export function generateWinningNumbers(seed: string): number[] {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = Array.from({ length: 39 }, (_, i) => i + 1);
  const picked: number[] = [];
  for (let i = 0; i < 5; i++) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked.sort((a, b) => a - b);
}

export function makeRandomnessProof(): string {
  return "vrf_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}