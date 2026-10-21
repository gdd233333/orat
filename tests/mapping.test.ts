import { describe, expect, test } from "vitest";
import {
  estimateComfortRegion,
  recommendMapping,
  screenToTablet,
  tabletToScreen,
  type AreaMapping,
  type ScreenSpec,
  type TabletSpec,
  type Vec2,
} from "../src/mapping/index.ts";

const screen: ScreenSpec = { widthPx: 1920, heightPx: 1080 };
const tablet: TabletSpec = { widthMm: 152, heightMm: 95 };

const fullArea: AreaMapping = {
  widthMm: 152,
  heightMm: 95,
  centerXmm: 76,
  centerYmm: 47.5,
  rotationDeg: 0,
};

function expectClose(actual: Vec2, expected: Vec2, epsilon = 1e-9): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThan(epsilon);
  expect(Math.abs(actual.y - expected.y)).toBeLessThan(epsilon);
}

describe("screenToTablet / tabletToScreen", () => {
  test("满区域、零旋转时，屏幕四角与中心对应板面已知坐标", () => {
    expectClose(screenToTablet({ x: 0, y: 0 }, screen, tablet, fullArea), {
      x: 0,
      y: 0,
    });
    expectClose(
      screenToTablet({ x: 1920, y: 1080 }, screen, tablet, fullArea),
      {
        x: 152,
        y: 95,
      },
    );
    expectClose(screenToTablet({ x: 960, y: 540 }, screen, tablet, fullArea), {
      x: 76,
      y: 47.5,
    });
    expectClose(tabletToScreen({ x: 0, y: 95 }, screen, tablet, fullArea), {
      x: 0,
      y: 1080,
    });
  });

  test("手算：60×33.75mm 区域中心 (76, 47.5)，屏幕 (480, 270) 落在左上四分之一", () => {
    const mapping: AreaMapping = {
      widthMm: 60,
      heightMm: 33.75,
      centerXmm: 76,
      centerYmm: 47.5,
      rotationDeg: 0,
    };
    // (480-960)/1920*60 = -15；(270-540)/1080*33.75 = -8.4375
    expectClose(screenToTablet({ x: 480, y: 270 }, screen, tablet, mapping), {
      x: 61,
      y: 39.0625,
    });
    expectClose(
      tabletToScreen({ x: 61, y: 39.0625 }, screen, tablet, mapping),
      {
        x: 480,
        y: 270,
      },
    );
  });

  test("手算：旋转 90° 后，区域中心右侧的板面点映射到屏幕上方中点", () => {
    const mapping: AreaMapping = { ...fullArea, rotationDeg: 90 };
    // OTD 使用 -Rotation。中心右侧 (76+47.5, 47.5) 顺时针 90° 后落到中心上方，
    // 局部坐标 (0, -47.5)，对应屏幕 (960, 0)。
    expectClose(
      tabletToScreen({ x: 123.5, y: 47.5 }, screen, tablet, mapping),
      {
        x: 960,
        y: 0,
      },
    );
    expectClose(screenToTablet({ x: 960, y: 0 }, screen, tablet, mapping), {
      x: 123.5,
      y: 47.5,
    });
  });

  test.each([0, 90, 180, -37.5, 123.456])(
    "旋转 %s° 时正逆变换往返误差小于 1e-9",
    (rotationDeg) => {
      const mapping: AreaMapping = {
        widthMm: 80,
        heightMm: 45,
        centerXmm: 70,
        centerYmm: 40,
        rotationDeg,
      };
      const samples = [
        { x: 0, y: 0 },
        { x: 1920, y: 0 },
        { x: 0, y: 1080 },
        { x: 1920, y: 1080 },
        { x: 960, y: 540 },
        { x: 100, y: 900 },
        { x: 1600.5, y: 20.25 },
      ];
      for (const point of samples) {
        const roundTrip = tabletToScreen(
          screenToTablet(point, screen, tablet, mapping),
          screen,
          tablet,
          mapping,
        );
        expectClose(roundTrip, point);
      }
    },
  );

  test("旋转 180° 时屏幕左上角落到区域右下角", () => {
    const mapping: AreaMapping = {
      widthMm: 40,
      heightMm: 20,
      centerXmm: 50,
      centerYmm: 30,
      rotationDeg: 180,
    };
    expectClose(screenToTablet({ x: 0, y: 0 }, screen, tablet, mapping), {
      x: 70,
      y: 40,
    });
    expectClose(screenToTablet({ x: 1920, y: 1080 }, screen, tablet, mapping), {
      x: 30,
      y: 20,
    });
  });
});

describe("estimateComfortRegion", () => {
  test("5%/95% 分位数裁掉两端离群点", () => {
    const pts = [
      { x: 0, y: 0 },
      ...Array.from({ length: 18 }, () => ({ x: 40, y: 20 })),
      { x: 100, y: 80 },
    ];
    const region = estimateComfortRegion(pts, { marginMm: 0 });
    // 20 个样本，index = 19 * 0.05 = 0.95，故低端为 0*0.05 + 40*0.95 = 38。
    expect(region.minXmm).toBeCloseTo(38, 10);
    expect(region.maxXmm).toBeCloseTo(43, 10);
    expect(region.minYmm).toBeCloseTo(19, 10);
    expect(region.maxYmm).toBeCloseTo(23, 10);
  });

  test("默认外扩 3mm，并夹到板面物理边界", () => {
    const pts = [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 150, y: 93 },
      { x: 151, y: 94 },
    ];
    const region = estimateComfortRegion(pts, { tablet });
    expect(region).toEqual({ minXmm: 0, maxXmm: 152, minYmm: 0, maxYmm: 95 });
  });

  test("自定义 margin 向外扩展且不夹取时可以超出原点", () => {
    const pts = [
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      { x: 20, y: 30 },
      { x: 20, y: 30 },
    ];
    expect(estimateComfortRegion(pts, { percentile: 0, marginMm: 4 })).toEqual({
      minXmm: 6,
      maxXmm: 24,
      minYmm: 6,
      maxYmm: 34,
    });
  });

  test("点数少于 4 时抛出中文错误", () => {
    expect(() => estimateComfortRegion([{ x: 1, y: 1 }])).toThrow(
      /至少需要 4 个落点/,
    );
    expect(() => estimateComfortRegion([])).toThrow(Error);
  });
});

describe("recommendMapping", () => {
  test("宽高与中心取舒适区，旋转沿用当前映射", () => {
    const current: AreaMapping = { ...fullArea, rotationDeg: -12.5 };
    expect(
      recommendMapping(
        { minXmm: 40, maxXmm: 100, minYmm: 20, maxYmm: 50 },
        current,
      ),
    ).toEqual({
      widthMm: 60,
      heightMm: 30,
      centerXmm: 70,
      centerYmm: 35,
      rotationDeg: -12.5,
    });
  });
});
