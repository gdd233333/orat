import { describe, expect, test } from "vitest";
import type {
  AreaMapping,
  ScreenSpec,
  TabletSpec,
} from "../src/mapping/index.ts";
import {
  COARSE_INSET,
  FINE_GRID_SIZE,
  FINE_JUMP_DISTANCE_MAX,
  FINE_JUMP_DISTANCE_MIN,
  FINE_JUMP_MAX,
  FINE_JUMP_MIN,
  coarseTargets,
  fineGrid,
  fineTargets,
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

describe("coarseTargets", () => {
  test("returns the center, four inset corners and four edge midpoints", () => {
    const targets = coarseTargets(screen);
    expect(targets).toHaveLength(9);
    expect(new Set(targets.map((target) => target.id)).size).toBe(9);

    const byId = Object.fromEntries(
      targets.map((target) => [target.id, target]),
    );
    expect(byId.center).toEqual({ id: "center", x: 960, y: 540 });
    expect(byId["top-left"]).toEqual({
      id: "top-left",
      x: 1920 * COARSE_INSET,
      y: 1080 * COARSE_INSET,
    });
    expect(byId["bottom-right"]).toEqual({
      id: "bottom-right",
      x: 1920 * (1 - COARSE_INSET),
      y: 1080 * (1 - COARSE_INSET),
    });
    expect(byId.left).toEqual({ id: "left", x: 1920 * COARSE_INSET, y: 540 });
    expect(byId.top).toEqual({ id: "top", x: 960, y: 1080 * COARSE_INSET });
  });

  test("keeps every point inside the screen", () => {
    for (const target of coarseTargets(screen)) {
      expect(target.x).toBeGreaterThan(0);
      expect(target.x).toBeLessThan(screen.widthPx);
      expect(target.y).toBeGreaterThan(0);
      expect(target.y).toBeLessThan(screen.heightPx);
    }
  });
});

describe("fineTargets", () => {
  test("lays a 5×5 grid across the preliminary area", () => {
    const grid = fineGrid(screen, tablet, mapping);
    expect(grid).toHaveLength(FINE_GRID_SIZE * FINE_GRID_SIZE);
    expect(grid[0]).toMatchObject({ id: "grid-0-0", kind: "grid" });
    expect(grid[0]?.x).toBeCloseTo(0, 5);
    expect(grid[0]?.y).toBeCloseTo(0, 5);
    expect(grid[12]).toMatchObject({ id: "grid-2-2", x: 960, y: 540 });
    expect(grid[24]?.x).toBeCloseTo(1920, 5);
    expect(grid[24]?.y).toBeCloseTo(1080, 5);
  });

  test("appends 6 to 10 jumps of 120 to 180 px and stays deterministic", () => {
    let seed = 0.25;
    const random = (): number => {
      seed = (seed * 17 + 0.13) % 1;
      return seed;
    };
    const targets = fineTargets(screen, tablet, mapping, random);
    const jumps = targets.filter((target) => target.kind === "jump");
    expect(targets).toHaveLength(25 + jumps.length);
    expect(jumps.length).toBeGreaterThanOrEqual(FINE_JUMP_MIN);
    expect(jumps.length).toBeLessThanOrEqual(FINE_JUMP_MAX);

    let previous = targets[24]!;
    for (const jump of jumps) {
      const raw = Math.hypot(jump.x - previous.x, jump.y - previous.y);
      expect(raw).toBeGreaterThan(0);
      expect(raw).toBeLessThanOrEqual(FINE_JUMP_DISTANCE_MAX + 0.001);
      const clamped =
        jump.x <= screen.widthPx * 0.04 + 1e-6 ||
        jump.x >= screen.widthPx * 0.96 - 1e-6 ||
        jump.y <= screen.heightPx * 0.04 + 1e-6 ||
        jump.y >= screen.heightPx * 0.96 - 1e-6;
      if (!clamped)
        expect(raw).toBeGreaterThanOrEqual(FINE_JUMP_DISTANCE_MIN - 0.001);
      expect(jump.x).toBeGreaterThanOrEqual(screen.widthPx * 0.04 - 1e-9);
      expect(jump.x).toBeLessThanOrEqual(screen.widthPx * 0.96 + 1e-9);
      previous = jump;
    }

    let again = 0.25;
    const repeated = fineTargets(screen, tablet, mapping, () => {
      again = (again * 17 + 0.13) % 1;
      return again;
    });
    expect(repeated).toEqual(targets);
  });
});
