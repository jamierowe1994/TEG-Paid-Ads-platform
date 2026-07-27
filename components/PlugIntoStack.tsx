// "Everything plugs into one place" — the platforms we pull from on the left,
// Launch Pad in the middle, the systems we push out to on the right, wired
// together. Pure SVG + CSS so it stays crisp and ships no images.

const LEFT = [
  { name: "Meta", short: "Meta", colour: "#1877F2" },
  { name: "Instagram", short: "IG", colour: "#E4405F" },
  { name: "Facebook", short: "FB", colour: "#1877F2" },
];
const RIGHT = [
  { name: "REX", short: "REX", colour: "#8a6f5c" },
  { name: "Atlas", short: "Atlas", colour: "#2b6193" },
  { name: "Your inbox", short: "Mail", colour: "#9ca3af" },
];

function Node({
  label,
  short,
  colour,
  flip,
}: {
  label: string;
  short: string;
  colour: string;
  flip?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 ${flip ? "flex-row-reverse" : ""}`}>
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.05] text-[11px] font-bold text-white/90 backdrop-blur"
        style={{ boxShadow: `inset 0 0 22px -8px ${colour}` }}
      >
        {short}
      </span>
      <span className="text-sm text-white/70">{label}</span>
    </div>
  );
}

export default function PlugIntoStack() {
  return (
    <div className="mx-auto max-w-5xl text-center">
      <h2 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
        Everything plugs into one place.
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-white/55">
        We pull from the platforms your leads come from, and push into the
        systems you already work in. You just open one app.
      </p>

      <div className="relative mt-16 grid items-center gap-10 sm:grid-cols-[1fr_auto_1fr]">
        {/* Sources */}
        <div className="flex flex-col items-start gap-6 sm:items-end">
          {LEFT.map((n) => (
            <Node key={n.name} label={n.name} short={n.short} colour={n.colour} flip />
          ))}
        </div>

        {/* The hub */}
        <div className="relative flex justify-center">
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[60px]"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.30), transparent 68%)" }}
          />
          <div className="relative flex h-28 w-28 flex-col items-center justify-center rounded-[26px] border border-white/15 bg-[#0e0e12] shadow-[0_0_50px_-10px_rgba(255,255,255,0.35),inset_0_1px_0_rgba(255,255,255,0.15)]">
            <svg viewBox="0 0 512 512" className="h-11 w-11" fill="#ffffff" aria-hidden>
              <g transform="rotate(45 256 256) translate(0 -8)">
                <path d="M256 80 C298 122 300 194 298 268 C298 302 293 330 284 350 L228 350 C219 330 214 302 214 268 C212 194 214 122 256 80 Z" />
                <path d="M214 266 L172 356 L221 335 Z" />
                <path d="M298 266 L340 356 L291 335 Z" />
                <path d="M232 350 L239 372 L273 372 L280 350 Z" />
                <circle cx="256" cy="172" r="32" fill="#0e0e12" />
              </g>
            </svg>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-white/70">
              Launch Pad
            </span>
          </div>
        </div>

        {/* Destinations */}
        <div className="flex flex-col items-start gap-6">
          {RIGHT.map((n) => (
            <Node key={n.name} label={n.name} short={n.short} colour={n.colour} />
          ))}
        </div>

        {/* Wires — drawn behind, hidden on small screens where the grid stacks */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 hidden h-full w-full sm:block"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          {[18, 50, 82].map((y) => (
            <g key={y} stroke="rgba(255,255,255,0.18)" strokeWidth="0.35" fill="none">
              <path d={`M30 ${y} H40 Q44 ${y} 44 50 H48`} />
              <path d={`M70 ${y} H60 Q56 ${y} 56 50 H52`} />
            </g>
          ))}
        </svg>
      </div>

      <p className="mt-14 text-sm text-white/40">
        More going in and out all the time — if you use it, tell us and we&apos;ll
        wire it up.
      </p>
    </div>
  );
}
