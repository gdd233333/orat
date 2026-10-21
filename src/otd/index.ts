import type {
  AreaMapping,
  ComfortRegion,
  TabletSpec,
} from "../mapping/index.ts";

/**
 * 最小键值存储。默认实现是 `globalThis.localStorage`，测试可注入内存实现。
 * 不触碰 DOM API，便于原样移植到 ArkTS。
 */
export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/**
 * 一次校准结果。`createdAt` 为 ISO 8601 字符串，`mapping` 单位与 {@link AreaMapping} 相同。
 */
export interface CalibrationProfile {
  id: string;
  name: string;
  createdAt: string;
  mapping: AreaMapping;
  region: ComfortRegion;
}

const PROFILE_STORAGE_KEY = "orat.calibrationProfiles";

const ABSOLUTE_MODE_PATH = "OpenTabletDriver.Desktop.Output.AbsoluteMode";

/**
 * 解析 OpenTabletDriver 的 `settings.json`，返回第一份 Absolute 模式 profile
 * 的板面物理尺寸与输入区域。
 *
 * 现行 schema（master `Settings` / `Profiles.Profile` / `PluginSettings`，
 * Newtonsoft 默认属性名，`Area` 用属性名而非 DisplayName）为：
 * `Profiles[].Tablet`、`Profiles[].OutputMode.Path`、
 * `OutputMode.Settings[]` 中 `Property === "Input"` 的
 * `Value.{Width,Height,XPosition,YPosition,Rotation}`。
 * 板面尺寸不在 settings 内，而在数位板配置的
 * `Specifications.Digitizer.{Width,Height}`；解析时按以下顺序查找：
 * 根对象、`Profiles[]` 内嵌的 `TabletConfiguration`/`Configuration`、
 * 以及名为 `Tablets` 的配置表（键为 profile 的 `Tablet` 名称）。
 * 仍兼容 0.6.x 的 `AbsoluteModeSettings.Tablet.{Width,Height,X,Y,Rotation}`。
 * JSON 损坏或找不到 Absolute profile / 尺寸 / 输入区域时抛中文错误并指出缺失字段。
 */
export function parseOtdSettings(jsonText: string): {
  tablet: TabletSpec;
  mapping: AreaMapping;
} {
  let root: unknown;
  try {
    root = JSON.parse(jsonText);
  } catch {
    throw new Error("settings.json 不是合法的 JSON");
  }
  if (!isRecord(root)) {
    throw new Error("settings.json 的根节点必须是对象");
  }

  const profiles = root.Profiles;
  if (!Array.isArray(profiles)) {
    throw new Error("settings.json 缺少 Profiles 数组");
  }

  const tablets = root.Tablets;
  for (const profile of profiles) {
    if (!isRecord(profile)) continue;
    const legacy = readLegacyAbsolute(profile);
    const modern = readModernAbsolute(profile);
    const area = modern ?? legacy;
    if (!area) continue;

    const tabletName =
      typeof profile.Tablet === "string" ? profile.Tablet : undefined;
    const tablet =
      readDigitizer(profile.TabletConfiguration) ??
      readDigitizer(profile.Configuration) ??
      readDigitizer(profile.TabletSpecifications) ??
      readDigitizer(profile) ??
      (tabletName ? readNamedDigitizer(tablets, tabletName) : undefined) ??
      readDigitizer(root);

    if (!tablet) {
      throw new Error(
        "找到了 Absolute 模式的 profile，但缺少数位板物理尺寸：需要 Specifications.Digitizer.Width 与 Height（毫米），可放在 settings 根对象、该 profile，或 Tablets[<Tablet 名称>] 下",
      );
    }
    return { tablet, mapping: area };
  }

  throw new Error(
    "Profiles 中没有可用的 Absolute 模式条目：需要 OutputMode.Path 含 AbsoluteMode 且 Settings 含 Input（或 0.6.x 的 AbsoluteModeSettings.Tablet）",
  );
}

/**
 * 人类可读的中文参数摘要。宽、高、中心 X/Y 为毫米，保留两位小数；旋转为度数。
 */
export function formatOtdMapping(m: AreaMapping): string {
  return [
    `宽 ${m.widthMm.toFixed(2)} mm`,
    `高 ${m.heightMm.toFixed(2)} mm`,
    `X ${m.centerXmm.toFixed(2)} mm`,
    `Y ${m.centerYmm.toFixed(2)} mm`,
    `旋转 ${m.rotationDeg.toFixed(2)}°`,
  ].join("，");
}

/**
 * 生成可合并进现行 settings.json 的 JSON 片段：`OutputMode.Settings` 里
 * `Input` 一项，字段名与 `AngledArea` 的序列化一致
 * （`Width`/`Height`/`XPosition`/`YPosition`/`Rotation`）。
 */
export function exportOtdPreset(m: AreaMapping): string {
  return JSON.stringify(
    {
      Property: "Input",
      Value: {
        Width: m.widthMm,
        Height: m.heightMm,
        XPosition: m.centerXmm,
        YPosition: m.centerYmm,
        Rotation: m.rotationDeg,
      },
    },
    null,
    2,
  );
}

