import { fetchRows, formatRelative } from "@/lib/data";
import { DemoBanner, PageHeader } from "@/components/ui";
import InboxClient from "./InboxClient";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const [convsRes, aiRes, ordersRes, customersRes] = await Promise.all([
    fetchRows("conversations", { order: "created_at" }),
    fetchRows("ai_outputs"),
    fetchRows("orders"),
    fetchRows("customers"),
  ]);
  const conversations = convsRes.rows.map((c) => ({ ...c, when: formatRelative(c.created_at as string) }));
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Customer Inbox"
        subtitle="Every captured DM, WhatsApp, comment — with stage, temperature, and an AI-drafted reply you approve."
      />
      <DemoBanner demoMode={convsRes.demoMode} />
      <InboxClient
        conversations={conversations}
        aiOutputs={aiRes.rows}
        orders={ordersRes.rows}
        customers={customersRes.rows}
      />
    </div>
  );
}
