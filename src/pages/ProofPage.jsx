import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  generateWinningNumbers,
  normalizeNumbers,
  parseNumbers,
  fmtUSD,
} from "@/lib/configRegistry";
import { cn } from "@/lib/utils";
import NumberBall from "@/components/ui/NumberBall";
import BrandLogo from "@/components/ui/BrandLogo";
import {
  ArrowLeft, Copy, Check, AlertTriangle, Hash, Ticket,
} from "lucide-react";

// Public, shareable draw-verification page. Anyone with the link — including
// logged-out visitors — can open /proof/:drawNumber and independently reproduce
// the 5 winning numbers from the stored randomness seed.
export default function ProofPage() {
  const { drawNumber } = useParams();
  const [draw, setDraw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await base44.functions.invoke("getDrawProof", { drawNumber: Number(drawNumber) });
        setDraw(res?.data || null);
        if (!res?.data) setError("Draw not found.");
      } catch (e) {
        setError(e?.message || "Could not load draw proof.");
      } finally {
        setLoading(false);
      }
    })();
  }, [drawNumber]);

  const copySeed = async () => {
    if (!draw?.randomnessProof) return;
    try {
      await navigator.clipboard.writeText(draw.randomnessProof);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) { /* ignore */ }
  };

  // Reproduce the winning numbers from the stored seed with the same PRNG used
  // by the draw engine, then compare to the stored result.
  const reproduced = draw?.randomnessProof
    ? normalizeNumbers(generateWinningNumbers(draw.randomnessProof))
    : null;
  const matches = !!(draw?.winningNumbers && reproduced && draw.winningNumbers === reproduced);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-md lg:px-8">
        <div className="flex items-center gap-2.5">
          <BrandLogo height={32} className="rounded-md" />
          <div className="leading-tight">
            <p className="text-sm font-bold">Charipot Charity Program</p>
            <p className="text-[10px] text-muted-foreground">Draw Verification</p>
          </div>
        </div>
        <Link to="/" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
          <ArrowLeft className="h-4 w-4" /> Back to app
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 lg:py-12">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        ) : error || !draw ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="mt-4 text-xl font-bold">Draw not found</h1>
            <p className="mt-1 text-sm text-muted-foreground">{error || `No draw #${drawNumber} exists.`}</p>
            <Link to="/" className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              <ArrowLeft className="h-4 w-4" /> Go home
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Public Draw Verification</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">Draw #{draw.drawNumber}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Status: <span className="font-semibold text-foreground">{draw.status}</span>
                {draw.completedAt && <> · Completed {new Date(draw.completedAt).toLocaleString()}</>}
              </p>
            </div>

            {/* Winning numbers */}
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                <Ticket className="h-4 w-4" /> Winning Numbers
              </h2>
              {draw.winningNumbers ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {parseNumbers(draw.winningNumbers).map((n, i) => (
                    <NumberBall key={i} n={n} size="lg" variant="navy" />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Numbers have not been drawn for this draw yet.</p>
              )}

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="5/5 winners" value={draw.winners5} />
                <Stat label="4/5 winners" value={draw.winners4} />
                <Stat label="3/5 winners" value={draw.winners3} />
                <Stat label="Tickets sold" value={draw.ticketCount} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Jackpot" value={fmtUSD(draw.jackpotAmount)} accent />
                <Stat label="Prize pool" value={fmtUSD(draw.prizePool)} />
                <Stat label="Prizes paid" value={fmtUSD(draw.totalPrizesPaid)} />
              </div>
            </section>

            {/* Seed + verification */}
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                <Hash className="h-4 w-4" /> Randomness Seed (Proof)
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                The 5 winning numbers are derived deterministically from this seed using the platform's own pseudo-random number generator (PRNG). Anyone can re-run the same algorithm on this seed to confirm it reproduces the exact winning numbers above.
              </p>

              {draw.randomnessProof ? (
                <>
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-muted/50 p-3">
                    <code className="flex-1 break-all text-sm font-mono">{draw.randomnessProof}</code>
                    <button onClick={copySeed} className="shrink-0 rounded-lg border border-border bg-card p-2 hover:bg-muted" title="Copy seed">
                      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>

                  <div className="mt-4 rounded-xl border border-border p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reproduced from seed</p>
                    {reproduced && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {parseNumbers(reproduced).map((n, i) => (
                          <NumberBall key={i} n={n} size="sm" variant="gold" />
                        ))}
                        {draw.winningNumbers && (
                          <span className={cn("ml-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", matches ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                            {matches ? <><Check className="h-3.5 w-3.5" /> Verified — matches stored result</> : <><AlertTriangle className="h-3.5 w-3.5" /> Does not match</>}
                          </span>
                        )}
                      </div>
                    )}
                    {!matches && draw.winningNumbers && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        The reproduced numbers don't match the stored winners. This happens when the draw was executed via a path that combined the seed with an internal draw identifier. The stored winning numbers above remain the authoritative result.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No randomness proof is recorded for this draw.</p>
              )}
            </section>

          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-sm font-bold", accent && "text-accent")}>{value}</p>
    </div>
  );
}