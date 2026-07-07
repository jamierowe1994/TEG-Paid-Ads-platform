// A very subtle topographic-contour texture, fixed behind the whole landing
// page so it reads as one continuous light-grey underlay through every white
// section as you scroll. Deterministic (no random) so SSR/CSR match. The
// charcoal panel and dark footer sit on top and cover it.

// Organic closed "island" outlines centred on the origin (radius ~100).
const BLOBS = [
  "M0,-100 C46,-96 84,-62 88,-14 C92,34 58,78 6,92 C-46,106 -92,64 -94,12 C-96,-42 -54,-96 0,-100 Z",
  "M0,-96 C52,-100 92,-54 90,-6 C88,42 60,86 8,96 C-44,106 -98,58 -92,6 C-86,-46 -52,-92 0,-96 Z",
  "M2,-98 C50,-92 96,-58 92,-8 C88,42 52,80 2,94 C-48,108 -96,54 -90,4 C-84,-46 -46,-104 2,-98 Z",
];

// Where the islands sit across the viewBox, which base shape, and overall scale.
const ISLANDS = [
  { x: 120, y: 150, b: 0, s: 1.15 },
  { x: 520, y: 80, b: 1, s: 0.8 },
  { x: 900, y: 190, b: 2, s: 1.25 },
  { x: 1090, y: 520, b: 0, s: 0.95 },
  { x: 300, y: 540, b: 1, s: 1.2 },
  { x: 700, y: 660, b: 2, s: 0.85 },
  { x: 60, y: 790, b: 2, s: 1.05 },
  { x: 1130, y: 820, b: 1, s: 1.1 },
];

// Concentric contour rings within each island.
const RINGS = [0.26, 0.48, 0.7, 0.92, 1.14];

export default function BackgroundTexture() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 opacity-[0.75]"
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 1200 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <g stroke="#b7bcc7" strokeWidth={1} vectorEffect="non-scaling-stroke">
          {ISLANDS.map((isl, i) => (
            <g key={i} transform={`translate(${isl.x} ${isl.y}) scale(${isl.s})`}>
              {RINGS.map((r, j) => (
                <path key={j} d={BLOBS[isl.b]} transform={`scale(${r})`} />
              ))}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
