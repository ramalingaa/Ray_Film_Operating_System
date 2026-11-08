/**
 * Characters and how they connect: the protagonist in the centre, everyone
 * else on a ring, a labelled line per relationship. Role is shown by colour
 * AND by a legend and the role under each name, so it never rests on colour.
 */
import { MUTED, SERIES, SURFACE, TEXT, TEXT_2 } from "./palette";

export interface MapCharacter {
  name: string;
  role: "protagonist" | "antagonist" | "supporting" | "minor";
  age?: number | null;
  description?: string;
}
export interface MapRelationship {
  a: string;
  b: string;
  relation: string;
}

const ROLE_COLOR: Record<MapCharacter["role"], string> = {
  protagonist: SERIES[0],
  antagonist: SERIES[1],
  supporting: SERIES[2],
  minor: SERIES[3],
};
const ROLE_ORDER: MapCharacter["role"][] = ["protagonist", "antagonist", "supporting", "minor"];

export function CharacterMap({ characters, relationships, title = "Characters and relationships" }: { characters: MapCharacter[]; relationships: MapRelationship[]; title?: string }) {
  if (characters.length === 0) return null;
  const W = 760;
  const H = characters.length > 6 ? 560 : 480;
  const cx = W / 2;
  const cy = H / 2;
  const sorted = [...characters].sort((p, q) => ROLE_ORDER.indexOf(p.role) - ROLE_ORDER.indexOf(q.role));
  const centre = sorted[0].role === "protagonist" ? sorted[0] : undefined;
  const ring = orderByConnection(centre ? sorted.slice(1) : sorted, relationships);
  const rx = W / 2 - 110;
  const ry = H / 2 - 75;
  const pos = new Map<string, { x: number; y: number }>();
  if (centre) pos.set(centre.name.toLowerCase(), { x: cx, y: cy });
  ring.forEach((c, i) => {
    const t = -Math.PI / 2 + (i / Math.max(1, ring.length)) * Math.PI * 2;
    pos.set(c.name.toLowerCase(), { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  });
  const edges = relationships.flatMap((r) => {
    const p = pos.get(r.a.toLowerCase());
    const q = pos.get(r.b.toLowerCase());
    return p && q ? [{ ...r, p, q }] : [];
  });
  const roles = ROLE_ORDER.filter((r) => characters.some((c) => c.role === r));

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{title}</figcaption>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]" aria-hidden>
        {roles.map((r) => (
          <span key={r} className="inline-flex items-center gap-2 text-fg-2">
            <span className="h-3 w-3 rounded-full" style={{ background: ROLE_COLOR[r] }} />
            {r}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${characters.length} characters, ${edges.length} relationships`} className="h-auto w-full">
        {edges.map((e, i) => (
          <line key={`l${i}`} x1={e.p.x} y1={e.p.y} x2={e.q.x} y2={e.q.y} stroke="#C9BFA7" strokeWidth={2} />
        ))}
        {edges.map((e, i) => {
          // A numbered pill at the middle of each line; the numbered list below says what it is.
          const mx = (e.p.x + e.q.x) / 2;
          const my = (e.p.y + e.q.y) / 2;
          return (
            <g key={`n${i}`}>
              <title>{`${i + 1}. ${e.a} — ${e.b}: ${e.relation}`}</title>
              <circle cx={mx} cy={my} r={11} fill={SURFACE} stroke="#C9BFA7" strokeWidth={1.5} />
              <text x={mx} y={my + 4} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={TEXT_2}>
                {i + 1}
              </text>
            </g>
          );
        })}
        {characters.map((c) => {
          const p = pos.get(c.name.toLowerCase())!;
          const r = c === centre ? 34 : 26;
          return (
            <g key={c.name}>
              <title>{`${c.name} (${c.role}${c.age != null ? `, ${c.age}` : ""})${c.description ? `: ${c.description}` : ""}`}</title>
              <circle cx={p.x} cy={p.y} r={r + 4} fill={SURFACE} />
              <circle cx={p.x} cy={p.y} r={r} fill={ROLE_COLOR[c.role]} />
              <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize={c === centre ? 16 : 13} fontWeight={700} fill="#fff">
                {c.name
                  .split(/\s+/)
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </text>
              <text x={p.x} y={p.y + r + 20} textAnchor="middle" fontSize={14} fontWeight={600} fill={TEXT}>
                {c.name}
              </text>
              <text x={p.x} y={p.y + r + 36} textAnchor="middle" fontSize={11.5} fill={MUTED}>
                {c.role}
                {c.age != null ? ` · ${c.age}` : ""}
              </text>
            </g>
          );
        })}
      </svg>
      {edges.length > 0 && (
        <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {edges.map((e, i) => (
            <li key={i} className="flex gap-2.5 text-fg-2">
              <span className="inline-flex h-5.5 w-5.5 flex-none items-center justify-center rounded-full border border-[#C9BFA7] text-xs font-bold">{i + 1}</span>
              <span>
                <strong className="font-semibold text-fg">
                  {e.a} — {e.b}
                </strong>
                : {e.relation}
              </span>
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}

/**
 * Order the ring so connected characters sit next to each other (fewer lines
 * cross the middle): start from the most connected, then walk to neighbours.
 */
function orderByConnection(ring: MapCharacter[], relationships: MapRelationship[]): MapCharacter[] {
  const key = (n: string) => n.toLowerCase();
  const links = (c: MapCharacter) =>
    relationships.flatMap((r) => (key(r.a) === key(c.name) ? [key(r.b)] : key(r.b) === key(c.name) ? [key(r.a)] : []));
  const left = [...ring].sort((a, b) => links(b).length - links(a).length);
  if (!left.length) return left;
  // The ring is a circle: the hub's neighbours go on either side of it, then the rest fill the far side.
  const hub = left.shift()!;
  const before: MapCharacter[] = [];
  const after: MapCharacter[] = [];
  for (const n of links(hub)) {
    const i = left.findIndex((c) => key(c.name) === n);
    if (i < 0) continue;
    (after.length <= before.length ? after : before).push(...left.splice(i, 1));
  }
  return [hub, ...after, ...left, ...before.reverse()];
}
