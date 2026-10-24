import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { emailCard, rowsHtml, noteHtml, emailPlainText } from '../../shared/emailTemplate.ts';

// Daily maintenance sweep for ticket-pass packages.
//   1. Burns passes whose package has passed its expiry: unused passes are
//      removed from the wallet's passBalance and the PassPurchase is marked
//      `burned`.
//   2. Sends a day-before-expiry reminder email for active purchases expiring
//      within the next 24-48h that have not already been reminded.
// Invoked by the "Pass Expiry Sweep" scheduled workflow (no user context).
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const now = new Date();
    const isoNow = now.toISOString();
    const H24 = 24 * 3600 * 1000;
    const H48 = 48 * 3600 * 1000;

    // 1. Burn expired passes.
    const expired = await svc.entities.PassPurchase.filter({ status: 'active' });
    let burnedCount = 0;
    let burnedPasses = 0;
    for (const p of expired) {
      if (!p.expiresAt) continue;
      if (new Date(p.expiresAt) > now) continue;
      const remaining = Number(p.remaining) || 0;
      if (remaining > 0) {
        const wallets = await svc.entities.Wallet.filter({ userId: p.userId });
        const w = wallets[0];
        if (w) {
          // Only debit what the wallet actually holds (guard against drift).
          const held = Number(w.passBalance) || 0;
          const toBurn = Math.min(remaining, held);
          if (toBurn > 0) {
            await svc.entities.Wallet.updateMany(
              { id: w.id, passBalance: { $gte: toBurn } },
              { $inc: { passBalance: -toBurn } }
            );
          }
        }
      }
      await svc.entities.PassPurchase.update(p.id, {
        status: 'burned',
        burnedQty: remaining,
        remaining: 0,
      });
      burnedCount++;
      burnedPasses += remaining;
    }

    // 2. Day-before-expiry reminder emails.
    const active = await svc.entities.PassPurchase.filter({ status: 'active', reminderSent: false });
    let reminders = 0;
    for (const p of active) {
      if (!p.expiresAt) continue;
      const exp = new Date(p.expiresAt);
      if (exp <= now) continue;
      const msUntil = exp.getTime() - now.getTime();
      if (msUntil > H48) continue; // only those expiring within the next 48h
      if ((Number(p.remaining) || 0) <= 0) {
        await svc.entities.PassPurchase.update(p.id, { reminderSent: true });
        continue;
      }
      let to = p.userEmail;
      if (!to) {
        const u = await svc.entities.User.get(p.userId).catch(() => null as any);
        to = u?.email;
      }
      if (to) {
        const expStr = new Date(p.expiresAt).toLocaleString();
        try {
          const remRows = [
            { label: 'Quantity remaining', value: `${p.remaining} passes`, strong: true },
            { label: 'Package', value: p.packageLabel },
            { label: 'Expiry', value: expStr, strong: true },
          ];
          const remHtml = emailCard({
            title: 'Passes Expiring Soon',
            subtitle: p.packageLabel,
            greeting: `Hi ${p.fullName || 'there'}, this is a friendly reminder.`,
            innerHtml: rowsHtml(remRows) + noteHtml('Unused passes are burned at expiry — head to the Play page to redeem them before then. Each pass equals one free ticket play.'),
          });
          const remText = emailPlainText({
            greeting: `Hi ${p.fullName || ''},`,
            lines: [
              `This is a friendly reminder that ${p.remaining} of your ticket passes from the "${p.packageLabel}" package will expire on ${expStr}.`,
              `Unused passes are burned at expiry, so head to the Play page to redeem them before then.`,
              `Quantity remaining: ${p.remaining}`,
              `Package: ${p.packageLabel}`,
              `Expiry: ${expStr}`,
            ],
          });
          await svc.integrations.Core.SendEmail({
            to,
            subject: `Reminder: your ticket passes expire soon — ${p.packageLabel}`,
            html: remHtml,
            text: remText,
          });
          reminders++;
        } catch (_) { /* email send failed — still mark reminded to avoid spam */ }
      }
      await svc.entities.PassPurchase.update(p.id, { reminderSent: true });
    }

    return Response.json({ success: true, burnedCount, burnedPasses, reminders, at: isoNow });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}