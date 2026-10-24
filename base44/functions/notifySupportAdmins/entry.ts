import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

// Notifies every platform admin IN-APP when a user creates a support ticket or
// sends a reply. Creates a Notification record for each admin so the alert shows
// up in the app's notification bell and the Support Inbox — no email is sent.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const ticketCode = String(body.ticketCode || "");
    const subject = String(body.subject || "(no subject)");
    const userName = String(body.userName || user.full_name || user.email || "A user");
    const message = String(body.message || "");
    const category = String(body.category || "General");
    const isNewTicket = !!body.isNewTicket;

    const admins = await base44.asServiceRole.entities.User.filter({ role: "admin" });

    const title = isNewTicket
      ? `New support ticket ${ticketCode}`
      : `New reply on ${ticketCode}`;
    const preview = message.length > 160 ? message.slice(0, 160) + "…" : message;
    const notifMessage = `${userName}: ${preview}`;

    let notified = 0;
    for (const admin of admins) {
      try {
        await base44.asServiceRole.entities.Notification.create({
          userId: admin.id,
          title,
          message: notifMessage,
          type: "ticket",
          createdAt: new Date().toISOString(),
        });
        notified++;
      } catch (_) { /* ignore */ }
    }

    return Response.json({ ok: true, notified });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}