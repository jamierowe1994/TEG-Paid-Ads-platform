import fs from "node:fs";
import path from "node:path";
import ICONS, { SocialIcon } from "./SocialIcons";

// "Everything plugs into one place" — the platforms leads come from on the
// left, Launch Pad in the middle, the systems you already work in on the
// right, joined by wires that flow into and out of the hub. Icons only; the
// logos speak for themselves.

const pick = (name: string) => ICONS.find((i) => i.name === name)!;
const SOURCES = [
  pick("Meta / Facebook"),
  pick("Instagram"),
  pick("LinkedIn"),
];
// Internal systems. Drop <id>.svg or .png into public/system-logos and the
// lettermark is replaced by the real logo; without one it stays as text.
const DESTINATIONS = [
  { id: "rex", label: "REX" },
  { id: "atlas", label: "Atlas" },
];

/* Which logo file (if any) exists for a destination.
   Resolved on the server rather than in the browser: the first attempt at
   this rendered an <img> pointed at .svg and swapped to .png in onError, but
   the 404 lands before React hydrates, so the handler never runs and you get
   a broken-image icon. Checking the filesystem also means no 404s in the log
   and no flash of the wrong mark.

   Note: the landing page is statically prerendered, so this is evaluated at
   BUILD time — a logo added to the folder only appears after a rebuild.
   Adding one is a commit anyway, and pushing triggers a build. */
function logoSrc(id: string): string | null {
  const dir = path.join(process.cwd(), "public", "system-logos");
  for (const ext of ["svg", "png"]) {
    if (fs.existsSync(path.join(dir, `${id}.${ext}`))) {
      return `/system-logos/${id}.${ext}`;
    }
  }
  return null;
}

export default function PlugIntoStack() {
  return (
    <div className="mx-auto max-w-4xl text-center">
      <h2 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
        Everything plugs into one place.
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-white/55">
        We pull from the platforms your leads come from and push into the
        systems you already work in. You just open one app.
      </p>

      <div className="relative mt-16 flex items-center justify-between gap-4 sm:gap-8">
        {/* Sources */}
        <div className="flex flex-col gap-9 sm:gap-12">
          {SOURCES.map((icon) => (
            <span key={icon.name} className="text-white/85">
              <SocialIcon icon={icon} className="h-9 w-9 sm:h-11 sm:w-11" />
            </span>
          ))}
        </div>

        {/* Wires in */}
        <Wires direction="in" rows={[30, 100, 170]} />

        {/* The hub */}
        <div className="relative shrink-0">
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[55px]"
            style={{
              background:
                "radial-gradient(circle, rgba(255,255,255,0.28), transparent 68%)",
            }}
          />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-[24px] border border-white/15 bg-[#0e0e12] shadow-[0_0_46px_-12px_rgba(255,255,255,0.4),inset_0_1px_0_rgba(255,255,255,0.14)] sm:h-28 sm:w-28">
            <svg viewBox="0 0 512 512" className="h-12 w-12 sm:h-14 sm:w-14" fill="#ffffff" aria-hidden>
              <g transform="rotate(45 256 256) translate(0 -8)">
                <path d="M256 80 C298 122 300 194 298 268 C298 302 293 330 284 350 L228 350 C219 330 214 302 214 268 C212 194 214 122 256 80 Z" />
                <path d="M214 266 L172 356 L221 335 Z" />
                <path d="M298 266 L340 356 L291 335 Z" />
                <path d="M232 350 L239 372 L273 372 L280 350 Z" />
                <circle cx="256" cy="172" r="32" fill="#0e0e12" />
              </g>
            </svg>
          </div>
        </div>

        {/* Wires out */}
        <Wires direction="out" rows={[62, 138]} />

        {/* Destinations */}
        <div className="flex flex-col gap-9 sm:gap-12">
          {DESTINATIONS.map((d) => {
            const src = logoSrc(d.id);
            return (
              <span key={d.id} className="flex h-11 items-center">
                {src ? (
                  // brightness-0 + invert flattens whatever colour the supplied
                  // mark is to solid white, matching the platform icons
                  // opposite on the dark background.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={d.label}
                    className="h-11 w-auto max-w-[130px] object-contain object-left opacity-80 brightness-0 invert"
                  />
                ) : (
                  <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/70 sm:text-sm">
                    {d.label}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Three wires fanning between a column of items and the hub, with an
// arrowhead showing which way the data flows.
function Wires({ direction, rows }: { direction: "in" | "out"; rows: number[] }) {
  const flip = direction === "out";
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 200"
      preserveAspectRatio="none"
      className="h-[190px] flex-1 sm:h-[230px]"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      <defs>
        <marker
          id={`arrow-${direction}`}
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0 0 L6 3 L0 6 z" fill="rgba(255,255,255,0.45)" />
        </marker>
      </defs>
      {rows.map((y) => (
        <path
          key={y}
          d={`M0 ${y} H26 L74 100 H90`}
          fill="none"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
          markerEnd={`url(#arrow-${direction})`}
        />
      ))}
    </svg>
  );
}
