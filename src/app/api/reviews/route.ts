// POST /api/reviews — capture a review the customer gave, as the operator
// recorded it. Body: { order_id, customer_id?, rating 1-5, feedback,
// permission_to_share: 'yes' | '', story_mention: 'yes' | '' }
// permission_to_share becomes true only from the literal 'yes'. One review per
// order: a second capture is 409. Demo mode persists nothing.
import { NextRequest, NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { parseReviewCapture } from "@/lib/operator-productivity";

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = parseReviewCapture(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const review = parsed.value;

  if (!hasSupabaseEnv()) {
    return NextResponse.json({ ok: true, demo: true, review });
  }

  const role = await getCurrentRole();
  if (role !== "owner" && role !== "operator") {
    return NextResponse.json({ error: `role '${role}' may not capture reviews` }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, customer_id")
    .eq("id", review.order_id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("reviews")
    .insert({
      order_id: review.order_id,
      customer_id: review.customer_id ?? (order.customer_id as string | null) ?? null,
      rating: review.rating,
      feedback: review.feedback,
      permission_to_share: review.permission_to_share,
      story_mention: review.story_mention,
    })
    .select("id, order_id, rating, permission_to_share")
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "a review was already captured for this order" }, { status: 409 });
    }
    const denied = /policy|permission|denied/i.test(error.message);
    return NextResponse.json({ error: error.message }, { status: denied ? 403 : 422 });
  }
  return NextResponse.json({ ok: true, review: data });
}
