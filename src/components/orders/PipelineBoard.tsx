// Signature visual: the order pipeline over the canonical lifecycle.
// Every stage is a real link into the filtered orders list — the board is
// an instrument, not a decoration.
import Link from "next/link";
import { PIPELINE_STAGES, type StageCounts } from "@/lib/orders/pipeline";
import clsx from "clsx";

export function PipelineBoard({ counts }: { counts: StageCounts }) {
  const flow = PIPELINE_STAGES.filter((s) => s.kind === "flow");
  const outcomes = PIPELINE_STAGES.filter((s) => s.kind === "outcome");
  return (
    <div>
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="list" aria-label="Order pipeline">
        {flow.map((s, i) => (
          <span key={s.key} className="flex items-center gap-1.5" role="listitem">
            <Link
              href={`/orders?stage=${s.key}`}
              className="cr-stage"
              aria-label={`${s.label}: ${counts[s.key]} orders`}
            >
              <span className="cr-stage-count">{counts[s.key]}</span>
              <span className="text-[10px] font-medium leading-tight text-white/80">{s.label}</span>
            </Link>
            {i < flow.length - 1 && <span className="cr-arrow" aria-hidden="true">→</span>}
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 overflow-x-auto" role="list" aria-label="Order outcomes">
        {outcomes.map((s) => (
          <Link
            key={s.key}
            role="listitem"
            href={`/orders?stage=${s.key}`}
            className={clsx(
              "cr-stage",
              s.key === "delivered" && "cr-stage-outcome",
              (s.key === "after_sales" || s.key === "cancelled") && "cr-stage-problem",
            )}
            aria-label={`${s.label}: ${counts[s.key]} orders`}
          >
            <span className="cr-stage-count">{counts[s.key]}</span>
            <span className="text-[10px] font-medium leading-tight text-white/80">{s.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
