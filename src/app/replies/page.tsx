import { PageHeader } from '@/components/ui';
import CopyDraft from '@/components/CopyDraft';
import { REPLY_LIBRARY } from '@/lib/operator-productivity';

export default function RepliesPage() {
  return <div className="mx-auto max-w-4xl">
    <PageHeader title="Reply libraries" subtitle="Review and personalise each draft before copying into WhatsApp Business or Instagram. Nothing is sent automatically." />
    <p className="mb-4 text-sm">Suggested starter copy. Confirm prices, materials, payment and delivery against the actual record. Complaints and financial decisions require owner review.</p>
    {(['WhatsApp Business quick replies', 'Instagram saved replies'] as const).map(channel => <section key={channel} className="card mb-4">
      <h2 className="mb-3 text-lg font-semibold">{channel}</h2>
      {REPLY_LIBRARY.map(reply => <article key={reply.key} className="mb-4 border-b pb-4">
        <h3 className="font-semibold">/{reply.key} — {reply.title}</h3>
        <p className="my-2 whitespace-pre-wrap text-sm">{reply.text}</p>
        <CopyDraft text={reply.text} />
      </article>)}
    </section>)}
  </div>;
}
