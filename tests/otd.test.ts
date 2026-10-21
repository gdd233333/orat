import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { CalibrationProfile } from "../src/otd/index.ts";
import {
  deleteProfile,
  exportOtdPreset,
  formatOtdMapping,
  listProfiles,
  parseOtdSettings,
  saveProfile,
  type StorageLike,
} from "../src/otd/index.ts";

const fixture = readFileSync(
  new URL("./fixtures/otd-settings.json", import.meta.url),
  "utf8",
);

class MemoryStorage implements StorageLike {
  private readonly items = new Map<string, string>();

  getItem(k: string): string | null {
    return this.items.has(k) ? this.items.get(k)! : null;
  }

  setItem(k: string, v: string): void {
    this.items.set(k, v);
  }

  removeItem(k: string): void {
    this.items.delete(k);
  }
}

describe("parseOtdSettings", () => {
  test("解析现行 settings：跳过 Relative profile，读取第一份 Absolute 的输入区域与数位板尺寸", () => {
    expect(parseOtdSettings(fixture)).toEqual({
      tablet: { widthMm: 152, heightMm: 95 },
      mapping: {
        widthMm: 60,
        heightMm: 33.75,
        centerXmm: 76,
        centerYmm: 47.5,
        rotationDeg: 15,
      },
    });
  });

  test("兼容 0.6.x 的 AbsoluteModeSettings.Tablet，尺寸可在 profile 的数位板配置上", () => {
    const legacy = {
      Profiles: [
        {
          Tablet: "XP-Pen Deco 01",
          OutputMode: { Path: "OpenTabletDriver.OutputMode.RelativeMode" },
          AbsoluteModeSettings: {
            Tablet: { Width: 80, Height: 45, X: 100, Y: 62.5, Rotation: 0 },
          },
          Specifications: { Digitizer: { Width: 254, Height: 158.75 } },
        },
      ],
    };
    expect(parseOtdSettings(JSON.stringify(legacy)).mapping.centerXmm).toBe(
      100,
    );
  });

  test("损坏的 JSON 用中文说明", () => {
    expect(() => parseOtdSettings("{")).toThrow(
      "settings.json 不是合法的 JSON",
    );
  });

  test("缺少 Profiles、Absolute 模式或输入区域时用中文指出缺什么", () => {
    expect(() => parseOtdSettings("{}")).toThrow(/缺少 Profiles/);
    expect(() =>
      parseOtdSettings(
        JSON.stringify({
          Profiles: [
            {
              OutputMode: {
                Path: "OpenTabletDriver.Desktop.Output.RelativeMode",
              },
            },
          ],
        }),
      ),
    ).toThrow(/没有可用的 Absolute 模式条目/);
    expect(() =>
      parseOtdSettings(
        JSON.stringify({
          Profiles: [
            {
              OutputMode: {
                Path: "OpenTabletDriver.Desktop.Output.AbsoluteMode",
                Settings: [],
              },
            },
          ],
        }),
      ),
    ).toThrow(/缺少 Property 为 Input 的区域/);
  });

  test("有输入区域但没有数位板物理尺寸时用中文说明", () => {
    expect(() =>
      parseOtdSettings(
        JSON.stringify({
          Profiles: [
            {
              OutputMode: {
                Path: "OpenTabletDriver.Desktop.Output.AbsoluteMode",
                Settings: [
                  {
                    Property: "Input",
                    Value: {
                      Width: 1,
                      Height: 1,
                      XPosition: 0,
                      YPosition: 0,
                      Rotation: 0,
                    },
                  },
                ],
              },
            },
          ],
        }),
      ),
    ).toThrow(/缺少数位板物理尺寸/);
  });
});

describe("formatOtdMapping / exportOtdPreset", () => {
  const mapping = {
    widthMm: 60,
    heightMm: 33.75,
    centerXmm: 76,
    centerYmm: 47.5,
    rotationDeg: 15,
  };

  test("中文摘要保留两位小数", () => {
    expect(formatOtdMapping(mapping)).toBe(
      "宽 60.00 mm，高 33.75 mm，X 76.00 mm，Y 47.50 mm，旋转 15.00°",
    );
  });

  test("导出的片段使用 AngledArea 的真实字段名", () => {
    expect(JSON.parse(exportOtdPreset(mapping))).toEqual({
      Property: "Input",
      Value: {
        Width: 60,
        Height: 33.75,
        XPosition: 76,
        YPosition: 47.5,
        Rotation: 15,
      },
    });
  });
});

describe("校准档案存储", () => {
  const region = { minXmm: 40, maxXmm: 100, minYmm: 20, maxYmm: 50 };
  const first: CalibrationProfile = {
    id: "a",
    name: "握笔 A",
    createdAt: "2026-10-21T00:00:00.000Z",
    mapping: {
      widthMm: 60,
      heightMm: 30,
      centerXmm: 70,
      centerYmm: 35,
      rotationDeg: 0,
    },
    region,
  };
  const second: CalibrationProfile = { ...first, id: "b", name: "握笔 B" };

  test("增、列、覆盖与删除", () => {
    const storage = new MemoryStorage();
    expect(listProfiles(storage)).toEqual([]);

    saveProfile(first, storage);
    saveProfile(second, storage);
    expect(listProfiles(storage).map((item) => item.id)).toEqual(["a", "b"]);

    saveProfile({ ...first, name: "握笔 A2" }, storage);
    expect(listProfiles(storage).find((item) => item.id === "a")?.name).toBe(
      "握笔 A2",
    );
    expect(listProfiles(storage)).toHaveLength(2);

    deleteProfile("a", storage);
    expect(listProfiles(storage)).toEqual([second]);
    deleteProfile("missing", storage);
    expect(listProfiles(storage)).toEqual([second]);
  });

  test("存储内容损坏时列表为空", () => {
    const storage = new MemoryStorage();
    storage.setItem("orat.calibrationProfiles", "not-json");
    expect(listProfiles(storage)).toEqual([]);
  });
});
