// Supabase mirror helpers — shared by supabaseEnsureTables, supabaseSync, supabaseBackfill.
// Base44 stays the source of truth; these helpers push a copy of entity records into
// Supabase tables via the Management API (DDL) + PostgREST (upsert with service_role key).

const MGMT = "https://api.supabase.com/v1";

// entity key -> { table, columns: [{ col, field, type }] }
// `field` is the Base44 entity field (camelCase or built-in), `col` the Supabase column.
export const MIRROR_CONFIG = {
  User: {
    table: "rotary_users",
    columns: [
      { col: "id", field: "id", type: "text" },
      { col: "email", field: "email", type: "text" },
      { col: "full_name", field: "full_name", type: "text" },
      { col: "role", field: "role", type: "text" },
      { col: "created_date", field: "created_date", type: "timestamptz" },
    ],
  },
  Wallet: {
    table: "rotary_wallets",
    columns: [
      { col: "id", field: "id", type: "text" },
      { col: "user_id", field: "userId", type: "text" },
      { col: "full_name", field: "fullName", type: "text" },
      { col: "gov_balance", field: "govBalance", type: "numeric" },
      { col: "gov_burned", field: "govBurned", type: "numeric" },
      { col: "gov_committed", field: "govCommitted", type: "numeric" },
      { col: "prize_balance", field: "prizeBalance", type: "numeric" },
      { col: "pass_balance", field: "passBalance", type: "numeric" },
      { col: "is_agent", field: "isAgent", type: "boolean" },
      { col: "agent_code", field: "agentCode", type: "text" },
      { col: "agent_tier", field: "agentTier", type: "text" },
      { col: "tickets_sold", field: "ticketsSold", type: "numeric" },
      { col: "club_name", field: "clubName", type: "text" },
      { col: "wallet_address", field: "walletAddress", type: "text" },
      { col: "referrer_code", field: "referrerCode", type: "text" },
      { col: "gov_escrowed", field: "govEscrowed", type: "numeric" },
      { col: "total_referral_earnings", field: "totalReferralEarnings", type: "numeric" },
      { col: "total_bonus_earnings", field: "totalBonusEarnings", type: "numeric" },
      { col: "pass_purchased", field: "passPurchased", type: "numeric" },
      { col: "pass_spent", field: "passSpent", type: "numeric" },
      { col: "crypto_balances", field: "cryptoBalances", type: "jsonb" },
      { col: "crypto_escrowed", field: "cryptoEscrowed", type: "jsonb" },
      { col: "custom_tokens", field: "customTokens", type: "jsonb" },
      { col: "last_sync_at", field: "lastSyncAt", type: "timestamptz" },
      { col: "is_blacklisted", field: "isBlacklisted", type: "boolean" },
      { col: "blacklist_reason", field: "blacklistReason", type: "text" },
      { col: "blacklisted_at", field: "blacklistedAt", type: "timestamptz" },
      { col: "created_date", field: "created_date", type: "timestamptz" },
      { col: "updated_date", field: "updated_date", type: "timestamptz" },
    ],
  },
  Project: {
    table: "rotary_projects",
    columns: [
      { col: "id", field: "id", type: "text" },
      { col: "name", field: "name", type: "text" },
      { col: "club_name", field: "clubName", type: "text" },
      { col: "region", field: "region", type: "text" },
      { col: "category", field: "category", type: "text" },
      { col: "status", field: "status", type: "text" },
      { col: "requested_funding", field: "requestedFunding", type: "numeric" },
      { col: "budget", field: "budget", type: "numeric" },
      { col: "beneficiaries", field: "beneficiaries", type: "numeric" },
      { col: "total_committed_gov", field: "totalCommittedGov", type: "numeric" },
      { col: "voter_count", field: "voterCount", type: "numeric" },
      { col: "submitted_by", field: "submittedBy", type: "text" },
      { col: "submitted_at", field: "submittedAt", type: "timestamptz" },
      { col: "image_url", field: "imageUrl", type: "text" },
      { col: "created_date", field: "created_date", type: "timestamptz" },
      { col: "updated_date", field: "updated_date", type: "timestamptz" },
    ],
  },
  Draw: {
    table: "rotary_draws",
    columns: [
      { col: "id", field: "id", type: "text" },
      { col: "draw_number", field: "drawNumber", type: "numeric" },
      { col: "status", field: "status", type: "text" },
      { col: "jackpot_amount", field: "jackpotAmount", type: "numeric" },
      { col: "prize_pool", field: "prizePool", type: "numeric" },
      { col: "ticket_count", field: "ticketCount", type: "numeric" },
      { col: "winning_numbers", field: "winningNumbers", type: "text" },
      { col: "charity_contribution", field: "charityContribution", type: "numeric" },
      { col: "created_at", field: "createdAt", type: "timestamptz" },
      { col: "completed_at", field: "completedAt", type: "timestamptz" },
    ],
  },
  ConfigParameter: {
    table: "rotary_config",
    columns: [
      { col: "id", field: "id", type: "text" },
      { col: "key", field: "key", type: "text" },
      { col: "category", field: "category", type: "text" },
      { col: "label", field: "label", type: "text" },
      { col: "value", field: "value", type: "numeric" },
      { col: "unit", field: "unit", type: "text" },
      { col: "last_updated_at", field: "lastUpdatedAt", type: "timestamptz" },
    ],
  },
  FundingRound: {
    table: "rotary_funding_rounds",
    columns: [
      { col: "id", field: "id", type: "text" },
      { col: "name", field: "name", type: "text" },
      { col: "status", field: "status", type: "text" },
      { col: "funding_amount", field: "fundingAmount", type: "numeric" },
      { col: "remaining_amount", field: "remainingAmount", type: "numeric" },
      { col: "start_date", field: "startDate", type: "timestamptz" },
      { col: "end_date", field: "endDate", type: "timestamptz" },
      { col: "total_votes", field: "totalVotes", type: "numeric" },
      { col: "voter_count", field: "voterCount", type: "numeric" },
      { col: "created_at", field: "createdAt", type: "timestamptz" },
    ],
  },
};

