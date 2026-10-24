import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { normalizeNumbers } from '../../shared/lottery.ts';
import { computeAmountShares } from '../../shared/walletAllocations.ts';

// Agent-on-behalf ticket purchase. A registered sales agent pays from their own
// crypto wallet for one or more recipients (by email) in a single session, and
// picks the 5 lottery numbers for each ticket (Play-style), with an optional
// quick-pick. The agent's funds are charged first (on-chain to treasury); only
// after payment succeeds are tickets created, assigned to the recipient's user
// account (inviting the user if they don't exist yet), and emailed to the
// recipient with a unique serial number + QR code. A full audit row is written
// per ticket.
//
// The agent who pays is distinct from the user who owns/uses the ticket: the
// ticket's userId is the recipient, while purchasedByAgentId records the agent.

const HOUSE_AGENT_EMAIL = 'kemboi5870@gmail.com';
const HOUSE_CODE = 'ROTARY-DEN-33';
const POOL = 39;
const PICK = 5;

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Accepts "04-08-17-22-39" or [4,8,17,22,39]; returns a normalized string or ''.
function parsePick(input: any): string {
  let arr: number[];
  if (Array.isArray(input)) arr = input.map((n) => Number(n));
  else if (typeof input === 'string') arr = input.split('-').map((n) => Number(n));
  else return '';
  arr = arr.filter((n) => Number.isInteger(n) && n >= 1 && n <= POOL);
  if (arr.length !== PICK) return '';
  if (new Set(arr).size !== PICK) return '';
  return normalizeNumbers(arr);
}

