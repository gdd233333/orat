import type {
  AreaMapping,
  ScreenSpec,
  TabletSpec,
  Vec2,
} from "../mapping/index.ts";
import { tabletToScreen } from "../mapping/index.ts";

/** 粗调四角相对屏幕边缘的内缩比例。 */
export const COARSE_INSET = 0.08;

/** 细调网格的行列数。 */
export const FINE_GRID_SIZE = 5;

/** 细调在网格之后追加的随机小跳数量范围。 */
export const FINE_JUMP_MIN = 6;
export const FINE_JUMP_MAX = 10;

/** 随机小跳的跳距（CSS 像素）。 */
export const FINE_JUMP_DISTANCE_MIN = 120;
export const FINE_JUMP_DISTANCE_MAX = 180;

export interface CoarseTarget extends Vec2 {
  /** 稳定标识，便于测试与命中回放。 */
  id: string;
}

export interface FineTarget extends Vec2 {
  id: string;
  kind: "grid" | "jump";
}

/**
 * 粗调目标：四角（内缩 8%）、四边中点、中心，共 9 个。
 * 顺序是中心先出现，再顺时针走一圈，避免第一下就点到角落。
 * 坐标是 CSS 像素，原点在屏幕左上角。
 */
export function coarseTargets(screen: ScreenSpec): CoarseTarget[] {
  const insetX = screen.widthPx * COARSE_INSET;
  const insetY = screen.heightPx * COARSE_INSET;
  const left = insetX;
  const right = screen.widthPx - insetX;
  const top = insetY;
  const bottom = screen.heightPx - insetY;
  const midX = screen.widthPx / 2;
  const midY = screen.heightPx / 2;

  return [
    { id: "center", x: midX, y: midY },
    { id: "top-left", x: left, y: top },
    { id: "top", x: midX, y: top },
    { id: "top-right", x: right, y: top },
    { id: "right", x: right, y: midY },
    { id: "bottom-right", x: right, y: bottom },
    { id: "bottom", x: midX, y: bottom },
    { id: "bottom-left", x: left, y: bottom },
    { id: "left", x: left, y: midY },
  ];
}

/**
 * 细调目标：把粗调落点反解后的初步区域映射回屏幕，铺 5×5 网格，
 * 再从网格末点出发追加 6–10 个 120–180px 的随机小跳。
 * 小跳被夹在屏幕内缩 4% 的范围内，避免贴边点不到。
 * `random` 默认 `Math.random`，测试可注入。
 */
export function fineTargets(
  screen: ScreenSpec,
  tablet: TabletSpec,
  mapping: AreaMapping,
  random: () => number = Math.random,
): FineTarget[] {
  const grid = fineGrid(screen, tablet, mapping);
  const jumpCount =
    FINE_JUMP_MIN + Math.floor(random() * (FINE_JUMP_MAX - FINE_JUMP_MIN + 1));
  const jumps = fineJumps(
    screen,
    grid[grid.length - 1] ?? screenCenter(screen),
    jumpCount,
    random,
  );
  return [...grid, ...jumps];
}

/** 5×5 网格。行优先，从上到下、从左到右。 */
export function fineGrid(
  screen: ScreenSpec,
  tablet: TabletSpec,
  mapping: AreaMapping,
): FineTarget[] {
  const targets: FineTarget[] = [];
  for (let row = 0; row < FINE_GRID_SIZE; row += 1) {
    for (let column = 0; column < FINE_GRID_SIZE; column += 1) {
      const point = tabletToScreen(
        {
          x:
            mapping.centerXmm +
            (column / (FINE_GRID_SIZE - 1) - 0.5) * mapping.widthMm,
          y:
            mapping.centerYmm +
            (row / (FINE_GRID_SIZE - 1) - 0.5) * mapping.heightMm,
        },
        screen,
        tablet,
        mapping,
      );
      targets.push({
        id: `grid-${row}-${column}`,
        kind: "grid",
        x: point.x,
        y: point.y,
      });
    }
  }
  return targets;
}

function fineJumps(
  screen: ScreenSpec,
  start: Vec2,
  count: number,
  random: () => number,
): FineTarget[] {
  const marginX = screen.widthPx * 0.04;
  const marginY = screen.heightPx * 0.04;
  const jumps: FineTarget[] = [];
  let cursor = start;
  for (let index = 0; index < count; index += 1) {
    const distance =
      FINE_JUMP_DISTANCE_MIN +
      random() * (FINE_JUMP_DISTANCE_MAX - FINE_JUMP_DISTANCE_MIN);
    const angle = random() * Math.PI * 2;
    const next = {
      x: clamp(
        cursor.x + Math.cos(angle) * distance,
        marginX,
        screen.widthPx - marginX,
      ),
      y: clamp(
        cursor.y + Math.sin(angle) * distance,
        marginY,
        screen.heightPx - marginY,
      ),
    };
    jumps.push({ id: `jump-${index}`, kind: "jump", x: next.x, y: next.y });
    cursor = next;
  }
  return jumps;
}

function screenCenter(screen: ScreenSpec): Vec2 {
  return { x: screen.widthPx / 2, y: screen.heightPx / 2 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
