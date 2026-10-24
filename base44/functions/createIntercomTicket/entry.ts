import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const API = 'https://api.intercom.io';

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Intercom-Version': '2.12',
  };
}

// Fallback: create an inbox conversation when no ticket type is available.
async function createConversationFallback(h, contactId, subject, category, description) {
  const body = `<p><strong>${subject}</strong></p><p><em>Category: ${category}</em></p><p>${description.replace(/\n/g, '<br>')}</p>`;
  const res = await fetch(`${API}/conversations`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      from: { type: 'user', id: contactId },
      body,
    }),
  });
  const conv = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (conv.errors && conv.errors[0] && conv.errors[0].message) || 'Failed to create Intercom conversation';
    return Response.json({ error: msg }, { status: 502 });
  }
  return Response.json({
    ticketId: conv.id,
    ticketTypeName: 'Inbox conversation',
    url: null,
    contactId,
    kind: 'conversation',
  });
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const subject = String(body.subject || '').trim();
    const description = String(body.description || '').trim();
    const category = String(body.category || 'General').trim();
    if (!subject || !description) {
      return Response.json({ error: 'Subject and description are required' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('intercom');
    if (!accessToken) return Response.json({ error: 'Intercom not connected' }, { status: 502 });
    const h = headers(accessToken);

    // Resolve or create the Intercom contact for this app user. Try external_id
    // first (idempotent), then fall back to an email lookup (a contact may exist
    // without our external_id), then create if neither matches.
    const externalId = `rotaryimpact-${user.id}`;
    let contactId = null;
    const findRes = await fetch(`${API}/contacts?external_id=${encodeURIComponent(externalId)}`, { headers: h });
    const findData = await findRes.json().catch(() => ({}));
    if (findData.type === 'contact.list' && Array.isArray(findData.data) && findData.data.length > 0) {
      contactId = findData.data[0].id;
    }
    if (!contactId && user.email) {
      const emailRes = await fetch(`${API}/contacts?email=${encodeURIComponent(user.email)}`, { headers: h });
      const emailData = await emailRes.json().catch(() => ({}));
      if (emailData.type === 'contact.list' && Array.isArray(emailData.data) && emailData.data.length > 0) {
        contactId = emailData.data[0].id;
      }
    }
    if (!contactId) {
      const createRes = await fetch(`${API}/contacts`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          external_id: externalId,
          email: user.email,
          name: user.full_name || user.email,
          role: 'user',
        }),
      });
      const contact = await createRes.json().catch(() => ({}));
      contactId = contact.id;
      if (!contactId) {
        // Intercom returns "A contact matching those details already exists with id=<id>"
        // when the email is already registered — parse and reuse that contact.
        const msg = (contact.errors && contact.errors[0] && contact.errors[0].message) || '';
        const m = msg.match(/id=([a-zA-Z0-9]+)/);
        if (m) {
          contactId = m[1];
        } else {
          const detail = msg || JSON.stringify(contact).slice(0, 300);
          return Response.json({ error: `Could not create Intercom contact: ${detail}` }, { status: 502 });
        }
      }
    }

    // Pick the first available ticket type in the workspace.
    const ttRes = await fetch(`${API}/ticket_types`, { headers: h });
    const ttData = await ttRes.json().catch(() => ({}));
    const types = ttData.ticket_types || [];
    if (!types.length) {
      // No ticket types configured — fall back to an inbox conversation so the request still lands in Intercom.
      return createConversationFallback(h, contactId, subject, category, description);
    }
    const ticketType = types[0];

    const fullDescription = `[${category}] ${description}`;

    // Build ticket attributes. Always set the default title/description slugs,
    // and also map onto the ticket type's own attributes by name when available.
    const attrs = { _default_title_: subject, _default_description_: fullDescription };
    for (const a of ticketType.attributes || []) {
      const name = String(a.name || '').toLowerCase();
      const slug = a.slug;
      if (!slug) continue;
      if (name.includes('title') || name.includes('subject')) attrs[slug] = subject;
      else if (name.includes('description') || name.includes('message') || name.includes('details')) attrs[slug] = fullDescription;
      else if (name.includes('category') || name.includes('type') || name.includes('topic')) attrs[slug] = category;
    }

    const ticketRes = await fetch(`${API}/tickets`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        ticket_type: ticketType.id,
        contacts: [{ intercom_user_id: contactId }],
        ticket_attributes: attrs,
      }),
    });
    const ticket = await ticketRes.json().catch(() => ({}));
    if (!ticketRes.ok) {
      // Fall back to an inbox conversation if ticket creation fails (e.g. no usable ticket type).
      return createConversationFallback(h, contactId, subject, category, description);
    }

    return Response.json({
      ticketId: ticket.id,
      ticketTypeId: ticketType.id,
      ticketTypeName: ticketType.name,
      url: ticket.url || null,
      contactId,
      kind: 'ticket',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}