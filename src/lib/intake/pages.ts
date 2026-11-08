/**
 * Page length in eighths, estimated from Fountain the way a formatted
 * screenplay lays out: about 55 lines per page, action wrapping at about 60
 * characters, dialogue at about 35. One page is roughly one minute of screen
 * time. Estimates, labelled as such wherever they are shown.
 */
import type { ParsedScene } from "../fountain";

export const LINES_PER_PAGE = 55;

function wrapped(text: string, width: number): number {
  return text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.trim().length / width)), 0);
}

export function sceneLines(scene: Pick<ParsedScene, "elements">): number {
  let lines = 0;
  for (const e of scene.elements) {
    switch (e.type) {
      case "scene_heading":
        lines += 2;
        break;
      case "action":
        lines += wrapped(e.text, 60) + 1;
        break;
      case "character":
        lines += 1;
        break;
      case "parenthetical":
        lines += wrapped(e.text, 25);
        break;
      case "dialogue":
        lines += wrapped(e.text, 35) + 1;
        break;
      case "transition":
        lines += 2;
        break;
      default:
        lines += 1;
    }
  }
  return lines;
}

/** Scene length in eighths of a page, at least 1/8. */
export function sceneEighths(scene: Pick<ParsedScene, "elements">): number {
  return Math.max(1, Math.round((sceneLines(scene) / LINES_PER_PAGE) * 8));
}

export function formatEighths(eighths: number): string {
  const pages = Math.floor(eighths / 8);
  const rest = eighths % 8;
  if (!rest) return `${pages}`;
  return pages ? `${pages} ${rest}/8` : `${rest}/8`;
}
