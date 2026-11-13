import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient as sdkClient } from "@supabase/supabase-js";

// Node 20 CI runners have no native WebSocket; the realtime-js client probes
// for one at construction time even though this suite never opens a channel.
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as { WebSocket?: unknown }).WebSocket = class {} as unknown;
}

const boundary = vi.hoisted(() => ({ session: vi.fn(), admin: vi.fn(), role: vi.fn(), configured: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: boundary.session, hasSupabaseEnv: boundary.configured }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: boundary.admin }));
vi.mock("@/lib/auth/role", () => ({ getCurrentRole: boundary.role }));
import { POST } from "@/app/api/media/route";

const USER_ID = "11111111-2222-4333-8444-555555555555";
type Row = { id: string; storage_path: string; uploaded_by: string; contains_private_data: boolean };
let objects: Set<string>;
let rows: Row[];
let requests: { method: string; path: string; key: string; body: unknown }[];
let metadataFailure: string | null;
let cleanupFailure: "denied" | "empty" | "wrong-file" | "network" | null;
let uploadFailure: "denied" | "lost-response" | null;
let log: ReturnType<typeof vi.spyOn>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});

// Real locked Supabase SDK, synthetic HTTP boundary. Authenticated DELETE is
// denied just as migration 0011 and the native RLS regression require.
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  const key = new Headers(init?.headers).get("apikey") ?? "";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  requests.push({ method, path: url.pathname, key, body });
  if (method === "POST" && url.pathname.startsWith("/storage/v1/object/media/")) {
    if (uploadFailure === "denied") return json({ message: "policy denied", statusCode: "403" }, 403);
    const path = decodeURIComponent(url.pathname.slice("/storage/v1/object/media/".length));
    objects.add(path);
    if (uploadFailure === "lost-response") throw new TypeError("synthetic upload response lost");
    return json({ Key: `media/${path}`, Id: "synthetic-object" });
  }
  if (method === "POST" && url.pathname === "/rest/v1/media_assets") {
    if (metadataFailure === "lost-response") {
      rows.push(body);
      throw new TypeError("synthetic insert committed but response lost");
    }
    if (metadataFailure) return json({ code: metadataFailure, message: "synthetic database rejection" }, 400);
    rows.push(body);
    return json(body, 201);
  }
  if (method === "DELETE" && url.pathname === "/storage/v1/object/media") {
    if (key !== "synthetic-admin" || cleanupFailure === "denied") {
      return json({ message: "policy denied", statusCode: "403" }, 403);
    }
    if (cleanupFailure === "network") throw new TypeError("synthetic cleanup connection lost");
    if (cleanupFailure === "empty") return json([]);
    if (cleanupFailure === "wrong-file") return json([{ name: "unrelated-object" }]);
    const removed = body.prefixes.filter((path: string) => objects.delete(path));
    return json(removed.map((name: string) => ({ name })));
  }
  throw new Error(`Unexpected synthetic request: ${method} ${url.pathname}`);
}

function request() {
  const form = new FormData();
  form.set("file", new File(["synthetic photo bytes"], "private-photo.png", { type: "image/png" }));
  form.set("photo_classification", "customer_private_order_photo");
  // Neither of these caller-supplied cleanup targets may be trusted.
  form.set("storage_path", "unrelated-object");
  form.set("bucket", "unrelated-bucket");
  return new NextRequest("http://localhost/api/media", { method: "POST", body: form });
}