export function mirroredEntities() {
  return Object.keys(MIRROR_CONFIG);
}

// Fetch connection details: { ref, serviceRoleKey, accessToken }
export async function getSupabaseConn(base44) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection("supabase");
  const projectsRes = await fetch(`${MGMT}/projects`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!projectsRes.ok) throw new Error(`Supabase list projects failed: ${projectsRes.status}`);
  const projectsText = await projectsRes.text();
  let projects;
  try { projects = JSON.parse(projectsText); } catch { projects = null; }
  const list = Array.isArray(projects) ? projects : (projects && Array.isArray(projects.projects) ? projects.projects : []);
  if (list.length === 0) throw new Error(`No Supabase projects found. API status ${projectsRes.status}, body: ${projectsText.slice(0, 300)}`);
  const ref = list[0].ref;
  const keysRes = await fetch(`${MGMT}/projects/${ref}/api-keys`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!keysRes.ok) throw new Error(`Supabase api-keys failed: ${keysRes.status}`);
  const keys = await keysRes.json();
  const serviceRole = (keys || []).find((k) => k.name === "service_role");
  if (!serviceRole) throw new Error("Supabase service_role key not found");
  return { ref, serviceRoleKey: serviceRole.api_key, accessToken };
}

function mapRow(entity, record) {
  const cfg = MIRROR_CONFIG[entity];
  const row = {};
  for (const c of cfg.columns) {
    const v = record?.[c.field];
    // Empty strings are invalid for timestamptz/numeric/boolean/jsonb columns; coerce to null.
    const normalized = v === undefined || v === "" ? null : v;
    if (normalized !== null && (c.type === "jsonb") && typeof normalized === "string") {
      // Store parsed object/array for jsonb columns; pass through if already an object.
      try { row[c.col] = JSON.parse(normalized); } catch { row[c.col] = null; }
    } else {
      row[c.col] = normalized;
    }
  }
  return row;
}

// Create all mirror tables (idempotent). Admin-triggered.
export async function ensureTables(base44) {
  const { ref, accessToken } = await getSupabaseConn(base44);
  const statements = [];
  for (const entity of Object.keys(MIRROR_CONFIG)) {
    const cfg = MIRROR_CONFIG[entity];
    const cols = cfg.columns.map((c) => `${c.col} ${c.type}`).join(", ");
    statements.push(`CREATE TABLE IF NOT EXISTS public.${cfg.table} (${cols}, PRIMARY KEY (id));`);
    // Evolve existing tables: add any new columns that aren't present yet.
    for (const c of cfg.columns) {
      statements.push(`ALTER TABLE public.${cfg.table} ADD COLUMN IF NOT EXISTS ${c.col} ${c.type};`);
    }
  }
  const sql = statements.join("\n");
  const res = await fetch(`${MGMT}/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ensureTables failed (${res.status}): ${text}`);
  }
  return { tables: Object.values(MIRROR_CONFIG).map((c) => c.table) };
}

// Re-fetch one record by id and upsert it into its Supabase table.
export async function upsertEntity(base44, entity, recordId) {
  const cfg = MIRROR_CONFIG[entity];
  if (!cfg) throw new Error(`Unknown entity for Supabase mirror: ${entity}`);
  const record = await base44.asServiceRole.entities[entity].get(recordId);
  if (!record) throw new Error(`Record ${entity}:${recordId} not found`);
  const row = mapRow(entity, record);
  const { ref, serviceRoleKey } = await getSupabaseConn(base44);
  const url = `https://${ref}.supabase.co/rest/v1/${cfg.table}?on_conflict=id`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase upsert ${cfg.table} failed (${res.status}): ${text}`);
  }
  return { table: cfg.table, id: record.id };
}

// Push every record of an entity into Supabase (chunked upserts). Admin-triggered.
export async function backfillEntity(base44, entity) {
  const cfg = MIRROR_CONFIG[entity];
  if (!cfg) throw new Error(`Unknown entity for Supabase mirror: ${entity}`);
  const records = await base44.asServiceRole.entities[entity].list("-created_date", 10000);
  if (!records || records.length === 0) return { table: cfg.table, count: 0 };
  const { ref, serviceRoleKey } = await getSupabaseConn(base44);
  const rows = records.map((r) => mapRow(entity, r));
  let total = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const url = `https://${ref}.supabase.co/rest/v1/${cfg.table}?on_conflict=id`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation,resolution=merge-duplicates",
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase backfill ${cfg.table} failed (${res.status}): ${text}`);
    }
    total += chunk.length;
  }
  return { table: cfg.table, count: total };
}