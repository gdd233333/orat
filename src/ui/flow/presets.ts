import type { TabletSpec } from "../../mapping/index.ts";

export interface TabletPreset {
  id: string;
  label: string;
  spec: TabletSpec;
}

/** 常见板子的公开有效区尺寸，标注为约值，用户仍可手改。 */
export const TABLET_PRESETS: readonly TabletPreset[] = [
  {
    id: "ctl-472",
    label: "Wacom CTL-472（约 152 × 95 mm）",
    spec: { widthMm: 152, heightMm: 95 },
  },
  {
    id: "ctl-4100",
    label: "Wacom CTL-4100（约 152 × 95 mm）",
    spec: { widthMm: 152, heightMm: 95 },
  },
  {
    id: "pth-660",
    label: "Wacom PTH-660（约 224 × 148 mm）",
    spec: { widthMm: 224, heightMm: 148 },
  },
  {
    id: "g640",
    label: "XP-Pen G640（约 152.4 × 101.6 mm）",
    spec: { widthMm: 152.4, heightMm: 101.6 },
  },
  { id: "custom", label: "手动输入", spec: { widthMm: 152, heightMm: 95 } },
];

export const DEFAULT_PRESET_ID = "ctl-472";
