import { describe, expect, test } from "vitest";
import type {
  AreaMapping,
  ScreenSpec,
  TabletSpec,
} from "../src/mapping/index.ts";
import {
  GREAT_WINDOW_MS,
  OK_WINDOW_MS,
  approachProgress,
  beatIntervalMs,
  clampBpm,
  dueClicks,
  judgeOffset,
  noteAppearTime,
  noteHitTime,
} from "../src/ui/rhythm.ts";
import {
  COARSE_COUNT_MAX,
  COARSE_COUNT_MIN,
  COARSE_DISTANCES,
  FINE_GRID_SIZE,
  FINE_JUMP_DISTANCE_MAX,
  FINE_JUMP_DISTANCE_MIN,
  FINE_JUMP_MAX,
  FINE_JUMP_MIN,
  PLAYFIELD_ASPECT,
  coarseTargets,
  fineGrid,
  fineTargets,
  playfieldOf,
} from "../src/ui/sequence.ts";

const screen: ScreenSpec = { widthPx: 1920, heightPx: 1080 };
const tablet: TabletSpec = { widthMm: 152, heightMm: 95 };
const mapping: AreaMapping = {
  widthMm: 80,
  heightMm: 50,
  centerXmm: 76,
  centerYmm: 47.5,
  rotationDeg: 0,
};

function series(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 17 + 0.13) % 1;
    return state;
  };
}

describe("playfield", () => {
  test("centers a 4:3 field at 80% of the screen height", () => {
    const field = playfieldOf(screen);
    expect(field.height).toBeCloseTo(1080 * 0.8, 5);
    expect(field.width).toBeCloseTo(field.height * PLAYFIELD_ASPECT, 5);
    expect(field.x).toBeCloseTo((1920 - field.width) / 2, 5);
    expect(field.y).toBeCloseTo((1080 - field.height) / 2, 5);
  });

  test("shrinks to the screen width when 4:3 would overflow", () => {
    const narrow = playfieldOf({ widthPx: 800, heightPx: 1080 });
    expect(narrow.width).toBe(800);
    expect(narrow.height).toBeCloseTo(800 / PLAYFIELD_ASPECT, 5);
    expect(narrow.x).toBe(0);
  });
});

describe("coarseTargets", () => {
  test("starts at the playfield center and stays inside it", () => {
    const field = playfieldOf(screen);
    const targets = coarseTargets(screen, series(0.2));
    expect(targets.length).toBeGreaterThanOrEqual(COARSE_COUNT_MIN);
    expect(targets.length).toBeLessThanOrEqual(COARSE_COUNT_MAX);
    expect(targets[0]).toMatchObject({
      x: field.x + field.width / 2,
      y: field.y + field.height / 2,
    });
    for (const target of targets) {
      expect(target.x).toBeGreaterThanOrEqual(field.x);
      expect(target.x).toBeLessThanOrEqual(field.x + field.width);
      expect(target.y).toBeGreaterThanOrEqual(field.y);
      expect(target.y).toBeLessThanOrEqual(field.y + field.height);
    }
  });

  test("grows the jump by the published distances until a jump is shortened", () => {
    const targets = coarseTargets(screen, series(0.2));
    let matched = 0;
    for (let index = 1; index < targets.length; index += 1) {
      const distance = Math.hypot(
        targets[index]!.x - targets[index - 1]!.x,
        targets[index]!.y - targets[index - 1]!.y,
      );
      const planned = COARSE_DISTANCES[(index - 1) % COARSE_DISTANCES.length]!;
      expect(distance).toBeLessThanOrEqual(planned + 0.001);
      if (Math.abs(distance - planned) < 0.001) matched += 1;
    }
    expect(matched).toBeGreaterThan(0);
  });
});

describe("fineTargets", () => {
  test("lays the 5×5 grid across the mapped area before clamping", () => {
    const grid = fineGrid(screen, tablet, mapping);
    expect(grid).toHaveLength(FINE_GRID_SIZE * FINE_GRID_SIZE);
    expect(grid[12]).toMatchObject({ id: "grid-2-2", x: 960, y: 540 });
  });

  test("keeps the grid and the short jumps inside the playfield", () => {
    const field = playfieldOf(screen);
    const targets = fineTargets(screen, tablet, mapping, series(0.25));
    const jumps = targets.filter((target) => target.kind === "jump");
    expect(jumps.length).toBeGreaterThanOrEqual(FINE_JUMP_MIN);
    expect(jumps.length).toBeLessThanOrEqual(FINE_JUMP_MAX);
    for (const target of targets) {
      expect(target.x).toBeGreaterThanOrEqual(field.x - 1e-6);
      expect(target.x).toBeLessThanOrEqual(field.x + field.width + 1e-6);
      expect(target.y).toBeGreaterThanOrEqual(field.y - 1e-6);
      expect(target.y).toBeLessThanOrEqual(field.y + field.height + 1e-6);
    }
    let previous = targets[24]!;
    for (const jump of jumps) {
      const distance = Math.hypot(jump.x - previous.x, jump.y - previous.y);
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThanOrEqual(FINE_JUMP_DISTANCE_MAX + 0.001);
      if (distance > FINE_JUMP_DISTANCE_MIN - 1) {
        expect(distance).toBeGreaterThanOrEqual(FINE_JUMP_DISTANCE_MIN - 0.001);
      }
      previous = jump;
    }
  });
});

describe("rhythm", () => {
  test("places every note on a beat and shows it one beat early", () => {
    expect(beatIntervalMs(120)).toBe(500);
    expect(noteHitTime(1000, 0, 120)).toBe(1000);
    expect(noteHitTime(1000, 3, 120)).toBe(2500);
    expect(noteAppearTime(1000, 3, 120)).toBe(2000);
    expect(approachProgress(2000, 2500, 120)).toBe(0);
    expect(approachProgress(2250, 2500, 120)).toBeCloseTo(0.5, 5);
    expect(approachProgress(2500, 2500, 120)).toBe(1);
    expect(approachProgress(2800, 2500, 120)).toBe(1);
  });

  test("grades the offset without discarding a late hit", () => {
    expect(judgeOffset(0)).toBe("great");
    expect(judgeOffset(-GREAT_WINDOW_MS)).toBe("great");
    expect(judgeOffset(OK_WINDOW_MS)).toBe("ok");
    expect(judgeOffset(OK_WINDOW_MS + 1)).toBe("miss");
    expect(judgeOffset(-400)).toBe("miss");
  });

  test("clicks once per beat and accents every fourth", () => {
    expect(dueClicks(1000, 1000, 120, 0)).toEqual([{ beat: 0, accent: true }]);
    expect(dueClicks(2400, 1000, 120, 1)).toEqual([
      { beat: 1, accent: false },
      { beat: 2, accent: false },
    ]);
    expect(dueClicks(3000, 1000, 120, 4)).toEqual([{ beat: 4, accent: true }]);
    expect(clampBpm(40)).toBe(90);
    expect(clampBpm(240)).toBe(200);
    expect(clampBpm(Number.NaN)).toBe(120);
  });
});
