import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

const SUPPORT_EMAIL = "care@rotaryimpact.org";

// Lets an admin open a support ticket on behalf of a user (e.g. logging a
// phone-in inquiry or proactively reaching out). Creates the ticket + initial
// admin message with the service role (the SupportTicket create RLS only
// allows the owner), then emails + notifies the target user.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const targetUserId = String(body.userId || "").trim();
    const subject = String(body.subject || "").trim();
    const category = String(body.category || "General");
    const messageBody = String(body.body || "").trim();

    if (!targetUserId || !subject || !messageBody) {
      return Response.json({ error: "userId, subject and body are required" }, { status: 400 });
    }

    const target = await base44.asServiceRole.entities.User.get(targetUserId);
    if (!target) return Response.json({ error: "User not found" }, { status: 404 });

    const existing = await base44.asServiceRole.entities.SupportTicket.list("-ticketNumber", 1);
    const nextNum = (existing[0]?.ticketNumber || 0) + 1;
    const ticketCode = `SUP-${String(nextNum).padStart(4, "0")}`;
    const now = new Date().toISOString();

    const ticket = await base44.asServiceRole.entities.SupportTicket.create({
      ticketNumber: nextNum,
      ticketCode,
      userId: target.id,
      userName: target.full_name || target.email,
      userEmail: target.email,
      subject,
      category,
      status: "AWAITING_USER",
      unreadForUser: true,
      unreadForAdmin: false,
      lastMessageAt: now,
      lastMessagePreview: messageBody.slice(0, 80),
      createdAt: now,
    });

    await base44.asServiceRole.entities.SupportMessage.create({
      ticketId: ticket.id,
      ticketCode,
      ticketNumber: nextNum,
      ticketOwnerId: target.id,
      authorId: user.id,
      authorName: user.full_name || user.email || "Support Team",
      authorRole: "admin",
      body: messageBody,
      createdAt: now,
    });

    const subjectLine = `Support opened a ticket for you: ${ticketCode}`;
    const plainText =
      `Hello ${target.full_name || target.email},\n\nOur support team has opened a ticket on your behalf.\n\nTicket: ${ticketCode}\nSubject: ${subject}\n\nMessage:\n${messageBody}\n\nYou can reply in the app under Help & Support, or email us at ${SUPPORT_EMAIL}.\n\n— Rotary Impact Vault Team`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
      <h2 style="color:#1e3a8a">Support has a message for you</h2>
      <p>Ticket <strong>${ticketCode}</strong> · ${subject}</p>
      <div style="background:#f3f4f6;border-left:4px solid #1e3a8a;padding:12px 16px;margin:16px 0;border-radius:6px">
        <p style="margin:0;white-space:pre-wrap">${messageBody}</p>
      </div>
      <p>Reply in the app under <strong>Help &amp; Support</strong>, or email us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
      <p style="margin-top:24px;color:#6b7280;font-size:13px">Rotary Impact Vault Team</p>
    </div>`;

    let emailed = false;
    if (target.email) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: target.email,
          subject: subjectLine,
          body: plainText,
          html,
        });
        emailed = true;
      } catch (_) { /* email failed — in-app notification still delivered below */ }
    }
    try {
      await base44.asServiceRole.entities.Notification.create({
        userId: target.id,
        title: `Support message: ${subject}`,
        message: messageBody.slice(0, 160),
        type: "ticket",
        createdAt: now,
      });
    } catch (_) { /* ignore */ }

    return Response.json({ ok: true, ticketCode, ticketId: ticket.id, emailed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}