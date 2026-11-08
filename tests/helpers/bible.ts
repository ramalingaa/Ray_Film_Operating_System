import type { BibleState, FactInfo, SceneInfo } from "@/lib/checks/types";

/** Tiny hand-built story bibles for check tests. */
export class BibleBuilder {
  private scenes: SceneInfo[] = [];
  private facts: FactInfo[] = [];
  private names = new Map<number, string>();
  private ids = new Map<string, number>();
  private nextFact = 1;

  entity(name: string): number {
    let id = this.ids.get(name);
    if (!id) {
      id = this.ids.size + 1000;
      this.ids.set(name, id);
      this.names.set(id, name);
    }
    return id;
  }

  scene(number: string, opts: { time?: string; day?: number | null; basis?: string; flashback?: boolean; location?: string } = {}): this {
    const ordinal = this.scenes.length + 1;
    const id = ordinal * 10;
    this.scenes.push({
      id,
      ordinal,
      number,
      heading: `INT. ${opts.location ?? "ROOM"} - ${opts.time ?? "DAY"}`,
      timeOfDay: opts.time ?? "DAY",
      isFlashback: opts.flashback ?? false,
      storyDay: opts.day === undefined ? 1 : opts.day,
      dayBasis: opts.basis ?? "assumed",
      locationEntityId: this.entity(opts.location ?? "ROOM"),
      startLine: ordinal * 10,
    });
    this.fact({ scene: number, kind: "story_day", predicate: "story_day", object: String(opts.day ?? 1), attrs: { basis: opts.basis ?? "assumed" } });
    return this;
  }

  fact(f: {
    scene?: string;
    kind: string;
    subject?: string;
    predicate: string;
    object: string;
    attrs?: Record<string, unknown>;
    day?: number | null;
    doc?: string;
    line?: number;
  }): number {
    const scene = f.scene ? this.scenes.find((s) => s.number === f.scene) : undefined;
    const id = this.nextFact++;
    this.facts.push({
      id,
      sceneId: scene?.id ?? null,
      kind: f.kind,
      subjectEntityId: f.subject ? this.entity(f.subject) : null,
      predicate: f.predicate,
      objectValue: f.object,
      attrs: f.attrs ?? {},
      storyDay: f.day !== undefined ? f.day : (scene?.storyDay ?? null),
      sourceDocId: f.doc === "costumes.csv" ? 2 : 1,
      sourceDocName: f.doc ?? "script.fountain",
      sourceLine: f.line ?? (scene ? scene.startLine + 1 : 2),
      sourceSnippet: f.object,
      confidence: 1,
      extractedBy: "test",
    });
    return id;
  }

  wears(scene: string, who: string, garment: string, attrs: Record<string, unknown> = {}): number {
    return this.fact({ scene, kind: "wears", subject: who, predicate: "wears", object: garment, attrs });
  }

  sheet(who: string, costume: string, opts: { scenes?: string[]; day?: number | null; state?: string }): number {
    return this.fact({
      kind: "wears",
      subject: who,
      predicate: "sheet_costume",
      object: costume,
      day: opts.day ?? null,
      attrs: { scenes: opts.scenes ?? [], state: opts.state ?? null },
      doc: "costumes.csv",
    });
  }

  prop(scene: string, name: string, action: string, attrs: Record<string, unknown> = {}): number {
    return this.fact({ scene, kind: "prop_state", subject: name, predicate: action, object: action, attrs: { action, ...attrs } });
  }

  build(): BibleState {
    return { docId: 1, scenes: this.scenes, facts: this.facts, entityNames: this.names };
  }
}
