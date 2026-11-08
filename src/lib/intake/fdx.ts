/**
 * Final Draft (.fdx) → Fountain. FDX is XML: a <Content> list of
 * <Paragraph Type="..."> elements whose text is split across <Text> runs.
 * Only the element types the pipeline reads are mapped; anything else becomes
 * action so no words are lost.
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function isFdx(text: string): boolean {
  return /<FinalDraft[\s>]/i.test(text.slice(0, 2000));
}

const HEADING = /^(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E)[.\s]/i;

export function fdxToFountain(xml: string): { text: string; title?: string; paragraphs: number } {
  const content = /<Content>([\s\S]*?)<\/Content>/i.exec(xml)?.[1] ?? xml;
  const out: string[] = [];
  let paragraphs = 0;
  for (const m of content.matchAll(/<Paragraph\b([^>]*)>([\s\S]*?)<\/Paragraph>/gi)) {
    const type = /\bType="([^"]*)"/i.exec(m[1])?.[1] ?? "Action";
    const text = unescapeXml([...m[2].matchAll(/<Text\b[^>]*>([\s\S]*?)<\/Text>/gi)].map((t) => t[1]).join(""))
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    paragraphs++;
    switch (type) {
      case "Scene Heading":
        out.push("", HEADING.test(text) ? text.toUpperCase() : `.${text.toUpperCase()}`, "");
        break;
      case "Character":
        out.push("", text.toUpperCase());
        break;
      case "Parenthetical":
        out.push(text.startsWith("(") ? text : `(${text})`);
        break;
      case "Dialogue":
        out.push(text);
        break;
      case "Transition":
        out.push("", /TO:$/.test(text.toUpperCase()) ? text.toUpperCase() : `> ${text.toUpperCase()}`, "");
        break;
      default:
        // Action, Shot, General, Cast List, ...: an action paragraph.
        out.push("", text, "");
    }
  }
  const title = /<TitlePage>[\s\S]*?<Text\b[^>]*>([^<]+)<\/Text>/i.exec(xml)?.[1];
  const body = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: (title ? `Title: ${unescapeXml(title).trim()}\n\n` : "") + body + "\n", title: title ? unescapeXml(title).trim() : undefined, paragraphs };
}