beforeEach(() => {
  vi.resetAllMocks();
  objects = new Set(["unrelated-object"]);
  rows = [];
  requests = [];
  metadataFailure = null;
  cleanupFailure = null;
  uploadFailure = null;
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fakeFetch } };
  const session = sdkClient("https://synthetic.invalid", "synthetic-session", options);
  vi.spyOn(session.auth, "getUser").mockResolvedValue({ data: { user: {
    id: USER_ID, aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-11-11T00:00:00Z",
  } }, error: null });
  boundary.session.mockResolvedValue(session);
  boundary.admin.mockReturnValue(sdkClient("https://synthetic.invalid", "synthetic-admin", options));
  boundary.role.mockResolvedValue("operator");
  boundary.configured.mockReturnValue(true);
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("private media upload boundary", () => {
  it("keeps successful uploads and metadata under the caller's session", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ uploaded_by: USER_ID, contains_private_data: true });
    expect(objects.has(rows[0].storage_path)).toBe(true);
    expect(requests.every((r) => r.key === "synthetic-session")).toBe(true);
    expect(requests.some((r) => r.method === "DELETE")).toBe(false);
  });

  it.each(["23502", "23503", "23514", "42501", "22001", "22P02"])(
    "removes only this request's object after a definite SQL rejection (%s)", async (code) => {
      metadataFailure = code;
      const response = await POST(request());
      expect(response.status).toBe(code === "42501" ? 403 : 422);
      expect(rows).toEqual([]);
      expect([...objects]).toEqual(["unrelated-object"]);
      const deletion = requests.find((r) => r.method === "DELETE");
      expect(deletion?.key).toBe("synthetic-admin");
      expect(deletion?.body).toEqual({ prefixes: [expect.stringMatching(/^customer_private_order_photo\/\d{4}\/\d{2}\/.*-private-photo.png$/)] });
      expect(requests.filter((r) => r.key === "synthetic-admin")).toHaveLength(1);
      expect(log).not.toHaveBeenCalled();
    },
  );

  it("refuses to start a live upload without cleanup configuration", async () => {
    boundary.admin.mockReturnValue(null);
    expect((await POST(request())).status).toBe(503);
    expect(requests).toEqual([]);
  });

  it.each(["owner", "operator"])("allows the %s role", async (role) => {
    boundary.role.mockResolvedValue(role);
    expect((await POST(request())).status).toBe(201);
  });

  it.each(["finance", "workshop", "readonly"])("denies %s before privileged cleanup is available", async (role) => {
    boundary.role.mockResolvedValue(role);
    expect((await POST(request())).status).toBe(403);
    expect(boundary.admin).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  it("requires a current authenticated user even if the earlier role lookup succeeded", async () => {
    const session = await boundary.session();
    session.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(request())).status).toBe(401);
    expect(boundary.admin).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  it.each(["denied", "empty", "wrong-file", "network"] as const)("reports recovery required when cleanup is %s", async (failure) => {
    metadataFailure = "23503";
    cleanupFailure = failure;
    const response = await POST(request());
    const result = await response.json();
    expect(response.status).toBe(503);
    expect(result.code).toBe("MEDIA_UPLOAD_RECOVERY_REQUIRED");
    expect(result.uploadId).toEqual(expect.any(String));
    expect(result.error).toContain(result.uploadId);
    expect(objects.size).toBe(2);
    expect(log).toHaveBeenCalledWith("media_upload_recovery_required", { uploadId: result.uploadId, stage: "cleanup" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-photo");
  });

  it.each(["lost-response", "PGRST116", "08006", "23505"])("preserves bytes after an uncertain metadata outcome (%s)", async (failure) => {
    metadataFailure = failure;
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("MEDIA_UPLOAD_RECOVERY_REQUIRED");
    expect(objects.size).toBe(2);
    expect(requests.some((r) => r.method === "DELETE")).toBe(false);
    if (failure === "lost-response") expect(objects.has(rows[0].storage_path)).toBe(true);
  });

  it("does not insert metadata or delete an existing object after upload denial", async () => {
    uploadFailure = "denied";
    expect((await POST(request())).status).toBe(403);
    expect(rows).toEqual([]);
    expect([...objects]).toEqual(["unrelated-object"]);
    expect(requests).toHaveLength(1);
  });

  it("reports an uncertain upload response without deleting or claiming nothing was saved", async () => {
    uploadFailure = "lost-response";
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("MEDIA_UPLOAD_RECOVERY_REQUIRED");
    expect(objects.size).toBe(2);
    expect(rows).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it("keeps demo mode validation without touching either database client", async () => {
    boundary.configured.mockReturnValue(false);
    const response = await POST(request());
    expect((await response.json()).demo).toBe(true);
    expect(boundary.admin).not.toHaveBeenCalled();
    expect(boundary.session).not.toHaveBeenCalled();
  });
});
