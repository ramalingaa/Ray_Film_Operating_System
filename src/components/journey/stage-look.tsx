/**
 * The visual identity of each stage, from the design system: a colour (base
 * for tiles and the rail, soft for backgrounds, deep for text on light
 * surfaces), an icon, and the copy the journey map shows.
 */
import { CalendarDays, ClipboardList, Coins, FileText, MapPin, PenLine, type LucideIcon } from "lucide-react";
import type { Chapter } from "@/lib/stages/chapters";

export interface StageLook {
  base: string;
  soft: string;
  deep: string;
  /** Pill on the dark production strip. */
  onInkBg: string;
  onInkFg: string;
  Icon: LucideIcon;
  purpose: string;
  checks: string;
  signer: string;
}

export const STAGE_LOOK: Record<Chapter["id"], StageLook> = {
  story: {
    base: "#7C6AE6",
    soft: "#EEEAFD",
    deep: "#4B3BB0",
    onInkBg: "#2C2560",
    onInkFg: "#D6CEFF",
    Icon: PenLine,
    purpose: "Find the heart of it before a scene is written.",
    checks: "Logline · 15 beats · setups and payoffs · producer questions",
    signer: "the writer and producer",
  },
  script: {
    base: "#4F7FE0",
    soft: "#E6EEFC",
    deep: "#2A57B5",
    onInkBg: "#22305A",
    onInkFg: "#CFE0FF",
    Icon: FileText,
    purpose: "Written from your story, or your own. Every page tested.",
    checks: "Pages and running time · structure · 8 continuity checks",
    signer: "the writer and script supervisor",
  },
  breakdown: {
    base: "#219E90",
    soft: "#DFF4F1",
    deep: "#136B61",
    onInkBg: "#173F3B",
    onInkFg: "#B7EEE6",
    Icon: ClipboardList,
    purpose: "Everything every department must bring to set.",
    checks: "Cast · wardrobe · props · stunts · weapons · minors · effects",
    signer: "the first assistant director",
  },
  locations: {
    base: "#4E9F5E",
    soft: "#E5F3E7",
    deep: "#2F6E3C",
    onInkBg: "#1E3D26",
    onInkFg: "#C4EDCD",
    Icon: MapPin,
    purpose: "Every set the story needs, by day and by night.",
    checks: "Sets · day and night needs · sheet coverage · one-off moves",
    signer: "the location manager",
  },
  schedule: {
    base: "#D98A2B",
    soft: "#FBEEDB",
    deep: "#8F5410",
    onInkBg: "#4A3110",
    onInkFg: "#FBD9A8",
    Icon: CalendarDays,
    purpose: "The order of the shoot, day by day.",
    checks: "Stripboard · day out of days · turnaround · child hours",
    signer: "the first assistant director",
  },
  budget: {
    base: "#C29A2E",
    soft: "#F6EED6",
    deep: "#7A5E12",
    onInkBg: "#463A14",
    onInkFg: "#F2DFA6",
    Icon: Coins,
    purpose: "What it will take, line by line.",
    checks: "Top sheet from the schedule · cost drivers · every line traced",
    signer: "the line producer",
  },
};

/** The four-pointed star mark used for the brand and the greenlight. */
export function StarMark({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 1.5c.5 4.9 2.6 8 7.5 8.5-4.9.5-7 3.6-7.5 8.5-.5-4.9-2.6-8-7.5-8.5 4.9-.5 7-3.6 7.5-8.5Z" />
    </svg>
  );
}
