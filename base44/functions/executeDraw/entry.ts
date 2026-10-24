import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  normalizeNumbers,
  countMatches,
  prizeTier,
  generateWinningNumbers,
  makeRandomnessProof,
} from '../../shared/lottery.ts';
import { computeDrawInflows } from '../../shared/walletAllocations.ts';
import { secrets } from 'base44:runtime';
import { sendTokenFromRawKey, readOnChainBalances, checkGasForTransfers } from '../../shared/walletCrypto.ts';

// Executes a draw once it has reached its ticket target: locks the draw,
// draws 5 winning numbers (verifiable randomness proof), matches every
// ticket in the draw to determine winners, credits prize balances, completes
// the draw, and seeds the next sequential draw (with jackpot rollover + the
// configured starting jackpot base).
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const svc = base44.asServiceRole;

    // Load economic parameters from the registry.
    const params = await svc.entities.ConfigParameter.list('-key', 100);
    const cfg: Record<string, number> = {};
    params.forEach((p) => { cfg[p.key] = Number(p.value); });
    const get = (k: string, d: number) => (cfg[k] ?? d);
    const target = get('draw_target', 5);
    const startingJackpot = get('starting_jackpot', 0.25);
    const prize4 = get('prize_4', 20);
    const prize3 = get('prize_3', 10);
    const claimFee = get('claim_fee', 0);

    // Find the active (still building) draws. When overflow creates a newer
    // building draw before the older one is executed, we must finish the OLDEST
    // draw that has reached its target first — otherwise listing newest-first
    // would inspect the newer (empty) draw and leave the full one stuck.
    const draws = await svc.entities.Draw.list('-drawNumber', 20);
    const building = draws.filter((d) =>
      ['BUILDING', 'MINIMUM_REACHED', 'TARGET_REACHED'].includes(d.status)
    );
    if (building.length === 0) return Response.json({ error: 'No active draw' }, { status: 400 });
    building.sort((a, b) => a.drawNumber - b.drawNumber);
    const draw = building.find((d) => (d.ticketCount || 0) >= target);
    if (!draw) {
      const fullest = building.reduce((a, b) => ((a.ticketCount || 0) >= (b.ticketCount || 0) ? a : b));
      return Response.json({ notReady: true, ticketCount: fullest.ticketCount, target });
    }

    // Lock the draw so no further tickets can be added.
    await svc.entities.Draw.update(draw.id, {
      status: 'LOCKED',
      lockedAt: new Date().toISOString(),
    });

    // Draw the winning numbers with a verifiable randomness proof.
    const proof = makeRandomnessProof();
    const winning = generateWinningNumbers(proof);
    const winningStr = normalizeNumbers(winning);

    // Every ticket purchased for this draw.
    const tickets = await svc.entities.Ticket.filter(
      { drawNumber: draw.drawNumber }, '-createdAt', 5000
    );

    // Prize pools from actual ticket prize contributions. The 4/5 and 3/5
    // pools are the full tier share of the gross prize; the buffer/reserve
    // (reserve_split% of the 5/5 jackpot share) is carved out during ticket
    // accrual, so draw.jackpotAmount is already the net current jackpot.
    const grossPrize = tickets.reduce((s, t) => s + (t.prizeContribution || 0), 0);
    const pool4 = +((grossPrize * prize4) / 100).toFixed(2);
    const pool3 = +((grossPrize * prize3) / 100).toFixed(2);
    // Each tier pot = this draw's contribution + the carried-over un-won pot
    // from prior draws. Pots grow independently until their tier is won.
    const fullPool4 = +(pool4 + (draw.pool4Carry || 0)).toFixed(2);
    const fullPool3 = +(pool3 + (draw.pool3Carry || 0)).toFixed(2);
    const jackpotPot = draw.jackpotAmount || 0; // 5/5 pot (starting + carried 5/5 + accrued, net of buffer)

    // Tally winners per tier.
    let w5 = 0, w4 = 0, w3 = 0;
    const rows = tickets.map((t) => {
      const m = countMatches(t.numbers, winningStr);
      const tier = prizeTier(m);
      if (tier === '5/5') w5++;
      else if (tier === '4/5') w4++;
      else if (tier === '3/5') w3++;
      return { id: t.id, userId: t.userId, tier, agentCode: t.agentCode || '', ticketNumber: t.ticketNumber || 0 };
    });
    const each5 = w5 > 0 ? +(jackpotPot / w5).toFixed(2) : 0;
    const each4 = w4 > 0 ? +(fullPool4 / w4).toFixed(2) : 0;
    // 3/5 prize = the ACTUAL on-chain balance of the winnings_3 custody wallet
    // (USDC + USDT across all chains) split equally among all 3/5 winners, so
    // each winner's payout matches the real funds held for that tier. Falls
    // back to the computed pool only if the wallet/balance can't be read.
    let each3 = 0;
    if (w3 > 0) {
      try {
        const w3w = (await svc.entities.PlatformWallet.filter({ key: 'winnings_3' }))[0];
        if (w3w?.address) {
          const w3Chains = await readOnChainBalances(w3w.address);
          const walletTotal = w3Chains.reduce(
            (s, c) => s + Number(c.balances?.USDC ?? 0) + Number(c.balances?.USDT ?? 0), 0
          );
          each3 = walletTotal > 0 ? +(walletTotal / w3).toFixed(2) : +(fullPool3 / w3).toFixed(2);
        } else {
          each3 = +(fullPool3 / w3).toFixed(2);
        }
      } catch (_) {
        each3 = +(fullPool3 / w3).toFixed(2);
      }
    }
    const bonusRate = get('winning_agent_bonus', 1);

    // Settle every ticket. For 5/5 winners carrying a valid agent attribution
    // recorded before draw lock (§12.5 / §16.3), the Winning Agent Bonus is
    // carved from that ticket's jackpot share and paid to the agent; the
    // remainder goes to the winning player. Unattributed 5/5 tickets pay in
    // full with no deduction.
    const ticketUpdates: any[] = [];
    const bonusRecords: { agentCode: string; ticketId: string; ticketNumber: number; amount: number }[] = [];
    const payouts: { drawNumber: number; ticketId: string; ticketNumber: number; userId: string; tier: string; amount: number }[] = [];
    let totalAgentBonus = 0;
    let totalClaimFee = 0;
    for (const r of rows) {
      let prize = 0;
      let bonusDeducted = 0;
      if (r.tier === '5/5') {
        if (r.agentCode) {
          bonusDeducted = +(each5 * bonusRate / 100).toFixed(2);
          prize = +(each5 - bonusDeducted).toFixed(2);
          totalAgentBonus = +(totalAgentBonus + bonusDeducted).toFixed(2);
          bonusRecords.push({ agentCode: r.agentCode, ticketId: r.id, ticketNumber: r.ticketNumber, amount: bonusDeducted });
        } else {
          prize = each5;
        }
      } else if (r.tier === '4/5') {
        prize = each4;
      } else if (r.tier === '3/5') {
        prize = each3;
      }
      // Claim fee: deduct claim_fee% from each winning payout to the treasury.
      let net = prize;
      if (prize > 0 && claimFee > 0) {
        const fee = +(prize * claimFee / 100).toFixed(2);
        net = +(prize - fee).toFixed(2);
        totalClaimFee = +(totalClaimFee + fee).toFixed(2);
      }
      if (net > 0 && r.userId && r.tier !== 'none') payouts.push({ drawNumber: draw.drawNumber, ticketId: r.id, ticketNumber: r.ticketNumber || 0, userId: r.userId, tier: r.tier, amount: net });
      ticketUpdates.push({
        id: r.id,
        prizeTier: r.tier,
        prizeAmount: net,
        agentBonusDeducted: bonusDeducted,
        status: r.tier === 'none' ? 'EXPIRED' : 'WINNING',
      });
    }
    await svc.entities.Ticket.bulkUpdate(ticketUpdates);

    // Record each Winning Agent Bonus per ticket (§16.3: computed
    // independently per winning ticket) and credit the summed amount to the
    // agent's lifetime bonus earnings.
    const agentTotals: Record<string, number> = {};
    bonusRecords.forEach((b) => { agentTotals[b.agentCode] = (agentTotals[b.agentCode] || 0) + b.amount; });
    for (const [code, amt] of Object.entries(agentTotals)) {
      const agentWallets = await svc.entities.Wallet.filter({ agentCode: code });
      const aw = agentWallets[0];
      if (aw) {
        await svc.entities.Wallet.update(aw.id, {
          totalBonusEarnings: +((aw.totalBonusEarnings || 0) + amt).toFixed(2),
        });
      }
      for (const b of bonusRecords.filter((x) => x.agentCode === code)) {
        await svc.entities.AgentBonusRecord.create({
          agentCode: code,
          agentName: aw?.fullName || 'Agent',
          ticketId: b.ticketId,
          ticketNumber: b.ticketNumber,
          drawNumber: draw.drawNumber,
          type: 'WINNING_BONUS',
          amount: b.amount,
          status: 'ACCRUED',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Hold player prizes for admin verification before release. Each winning
    // ticket becomes a PrizePayout record in PENDING_VERIFICATION status; the
    // admin verifies the winner (blacklist check) and releases or rejects the
    // payout from the Admin Console. Prizes are NOT credited to wallets here.
    const totalPrizesPaid = +payouts.reduce((s, p) => s + p.amount, 0).toFixed(2);
    for (const p of payouts) {
      const wlist = await svc.entities.Wallet.filter({ userId: p.userId });
      const w = wlist[0];
      await svc.entities.PrizePayout.create({
        drawNumber: p.drawNumber,
        ticketId: p.ticketId,
        ticketNumber: p.ticketNumber,
        userId: p.userId,
        fullName: w?.fullName || '',
        walletId: w?.id || '',
        walletAddress: w?.walletAddress || '',
        tier: p.tier,
        amount: p.amount,
        status: 'PENDING_VERIFICATION',
        createdAt: new Date().toISOString(),
      });
    }
    await svc.entities.AuditLog.create({
      actor: 'VRF Oracle', actorRole: 'system', action: 'PAYOUTS_PENDING_VERIFICATION',
      entityType: 'Draw', entityId: draw.id,
      details: `Draw #${draw.drawNumber}: ${payouts.length} prize payout(s) held for admin verification (total ${totalPrizesPaid}).`,
      timestamp: new Date().toISOString(), severity: 'warning',
    });

    // Record the aggregate claim fee routed to the developer treasury.
    if (totalClaimFee > 0) {
      await svc.entities.CryptoTransaction.create({
        type: 'FEE',
        chain: 'bnb',
        token: 'USDC',
        amount: totalClaimFee,
        status: 'CONFIRMED',
        toAddress: 'treasury',
        reference: 'claim_fee_draw_' + draw.drawNumber,
        createdAt: new Date().toISOString(),
      });
    }

    // Route this draw's revenue to each platform wallet's ledger balance.
    // The 7 wallets (charity, jackpot_5, winnings_4, winnings_3, buffer,
    // treasury, agent_fee) each receive their configured share; the claim fee
    // is added to the Treasury wallet on top of its ticket platform-fee share.
    const inflows = computeDrawInflows(tickets, cfg, pool4, pool3, totalClaimFee);
    const platformWallets = await svc.entities.PlatformWallet.list('order', 100);
    for (const pw of platformWallets) {
      const inc = inflows[pw.key];
      if (inc && inc > 0) {
        await svc.entities.PlatformWallet.update(pw.id, {
          ledgerBalance: +((pw.ledgerBalance || 0) + inc).toFixed(2),
        });
      }
    }

    // Seed the jackpot ON-CHAIN: after every draw, sweep the buffer wallet's
    // entire on-chain balance (USDC + USDT across BNB/Ethereum/Polygon) and
    // split it equally across the three prize wallets (5/5, 4/5, 3/5) — one
    // third to each, whether the jackpot was won or not. The buffer accrues its
    // 2.8% share during the draw (credited above via computeDrawInflows); this
    // moves the real tokens on-chain so the prize wallets' on-chain balances
    // (which the public jackpot display reads) actually grow. The buffer's EVM
    // private key is held in the BUFFER_WALLET_PRIVATE_KEY secret so the platform
    // can sign the sends. Internal ledger balances are mirrored to match. If the
    // key is not yet configured, falls back to a ledger-only roll so seeding
    // still happens. Chains where the buffer lacks native gas are skipped and
    // retried on the next draw — the draw itself never fails because of the sweep.
    const bufWallet = (await svc.entities.PlatformWallet.filter({ key: 'buffer' }))[0];
    const jpWallet = (await svc.entities.PlatformWallet.filter({ key: 'jackpot_5' }))[0];
    const w4Wallet = (await svc.entities.PlatformWallet.filter({ key: 'winnings_4' }))[0];
    const w3Wallet = (await svc.entities.PlatformWallet.filter({ key: 'winnings_3' }))[0];
    let bufferRolled = 0;
    let bufferThird = 0;
    const bufferKey = secrets.get('BUFFER_WALLET_PRIVATE_KEY');
    if (bufWallet && bufferKey && jpWallet && w4Wallet && w3Wallet) {
      const dests = [
        { key: 'jackpot_5', address: jpWallet.address },
        { key: 'winnings_4', address: w4Wallet.address },
        { key: 'winnings_3', address: w3Wallet.address },
      ];
      const chains = await readOnChainBalances(bufWallet.address);
      const txHashes: string[] = [];
      for (const c of chains) {
        for (const sym of ['USDC', 'USDT'] as const) {
          const total = Number(c.balances?.[sym] ?? 0);
          if (!(total > 0)) continue;
          const gas = await checkGasForTransfers(c.chain, bufWallet.address, 3);
          if (!gas.ok) continue;
          const third = +(total / 3).toFixed(6);
          const last = +(total - third * 2).toFixed(6);
          const shares = [third, third, last];
          let sent = 0;
          for (let i = 0; i < dests.length; i++) {
            const amt = shares[i];
            if (!(amt > 0)) continue;
            try {
              const tx = await sendTokenFromRawKey(c.chain, sym, bufferKey, dests[i].address, amt);
              txHashes.push(tx.txHash);
              sent = +(sent + amt).toFixed(6);
            } catch (_) { /* individual send failure; remainder retried next draw */ }
          }
          if (sent > 0) bufferRolled = +(bufferRolled + sent).toFixed(6);
        }
      }
      bufferThird = +(bufferRolled / 3).toFixed(6);
      if (bufferRolled > 0) {
        await svc.entities.PlatformWallet.update(bufWallet.id, {
          ledgerBalance: +((bufWallet.ledgerBalance || 0) - bufferRolled).toFixed(2),
        });
        await svc.entities.PlatformWallet.update(jpWallet.id, { ledgerBalance: +((jpWallet.ledgerBalance || 0) + bufferThird).toFixed(2) });
        await svc.entities.PlatformWallet.update(w4Wallet.id, { ledgerBalance: +((w4Wallet.ledgerBalance || 0) + bufferThird).toFixed(2) });
        await svc.entities.PlatformWallet.update(w3Wallet.id, { ledgerBalance: +((w3Wallet.ledgerBalance || 0) + bufferThird).toFixed(2) });
        await svc.entities.AuditLog.create({
          actor: 'Draw Engine', actorRole: 'system', action: 'BUFFER_SEED_JACKPOT',
          entityType: 'Draw', entityId: draw.id,
          details: `Draw #${draw.drawNumber}: swept ${bufferRolled} USD from the buffer wallet on-chain, split equally (1/3 each) into the 5/5, 4/5 and 3/5 prize wallets. Tx hashes: ${txHashes.join(', ') || 'none'}.`,
          timestamp: new Date().toISOString(), severity: 'info',
        });
      }
    } else if (bufWallet) {
      // Ledger-only fallback while the buffer signing key is not configured.
      const roll = Number(bufWallet.ledgerBalance || 0);
      if (roll > 0) {
        bufferRolled = +roll.toFixed(2);
        bufferThird = +(roll / 3).toFixed(2);
        await svc.entities.PlatformWallet.update(bufWallet.id, {
          ledgerBalance: +((bufWallet.ledgerBalance || 0) - bufferRolled).toFixed(2),
        });
        if (jpWallet) await svc.entities.PlatformWallet.update(jpWallet.id, { ledgerBalance: +((jpWallet.ledgerBalance || 0) + bufferThird).toFixed(2) });
        if (w4Wallet) await svc.entities.PlatformWallet.update(w4Wallet.id, { ledgerBalance: +((w4Wallet.ledgerBalance || 0) + bufferThird).toFixed(2) });
        if (w3Wallet) await svc.entities.PlatformWallet.update(w3Wallet.id, { ledgerBalance: +((w3Wallet.ledgerBalance || 0) + bufferThird).toFixed(2) });
      }
    }

    // Rollover for the next draw. Each unwon tier carries over in its OWN pot
    // (5/5 → next jackpot, 4/5 → next pool4Carry, 3/5 → next pool3Carry) so the
    // pots grow independently until the tier is won. The buffer's full balance
    // is split equally across the three tiers (above); each tier's next pot
    // gets one third of the buffer on top of its rollover.
    const won = w5 > 0;
    const rollover5 = won ? 0 : jackpotPot;
    const rollover4 = w4 > 0 ? 0 : fullPool4;
    const rollover3 = w3 > 0 ? 0 : fullPool3;
    const rolloverTotal = +(rollover5 + rollover4 + rollover3).toFixed(2);
    // The buffer roll is split equally across the three tiers, so each tier's
    // next pot gets one third of the rolled amount on top of its rollover.
    const nextJackpot = +(startingJackpot + rollover5 + bufferThird).toFixed(2);
    const nextPool4Carry = +(rollover4 + bufferThird).toFixed(2);
    const nextPool3Carry = +(rollover3 + bufferThird).toFixed(2);
    const nextReserve = draw.reserveBalance || 0; // carried forward; admin allocates buffer to jackpot
    const nextPrizePool = +(nextPool4Carry + nextPool3Carry).toFixed(2);

    // Complete this draw.
    await svc.entities.Draw.update(draw.id, {
      status: 'COMPLETED',
      winningNumbers: winningStr,
      randomnessProof: proof,
      winners5: w5,
      winners4: w4,
      winners3: w3,
      prizePool: +(fullPool4 + fullPool3).toFixed(2),
      totalPrizesPaid,
      agentBonusPaid: +totalAgentBonus.toFixed(2),
      completedAt: new Date().toISOString(),
    });

    // Seed the next sequential draw. If the next draw already exists (created
    // by allocateTickets to absorb overflow tickets once this draw filled),
    // atomically add the rollover pots onto it instead of creating a duplicate.
    const nextNumber = draw.drawNumber + 1;
    const existing = await svc.entities.Draw.filter({ drawNumber: nextNumber });
    if (!existing.length) {
      await svc.entities.Draw.create({
        drawNumber: nextNumber,
        status: 'BUILDING',
        jackpotAmount: nextJackpot,
        prizePool: nextPrizePool,
        pool4Carry: nextPool4Carry,
        pool3Carry: nextPool3Carry,
        targetTickets: target,
        minThreshold: get('min_jackpot', 3500),
        rolloverFrom: rolloverTotal > 0 ? draw.drawNumber : undefined,
        reserveBalance: nextReserve,
        reserveAllocation: 0,
        createdAt: new Date().toISOString(),
      });
    } else {
      const ex = existing[0];
      await svc.entities.Draw.updateMany(
        { id: ex.id },
        {
          $inc: {
            jackpotAmount: +(rollover5 + bufferThird).toFixed(2),
            pool4Carry: +(rollover4 + bufferThird).toFixed(2),
            pool3Carry: +(rollover3 + bufferThird).toFixed(2),
            prizePool: nextPrizePool,
          },
        }
      );
      if (rolloverTotal > 0) {
        await svc.entities.Draw.update(ex.id, { rolloverFrom: draw.drawNumber });
      }
    }

    return Response.json({
      success: true,
      drawNumber: draw.drawNumber,
      winningNumbers: winningStr,
      winners5: w5,
      winners4: w4,
      winners3: w3,
      totalPrizesPaid,
      agentBonusPaid: +totalAgentBonus.toFixed(2),
      claimFeePaid: +totalClaimFee.toFixed(2),
      bufferRolled,
      nextJackpot,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}