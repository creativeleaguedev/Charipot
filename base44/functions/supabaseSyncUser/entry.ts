import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { upsertEntity } from "../../shared/supabaseMirror.ts";

// Workflow-facing (app_user_auth trigger): mirrors one User record into rotary_users.
// Dedicated function so the workflow passes user_id (not an `entity` string, which the
// workflow validator rejects for the built-in User entity).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { user_id } = body || {};
    if (!user_id) return Response.json({ error: "user_id required" }, { status: 400 });
    const result = await upsertEntity(base44, "User", user_id);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}