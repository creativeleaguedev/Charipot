import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { upsertEntity, MIRROR_CONFIG } from "../../shared/supabaseMirror.ts";

// Workflow-facing: mirrors one Base44 record into its Supabase table.
// Re-fetches the record by id (handles payload_too_large triggers). Validates the
// entity name so the public endpoint can only mirror known entities.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { entity, recordId } = body || {};
    if (!entity || !recordId) return Response.json({ error: "entity and recordId required" }, { status: 400 });
    if (!MIRROR_CONFIG[entity]) return Response.json({ error: `entity ${entity} is not mirrored` }, { status: 400 });
    const result = await upsertEntity(base44, entity, recordId);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}