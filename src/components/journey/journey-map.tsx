import { CHAPTERS } from "@/lib/stages/chapters";
import { STAGE_LOOK, StarMark } from "./stage-look";

/** The six stages as one connected process, with the screenplay entry point marked. */
export function JourneyMap() {
  return (
    <div className="relative mt-16">
      <div aria-hidden className="absolute top-9 right-[7%] left-[7%] hidden h-0.5 bg-[#D9CFB8] lg:block" />
      <ol className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {CHAPTERS.map((c, i) => {
          const look = STAGE_LOOK[c.id];
          return (
            <li key={c.id} className="relative flex flex-col items-center gap-3.5 text-center">
              {i === 1 && (
                <span
                  className="absolute -top-11 hidden rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap lg:inline"
                  style={{ color: look.deep, background: look.soft, borderColor: "#C4D6F7" }}
                >
                  Have a screenplay? Join here
                </span>
              )}
              <span
                className="inline-flex h-[72px] w-[72px] items-center justify-center rounded-full text-white shadow-[0_0_0_8px_var(--ivory)]"
                style={{ background: look.base }}
              >
                <look.Icon aria-hidden size={30} strokeWidth={1.8} />
              </span>
              <span className="text-xs font-bold tracking-[0.18em]" style={{ color: look.deep }}>
                STEP {i + 1}
              </span>
              <div className="flex w-full flex-col gap-2.5 rounded-[18px] border border-line bg-card px-4 py-5 text-left lg:min-h-[290px]">
                <span className="font-display text-[28px] leading-none font-semibold">{c.title}</span>
                <span className="text-sm leading-normal text-fg-2">{look.purpose}</span>
                <span className="mt-1 text-xs font-semibold tracking-wider text-muted">CHECKS</span>
                <span className="text-[13px] leading-relaxed">{look.checks}</span>
                <span className="mt-auto pt-2 text-xs text-muted">Signed off by {look.signer}</span>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-7 flex justify-end">
        <span className="font-display inline-flex items-center gap-2.5 rounded-full bg-ink px-5 py-3 text-[22px] font-semibold text-gold-bright">
          <StarMark size={20} /> Greenlit for production
        </span>
      </div>
    </div>
  );
}
