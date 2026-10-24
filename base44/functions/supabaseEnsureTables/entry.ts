import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { ensureTables } from "../../shared/supabaseMirror.ts";

// Admin-only: creates all Supabase mirror tables (idempotent). Run once before backfill.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    const result = await ensureTables(base44);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}