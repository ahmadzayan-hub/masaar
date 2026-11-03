// POST  /api/records/{suppliers|couriers|customers} — create one record.
// PATCH /api/records/{table} — update one record; body carries `id` and only
// the columns to change. Columns outside the table's allow-list are rejected
// (400), so a client cannot write what the form does not show. Owner and
// operator only; database policies enforce the same. Demo mode (no Supabase
// env) validates and echoes the record, persisting nothing.
import { NextRequest, NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { isRecordTable, parseRecordCreate, parseRecordUpdate } from "@/lib/records";

type Ctx = { params: Promise<{ table: string }> };

async function readJson(req: NextRequest): Promise<{ ok: true; raw: unknown } | { ok: false; res: NextResponse }> {
  try {
    return { ok: true, raw: await req.json() };
  } catch {
    return { ok: false, res: NextResponse.json({ error: "invalid JSON body" }, { status: 400 }) };
  }
}

async function authorise(): Promise<NextResponse | null> {
  const role = await getCurrentRole();
  if (role !== "owner" && role !== "operator") {
    return NextResponse.json({ error: `role '${role}' may not edit records` }, { status: 403 });
  }
  return null;
}

function dbError(error: { code?: string; message: string }): NextResponse {
  const denied = /policy|permission|denied/i.test(error.message);
  return NextResponse.json({ error: error.message }, { status: denied ? 403 : 422 });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { table } = await ctx.params;
  if (!isRecordTable(table)) return NextResponse.json({ error: "unknown record table" }, { status: 404 });
  const body = await readJson(req);
  if (!body.ok) return body.res;
  const parsed = parseRecordCreate(table, body.raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  if (!hasSupabaseEnv()) return NextResponse.json({ ok: true, demo: true, record: parsed.value });
  const denied = await authorise();
  if (denied) return denied;

  const supabase = await createClient();
  const { data, error } = await supabase.from(table).insert(parsed.value).select("*").single();
  if (error) return dbError(error);
  return NextResponse.json({ ok: true, record: data }, { status: 201 });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { table } = await ctx.params;
  if (!isRecordTable(table)) return NextResponse.json({ error: "unknown record table" }, { status: 404 });
  const body = await readJson(req);
  if (!body.ok) return body.res;
  const parsed = parseRecordUpdate(table, body.raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { id, values } = parsed.value;

  if (!hasSupabaseEnv()) return NextResponse.json({ ok: true, demo: true, record: { id, ...values } });
  const denied = await authorise();
  if (denied) return denied;

  const supabase = await createClient();
  const { data, error } = await supabase.from(table).update(values).eq("id", id).select("*").maybeSingle();
  if (error) return dbError(error);
  if (!data) return NextResponse.json({ error: "record not found" }, { status: 404 });
  return NextResponse.json({ ok: true, record: data });
}
