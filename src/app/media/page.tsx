import { fetchRows, formatRelative } from "@/lib/data";
import { DemoBanner, PageHeader, Kpi, SectionTitle, EmptyState } from "@/components/ui";
import MediaUpload from "@/components/MediaUpload";
import { MEDIA_CLASSIFICATION_LABELS, mediaIsPrivate, type MediaClassification } from "@/lib/media";
import clsx from "clsx";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const { rows, demoMode, error } = await fetchRows("media_assets", { order: "created_at" });
  const privateCount = rows.filter(mediaIsPrivate).length;
  const unclear = rows.filter((r) => r.photo_classification === "unclear").length;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Media"
        subtitle="Every stored file carries a classification. Private customer photos never leave the console."
      />
      <DemoBanner demoMode={demoMode} />
      {error ? <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</div> : null}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Stored files" value={rows.length} />
        <Kpi label="Private" value={privateCount} hint="Never shared publicly" />
        <Kpi label="Unclear" value={unclear} hint="Needs classification review" />
      </div>

      <div className="card mb-4">
        <SectionTitle>Upload</SectionTitle>
        <MediaUpload demoMode={demoMode} />
      </div>

      <div className="card">
        <SectionTitle>Stored media</SectionTitle>
        {rows.length === 0 ? (
          <EmptyState title="No stored media yet." hint="Uploads land in the private media bucket with their classification." />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Path</th><th>Classification</th><th>Private</th><th>Type</th><th>Description</th><th>Stored</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const cls = m.photo_classification as MediaClassification | null;
                  const priv = mediaIsPrivate(m);
                  return (
                    <tr key={m.id as string}>
                      <td className="font-mono text-xs">{(m.storage_path as string) ?? (m.file_url as string) ?? "—"}</td>
                      <td>
                        <span className={clsx("badge", cls === "unclear" ? "badge-warn" : "badge-neutral")}>
                          {cls ? MEDIA_CLASSIFICATION_LABELS[cls] ?? cls : "—"}
                        </span>
                      </td>
                      <td>{priv ? <span className="badge badge-fail">private</span> : <span className="badge badge-pass">no</span>}</td>
                      <td className="text-xs">{(m.content_type as string) ?? (m.media_type as string) ?? "—"}</td>
                      <td className="text-xs">{(m.description as string) ?? "—"}</td>
                      <td className="text-xs text-gray-500">{m.created_at ? formatRelative(m.created_at as string) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
