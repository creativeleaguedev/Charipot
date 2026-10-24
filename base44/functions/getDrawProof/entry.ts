import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Public draw-verification endpoint. Returns only the transparency-relevant
// fields of a single draw so anyone — including logged-out visitors — can
// open the /proof/:drawNumber page and independently reproduce the winning
// numbers from the stored randomness seed. Uses the service role because
// anonymous visitors carry no app-user token.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({} as any));
    const drawNumber = Number(body?.drawNumber);
    if (!drawNumber || Number.isNaN(drawNumber)) {
      return Response.json({ error: 'drawNumber required' }, { status: 400 });
    }
    const draws = await base44.asServiceRole.entities.Draw.filter({ drawNumber });
    const d = draws[0];
    if (!d) return Response.json({ error: 'Draw not found' }, { status: 404 });
    return Response.json({
      drawNumber: d.drawNumber,
      status: d.status,
      winningNumbers: d.winningNumbers || null,
      randomnessProof: d.randomnessProof || null,
      winners5: d.winners5 || 0,
      winners4: d.winners4 || 0,
      winners3: d.winners3 || 0,
      jackpotAmount: d.jackpotAmount || 0,
      prizePool: d.prizePool || 0,
      ticketCount: d.ticketCount || 0,
      targetTickets: d.targetTickets || 0,
      completedAt: d.completedAt || null,
      lockedAt: d.lockedAt || null,
      rolloverFrom: d.rolloverFrom || null,
      totalPrizesPaid: d.totalPrizesPaid || 0,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}