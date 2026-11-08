/** Data for the stage visuals that has to come from the story graph. */
import { loadState } from "../checks/state";
import { nameOf } from "../checks/types";
import type { Db } from "../db/client";

/** Who is in which scene: anyone who speaks, is present, wears or holds something there. */
export async function presenceFor(db: Db, docId: number): Promise<{ scenes: string[]; rows: { name: string; in: Set<string> }[] }> {
  const state = await loadState(db, docId);
  const sceneOf = new Map(state.scenes.map((s) => [s.id, s.number]));
  const byName = new Map<string, Set<string>>();
  for (const f of state.facts) {
    if (f.sceneId == null || f.subjectEntityId == null) continue;
    if (!["appears_in", "wears", "has_prop"].includes(f.kind)) continue;
    const n = sceneOf.get(f.sceneId);
    if (!n) continue;
    const name = nameOf(state, f.subjectEntityId);
    byName.set(name, (byName.get(name) ?? new Set()).add(n));
  }
  const rows = [...byName].map(([name, set]) => ({ name, in: set })).sort((a, b) => b.in.size - a.in.size || a.name.localeCompare(b.name));
  return { scenes: state.scenes.map((s) => s.number), rows };
}
