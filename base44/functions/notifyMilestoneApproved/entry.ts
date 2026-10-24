import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { emailCard, rowsHtml, noteHtml, paraHtml } from '../../shared/emailTemplate.ts';

// Sends an automated email alert to a project officer when an admin verifies
// (approves) or releases funds for one of their funding milestones. Recipients
// are the official email entered on the project form (orgDetails.officialEmail)
// plus the submitting officer's own account email, deduped. Uses the platform's
// built-in SendEmail integration (no OAuth). Registered app users always receive;
// external addresses are delivered when the app has a paid plan + custom domain.
function validEmail(e: any): boolean {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

function fmtAmount(n: number): string {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({} as any));
    const milestoneId = body?.milestone_id || body?.milestoneId;
    if (!milestoneId) return Response.json({ error: 'milestone_id required' }, { status: 400 });

    const m = await base44.asServiceRole.entities.Milestone.get(milestoneId);
    if (!m) return Response.json({ error: 'Milestone not found' }, { status: 404 });

    const project = m.projectId ? await base44.asServiceRole.entities.Project.get(m.projectId) : null;

    // --- Gather recipient emails (deduped, lowercased) ---
    const recipients = new Set<string>();

    // 1) Official email captured while filling the project form (orgDetails.officialEmail)
    if (project?.orgDetails) {
      try {
        const org = typeof project.orgDetails === 'string' ? JSON.parse(project.orgDetails) : project.orgDetails;
        if (validEmail(org?.officialEmail)) recipients.add(org.officialEmail.trim().toLowerCase());
        if (validEmail(org?.clubContact)) recipients.add(org.clubContact.trim().toLowerCase());
      } catch (_) { /* ignore malformed orgDetails JSON */ }
    }

    // 2) The submitting project officer's own account email
    if (project?.submittedById) {
      try {
        const u = await base44.asServiceRole.entities.User.get(project.submittedById);
        if (validEmail(u?.email)) recipients.add(u.email.trim().toLowerCase());
      } catch (_) { /* ignore */ }
    }

    // 3) Fallback: submittedBy occasionally holds an email address
    if (validEmail(project?.submittedBy)) recipients.add(project.submittedBy.trim().toLowerCase());

    if (recipients.size === 0) {
      return Response.json({ ok: true, sent: false, reason: 'no recipient email found on project' });
    }

    const projectName = project?.name || m.projectName || 'your project';
    const released = m.status === 'DISBURSED';

    const subject = released
      ? `Funding Released: ${m.title} — ${projectName}`
      : `Milestone Approved: ${m.title} — ${projectName}`;

    const bodyText = [
      'Hello,',
      '',
      'Good news from the Charipot Charity Program.',
      '',
      `Project: ${projectName}`,
      `Milestone: ${m.title}`,
      ...(m.description ? [`Details: ${m.description}`] : []),
      ...(m.amount ? [`Amount: ${fmtAmount(m.amount)}`] : []),
      `Status: ${released ? 'Funds released' : 'Milestone verified and approved'}`,
      '',
      released
        ? 'The funds for this milestone have been released by the platform treasury. Please confirm receipt and proceed with the next phase of your project.'
        : 'This milestone has been verified and approved by the platform administrators. Funds will be released in line with the project disbursement schedule.',
      '',
      'If you have any questions, reply to this email or contact the platform support team.',
      '',
      '— Charipot Charity Program',
    ].join('\n');

    const msRows = [
      { label: 'Project', value: projectName, strong: true },
      { label: 'Milestone', value: m.title },
      ...(m.amount ? [{ label: 'Amount', value: fmtAmount(m.amount), strong: true }] : []),
      { label: 'Status', value: released ? 'Funds released' : 'Approved', strong: true },
    ];
    const msHtml = emailCard({
      title: released ? 'Funding Released' : 'Milestone Approved',
      subtitle: m.title,
      greeting: 'Hello, good news from the Charipot Charity Program.',
      innerHtml: rowsHtml(msRows) +
        paraHtml(released
          ? 'The funds for this milestone have been released by the platform treasury. Please confirm receipt and proceed with the next phase of your project.'
          : 'This milestone has been verified and approved by the platform administrators. Funds will be released in line with the project disbursement schedule.') +
        noteHtml('If you have any questions, reply to this email or contact the platform support team.'),
    });
    const sent: string[] = [];
    const failed: string[] = [];
    for (const to of recipients) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to,
          subject,
          html: msHtml,
          text: bodyText,
          from_name: 'Charipot Charity Program',
        });
        sent.push(to);
      } catch (e: any) {
        failed.push(`${to}: ${e?.message || 'failed'}`);
      }
    }

    return Response.json({ ok: true, sent: sent.length > 0, recipients: Array.from(recipients), delivered: sent, failed });
  } catch (error) {
    return Response.json({ error: error?.message || 'Unknown error' }, { status: 500 });
  }
}