function serialFor(drawNumber: number, ticketNumber: number): string {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CHARI-${drawNumber}-${String(ticketNumber).padStart(5, '0')}-${rand}`;
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length) return Response.json({ error: 'Add at least one ticket' }, { status: 400 });
    if (rawItems.length > 100) return Response.json({ error: 'Max 100 tickets per purchase' }, { status: 400 });

    const cart = rawItems.map((it: any) => ({
      email: String(it.email || '').trim().toLowerCase(),
      fullName: String(it.fullName || '').trim(),
      numbers: parsePick(it.numbers),
    }));
    if (cart.some((c) => !isEmail(c.email))) {
      return Response.json({ error: 'One or more recipient emails are invalid' }, { status: 400 });
    }
    if (cart.some((c) => !c.numbers)) {
      return Response.json({ error: 'Each ticket needs 5 distinct numbers from 1 to 39' }, { status: 400 });
    }
    const totalTickets = cart.length;

    // Agent wallet + agent gating.
    const agentWallets = await svc.entities.Wallet.filter({ userId: user.id });
    const agentWallet = agentWallets[0];
    if (!agentWallet || !agentWallet.walletAddress) {
      return Response.json({ error: 'No wallet', needsWallet: true }, { status: 400 });
    }
    if (!agentWallet.isAgent) {
      return Response.json({ error: 'Only registered agents can sell on behalf of users' }, { status: 403 });
    }

    // Economic parameters from the registry.
    const params = await svc.entities.ConfigParameter.list('-key', 100);
    const cfg: Record<string, number> = {};
    params.forEach((p) => { cfg[p.key] = Number(p.value); });
    const get = (k: string, d: number) => (cfg[k] ?? d);
    const price = get('ticket_price', 0.1);
    const target = get('draw_target', 5);
    const govEarned = get('gov_mint_ratio', 1);

    const usePasses = !!body.usePasses;
    const passPrice = +(price / 2).toFixed(4);
    const unitPrice = usePasses ? passPrice : price;
    const totalAmount = +((totalTickets * unitPrice).toFixed(2));

    // Fixed platform split per ticket (see walletAllocations.computeWalletPercents).
    // On crypto this is the ledger of the on-chain split already landed in the
    // custody wallets. On passes the pass was prepaid in buyTicketPasses (revenue
    // split then), so this records the half-price pass value only.
    const shares = computeAmountShares(unitPrice, cfg);
    const charity = shares.charity;
    const prize = shares.prize;
    const platform = shares.treasury;
    const agentRef = shares.agent_fee;
    const jackpotAdd = shares.jackpot_5;
    const buffer = shares.buffer;
    const poolAdd = shares.pool;

    let payment: any;
    let claimInc: any;
    if (usePasses) {
      // ---- PAYMENT WITH PASSES (agent's own pass balance) ----
      if ((agentWallet.passBalance || 0) < totalTickets) {
        return Response.json({ error: 'insufficient_passes', balance: agentWallet.passBalance || 0, needed: totalTickets });
      }
      const debit = await svc.entities.Wallet.updateMany(
        { id: agentWallet.id, passBalance: { $gte: totalTickets } },
        { $inc: { passBalance: -totalTickets, passSpent: totalTickets } },
      );
      if (!debit || debit.updated !== 1) {
        return Response.json({ error: 'insufficient_passes', balance: agentWallet.passBalance || 0, needed: totalTickets });
      }
      // Passes were prepaid: claim a draw slot only, do NOT credit financial
      // counters again.
      claimInc = { ticketCount: 1 };
      payment = { method: 'passes', passes: totalTickets };
    } else {
      // ---- PAYMENT (agent's own crypto wallet) ----
      const balRes = await base44.functions.invoke('getWalletBalances', {});
      const bd: any = balRes.data;
      if (bd?.needsWallet) return Response.json({ error: 'No wallet', needsWallet: true }, { status: 400 });
      if (bd?.error) return Response.json({ error: bd.error });
      const chains: any[] = bd?.chains || [];
      let chosen: { chain: string; token: string } | null = null;
      for (const c of chains) {
        if (Number(c.balances?.USDC) >= totalAmount) { chosen = { chain: c.chain, token: 'USDC' }; break; }
        if (Number(c.balances?.USDT) >= totalAmount) { chosen = { chain: c.chain, token: 'USDT' }; break; }
      }
      if (!chosen) {
        const best = chains.reduce((m, c) => Math.max(m, Number(c.balances?.USDC) || 0, Number(c.balances?.USDT) || 0), 0);
        return Response.json({ error: 'insufficient', balance: best, needed: totalAmount });
      }
      const payRes = await base44.functions.invoke('payToTreasury', {
        amount: totalAmount, chain: chosen.chain, token: chosen.token,
        purpose: 'LOTTERY_BUY', reference: 'agent_sell',
      });
      const pd: any = payRes.data;
      if (!pd?.success) {
        if (pd?.error === 'insufficient_gas') return Response.json({ error: 'insufficient_gas', chain: pd.chain || chosen.chain, native: pd.native });
        if (pd?.error === 'blacklisted') return Response.json({ error: 'blacklisted', message: pd.message }, { status: 403 });
        return Response.json({ error: pd?.error || 'Payment failed' });
      }
      payment = { ...pd, chain: chosen.chain, token: chosen.token, method: 'crypto' };
      claimInc = {
        ticketCount: 1, jackpotAmount: jackpotAdd, prizePool: poolAdd,
        charityContribution: charity, reserveAllocation: buffer, reserveBalance: buffer,
      };
    }

    // ---- Resolve / create current draw ----
    let draws = await svc.entities.Draw.list('-drawNumber', 10);
    let currentDraw = draws.find((d) => ['BUILDING', 'MINIMUM_REACHED', 'TARGET_REACHED'].includes(d.status));
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
    let nextDraw: any = null;

    // ---- Group tickets by recipient email (one recipient may get many tickets) ----
    const byEmail = new Map<string, { email: string; fullName: string; sets: string[] }>();
    for (const c of cart) {
      if (!byEmail.has(c.email)) byEmail.set(c.email, { email: c.email, fullName: c.fullName, sets: [] });
      const g = byEmail.get(c.email)!;
      if (c.fullName && !g.fullName) g.fullName = c.fullName;
      g.sets.push(c.numbers);
    }
    const groups = Array.from(byEmail.values());

    // ---- Resolve recipient users (invite if missing) ----
    for (const g of groups) {
      let recipient = (await svc.entities.User.filter({ email: g.email }))[0] || null;
      if (!recipient) {
        try { await base44.users.inviteUser(g.email, 'user'); } catch (_) {}
        recipient = (await svc.entities.User.filter({ email: g.email }))[0] || null;
      }
      (g as any).id = recipient?.id || '';
      (g as any).name = recipient?.full_name || g.fullName || g.email;
      (g as any).pending = !recipient;
    }

    // Flat slot list (one per ticket), preserving cart order.
    const slots: number[] = [];
    groups.forEach((g, gi) => { g.sets.forEach(() => slots.push(gi)); });

    // ---- Atomic per-slot claims (current draw, overflow to next) ----
    const placement: ('current' | 'overflow')[] = [];
    for (let i = 0; i < slots.length; i++) {
      const claim = await svc.entities.Draw.updateMany(
        { id: currentDraw.id, ticketCount: { $lt: target } }, { $inc: claimInc },
      );
      if (claim && claim.updated === 1) {
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
        await svc.entities.Draw.updateMany({ id: nextDraw.id, ticketCount: { $lt: target } }, { $inc: claimInc });
        placement.push('overflow');
      }
    }
    const currentAlloc = placement.filter((p) => p === 'current').length;
    const overflowAlloc = placement.filter((p) => p === 'overflow').length;
    const curReloaded = await svc.entities.Draw.get(currentDraw.id);
    const nextReloaded = nextDraw ? await svc.entities.Draw.get(nextDraw.id) : null;
    const curCount = curReloaded.ticketCount || 0;
    const nextCount = nextReloaded ? (nextReloaded.ticketCount || 0) : 0;

    // ---- Resolve house agent wallet (earns the 2% referral on these sales) ----
    let houseWallet: any = null;
    const houseUser = (await svc.entities.User.filter({ email: HOUSE_AGENT_EMAIL }))[0];
    if (houseUser) houseWallet = (await svc.entities.Wallet.filter({ userId: houseUser.id }))[0] || null;

    // ---- Create tickets, GOV mints, audit rows, and recipient emails ----
    const summary: any[] = [];
    let curIdx = 0;
    let ovfIdx = 0;
    let houseReferralCredit = 0;
    // Track per-group ticket lists for emailing.
    const groupTickets: any[] = groups.map(() => []);

    for (let i = 0; i < slots.length; i++) {
      const gi = slots[i];
      const g = groups[gi];
      const numbers = g.sets[groupTickets[gi].length];
      const isCurrent = placement[i] === 'current';
      const drawNumber = isCurrent ? currentDraw.drawNumber : nextDraw.drawNumber;
      const ticketNumber = isCurrent
        ? curCount - currentAlloc + 1 + curIdx
        : nextCount - overflowAlloc + 1 + ovfIdx;
      if (isCurrent) curIdx++; else ovfIdx++;

      const serial = serialFor(drawNumber, ticketNumber);
      const ticket = await svc.entities.Ticket.create({
        ticketNumber, drawNumber, userId: g.id, fullName: g.name,
        numbers, status: 'ACTIVE', agentCode: agentWallet.agentCode || HOUSE_CODE,
        price: unitPrice, charityContribution: charity, prizeContribution: prize,
        platformFee: platform, agentReferral: agentRef, govEarned, quickPick: false,
        serialNumber: serial, recipientEmail: g.email,
        purchasedByAgentId: user.id, purchasedByAgentEmail: user.email,
        agentPurchase: true, purchasedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      await svc.entities.GovTransaction.create({
        fromUserId: 'system', fromName: 'Lottery Mint',
        toUserId: g.id, toName: g.name, amount: govEarned, type: 'MINT',
        reference: 'mint_' + ticket.id, createdAt: new Date().toISOString(),
      });

      await svc.entities.AuditLog.create({
        actor: user.full_name || user.email, actorRole: 'agent',
        action: 'AGENT_TICKET_PURCHASE', entityType: 'Ticket', entityId: ticket.id,
        details: `Agent ${user.email} purchased ticket ${serial} (${numbers}) on behalf of ${g.email} — Draw #${drawNumber}, ${unitPrice} USD, paid with ${payment.method === 'passes' ? payment.passes + ' pass' + (payment.passes === 1 ? '' : 'es') : payment.token + ' on ' + payment.chain}.`,
        timestamp: new Date().toISOString(), severity: 'info',
      });

      if (houseWallet && agentRef > 0) houseReferralCredit += agentRef;
      await svc.entities.AgentBonusRecord.create({
        agentCode: HOUSE_CODE, agentName: 'House Agent', ticketId: ticket.id,
        ticketNumber, drawNumber, type: 'REFERRAL', amount: agentRef,
        status: 'SETTLED', createdAt: new Date().toISOString(),
      });

      groupTickets[gi].push({ serial, numbers, drawNumber, ticketNumber });
    }

    // Credit recipient wallets (GOV) + send each recipient their ticket email.
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const tickets = groupTickets[gi];
      let recipWallet: any = null;
      if (g.id) {
        const rw = await svc.entities.Wallet.filter({ userId: g.id });
        if (!rw.length) {
          recipWallet = await svc.entities.Wallet.create({
            userId: g.id, fullName: g.name, govBalance: 0, govBurned: 0, govCommitted: 0,
            prizeBalance: 0, totalReferralEarnings: 0, totalBonusEarnings: 0,
            isAgent: false, agentTier: 'standard', ticketsSold: 0,
          });
        } else recipWallet = rw[0];
      }
      if (recipWallet) {
        await svc.entities.Wallet.update(recipWallet.id, {
          govBalance: +((recipWallet.govBalance || 0) + govEarned * tickets.length).toFixed(2),
        });
      }

      const qrData = encodeURIComponent(tickets.map((t) => t.serial).join(','));
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}`;
      const listHtml = tickets.map((t) =>
        `<li style="padding:6px 0;border-bottom:1px solid #f1f5f9"><b style="font-family:monospace">${t.serial}</b> — Draw #${t.drawNumber} — Numbers: ${t.numbers}</li>`
      ).join('');
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#1a3a6b,#112040);padding:24px;color:#fff">
    <h1 style="margin:0;font-size:20px">Your Chari Charity Draw Ticket${tickets.length > 1 ? 's' : ''}</h1>
    <p style="margin:6px 0 0;opacity:.85;font-size:13px">Sent on behalf of your agent ${user.full_name || user.email}</p>
  </div>
  <div style="padding:24px;color:#1f2937">
    <p>Hi ${g.name},</p>
    <p>You have received <b>${tickets.length}</b> ticket${tickets.length > 1 ? 's' : ''} for the <b>Chari Charity Draw #${currentDraw.drawNumber}</b>. Your agent purchased them on your behalf and ${tickets.length > 1 ? 'they are' : 'it is'} now linked to your account (${g.email}).</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px">
      <tr><td style="padding:6px 0;color:#6b7280;width:130px">Event</td><td style="padding:6px 0">Chari Charity Draw #${currentDraw.drawNumber}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Ticket type</td><td style="padding:6px 0">5/39 Standard Entry</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Quantity</td><td style="padding:6px 0">${tickets.length}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Event date</td><td style="padding:6px 0">Drawn automatically once the ticket target is reached</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Venue</td><td style="padding:6px 0">Chari Online Platform (charipot.org)</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Ticket holder</td><td style="padding:6px 0">${g.name} — ${g.email}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Status</td><td style="padding:6px 0"><b style="color:#059669">Active</b></td></tr>
    </table>
    <h3 style="margin-top:18px;font-size:15px">Ticket serial number${tickets.length > 1 ? 's' : ''}</h3>
    <ul style="margin:0;padding-left:18px;list-style:disc">${listHtml}</ul>
    <div style="text-align:center;margin:18px 0">
      <img src="${qrUrl}" alt="Ticket QR code" style="width:180px;height:180px;border:1px solid #e5e7eb;border-radius:8px"/>
      <p style="font-size:12px;color:#6b7280;margin-top:6px">Scan to verify your serial number${tickets.length > 1 ? 's' : ''}</p>
    </div>
    <p style="font-size:12px;color:#6b7280;border-top:1px solid #f1f5f9;padding-top:12px">${g.pending ? 'You do not have an account yet — register at charipot.org using ' + g.email + ' to see these tickets under "My Tickets". ' : ''}Your agent paid for this ticket; the ticket belongs to you and appears in your My Tickets section.</p>
  </div>
