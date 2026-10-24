import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Two-step gate for the Admin Command Center:
//   mode "request" — verify the entered email belongs to the calling admin,
//                   issue a 6-digit code, store its hash, and email it.
//   mode "verify"  — check the entered code against the stored hash, mark
//                   the code consumed, and grant access on match.
// The caller must already be an authenticated admin/platform_admin (the
// Command Center's role gate runs before this), and the email they enter
// must match their own account email — so a non-admin email is denied.
const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'platform_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const mode = body.mode;
    const email = String(body.email || '').trim().toLowerCase();
    const callerEmail = String(user.email || '').toLowerCase();

    if (mode === 'request') {
      // Only the caller's own admin email is accepted.
      if (!email || email !== callerEmail) {
        return Response.json({ ok: false, denied: true, message: 'Access denied — this email is not among authorized admin accounts.' }, { status: 403 });
      }
      // Replace any prior codes for this email.
      const old = await base44.asServiceRole.entities.AdminAccessCode.filter({ email });
      await Promise.all((old || []).map((o) => base44.asServiceRole.entities.AdminAccessCode.delete(o.id)));
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codeHash = await sha256(code + ':' + user.id);
      const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
      await base44.asServiceRole.entities.AdminAccessCode.create({ email, codeHash, expiresAt, consumed: false, attempts: 0 });
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        subject: 'Your Admin Command Center access code',
        html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
<p style="font-size:15px;color:#0f172a">You requested access to the Administrator Command Center.</p>
<p style="font-size:13px;color:#475569">Use the code below to continue. It expires in 5 minutes.</p>
<p style="font-size:40px;font-weight:800;letter-spacing:10px;color:#1d4ed8;margin:24px 0">${code}</p>
<p style="font-size:12px;color:#64748b">If you did not request this, you can safely ignore this email.</p>
</div>`,
      });
      return Response.json({ ok: true, sent: true });
    }

    if (mode === 'verify') {
      const code = String(body.code || '').trim();
      if (!code || !email) {
        return Response.json({ ok: false, granted: false, message: 'Email and code are required.' }, { status: 400 });
      }
      if (email !== callerEmail) {
        return Response.json({ ok: false, granted: false, message: 'Access denied.' }, { status: 403 });
      }
      const records = await base44.asServiceRole.entities.AdminAccessCode.filter({ email });
      const now = Date.now();
      const valid = (records || [])
        .filter((r) => !r.consumed && new Date(r.expiresAt).getTime() > now)
        .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime());
      if (valid.length === 0) {
        return Response.json({ ok: false, granted: false, message: 'No valid code found. Please request a new one.' }, { status: 400 });
      }
      const rec = valid[0];
      const hash = await sha256(code + ':' + user.id);
      if (hash === rec.codeHash) {
        await base44.asServiceRole.entities.AdminAccessCode.update(rec.id, { consumed: true });
        return Response.json({ ok: true, granted: true });
      }
      const attempts = (rec.attempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await base44.asServiceRole.entities.AdminAccessCode.update(rec.id, { consumed: true, attempts });
        return Response.json({ ok: false, granted: false, message: 'Too many failed attempts. Request a new code.' }, { status: 403 });
      }
      await base44.asServiceRole.entities.AdminAccessCode.update(rec.id, { attempts });
      return Response.json({ ok: false, granted: false, message: 'Incorrect code. Please try again.' }, { status: 400 });
    }

    return Response.json({ error: 'Unknown mode' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}