import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { backfillEntity, mirroredEntities } from "../../shared/supabaseMirror.ts";

// Admin-only: one-time bulk push of existing records into Supabase.
// Body: { "entity": "Wallet" } to backfill one, or {} to backfill all mirrored entities.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const entities = body?.entity ? [body.entity] : mirroredEntities();
    const results = [];
    for (const e of entities) {
      results.push({ entity: e, ...(await backfillEntity(base44, e)) });
    }
    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}