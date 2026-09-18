/** The console's icons: strokes on a 24-unit grid, drawn here so the page depends on no icon set. */

import type { ReactNode } from "react";

type Segment = string | { circle: [number, number, number] } | { rect: [number, number, number, number, number] };

const PATHS = {
  home: ["M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
  grid: [{ rect: [3, 3, 7, 7, 1.5] }, { rect: [14, 3, 7, 7, 1.5] }, { rect: [3, 14, 7, 7, 1.5] }, { rect: [14, 14, 7, 7, 1.5] }],
  activity: ["M22 12h-4l-3 9L9 3l-3 9H2"],
  list: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
  check: [{ circle: [12, 12, 9] }, "m8.5 12.5 2.5 2.5 4.5-5"],
  chart: ["M3 3v18h18", "M7 15v3", "M12 9v9", "M17 5v13"],
  phone: [
    "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z",
  ],
  key: ["m21 2-9.6 9.6", "m15.5 7.5 3 3L22 7l-3-3", { circle: [7.5, 15.5, 5.5] }],
  plug: ["M12 22v-5", "M9 8V2", "M15 8V2", "M18 8v3a6 6 0 0 1-12 0V8z"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", { circle: [9, 7, 4] }, "M22 21v-2a4 4 0 0 0-3-3.9"],
  bot: ["M12 8V4", { rect: [4, 8, 16, 12, 2] }, "M2 14h2", "M20 14h2", "M9 13v2", "M15 13v2"],
  search: [{ circle: [11, 11, 7] }, "m21 21-4.3-4.3"],
  panel: [{ rect: [3, 3, 18, 18, 2] }, "M9 3v18"],
  building: [{ rect: [4, 2, 16, 20, 2] }, "M9 22v-4h6v4", "M8 6h.01", "M16 6h.01", "M12 6h.01", "M12 10h.01", "M12 14h.01", "M16 10h.01", "M16 14h.01", "M8 10h.01", "M8 14h.01"],
  server: [{ rect: [2, 2, 20, 8, 2] }, { rect: [2, 14, 20, 8, 2] }, "M6 6h.01", "M6 18h.01"],
  route: [{ circle: [6, 19, 3] }, "M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15", { circle: [18, 5, 3] }],
  sliders: ["M21 4h-7", "M10 4H3", "M21 12h-9", "M8 12H3", "M21 20h-5", "M12 20H3", "M14 2v4", "M8 10v4", "M16 18v4"],
  memory: ["M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z", "M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z", "M12 5v13"],
} satisfies Record<string, readonly Segment[]>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number | undefined }): ReactNode {
  return (
    <svg
      className="ui-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {(PATHS[name] as readonly Segment[]).map((segment, index) => {
        if (typeof segment === "string") return <path key={index} d={segment} />;
        if ("circle" in segment) {
          const [cx, cy, r] = segment.circle;
          return <circle key={index} cx={cx} cy={cy} r={r} />;
        }
        const [x, y, width, height, rx] = segment.rect;
        return <rect key={index} x={x} y={y} width={width} height={height} rx={rx} />;
      })}
    </svg>
  );
}
