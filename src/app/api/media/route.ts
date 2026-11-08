// POST /api/media — persist one upload. multipart/form-data with `file` plus
// photo_classification (required), contains_private_data ('yes' | ''),
// description?, conversation_id?, order_id?.
//
// The file goes to the private `media` bucket under a classification-prefixed
// path and a media_assets row records it. If the row cannot be written the
// object is removed again, so storage and the table do not drift. Owner and
// operator only. Demo mode (no Supabase env) validates and persists nothing.
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { MEDIA_BUCKET, mediaStoragePath, parseMediaMeta, validateMediaFile } from "@/lib/media";

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file: missing" }, { status: 400 });

  const meta = parseMediaMeta({
    photo_classification: form.get("photo_classification"),
    contains_private_data: form.get("contains_private_data"),
    description: form.get("description"),
    conversation_id: form.get("conversation_id"),
    order_id: form.get("order_id"),
  });
  if (!meta.ok) return NextResponse.json({ error: meta.error }, { status: 400 });
  const check = validateMediaFile({ name: file.name, type: file.type, size: file.size });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const id = randomUUID();
  const path = mediaStoragePath({
    classification: meta.value.photo_classification,
    originalName: file.name,
    extension: check.value.extension,
    id,
  });

  if (!hasSupabaseEnv()) {
    return NextResponse.json({ ok: true, demo: true, asset: { id, file_url: path, ...meta.value, size_bytes: file.size } });
  }

  const role = await getCurrentRole();
  if (role !== "owner" && role !== "operator") {
    return NextResponse.json({ error: `role '${role}' may not upload media` }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const upload = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
  if (upload.error) {
    const denied = /policy|permission|denied|unauthorized/i.test(upload.error.message);
    return NextResponse.json({ error: `storage: ${upload.error.message}` }, { status: denied ? 403 : 422 });
  }

  const { data, error } = await supabase
    .from("media_assets")
    .insert({
      id,
      conversation_id: meta.value.conversation_id,
      order_id: meta.value.order_id,
      file_url: path,
      storage_path: path,
      media_type: file.type,
      content_type: file.type,
      size_bytes: file.size,
      photo_classification: meta.value.photo_classification,
      contains_private_data: meta.value.contains_private_data,
      description: meta.value.description,
      uploaded_by: user?.id ?? null,
    })
    .select("id, file_url, photo_classification, contains_private_data, created_at")
    .single();
  if (error) {
    await supabase.storage.from(MEDIA_BUCKET).remove([path]);
    const denied = /policy|permission|denied/i.test(error.message);
    return NextResponse.json({ error: error.message }, { status: denied ? 403 : 422 });
  }
  return NextResponse.json({ ok: true, asset: data }, { status: 201 });
}
