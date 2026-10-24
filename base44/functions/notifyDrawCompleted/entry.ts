import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Called by the DrawCompleted workflow the moment a draw's status flips to
// COMPLETED. Notifies admins (detailed email + in-app) AND emails every other
// registered user the winning numbers, personalized with their own tickets'
// match results for the draw.
function parseNums(s) {
  return String(s || '').split('-').map((x) => parseInt(x, 10)).filter((n) => !isNaN(n));
}
function matchTier(ticketNums, winNums) {
  const m = ticketNums.filter((n) => winNums.includes(n)).length;
  if (m === 5) return '5/5';
  if (m === 4) return '4/5';
  if (m === 3) return '3/5';
  return null;
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const drawId = body.draw_id || body.drawId;

    let draw = null;
    if (drawId) {
      try { draw = await svc.entities.Draw.get(drawId); } catch (_) { draw = null; }
    }
    if (!draw) {
      return Response.json({ error: 'Draw not found' }, { status: 404 });
    }

    const drawNumber = draw.drawNumber;
    const winningNumbers = draw.winningNumbers || '—';
    const winNums = parseNums(winningNumbers);
    const w5 = draw.winners5 || 0;
    const w4 = draw.winners4 || 0;
    const w3 = draw.winners3 || 0;
    const prizesPaid = draw.totalPrizesPaid || 0;
    const charity = draw.charityContribution || 0;
    const proof = draw.randomnessProof ? String(draw.randomnessProof).slice(0, 24) : '—';

    // Jackpot = real prize-wallet balance (5/5 + 4/5 + 3/5 wallets), the same
    // source of truth displayed across the app — not the draw's accrual fields.
    const prizeWallets = await svc.entities.PlatformWallet.list('order', 100);
    const prizeKeys = ['jackpot_5', 'winnings_4', 'winnings_3'];
    let jackpot = 0;
    for (const w of prizeWallets) {
      if (prizeKeys.includes(w.key)) jackpot += Number(w.ledgerBalance || 0);
    }
    jackpot = +jackpot.toFixed(2);

    const summary = w5 > 0
      ? `Jackpot of $${jackpot.toFixed(2)} was WON by ${w5} ticket${w5 === 1 ? '' : 's'}!`
      : `No 5/5 winner — jackpot of $${jackpot.toFixed(2)} rolls over to the next draw.`;

    // ---------- Admin notification (detailed) ----------
    const adminSubject = `Draw #${drawNumber} completed — ${w5}× 5/5, ${w4}× 4/5, ${w3}× 3/5 winners`;
    const adminHtml = `
      <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:auto;background:#0b1220;color:#e2e8f0;border-radius:16px;overflow:hidden;border:1px solid #1e293b">
        <div style="background:linear-gradient(135deg,#1e3a5f,#0f172a);padding:24px 28px">
          <h1 style="margin:0;color:#f59e0b;font-size:22px">Draw #${drawNumber} — Complete</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:13px">Lottery draw engine finished execution</p>
        </div>
        <div style="padding:24px 28px">
          <div style="display:flex;justify-content:space-between;align-items:center;background:#0f1b2e;border-radius:12px;padding:16px 20px;margin-bottom:16px;border:1px solid #1e293b">
            <div>
              <p style="margin:0;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px">Winning Numbers</p>
              <p style="margin:6px 0 0;font-size:24px;font-weight:700;color:#f59e0b;letter-spacing:4px">${winningNumbers}</p>
            </div>
          </div>
          <p style="font-size:15px;font-weight:600;color:#f1f5f9;margin:0 0 12px">${summary}</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr style="border-bottom:1px solid #1e293b"><td style="padding:10px 0;color:#94a3b8">5/5 Winners</td><td style="padding:10px 0;text-align:right;font-weight:700;color:#f59e0b">${w5}</td></tr>
            <tr style="border-bottom:1px solid #1e293b"><td style="padding:10px 0;color:#94a3b8">4/5 Winners</td><td style="padding:10px 0;text-align:right;font-weight:700">${w4}</td></tr>
            <tr style="border-bottom:1px solid #1e293b"><td style="padding:10px 0;color:#94a3b8">3/5 Winners</td><td style="padding:10px 0;text-align:right;font-weight:700">${w3}</td></tr>
            <tr style="border-bottom:1px solid #1e293b"><td style="padding:10px 0;color:#94a3b8">Jackpot</td><td style="padding:10px 0;text-align:right;font-weight:700;color:#f59e0b">$${jackpot.toFixed(2)}</td></tr>
            <tr style="border-bottom:1px solid #1e293b"><td style="padding:10px 0;color:#94a3b8">Total Prizes Paid</td><td style="padding:10px 0;text-align:right;font-weight:700">$${prizesPaid.toFixed(2)}</td></tr>
            <tr style="border-bottom:1px solid #1e293b"><td style="padding:10px 0;color:#94a3b8">Charity Raised</td><td style="padding:10px 0;text-align:right;font-weight:700">$${charity.toFixed(2)}</td></tr>
            <tr><td style="padding:10px 0;color:#94a3b8">Randomness Proof</td><td style="padding:10px 0;text-align:right;font-family:monospace;font-size:12px">${proof}…</td></tr>
          </table>
          <p style="margin:20px 0 0;color:#64748b;font-size:12px">View full details in the Admin Center → Draw History.</p>
        </div>
      </div>
    `;
    const adminText = `Draw #${drawNumber} complete. Winners: ${w5}x 5/5, ${w4}x 4/5, ${w3}x 3/5. Winning numbers: ${winningNumbers}. ${summary} Prizes paid: $${prizesPaid.toFixed(2)}. Charity: $${charity.toFixed(2)}.`;

    const users = await svc.entities.User.list('-created_date', 500);
    const adminList = users.filter((u) => u.role === 'admin');
    const adminTargets = adminList.length ? adminList : users.slice(0, 1);

    let emailed = 0;
    let notified = 0;
    for (const a of adminTargets) {
      if (a.email) {
        try {
          await svc.integrations.Core.SendEmail({ to: a.email, subject: adminSubject, html: adminHtml, text: adminText });
          emailed++;
        } catch (_) {}
      }
      try {
        await svc.entities.Notification.create({
          userId: a.id, title: adminSubject, message: adminText, type: 'draw', read: false, createdAt: new Date().toISOString(),
        });
        notified++;
      } catch (_) {}
    }

    // ---------- All-users winning-numbers email ----------
    // Group this draw's tickets by user so each email is personalized with the
    // recipient's own ticket results (5/5, 4/5, 3/5 matches).
    let tickets = [];
    try { tickets = await svc.entities.Ticket.filter({ drawNumber }, '-createdAt', 5000); } catch (_) {}
    const byUser = {};
    for (const t of tickets) {
      const uid = t.userId;
      if (!uid) continue;
      (byUser[uid] = byUser[uid] || []).push(t);
    }

    let userEmailed = 0;
    let userNotified = 0;
    for (const u of users) {
      if (adminList.find((a) => a.id === u.id)) continue; // admins already emailed
      if (!u.email) continue;
      const mine = byUser[u.id] || [];
      const results = { '5/5': 0, '4/5': 0, '3/5': 0, none: 0 };
      const winners = [];
      for (const t of mine) {
        const tier = matchTier(parseNums(t.numbers), winNums);
        if (tier) { results[tier]++; winners.push(t); } else results.none++;
      }
      const played = mine.length;
      const bodyLine = played === 0
        ? `You didn't play Draw #${drawNumber}, but here are the winning numbers for your records.`
        : `You played ${played} ticket${played === 1 ? '' : 's'} in Draw #${drawNumber}. Results: ${results['5/5']} matched 5/5, ${results['4/5']} matched 4/5, ${results['3/5']} matched 3/5, ${results.none} non-winning.`;
      const userSubject = `Draw #${drawNumber} results — Winning numbers inside`;
      const winnersRows = winners.slice(0, 10).map((t) =>
        `<tr style="border-bottom:1px solid #1e293b"><td style="padding:8px 0;font-family:monospace;color:#e2e8f0">${t.serialNumber || t.numbers}</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#f59e0b">${matchTier(parseNums(t.numbers), winNums)}</td></tr>`
      ).join('');
      const userHtml = `
        <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:auto;background:#0b1220;color:#e2e8f0;border-radius:16px;overflow:hidden;border:1px solid #1e293b">
          <div style="background:linear-gradient(135deg,#1e3a5f,#0f172a);padding:24px 28px">
            <h1 style="margin:0;color:#f59e0b;font-size:20px">Draw #${drawNumber} — Winning Numbers</h1>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:13px">Charity Program 5/39 draw</p>
          </div>
          <div style="padding:24px 28px">
            <div style="text-align:center;background:#0f1b2e;border-radius:12px;padding:18px;margin-bottom:16px;border:1px solid #1e293b">
              <p style="margin:0;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px">Winning Numbers</p>
              <p style="margin:8px 0 0;font-size:26px;font-weight:700;color:#f59e0b;letter-spacing:5px">${winningNumbers}</p>
            </div>
            <p style="font-size:15px;color:#f1f5f9;margin:0 0 12px">${bodyLine}</p>
            ${winners.length ? `<p style="font-size:14px;color:#f59e0b;font-weight:600;margin:8px 0 6px">Your winning tickets:</p><table style="width:100%;border-collapse:collapse;font-size:13px">${winnersRows}</table>` : ''}
            <p style="margin:18px 0 0;color:#64748b;font-size:12px">${summary}</p>
            <p style="margin:8px 0 0;color:#64748b;font-size:12px">Total prizes paid this draw: $${prizesPaid.toFixed(2)} · Charity raised: $${charity.toFixed(2)}.</p>
            <p style="margin:12px 0 0;color:#475569;font-size:11px">Randomness proof: ${proof}…</p>
          </div>
        </div>`;
      const userText = `Draw #${drawNumber} winning numbers: ${winningNumbers}. ${bodyLine} ${summary}`;
      try {
        await svc.integrations.Core.SendEmail({ to: u.email, subject: userSubject, html: userHtml, text: userText });
        userEmailed++;
      } catch (_) {}
      try {
        await svc.entities.Notification.create({
          userId: u.id, title: userSubject, message: userText, type: 'draw', read: false, createdAt: new Date().toISOString(),
        });
        userNotified++;
      } catch (_) {}
    }

    return Response.json({ success: true, drawNumber, emailed, notified, userEmailed, userNotified });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}