import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

const SUPPORT_EMAIL = "care@rotaryimpact.org";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const email = String(body.email || "").trim();
    const fullName = String(body.fullName || "").trim();
    const reason = String(body.reason || "").trim() || "No reason provided";
    const targetType = String(body.targetType || "user");

    const subject = "Account status update — Rotary Impact Vault";
    const greeting = fullName ? `Dear ${fullName},` : "Hello,";
    const plainText =
      `${greeting}\n\nYour ${targetType === "wallet" ? "wallet" : "account"} on Rotary Impact Vault has been blacklisted by our administration team.\n\nReason: ${reason}\n\nIf you believe this was done in error or you need assistance, please contact our Customer Care team at ${SUPPORT_EMAIL} and we will review your case.\n\nThank you,\nRotary Impact Vault Team`;

    const html =
      `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
        <h2 style="color:#1e3a8a">Account Status Update</h2>
        <p>${greeting}</p>
        <p>Your ${targetType === "wallet" ? "wallet" : "account"} on <strong>Rotary Impact Vault</strong> has been blacklisted by our administration team.</p>
        <div style="background:#f3f4f6;border-left:4px solid #dc2626;padding:12px 16px;margin:16px 0;border-radius:6px">
          <p style="margin:0"><strong>Reason:</strong> ${reason}</p>
        </div>
        <p>If you believe this was done in error or you need assistance, please contact our Customer Care team at
          <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> and we will review your case.</p>
        <p style="margin-top:24px;color:#6b7280;font-size:13px">Rotary Impact Vault Team</p>
      </div>`;

    // Email the user only if we have an address (registered app users are reachable).
    let emailed = false;
    if (email) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject,
          body: plainText,
          html,
        });
        emailed = true;
      } catch (_) {
        /* email send failed — still deliver the in-app notification */
      }
    }

    // Always leave an in-app notification so the user sees the reason + care contact.
    await base44.asServiceRole.entities.Notification.create({
      userId: body.userId || null,
      title: `${targetType === "wallet" ? "Wallet" : "Account"} blacklisted`,
      message: `Your ${targetType === "wallet" ? "wallet" : "account"} was blacklisted. Reason: ${reason}. Contact Customer Care at ${SUPPORT_EMAIL} for help.`,
      type: "treasury",
      createdAt: new Date().toISOString(),
    });

    return Response.json({ ok: true, emailed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}