</div>`;
      let emailDelivered = false;
      try {
        await svc.integrations.Core.SendEmail({
          to: g.email,
          subject: `Your Chari Charity Draw Ticket${tickets.length > 1 ? 's' : ''} (${tickets.length})`,
          html,
        });
        emailDelivered = true;
      } catch (_) {
        // SendEmail to an unregistered address requires a paid plan + custom
        // domain. The ticket is still created and linked to the recipient's
        // account; they'll see it once they register with this email.
      }

      summary.push({
        email: g.email, name: g.name, quantity: tickets.length,
        serials: tickets.map((t) => t.serial),
        pendingRegistration: g.pending,
        emailDelivered,
      });
    }

    // Credit the 2% referral to the house agent wallet.
    if (houseWallet && houseReferralCredit > 0) {
      await svc.entities.Wallet.update(houseWallet.id, {
        totalReferralEarnings: +((houseWallet.totalReferralEarnings || 0) + houseReferralCredit).toFixed(2),
      });
    }

    // Bump the agent's ticketsSold ledger.
    await svc.entities.Wallet.update(agentWallet.id, {
      ticketsSold: +((agentWallet.ticketsSold || 0) + totalTickets).toFixed(0),
    });

    // Execute the draw if the target was reached.
    let drawExecuted = false;
    if ((curReloaded.ticketCount || 0) >= target) {
      try {
        const r = await base44.functions.invoke('executeDraw', {});
        drawExecuted = !!(r && r.data && r.data.success);
      } catch (_) {}
    }

    const allEmailsDelivered = summary.length > 0 && summary.every((s) => s.emailDelivered);
    return Response.json({
      success: true, totalTickets, totalAmount,
      paidWith: payment.method === 'passes'
        ? { method: 'passes', passes: payment.passes }
        : { method: 'crypto', chain: payment.chain, token: payment.token, txHash: payment.txHash },
      drawNumber: currentDraw.drawNumber, drawExecuted, summary,
      allEmailsDelivered,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}