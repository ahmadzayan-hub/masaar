import { fetchRows, formatRelative } from "@/lib/data";
import { DemoBanner, PageHeader, Kpi, SectionTitle } from "@/components/ui";
import { selectTestimonials, type ReviewLike } from "@/lib/growth";
import CopyDraft from '@/components/CopyDraft';
import { reviewRequest } from '@/lib/operator-productivity';

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const { rows, demoMode } = await fetchRows("reviews", { order: "created_at" });
  const orders = await fetchRows('orders', { order: 'created_at' });
  const eligible = orders.rows.filter(order => reviewRequest(order));

  const total = rows.length;
  const avg = total ? (rows.reduce((s, r) => s + (Number(r.rating) || 0), 0) / total) : 0;
  const fiveStar = rows.filter((r) => Number(r.rating) === 5).length;
  const sharable = rows.filter((r) => r.permission_to_share).length;
  const stories = rows.filter((r) => r.story_mention).length;

  const testimonials = selectTestimonials(rows as unknown as ReviewLike[], 6);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Reviews"
        subtitle="After-sale feedback &amp; the repeat-purchase loop. Only share with explicit permission — never lift a review without consent."
      />
      <DemoBanner demoMode={demoMode} />
      <section className="card mb-4">
        <SectionTitle>Collect feedback after delivery</SectionTitle>
        <p className="mb-3 text-sm">Review the order, confirm no request was already sent, then copy a draft for manual sending. Requests are not sent or tracked automatically. Public sharing requires separate consent.</p>
        {orders.error && <p role="alert">Could not load delivered orders.</p>}
        {eligible.length === 0 && <p>No delivered orders available for a review request.</p>}
        {eligible.map(order => <div key={String(order.id)} className="mb-3 border-b pb-3">
          <a href={`/orders/${encodeURIComponent(String(order.id))}`} className="font-semibold underline">Order {String(order.order_number ?? order.id)}</a>
          <p className="my-2 text-sm">{reviewRequest(order)}</p>
          <CopyDraft text={reviewRequest(order)!} />
        </div>)}
      </section>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Avg rating" value={avg.toFixed(2)} hint={`${total} reviews`} />
        <Kpi label="5★ count" value={fiveStar} />
        <Kpi label="Permission to share" value={sharable} hint="Use these on socials" />
        <Kpi label="Story mentions" value={stories} />
      </div>

      <div className="card mb-4">
        <SectionTitle>Shareable testimonials</SectionTitle>
        {testimonials.length === 0 ? (
          <p className="text-sm text-gray-500">No share-approved testimonials yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {testimonials.map((t) => (
              <div key={t.id as string} className="rounded-2xl border border-pink-200 bg-pink-50/60 p-3 text-sm">
                <div className="text-xs text-amber-700">{"★".repeat(Number(t.rating) || 0)}</div>
                <p className="mt-1 text-gray-800">“{t.feedback}”</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <SectionTitle>All reviews</SectionTitle>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Rating</th><th>Customer</th><th>Feedback</th><th>Share</th><th>Story</th><th>When</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id as string}>
                  <td>{"★".repeat(Number(r.rating) || 0)}</td>
                  <td>{r.customer_name as string}</td>
                  <td className="max-w-[28rem] truncate">{r.feedback as string}</td>
                  <td>{r.permission_to_share ? "✓" : "—"}</td>
                  <td>{r.story_mention ? "✓" : "—"}</td>
                  <td className="text-xs text-gray-500">{formatRelative(r.created_at as string)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