/** 按 `id` 插入或覆盖一条校准档案。未传入 storage 时使用 `globalThis.localStorage`。 */
export function saveProfile(
  p: CalibrationProfile,
  storage?: StorageLike,
): void {
  const target = resolveStorage(storage);
  const profiles = readProfiles(target).filter((item) => item.id !== p.id);
  profiles.push(p);
  target.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
}

/** 读出全部校准档案；存储为空或内容损坏时返回空数组。 */
export function listProfiles(storage?: StorageLike): CalibrationProfile[] {
  return readProfiles(resolveStorage(storage));
}

/** 按 `id` 删除校准档案。id 不存在时静默跳过。 */
export function deleteProfile(id: string, storage?: StorageLike): void {
  const target = resolveStorage(storage);
  const profiles = readProfiles(target).filter((item) => item.id !== id);
  target.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
}

function resolveStorage(storage: StorageLike | undefined): StorageLike {
  if (storage) return storage;
  const candidate = (globalThis as { localStorage?: StorageLike }).localStorage;
  if (
    candidate &&
    typeof candidate.getItem === "function" &&
    typeof candidate.setItem === "function" &&
    typeof candidate.removeItem === "function"
  ) {
    return candidate;
  }
  throw new Error(
    "没有可用的存储：请传入 StorageLike，或在提供 localStorage 的环境中调用",
  );
}

function readProfiles(storage: StorageLike): CalibrationProfile[] {
  const raw = storage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCalibrationProfile);
  } catch {
    return [];
  }
}

function readModernAbsolute(
  profile: Record<string, unknown>,
): AreaMapping | undefined {
  const outputMode = profile.OutputMode;
  if (!isRecord(outputMode)) return undefined;
  const path = outputMode.Path;
  if (typeof path !== "string" || !path.includes("AbsoluteMode"))
    return undefined;
  const settings = outputMode.Settings;
  if (!Array.isArray(settings)) {
    throw new Error("Absolute 模式的 OutputMode 缺少 Settings 数组");
  }
  const input = settings.find(
    (item) =>
      isRecord(item) && item.Property === "Input" && isRecord(item.Value),
  );
  if (!input || !isRecord(input.Value)) {
    throw new Error(
      "Absolute 模式的 OutputMode.Settings 缺少 Property 为 Input 的区域",
    );
  }
  return readArea(input.Value, "OutputMode.Settings[Input]");
}

function readLegacyAbsolute(
  profile: Record<string, unknown>,
): AreaMapping | undefined {
  if (!isRecord(profile.AbsoluteModeSettings)) return undefined;
  const tablet = profile.AbsoluteModeSettings.Tablet;
  if (!isRecord(tablet)) {
    throw new Error("AbsoluteModeSettings 缺少 Tablet 区域");
  }
  return readArea(tablet, "AbsoluteModeSettings.Tablet", true);
}

function readArea(
  value: Record<string, unknown>,
  where: string,
  legacy = false,
): AreaMapping {
  const xKey = legacy ? "X" : "XPosition";
  const yKey = legacy ? "Y" : "YPosition";
  const widthMm = readFinite(value.Width, `${where}.Width`);
  const heightMm = readFinite(value.Height, `${where}.Height`);
  const centerXmm = readFinite(value[xKey], `${where}.${xKey}`);
  const centerYmm = readFinite(value[yKey], `${where}.${yKey}`);
  const rotationDeg = readFinite(value.Rotation ?? 0, `${where}.Rotation`);
  return { widthMm, heightMm, centerXmm, centerYmm, rotationDeg };
}

function readNamedDigitizer(
  tablets: unknown,
  name: string,
): TabletSpec | undefined {
  if (!isRecord(tablets)) return undefined;
  return readDigitizer(tablets[name]);
}

function readDigitizer(source: unknown): TabletSpec | undefined {
  if (!isRecord(source)) return undefined;
  const specifications = isRecord(source.Specifications)
    ? source.Specifications
    : undefined;
  const digitizer =
    specifications && isRecord(specifications.Digitizer)
      ? specifications.Digitizer
      : undefined;
  const direct =
    digitizer ?? (isRecord(source.Digitizer) ? source.Digitizer : undefined);
  if (!direct) return undefined;
  if (typeof direct.Width !== "number" || typeof direct.Height !== "number")
    return undefined;
  if (!Number.isFinite(direct.Width) || !Number.isFinite(direct.Height))
    return undefined;
  return { widthMm: direct.Width, heightMm: direct.Height };
}

function readFinite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`缺少或无效的数值字段 ${field}`);
  }
  return value;
}

function isCalibrationProfile(value: unknown): value is CalibrationProfile {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.createdAt === "string" &&
    isAreaMapping(value.mapping) &&
    isComfortRegion(value.region)
  );
}

function isAreaMapping(value: unknown): value is AreaMapping {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.widthMm) &&
    isFiniteNumber(value.heightMm) &&
    isFiniteNumber(value.centerXmm) &&
    isFiniteNumber(value.centerYmm) &&
    isFiniteNumber(value.rotationDeg)
  );
}

function isComfortRegion(value: unknown): value is ComfortRegion {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.minXmm) &&
    isFiniteNumber(value.maxXmm) &&
    isFiniteNumber(value.minYmm) &&
    isFiniteNumber(value.maxYmm)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const OTD_ABSOLUTE_MODE_PATH = ABSOLUTE_MODE_PATH;
