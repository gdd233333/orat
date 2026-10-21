/**
 * 二维向量。屏幕侧单位为像素，板面侧单位为毫米。
 */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * 数位板有效感应区的物理尺寸（毫米）。
 * 对应 OpenTabletDriver `DigitizerSpecifications.Width/Height`。
 */
export interface TabletSpec {
  widthMm: number;
  heightMm: number;
}

/** 输出区域的像素尺寸，对应 OTD Output Area 的 Width/Height。 */
export interface ScreenSpec {
  widthPx: number;
  heightPx: number;
}

/**
 * OTD Absolute Mode 的输入区域（毫米）。
 * `centerXmm`/`centerYmm` 是区域中心，不是左上角；
 * `rotationDeg` 正值按 {@link screenToTablet} 的约定为逆时针。
 */
export interface AreaMapping {
  widthMm: number;
  heightMm: number;
  centerXmm: number;
  centerYmm: number;
  rotationDeg: number;
}

/** 轴对齐的舒适物理区域，单位毫米，含边界。 */
export interface ComfortRegion {
  minXmm: number;
  maxXmm: number;
  minYmm: number;
  maxYmm: number;
}

const DEFAULT_PERCENTILE = 0.05;
const DEFAULT_MARGIN_MM = 3;
const MIN_COMFORT_POINTS = 4;

/**
 * 将屏幕像素点反解为板面物理坐标（毫米）。
 *
 * 依据 OpenTabletDriver `AbsoluteOutputMode.CalculateTransformation`
 * （master，`OpenTabletDriver/Output/AbsoluteOutputMode.cs`）：
 * 原始坐标先按数位板尺寸换成毫米，平移到输入区域中心，再以
 * `-Rotation` 度旋转（`Matrix3x2.CreateRotation` 正角为逆时针，取负后为正角顺时针），
 * 最后按区域宽高比缩放到输出区域并平移到输出中心。
 * 本函数是该矩阵在「输出区域铺满整屏、输出中心为屏幕中心」时的逆变换，
 * 因此 `rotationDeg` 为正时，板面坐标相对屏幕坐标逆时针旋转。
 * 原点在板面左上角，X 向右、Y 向下，与 `Area.GetCorners` 及默认中心
 * `(digitizer.Width / 2, digitizer.Height / 2)` 一致。
 */
export function screenToTablet(
  p: Vec2,
  screen: ScreenSpec,
  _tablet: TabletSpec,
  m: AreaMapping,
): Vec2 {
  const localX = ((p.x - screen.widthPx / 2) / screen.widthPx) * m.widthMm;
  const localY = ((p.y - screen.heightPx / 2) / screen.heightPx) * m.heightMm;
  const rotated = rotate(localX, localY, m.rotationDeg);
  return {
    x: rotated.x + m.centerXmm,
    y: rotated.y + m.centerYmm,
  };
}

/**
 * {@link screenToTablet} 的正变换：板面毫米坐标映射到屏幕像素。
 * 旋转方向与 OTD 相同：先把点平移到区域中心，再按 `-rotationDeg` 旋转后缩放。
 */
export function tabletToScreen(
  p: Vec2,
  screen: ScreenSpec,
  _tablet: TabletSpec,
  m: AreaMapping,
): Vec2 {
  const rotated = rotate(p.x - m.centerXmm, p.y - m.centerYmm, -m.rotationDeg);
  return {
    x: (rotated.x / m.widthMm) * screen.widthPx + screen.widthPx / 2,
    y: (rotated.y / m.heightMm) * screen.heightPx + screen.heightPx / 2,
  };
}

/**
 * 由落点估计轴对齐舒适区。
 * 默认用 5%/95% 分位数丢掉两端离群点，再向外扩展 `marginMm`（默认 3mm），
 * 最后夹到 `[0, tablet]` 的物理范围。点数少于 4 时抛出中文错误。
 * 分位数使用线性插值（Hyndman-Fan type 7）。`tablet` 省略时不做夹取。
 */
export function estimateComfortRegion(
  pts: Vec2[],
  opts?: { percentile?: number; marginMm?: number; tablet?: TabletSpec },
): ComfortRegion {
  if (pts.length < MIN_COMFORT_POINTS) {
    throw new Error(
      `舒适区估计至少需要 ${MIN_COMFORT_POINTS} 个落点，当前只有 ${pts.length} 个`,
    );
  }

  const percentile = opts?.percentile ?? DEFAULT_PERCENTILE;
  if (!Number.isFinite(percentile) || percentile < 0 || percentile >= 0.5) {
    throw new Error("percentile 必须是 [0, 0.5) 内的有限数字");
  }
  const marginMm = opts?.marginMm ?? DEFAULT_MARGIN_MM;
  if (!Number.isFinite(marginMm) || marginMm < 0) {
    throw new Error("marginMm 必须是大于等于 0 的有限数字");
  }

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  let minXmm = quantile(xs, percentile) - marginMm;
  let maxXmm = quantile(xs, 1 - percentile) + marginMm;
  let minYmm = quantile(ys, percentile) - marginMm;
  let maxYmm = quantile(ys, 1 - percentile) + marginMm;

  const tablet = opts?.tablet;
  if (tablet) {
    minXmm = clamp(minXmm, 0, tablet.widthMm);
    maxXmm = clamp(maxXmm, 0, tablet.widthMm);
    minYmm = clamp(minYmm, 0, tablet.heightMm);
    maxYmm = clamp(maxYmm, 0, tablet.heightMm);
  }

  return { minXmm, maxXmm, minYmm, maxYmm };
}

/**
 * 用舒适区生成新的绝对映射：宽高与中心取区域本身，旋转沿用当前映射。
 * 区域中心写入 `centerXmm`/`centerYmm`，与 OTD `Area.XPosition/YPosition`
 * （中心偏移，毫米）一致。
 */
export function recommendMapping(
  region: ComfortRegion,
  current: AreaMapping,
): AreaMapping {
  return {
    widthMm: region.maxXmm - region.minXmm,
    heightMm: region.maxYmm - region.minYmm,
    centerXmm: (region.minXmm + region.maxXmm) / 2,
    centerYmm: (region.minYmm + region.maxYmm) / 2,
    rotationDeg: current.rotationDeg,
  };
}

/** 逆时针旋转 `degrees` 度。OTD 的 `CreateRotation` 同样以正角为逆时针。 */
function rotate(x: number, y: number, degrees: number): Vec2 {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

function quantile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (p <= 0) return sorted[0]!;
  if (p >= 1) return sorted[sorted.length - 1]!;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
