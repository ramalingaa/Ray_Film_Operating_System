/**
 * Where the beats land along the story, against where they usually land.
 * One series (present beats) on a single 0–100% axis; usual ranges are
 * recessive bands; every marker is labelled with its number, listed below.
 */
import { GRID, MUTED, SERIES, TEXT, TEXT_2 } from "./palette";

export interface ArcBeat {
  title: string;
  position: number | null;
  expected: string;
  present: boolean;
  timing: string;
}

export function BeatArc({ beats }: { beats: ArcBeat[] }) {
  const placed = beats.map((b, i) => ({ ...b, n: i + 1 })).filter((b) => b.position != null);
  if (placed.length < 2) return null;
  const W = 760;
  const H = 150;
  const L = 24;
  const R = W - 24;
  const x = (p: number) => L + p * (R - L);
  const lanes = [0, 0, 0];
  const laneOf = placed.map((b) => {
    const px = x(b.position!);
    const lane = lanes.findIndex((end) => px - end > 26);
    const k = lane < 0 ? 0 : lane;
    lanes[k] = px;
    return k;
  });
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Beats along the story: ${placed.length} placed`} className="h-auto w-full">
        <line x1={L} y1={100} x2={R} y2={100} stroke={GRID} strokeWidth={2} />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={94} x2={x(t)} y2={106} stroke={GRID} strokeWidth={2} />
            <text x={x(t)} y={128} textAnchor="middle" fontSize={12} fill={MUTED}>
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        <text x={L} y={146} fontSize={11} fill={MUTED}>
          beginning
        </text>
        <text x={R} y={146} fontSize={11} textAnchor="end" fill={MUTED}>
          end
        </text>
        {placed.map((b, i) => {
          const px = x(b.position!);
          const y = 82 - laneOf[i] * 26;
          const off = b.timing !== "on_time";
          return (
            <g key={b.n}>
              <title>{`${b.n}. ${b.title}: at ${Math.round(b.position! * 100)}%, usually ${b.expected}${off ? ` (${b.timing})` : ""}`}</title>
              <line x1={px} y1={y + 10} x2={px} y2={100} stroke={off ? SERIES[1] : SERIES[0]} strokeWidth={2} />
              <circle cx={px} cy={y} r={11} fill={off ? SERIES[1] : SERIES[0]} stroke="#fff" strokeWidth={2} />
              <text x={px} y={y + 4} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#fff">
                {b.n}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px]" style={{ color: TEXT_2 }}>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: SERIES[0] }} /> on time
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: SERIES[1] }} /> early or late
        </span>
        <span style={{ color: TEXT }}>Numbers match the beat list below. Hover a marker for details.</span>
      </figcaption>
    </figure>
  );
}
