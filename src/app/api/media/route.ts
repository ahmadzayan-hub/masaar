// POST /api/media — persist one upload. multipart/form-data with `file` plus
// photo_classification (required), contains_private_data ('yes' | ''),
// description?, conversation_id?, order_id?.
//
// The file goes to the private `media` bucket under a classification-prefixed
// path and a media_assets row records it. Definite rejected writes are
// compensated using server-only Storage deletion. Uncertain writes or failed
// cleanup require recovery; the two services are not an atomic transaction.
// Owner/operator only. Demo mode validates and persists nothing.
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentRole } from "@/lib/auth/role";
import { MEDIA_BUCKET, mediaStoragePath, parseMediaMeta, validateMediaFile } from "@/lib/media";

// Only explicit validation/RLS rejections prove that the insert was rolled
// back. Transport failures, unknown codes and unique conflicts may accompany
// an existing/committed record: never delete its bytes on those outcomes.
const REJECTED_INSERT_CODES = new Set(["23502", "23503", "23514", "42501", "22001", "22P02"]);

function recoveryRequired(uploadId: string, stage: "upload" | "metadata" | "cleanup") {
  // Keep a lookup reference without logging customer filenames, descriptions,
  // provider errors or credentials. The operator sees the same reference.
  console.error("media_upload_recovery_required", { uploadId, stage });
  return NextResponse.json({
    ok: false,
    code: "MEDIA_UPLOAD_RECOVERY_REQUIRED",
    uploadId,
    error: `Upload needs review before retrying. Ask an owner to check reference ${uploadId}.`,
  }, { status: 503 });
}

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
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Sign in again before uploading." }, { status: 401 });
  }

  // Session policies intentionally prohibit Storage DELETE. Require the
  // existing server configuration before accepting bytes, but keep uploads
  // and metadata writes on the caller's session so RLS still applies.
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Uploads are temporarily unavailable. Nothing was uploaded." }, { status: 503 });
  }

  try {
    const upload = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
    if (upload.error) {
      // A lost response or server failure cannot prove no file was saved.
      const status = "status" in upload.error ? upload.error.status : undefined;
      if (typeof status !== "number" || status < 400 || status >= 500 || status === 408) {
        return recoveryRequired(id, "upload");
      }
      const denied = status === 401 || status === 403;
      return NextResponse.json({ error: "File upload was rejected." }, { status: denied ? 403 : 422 });
    }
  } catch {
    return recoveryRequired(id, "upload");
  }

  try {
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
        uploaded_by: user.id,
      })
      .select("id, file_url, photo_classification, contains_private_data, created_at")
      .single();
    if (error) {
      if (!REJECTED_INSERT_CODES.has(error.code)) return recoveryRequired(id, "metadata");
      try {
        // Never accept a bucket/path from the request for privileged deletion.
        const removed = await admin.storage.from(MEDIA_BUCKET).remove([path]);
        if (removed.error || !removed.data?.some((object) => object.name === path)) {
          return recoveryRequired(id, "cleanup");
        }
      } catch {
        return recoveryRequired(id, "cleanup");
      }
      return NextResponse.json({ error: "Media details were rejected. The uploaded file was removed." }, {
        status: error.code === "42501" ? 403 : 422,
      });
    }
    if (!data) return recoveryRequired(id, "metadata");
    return NextResponse.json({ ok: true, asset: data }, { status: 201 });
  } catch {
    return recoveryRequired(id, "metadata");
  }
}
