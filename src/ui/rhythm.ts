/** 节拍与命中分档。不碰 DOM，也不碰 AudioContext。 */

export const DEFAULT_BPM = 120;
export const MIN_BPM = 90;
export const MAX_BPM = 200;

/** osu!standard 的 300 判定窗大约是 ±80ms，这里用它当「准」。 */
export const GREAT_WINDOW_MS = 80;
/** 100 判定大约是 ±140ms，这里当「偏」。更晚的位置照样记。 */
export const OK_WINDOW_MS = 140;

export type HitGrade = "great" | "ok" | "miss";

export function beatIntervalMs(bpm: number): number {
  return 60000 / bpm;
}

export function clampBpm(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)));
}

/**
 * 击打时刻相对这拍应到时刻的偏差。
 * 负数是抢拍，正数是打晚。分档只看绝对值。
 */
export function judgeOffset(offsetMs: number): HitGrade {
  const abs = Math.abs(offsetMs);
  if (abs <= GREAT_WINDOW_MS) return "great";
  if (abs <= OK_WINDOW_MS) return "ok";
  return "miss";
}

/** 第 `index` 个 note 的应到时刻。第 0 个在第一拍，之后每拍一个。 */
export function noteHitTime(
  startMs: number,
  index: number,
  bpm: number,
): number {
  return startMs + index * beatIntervalMs(bpm);
}

/** approach circle 提前整整一拍出现。 */
export function noteAppearTime(
  startMs: number,
  index: number,
  bpm: number,
): number {
  return noteHitTime(startMs, index, bpm) - beatIntervalMs(bpm);
}

/**
 * 收缩进度。0 是刚出现，1 是正好落到圈上。
 * 打晚了停在 1，不倒回去。
 */
export function approachProgress(
  nowMs: number,
  hitAtMs: number,
  bpm: number,
): number {
  const duration = beatIntervalMs(bpm);
  return clamp((nowMs - (hitAtMs - duration)) / duration, 0, 1);
}

/**
 * 从 `fromBeat` 起到 `nowMs`，该响的拍。
 * 返回拍序号和是否重音（每 4 拍的第一拍）。调用方记住所播到的最后一拍。
 */
export function dueClicks(
  nowMs: number,
  startMs: number,
  bpm: number,
  fromBeat: number,
): Array<{ beat: number; accent: boolean }> {
  const interval = beatIntervalMs(bpm);
  if (interval <= 0) return [];
  const latest = Math.floor((nowMs - startMs) / interval + 1e-6);
  const clicks: Array<{ beat: number; accent: boolean }> = [];
  for (let beat = fromBeat; beat <= latest; beat += 1) {
    clicks.push({ beat, accent: beat % 4 === 0 });
  }
  return clicks;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
