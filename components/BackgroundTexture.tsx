// A very subtle, abstract topographic-contour texture fixed behind the whole
// landing page. Each "island" is generated with a seeded PRNG so it's
// deterministic (SSR/CSR match) but deliberately non-uniform: random ring
// counts, varied stroke thicknesses, several base shapes, oblong/rotated
// forms, and a slow independent pulse/drift so the whole thing gently
// breathes without ever looking patterned.

// Several organic base outlines (centred on origin, radius ~100), so islands
// aren't all circles.
const SHAPES = [
  "M0,-100 C46,-96 84,-62 88,-14 C92,34 58,78 6,92 C-46,106 -92,64 -94,12 C-96,-42 -54,-96 0,-100 Z",
  "M0,-60 C64,-64 132,-46 142,-8 C152,32 82,66 0,62 C-82,66 -152,32 -142,-8 C-132,-46 -64,-56 0,-60 Z",
  "M0,-100 C56,-100 72,-54 96,-28 C120,-2 100,46 60,70 C20,94 -30,110 -72,80 C-114,50 -96,0 -100,-40 C-104,-80 -56,-100 0,-100 Z",
  "M-20,-90 C42,-102 96,-70 90,-14 C84,32 40,42 20,72 C0,102 -60,100 -86,54 C-112,8 -82,-80 -20,-90 Z",
  "M6,-92 C58,-96 98,-50 88,2 C78,54 54,92 0,96 C-56,100 -98,52 -92,0 C-86,-52 -46,-88 6,-92 Z",
];

// Deterministic PRNG (mulberry32) with a fixed seed — same output every render.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Island {
  x: number;
  y: number;
  shape: number;
  sx: number;
  sy: number;
  rot: number;
  anim: string;
  dur: number;
  delay: number;
  rings: { scale: number; width: number }[];
}

const ANIMS = ["topo-a", "topo-b", "topo-c"];

// Placed on a jittered grid (one per cell) so islands stay spread out and
// don't collide/overlap — smaller than a cell, with only gentle jitter.
const COLS = 4;
const ROWS = 4;

const ISLANDS: Island[] = (() => {
  const r = rng(20260707);
  const out: Island[] = [];
  const cw = 1200 / COLS;
  const ch = 900 / ROWS;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const ringCount = 3 + Math.floor(r() * 5); // 3–7 rings
      const rings: { scale: number; width: number }[] = [];
      for (let j = 0; j < ringCount; j++) {
        const t = ringCount === 1 ? 0.6 : j / (ringCount - 1);
        rings.push({
          scale: 0.12 + t * (0.68 + r() * 0.16) + r() * 0.04, // small, contained
          width: 0.5 + r() * 1.5, // varied thickness per ring
        });
      }
      out.push({
        // cell centre + gentle jitter (±22% of the cell)
        x: col * cw + cw / 2 + (r() - 0.5) * cw * 0.44,
        y: row * ch + ch / 2 + (r() - 0.5) * ch * 0.44,
        shape: Math.floor(r() * SHAPES.length),
        sx: 0.7 + r() * 0.55, // oblong horizontally (contained)
        sy: 0.7 + r() * 0.55, // oblong vertically
        rot: r() * 360,
        anim: ANIMS[Math.floor(r() * ANIMS.length)],
        dur: 34 + r() * 30, // 34–64s — very slow
        delay: -(r() * 40), // desync so nothing moves in step
        rings,
      });
    }
  }
  return out;
})();

export default function BackgroundTexture() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 opacity-80"
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 1200 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <g stroke="#d9dce2" vectorEffect="non-scaling-stroke">
          {ISLANDS.map((isl, i) => (
            <g key={i} transform={`translate(${isl.x} ${isl.y})`}>
              <g
                className="topo-pulse"
                style={{
                  animation: `${isl.anim} ${isl.dur}s ease-in-out ${isl.delay}s infinite`,
                }}
              >
                <g transform={`rotate(${isl.rot}) scale(${isl.sx} ${isl.sy})`}>
                  {isl.rings.map((ring, j) => (
                    <path
                      key={j}
                      d={SHAPES[isl.shape]}
                      transform={`scale(${ring.scale})`}
                      strokeWidth={ring.width}
                    />
                  ))}
                </g>
              </g>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
