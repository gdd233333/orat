import type {
  AreaMapping,
  ScreenSpec,
  TabletSpec,
  Vec2,
} from "../mapping/index.ts";
import { tabletToScreen } from "../mapping/index.ts";

/** osu!standard playfield 是 512×384，也就是 4:3。 */
export const PLAYFIELD_ASPECT = 512 / 384;

/** playfield 高度占屏幕高度的比例。 */
export const PLAYFIELD_HEIGHT_RATIO = 0.8;

export const COARSE_COUNT_MIN = 12;
export const COARSE_COUNT_MAX = 16;

/** 粗调跳距，从中心开始逐拍加长，单位 CSS 像素。 */
export const COARSE_DISTANCES = [80, 140, 200, 260, 320] as const;

export const FINE_GRID_SIZE = 5;
export const FINE_JUMP_MIN = 6;
export const FINE_JUMP_MAX = 10;
export const FINE_JUMP_DISTANCE_MIN = 120;
export const FINE_JUMP_DISTANCE_MAX = 180;

/** 连续两跳的方向差小于这个角度就算「同向」，换一个方向。 */
const SAME_DIRECTION = Math.PI / 3;

export interface Playfield {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CoarseTarget extends Vec2 {
  id: string;
}

export interface FineTarget extends Vec2 {
  id: string;
  kind: "grid" | "jump";
}

/**
 * 居中的 4:3 playfield。高度取屏幕的 80%，宽按 4:3 推出；
 * 宽放不下时改成占满屏幕宽度，高度跟着缩。
 */
export function playfieldOf(screen: ScreenSpec): Playfield {
  let height = screen.heightPx * PLAYFIELD_HEIGHT_RATIO;
  let width = height * PLAYFIELD_ASPECT;
  if (width > screen.widthPx) {
    width = screen.widthPx;
    height = width / PLAYFIELD_ASPECT;
  }
  return {
    x: (screen.widthPx - width) / 2,
    y: (screen.heightPx - height) / 2,
    width,
    height,
  };
}

/**
 * 粗调：中心起跳，跳距按 80、140、200、260、320 循环加长。
 * 方向伪随机，连续同向就旋转 2/3 π。跳出 playfield 就换方向，
 * 八个方向都不行就把这一跳缩短到边界内。共 12–16 个。
 */
export function coarseTargets(
  screen: ScreenSpec,
  random: () => number = Math.random,
): CoarseTarget[] {
  const field = playfieldOf(screen);
  const count =
    COARSE_COUNT_MIN +
    Math.floor(random() * (COARSE_COUNT_MAX - COARSE_COUNT_MIN + 1));
  const center = {
    x: field.x + field.width / 2,
    y: field.y + field.height / 2,
  };
  const targets: CoarseTarget[] = [{ id: "coarse-0", ...center }];
  let cursor = center;
  let previousAngle: number | null = null;

  for (let index = 1; index < count; index += 1) {
    const distance = COARSE_DISTANCES[(index - 1) % COARSE_DISTANCES.length]!;
    let angle = random() * Math.PI * 2;
    if (
      previousAngle !== null &&
      angleDelta(angle, previousAngle) < SAME_DIRECTION
    ) {
      angle = previousAngle + (2 * Math.PI) / 3;
    }
    const next = stepInside(field, cursor, distance, angle);
    targets.push({ id: `coarse-${index}`, x: next.point.x, y: next.point.y });
    cursor = next.point;
    previousAngle = next.angle;
  }
  return targets;
}

/**
 * 细调：初步区域映射回屏幕后铺 5×5，再接 6–10 个 120–180px 小跳。
 * 网格点夹进 playfield；小跳超界就改方向或缩短，不会跑到 playfield 外面。
 */
export function fineTargets(
  screen: ScreenSpec,
  tablet: TabletSpec,
  mapping: AreaMapping,
  random: () => number = Math.random,
): FineTarget[] {
  const field = playfieldOf(screen);
  const grid = fineGrid(screen, tablet, mapping).map((target) =>
    clampToPlayfield(field, target),
  );
  const jumpCount =
    FINE_JUMP_MIN + Math.floor(random() * (FINE_JUMP_MAX - FINE_JUMP_MIN + 1));
  const jumps = jumpsInside(
    field,
    grid[grid.length - 1] ?? {
      x: field.x + field.width / 2,
      y: field.y + field.height / 2,
    },
    jumpCount,
    random,
  );
  return [...grid, ...jumps];
}

/** 5×5 网格，行优先。坐标是屏幕像素，调用方再决定要不要夹进 playfield。 */
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

function jumpsInside(
  field: Playfield,
  start: Vec2,
  count: number,
  random: () => number,
): FineTarget[] {
  const jumps: FineTarget[] = [];
  let cursor = clampPoint(field, start);
  let previousAngle: number | null = null;
  for (let index = 0; index < count; index += 1) {
    const distance =
      FINE_JUMP_DISTANCE_MIN +
      random() * (FINE_JUMP_DISTANCE_MAX - FINE_JUMP_DISTANCE_MIN);
    let angle = random() * Math.PI * 2;
    if (
      previousAngle !== null &&
      angleDelta(angle, previousAngle) < SAME_DIRECTION
    ) {
      angle = previousAngle + (2 * Math.PI) / 3;
    }
    const next = stepInside(field, cursor, distance, angle);
    jumps.push({
      id: `jump-${index}`,
      kind: "jump",
      x: next.point.x,
      y: next.point.y,
    });
    cursor = next.point;
    previousAngle = next.angle;
  }
  return jumps;
}

function stepInside(
  field: Playfield,
  from: Vec2,
  distance: number,
  angle: number,
): { point: Vec2; angle: number } {
  for (let turn = 0; turn < 8; turn += 1) {
    const candidate = angle + turn * (Math.PI / 4);
    const point = {
      x: from.x + Math.cos(candidate) * distance,
      y: from.y + Math.sin(candidate) * distance,
    };
    if (inside(field, point)) return { point, angle: candidate };
  }
  const shortened = shorten(field, from, distance, angle);
  return { point: shortened, angle };
}

function shorten(
  field: Playfield,
  from: Vec2,
  distance: number,
  angle: number,
): Vec2 {
  const point = from;
  for (let step = distance; step >= 1; step -= 1) {
    const candidate = {
      x: from.x + Math.cos(angle) * step,
      y: from.y + Math.sin(angle) * step,
    };
    if (inside(field, candidate)) return candidate;
  }
  return point;
}

function clampToPlayfield(field: Playfield, target: FineTarget): FineTarget {
  return { ...target, ...clampPoint(field, target) };
}

function clampPoint(field: Playfield, point: Vec2): Vec2 {
  return {
    x: clamp(point.x, field.x, field.x + field.width),
    y: clamp(point.y, field.y, field.y + field.height),
  };
}

function inside(field: Playfield, point: Vec2): boolean {
  return (
    point.x >= field.x &&
    point.x <= field.x + field.width &&
    point.y >= field.y &&
    point.y <= field.y + field.height
  );
}

function angleDelta(a: number, b: number): number {
  const raw = Math.abs(a - b) % (Math.PI * 2);
  return Math.min(raw, Math.PI * 2 - raw);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
