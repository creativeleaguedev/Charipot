import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { normalizeNumbers, parseNumbers } from '../../shared/lottery.ts';

// Redeem ticket passes for free ticket plays. The passes were prepaid in
// buyTicketPasses (which already split the revenue into the draw + agent
// wallet), so redemption does NOT move on-chain funds and does NOT credit the
// draw's financial counters again. It only:
//   1. Atomically debits passBalance (refuse if not enough passes).
//   2. Claims one draw slot per ticket (ticketCount++ only) — capacity enforced
//      the same way as paid tickets, with overflow to the next draw.
//   3. Creates the ticket records (price = passPrice for audit), mints GOV,
//      and credits the user's GOV balance.
//   4. Executes the draw if its ticket target is reached.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const rawCombos = Array.isArray(body.combos) ? body.combos : [];
    const agentCode = typeof body.agentCode === 'string' ? body.agentCode.trim() : '';
    if (rawCombos.length === 0) return Response.json({ error: 'No tickets provided' }, { status: 400 });
    if (rawCombos.length > 10) return Response.json({ error: 'Max 10 tickets per redemption' }, { status: 400 });

    const combos = rawCombos.map((c) => {
      const nums = typeof c === 'string' ? parseNumbers(c) : c;
      return normalizeNumbers(nums);
    });

    // Economic parameters.
    const params = await svc.entities.ConfigParameter.list('-key', 100);
    const cfg: Record<string, number> = {};
    params.forEach((p) => { cfg[p.key] = Number(p.value); });
    const get = (k: string, d: number) => (cfg[k] ?? d);
    const price = get('ticket_price', 0.1);
    const target = get('draw_target', 5);
    const govEarned = get('gov_mint_ratio', 1);
    const HOUSE_CODE = 'ROTARY-DEN-33';

    // Passes are prepaid in buyTicketPasses, which already splits the bundle
    // across the custody wallets and credits the active draw's jackpot / prize
    // / charity / reserve counters. Redemption must NOT credit those again: the
    // ticket enters the draw with ZERO contribution values so executeDraw
    // (which sums ticket contributions into the 4/5 + 3/5 pools and the platform
    // wallet ledgers) does not re-add the pass funds. The pass holder still
    // participates in the 5/5 jackpot and rolled-over 4/5 / 3/5 pots funded at
    // purchase time.
    const passPrice = +(price / 2).toFixed(4);

    // Wallet + atomic pass debit.
    const wallets = await svc.entities.Wallet.filter({ userId: user.id });
    const wallet = wallets[0];
    if (!wallet) return Response.json({ error: 'No wallet' }, { status: 400 });
    if ((wallet.passBalance || 0) < combos.length) {
      return Response.json({ error: 'insufficient_passes', balance: wallet.passBalance || 0, needed: combos.length });
    }
    const debit = await svc.entities.Wallet.updateMany(
      { id: wallet.id, passBalance: { $gte: combos.length } },
      { $inc: { passBalance: -combos.length, passSpent: combos.length } }
    );
    if (!debit || debit.updated !== 1) {
      return Response.json({ error: 'insufficient_passes', balance: wallet.passBalance || 0, needed: combos.length });
    }

    // FIFO debit from the earliest-expiring active pass purchases so the
    // per-package expiry tracking stays in sync with the wallet aggregate.
    // The wallet debit above is authoritative; this is best-effort accounting.
    try {
      const purchases = await svc.entities.PassPurchase.filter({ userId: user.id, status: 'active' });
      purchases.sort((a: any, b: any) => {
        if (!a.expiresAt && !b.expiresAt) return 0;
        if (!a.expiresAt) return 1;
        if (!b.expiresAt) return -1;
        return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
      });
      let toDebit = combos.length;
      for (const p of purchases) {
        if (toDebit <= 0) break;
        const rem = Number(p.remaining) || 0;
        if (rem <= 0) continue;
        const take = Math.min(toDebit, rem);
        await svc.entities.PassPurchase.update(p.id, { remaining: rem - take });
        toDebit -= take;
      }
    } catch (_) { /* non-critical — wallet balance already debited */ }

    // Capacity-only claim: increments ticketCount, NOT the financial counters
    // (those were credited at pass-purchase time).
    const claimInc = { ticketCount: 1 };

    // Active draw (seed if none).
    let draws = await svc.entities.Draw.list('-drawNumber', 10);
    let currentDraw = draws.find((d) =>
      ['BUILDING', 'MINIMUM_REACHED', 'TARGET_REACHED'].includes(d.status)
    );
    if (!currentDraw) {
      const last = draws[0];
      const nextNumber = (last?.drawNumber || 0) + 1;
      const won = last && (last.winners5 || 0) > 0;
      const rollover = last && !won ? (last.jackpotAmount || 0) : 0;
      const reserveSeed = last && won ? (last.reserveBalance || 0) : 0;
      currentDraw = await svc.entities.Draw.create({
        drawNumber: nextNumber, status: 'BUILDING',
        jackpotAmount: +(rollover + reserveSeed).toFixed(2), prizePool: 0,
        targetTickets: target, minThreshold: get('min_jackpot', 3500),
        reserveBalance: last && !won ? (last.reserveBalance || 0) : reserveSeed,
        reserveAllocation: 0, createdAt: new Date().toISOString(),
      });
    }

    let currentAlloc = 0;
    let overflowAlloc = 0;
    let nextDraw: any = null;
    const placement: ('current' | 'overflow')[] = [];
    for (let i = 0; i < combos.length; i++) {
      const claim = await svc.entities.Draw.updateMany(
        { id: currentDraw.id, ticketCount: { $lt: target } },
        { $inc: claimInc }
      );
      if (claim && claim.updated === 1) {
        currentAlloc++;
        placement.push('current');
      } else {
        if (!nextDraw) {
          const nextNumber = currentDraw.drawNumber + 1;
          const existing = await svc.entities.Draw.filter({ drawNumber: nextNumber });
          nextDraw = existing.length ? existing[0] : await svc.entities.Draw.create({
            drawNumber: nextNumber, status: 'BUILDING', jackpotAmount: 0, prizePool: 0,
            targetTickets: target, minThreshold: get('min_jackpot', 3500),
            reserveBalance: currentDraw.reserveBalance || 0, reserveAllocation: 0,
            createdAt: new Date().toISOString(),
          });
        }
        await svc.entities.Draw.updateMany(
          { id: nextDraw.id, ticketCount: { $lt: target } },
          { $inc: claimInc }
        );
        overflowAlloc++;
        placement.push('overflow');
      }
    }

    const curReloaded = await svc.entities.Draw.get(currentDraw.id);
    const nextReloaded = nextDraw ? await svc.entities.Draw.get(nextDraw.id) : null;
    const curCount = curReloaded.ticketCount || 0;
    const nextCount = nextReloaded ? (nextReloaded.ticketCount || 0) : 0;

    const currentTickets: any[] = [];
    const overflowTickets: any[] = [];
    let curIdx = 0;
    let ovfIdx = 0;
    for (let i = 0; i < combos.length; i++) {
      const isCurrent = placement[i] === 'current';
      const drawNumber = isCurrent ? currentDraw.drawNumber : nextDraw.drawNumber;
      const ticketNumber = isCurrent
        ? curCount - currentAlloc + 1 + curIdx
        : nextCount - overflowAlloc + 1 + ovfIdx;
      const ticket = await svc.entities.Ticket.create({
        ticketNumber, drawNumber, userId: user.id,
        fullName: user.full_name || user.email, numbers: combos[i],
        status: 'ACTIVE', agentCode: agentCode || HOUSE_CODE,
        price: passPrice, charityContribution: 0, prizeContribution: 0,
        platformFee: 0, agentReferral: 0, govEarned, quickPick: false,
        createdAt: new Date().toISOString(),
      });
      const view = { id: ticket.id, ticketNumber, drawNumber, numbers: combos[i] };
      if (isCurrent) { currentTickets.push(view); curIdx++; }
      else { overflowTickets.push(view); ovfIdx++; }

      await svc.entities.GovTransaction.create({
        fromUserId: 'system', fromName: 'Lottery Mint',
        toUserId: user.id, toName: user.full_name || user.email,
        amount: govEarned, type: 'MINT',
        reference: 'mint_' + ticket.id, createdAt: new Date().toISOString(),
      });
    }

    // Credit GOV for the whole cart.
    await svc.entities.Wallet.updateMany(
      { id: wallet.id },
      { $inc: { govBalance: +(govEarned * combos.length).toFixed(2) } }
    );

    // Execute the draw if its target was reached.
    let drawExecuted = false;
    if ((curReloaded.ticketCount || 0) >= target) {
      try {
        const res = await base44.functions.invoke('executeDraw', {});
        drawExecuted = !!(res && res.data && res.data.success);
      } catch (_) {}
    }

    return Response.json({
      success: true,
      currentDrawNumber: currentDraw.drawNumber,
      currentCount: currentAlloc,
      currentTickets,
      overflowDrawNumber: nextDraw ? nextDraw.drawNumber : null,
      overflowCount: overflowAlloc,
      overflowTickets,
      govMinted: govEarned * combos.length,
      passesSpent: combos.length,
      drawExecuted,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}