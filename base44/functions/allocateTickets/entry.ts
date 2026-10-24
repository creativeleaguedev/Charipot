import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { normalizeNumbers, parseNumbers } from '../../shared/lottery.ts';
import { computeAmountShares } from '../../shared/walletAllocations.ts';

// Atomic ticket allocation engine. Selection is purely client-side (the cart);
// nothing is persisted until payment is confirmed. This function is called ONLY
// after payToTreasury has confirmed the on-chain transfer, so invocation order
// follows payment-confirmation order — not selection time.
//
// Capacity is enforced atomically: each ticket claims a single slot via a
// conditional updateMany (ticketCount < target). If the active draw is full, the
// ticket rolls over to the next draw. No two users can exceed the draw's fixed
// ticket capacity, and once capacity hits zero every further paid ticket
// automatically moves to the next draw.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const rawCombos = Array.isArray(body.combos) ? body.combos : [];
    const agentCode = typeof body.agentCode === 'string' ? body.agentCode.trim() : '';
    if (rawCombos.length === 0) return Response.json({ error: 'No tickets provided' }, { status: 400 });
    if (rawCombos.length > 10) return Response.json({ error: 'Max 10 tickets per purchase' }, { status: 400 });

    // Re-normalize every combo so stored numbers are always zero-padded + sorted.
    const combos = rawCombos.map((c) => {
      const nums = typeof c === 'string' ? parseNumbers(c) : c;
      return normalizeNumbers(nums);
    });

    // Load economic parameters from the registry.
    const params = await svc.entities.ConfigParameter.list('-key', 100);
    const cfg: Record<string, number> = {};
    params.forEach((p) => { cfg[p.key] = Number(p.value); });
    const get = (k: string, d: number) => (cfg[k] ?? d);
    const price = get('ticket_price', 0.1);
    const target = get('draw_target', 5);
    const govEarned = get('gov_mint_ratio', 1);

    // Fixed platform split per ticket (see walletAllocations.computeWalletPercents).
    // The 2% agent referral is ALWAYS carved out — it goes to the attributed
    // agent's wallet, or the house agent wallet when no referral code is given.
    const shares = computeAmountShares(price, cfg);
    const agentRef = shares.agent_fee;
    const charity = shares.charity;
    const prize = shares.prize;
    const platform = shares.treasury;
    const jackpotAdd = shares.jackpot_5;   // 5/5 wallet share (net of buffer)
    const buffer = shares.buffer;
    // 4/5 + 3/5 accrual per ticket, added to the draw's running prizePool so
    // the displayed jackpot = jackpotAmount (5/5) + prizePool (4/5 + 3/5).
    const poolAdd = shares.pool;

    // The atomic per-slot claim: increments capacity + financial counters in one
    // conditional update. Only succeeds while ticketCount < target.
    const claimInc = {
      ticketCount: 1,
      jackpotAmount: jackpotAdd,
      prizePool: poolAdd,
      charityContribution: charity,
      reserveAllocation: buffer,
      reserveBalance: buffer,
    };

    // Find the active building draw, or seed one if none exists.
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
        drawNumber: nextNumber,
        status: 'BUILDING',
        jackpotAmount: +(rollover + reserveSeed).toFixed(2),
        prizePool: 0,
        targetTickets: target,
        minThreshold: get('min_jackpot', 3500),
        rolloverFrom: rollover > 0 ? last.drawNumber : undefined,
        reserveBalance: last && !won ? (last.reserveBalance || 0) : reserveSeed,
        reserveAllocation: 0,
        createdAt: new Date().toISOString(),
      });
    }

    // Resolve the wallet that earns the 2% agent referral for this purchase:
    // the attributed agent (looked up by referral code), or the house agent
    // wallet (kemboi5870@gmail.com) for tickets sold without a referral code.
    // The in-house code ROTARY-DEN-33 always routes to the house agent wallet.
    const HOUSE_AGENT_EMAIL = 'kemboi5870@gmail.com';
    const HOUSE_CODE = 'ROTARY-DEN-33';
    let agentWallet: any = null;
    let bonusAgentCode = agentCode || HOUSE_CODE;
    let bonusAgentName = 'Agent';
    if (agentCode && agentCode !== HOUSE_CODE) {
      const found = await svc.entities.Wallet.filter({ agentCode });
      agentWallet = found[0] || null;
      bonusAgentName = agentWallet?.fullName || 'Agent';
    } else {
      const houseUser = (await svc.entities.User.filter({ email: HOUSE_AGENT_EMAIL }))[0];
      if (houseUser) {
        const found = await svc.entities.Wallet.filter({ userId: houseUser.id });
        agentWallet = found[0] || null;
      }
      bonusAgentCode = HOUSE_CODE;
      bonusAgentName = 'House Agent';
    }

    // Atomic per-ticket allocation. Each claim is a single conditional updateMany
    // on the draw (ticketCount < target). On success the ticket enters the
    // current draw; on failure (draw full) it overflows to the next draw.
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
          if (existing.length) {
            nextDraw = existing[0];
          } else {
            nextDraw = await svc.entities.Draw.create({
              drawNumber: nextNumber,
              status: 'BUILDING',
              jackpotAmount: 0,
              prizePool: 0,
              targetTickets: target,
              minThreshold: get('min_jackpot', 3500),
              reserveBalance: currentDraw.reserveBalance || 0,
              reserveAllocation: 0,
              createdAt: new Date().toISOString(),
            });
          }
        }
        await svc.entities.Draw.updateMany(
          { id: nextDraw.id, ticketCount: { $lt: target } },
          { $inc: claimInc }
        );
        overflowAlloc++;
        placement.push('overflow');
      }
    }

    // Reload draws to compute ticket numbers from the live ticketCount.
    const curReloaded = await svc.entities.Draw.get(currentDraw.id);
    const nextReloaded = nextDraw ? await svc.entities.Draw.get(nextDraw.id) : null;
    const curCount = curReloaded.ticketCount || 0;
    const nextCount = nextReloaded ? (nextReloaded.ticketCount || 0) : 0;

    // Create the ticket records, GOV mints, and agent referral records.
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
        ticketNumber,
        drawNumber,
        userId: user.id,
        fullName: user.full_name || user.email,
        numbers: combos[i],
        status: 'ACTIVE',
        agentCode: agentCode || HOUSE_CODE,
        price,
        charityContribution: charity,
        prizeContribution: prize,
        platformFee: platform,
        agentReferral: agentRef,
        govEarned,
        quickPick: false,
        createdAt: new Date().toISOString(),
      });
      const view = { id: ticket.id, ticketNumber, drawNumber, numbers: combos[i] };
      if (isCurrent) { currentTickets.push(view); curIdx++; }
      else { overflowTickets.push(view); ovfIdx++; }

      await svc.entities.GovTransaction.create({
        fromUserId: 'system',
        fromName: 'Lottery Mint',
        toUserId: user.id,
        toName: user.full_name || user.email,
        amount: govEarned,
        type: 'MINT',
        reference: 'mint_' + ticket.id,
        createdAt: new Date().toISOString(),
      });

      // The 2% referral is credited directly to the earning wallet's ledger on
      // every ticket sold — attributed agent or house agent when unattributed.
      await svc.entities.AgentBonusRecord.create({
        agentCode: bonusAgentCode || 'HOUSE',
        agentName: bonusAgentName,
        ticketId: ticket.id,
        ticketNumber,
        drawNumber,
        type: 'REFERRAL',
        amount: agentRef,
        status: 'SETTLED',
        createdAt: new Date().toISOString(),
      });
    }

    // Credit the wallet GOV balance for the whole cart at once.
    const wallets = await svc.entities.Wallet.filter({ userId: user.id });
    if (wallets[0]) {
      await svc.entities.Wallet.update(wallets[0].id, {
        govBalance: +((wallets[0].govBalance || 0) + govEarned * combos.length).toFixed(2),
      });
    }

    // Credit the 2% agent referral directly to the earning wallet's ledger.
    // Paid immediately on every ticket sold (attributed agent or house agent).
    if (agentWallet && agentRef > 0) {
      await svc.entities.Wallet.update(agentWallet.id, {
        totalReferralEarnings: +((agentWallet.totalReferralEarnings || 0) + agentRef * combos.length).toFixed(2),
      });
    }

    // If the current draw reached its ticket target, execute it. executeDraw
    // completes the draw and rolls any unwon pots into the next draw (which may
    // already exist if overflow occurred — it upserts the rollover).
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
      drawExecuted,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}