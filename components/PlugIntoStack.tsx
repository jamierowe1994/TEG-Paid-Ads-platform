import fs from "node:fs";
import path from "node:path";
import ICONS, { SocialIcon } from "./SocialIcons";

// "Every lead — one place" — the platforms leads come from on the
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
      <h2 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
        Every lead — one place.
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-gray-600">
        We pull from the platforms your leads come from and push into the
        systems you already work in. You just open one app.
      </p>

      <div className="relative mt-16 flex items-center justify-between gap-4 sm:gap-8">
        {/* Sources — pop in one by one before their wires draw. */}
        <div className="flex flex-col gap-9 sm:gap-12">
          {SOURCES.map((icon, i) => (
            <span
              key={icon.name}
              className="plug-node text-gray-800"
              style={{ "--node-delay": `${i * 140}ms` } as React.CSSProperties}
            >
              <SocialIcon icon={icon} className="h-9 w-9 sm:h-11 sm:w-11" />
            </span>
          ))}
        </div>

        {/* Wires in */}
        <Wires direction="in" rows={[30, 100, 170]} />

        {/* The hub — a miniature of the app itself. Everything the wires
            carry lands HERE: pulses run down every line into the card, and
            the lead rows inside light up in turn as they arrive. That's the
            whole pitch drawn live: we connect it all, it lands in one place. */}
        <div className="plug-node relative w-40 shrink-0 sm:w-48" style={{ "--node-delay": "260ms" } as React.CSSProperties}>
          <div className="relative rounded-2xl border border-black/5 bg-white p-3 text-left shadow-[0_26px_50px_-22px_rgba(17,24,39,0.45)] sm:p-3.5">
            <div className="flex items-center gap-2">
              <svg
                viewBox="0 0 512 512"
                className="h-5 w-5 shrink-0"
                fill="var(--group)"
                aria-hidden
              >
                <g transform="rotate(45 256 256) translate(0 -8)">
                  <path d="M256 80 C298 122 300 194 298 268 C298 302 293 330 284 350 L228 350 C219 330 214 302 214 268 C212 194 214 122 256 80 Z" />
                  <path d="M214 266 L172 356 L221 335 Z" />
                  <path d="M298 266 L340 356 L291 335 Z" />
                  <path d="M232 350 L239 372 L273 372 L280 350 Z" />
                  <circle cx="256" cy="172" r="32" fill="#ffffff" />
                </g>
              </svg>
              <p className="text-[13px] font-semibold tracking-tight text-gray-900">
                Launch Pad
              </p>
              {/* Live dot — the app is on, listening. */}
              <span className="pulse-dot ml-auto h-1.5 w-1.5 rounded-full bg-green-500" />
            </div>
            <p className="mt-1.5 text-[8px] font-semibold uppercase tracking-[0.16em] text-gray-400">
              Every lead · one place
            </p>
            <div className="mt-2 space-y-1">
              {/* Skeleton lead rows, tinted with each platform's colour on
                  the left; each glows as a pulse lands. */}
              {["#1877F2", "#E4405F", "#0A66C2"].map((c, i) => (
                <div
                  key={c}
                  className="plug-row flex items-center gap-2 px-1.5 py-1.5"
                  style={{ "--row-delay": `${i * 2.6}s` } as React.CSSProperties}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: c }}
                  />
                  <span className="h-1.5 flex-1 rounded-full bg-gray-200" />
                  <span className="h-1.5 w-6 rounded-full bg-gray-100" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Wires out */}
        <Wires direction="out" rows={[62, 138]} />

        {/* Destinations */}
        <div className="flex flex-col gap-9 sm:gap-12">
          {DESTINATIONS.map((d, i) => {
            const src = logoSrc(d.id);
            return (
              <span
                key={d.id}
                className="plug-node flex h-11 items-center"
                style={
                  { "--node-delay": `${420 + i * 140}ms` } as React.CSSProperties
                }
              >
                {src ? (
                  // brightness-0 flattens whatever colour the supplied mark
                  // is to solid black, matching the platform icons opposite
                  // on the light background. Rex ships as icon + wordmark;
                  // the square crop keeps just the icon, like the rest.
                  d.id === "rex" ? (
                    <span className="block h-11 w-11 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={d.label}
                        className="h-11 w-auto max-w-none object-left opacity-80 brightness-0"
                      />
                    </span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={d.label}
                      className="h-11 w-auto max-w-[130px] object-contain object-left opacity-80 brightness-0"
                    />
                  )
                ) : (
                  <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-gray-500 sm:text-sm">
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
          <path d="M0 0 L6 3 L0 6 z" fill="rgba(17,24,39,0.45)" />
        </marker>
      </defs>
      {rows.map((y, i) => (
        <g key={y}>
          <path
            // pathLength=1 normalises every wire so one dash animation draws
            // them all; each wire starts after its node has popped in.
            className="plug-wire"
            pathLength={1}
            style={
              {
                "--wire-delay": `${(direction === "out" ? 560 : 140) + i * 160}ms`,
              } as React.CSSProperties
            }
            d={`M0 ${y} H26 L74 100 H90`}
            fill="none"
            stroke="rgba(17,24,39,0.22)"
            strokeWidth="1.6"
            vectorEffect="non-scaling-stroke"
            markerEnd={`url(#arrow-${direction})`}
          />
          {/* The data pulse — a comet running the wire on repeat. The svg
              for "out" is mirrored, so its pulses run in reverse to keep
              travelling hub → destination. */}
          <path
            className={`plug-pulse-line${flip ? " plug-pulse-rev" : ""}`}
            pathLength={1}
            style={
              {
                "--pulse-delay": `${(direction === "out" ? 1.3 : 0) + i * 0.85}s`,
              } as React.CSSProperties
            }
            d={`M0 ${y} H26 L74 100 H90`}
            fill="none"
            stroke="var(--group)"
            strokeWidth="2.4"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
    </svg>
  );
}
