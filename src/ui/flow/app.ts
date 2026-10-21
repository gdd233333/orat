import type {
  AreaMapping,
  ComfortRegion,
  TabletSpec,
  Vec2,
} from "../../mapping/index.ts";
import {
  estimateComfortRegion,
  recommendMapping,
  screenToTablet,
} from "../../mapping/index.ts";
import {
  deleteProfile,
  exportOtdPreset,
  formatOtdMapping,
  listProfiles,
  parseOtdSettings,
  saveProfile,
  type CalibrationProfile,
} from "../../otd/index.ts";
import {
  Bind,
  Blank,
  Button,
  ButtonType,
  Card,
  Column,
  Divider,
  ForEach,
  Row,
  Select,
  Stack,
  State,
  Text,
  TextInput,
  mount,
  type StageHandle,
  type StagePointer,
} from "../hmos/index.ts";
import {
  approachProgress,
  clampBpm,
  judgeOffset,
  noteHitTime,
  type HitGrade,
} from "../rhythm.ts";
import {
  coarseTargets,
  fineTargets,
  type CoarseTarget,
  type FineTarget,
} from "../sequence.ts";
import { createMetronome, type Metronome } from "./metronome.ts";
import { DEFAULT_PRESET_ID, TABLET_PRESETS } from "./presets.ts";
import { createStage } from "./stage-view.ts";

type Phase = "setup" | "coarse" | "fine" | "result";
type InputMode = "keys" | "pen";

interface Session {
  tablet: TabletSpec;
  mapping: AreaMapping;
  screen: { widthPx: number; heightPx: number };
  coarseHits: Vec2[];
  fineHits: Vec2[];
  recommended: AreaMapping | null;
  region: ComfortRegion | null;
}

const BURST_MS = 280;
const HIT_RADIUS = 46;

const phase = new State<Phase>("setup");
const notice = new State("");
const profiles = new State<CalibrationProfile[]>([]);
const copied = new State("");
const session = new State<Session>(emptySession());

const form = {
  preset: DEFAULT_PRESET_ID,
  width: "152",
  height: "95",
  mapWidth: "152",
  mapHeight: "95",
  centerX: "76",
  centerY: "47.5",
  rotation: "0",
  paste: "",
  profileName: "抓握A",
  bpm: "120",
  input: "keys" as InputMode,
};

let stage: StageHandle | null = null;
let progressWatch: State<number> | null = null;
let coarsePlan: CoarseTarget[] = [];
let finePlan: FineTarget[] = [];
let cursor = 0;
let clockStart = 0;
let activeBpm = 120;
let inputMode: InputMode = "keys";
let pointer: Vec2 | null = null;
let burst: { x: number; y: number; at: number; grade: HitGrade } | null = null;
let pendingHits: Vec2[] = [];
let metronome: Metronome | null = null;

let listening = false;

export function startApp(root: HTMLElement): void {
  resetFlow();
  refreshProfiles();
  mount(root, Bind(render));
  if (!listening) {
    window.addEventListener("keydown", onKeyDown);
    listening = true;
  }
}

function resetFlow(): void {
  releaseStage();
  phase.set("setup");
  notice.set("");
  copied.set("");
  cursor = 0;
  pendingHits = [];
  pointer = null;
  burst = null;
  metronome?.stop();
  coarsePlan = [];
  finePlan = [];
  form.preset = DEFAULT_PRESET_ID;
  form.width = "152";
  form.height = "95";
  form.mapWidth = "152";
  form.mapHeight = "95";
  form.centerX = "76";
  form.centerY = "47.5";
  form.rotation = "0";
  form.paste = "";
  form.profileName = "抓握A";
  form.bpm = "120";
  form.input = "keys";
}

function render(): HTMLElement {
  const current = phase.value;
  if (current === "setup") return setupView();
  if (current === "result") return resultView();
  return captureView(current);
}

function setupView(): HTMLElement {
  const preset = Select({
    value: form.preset,
    options: TABLET_PRESETS.map((item) => ({
      value: item.id,
      label: item.label,
    })),
  });
  const width = numberField("物理宽度 mm", form.width);
  const height = numberField("物理高度 mm", form.height);
  preset.onChange((value) => {
    form.preset = value;
    const found = TABLET_PRESETS.find((item) => item.id === value);
    if (!found || found.id === "custom") return;
    form.width = String(found.spec.widthMm);
    form.height = String(found.spec.heightMm);
    width.value = form.width;
    height.value = form.height;
  });
  remember(width, (value) => {
    form.width = value;
  });
  remember(height, (value) => {
    form.height = value;
  });

  const mapWidth = numberField("映射宽度 mm", form.mapWidth);
  const mapHeight = numberField("映射高度 mm", form.mapHeight);
  const centerX = numberField("中心 X mm", form.centerX);
  const centerY = numberField("中心 Y mm", form.centerY);
  const rotation = numberField("旋转（度）", form.rotation);
  const bpm = numberField("BPM", form.bpm);
  const input = Select({
    value: form.input,
    options: [
      { value: "keys", label: "Z/X 键盘击打" },
      { value: "pen", label: "笔触直接点" },
    ],
  });
  remember(mapWidth, (value) => {
    form.mapWidth = value;
  });
  remember(mapHeight, (value) => {
    form.mapHeight = value;
  });
  remember(centerX, (value) => {
    form.centerX = value;
  });
  remember(centerY, (value) => {
    form.centerY = value;
  });
  remember(rotation, (value) => {
    form.rotation = value;
  });
  remember(bpm, (value) => {
    form.bpm = value;
  });
  input.onChange((value) => {
    form.input = value === "pen" ? "pen" : "keys";
  });

  const paste = document.createElement("textarea");
  paste.className = "hmos-input";
  paste.placeholder = "把 settings.json 内容粘贴到这里";
  paste.value = form.paste;
  paste.style.minHeight = "120px";
  paste.style.resize = "vertical";
  paste.style.padding = "12px 16px";
  remember(paste, (value) => {
    form.paste = value;
  });

  const screen = detectScreen();

  return page(
    Column({ space: 16 }, [
      Text("ORAT").fontSize(28).fontWeight("bold"),
      Text("osu! 数位板映射校准").fontColor("var(--hmos-color-text-secondary)"),
      Card([
        Column({ space: 12 }, [
          Text("数位板").fontWeight("medium"),
          preset,
          Row({ space: 12 }, [
            field("物理宽度 mm", width),
            field("物理高度 mm", height),
          ]),
          Text("尺寸为公开资料中的约值，手改后以输入框为准。")
            .fontSize(12)
            .fontColor("var(--hmos-color-text-tertiary)"),
        ]),
      ]),
      Card([
        Column({ space: 12 }, [
          Text("当前 OTD 映射").fontWeight("medium"),
          Row({ space: 12 }, [
            field("映射宽度 mm", mapWidth),
            field("映射高度 mm", mapHeight),
          ]),
          Row({ space: 12 }, [
            field("中心 X mm", centerX),
            field("中心 Y mm", centerY),
          ]),
          field("旋转（度，正值为顺时针）", rotation),
          Divider(),
          Text("粘贴 settings.json").fontSize(14),
          paste,
          Row({ space: 12 }, [
            Button("从 JSON 填充", { type: ButtonType.Normal }).onClick(() => {
              fillFromSettings(
                paste.value,
                width,
                height,
                mapWidth,
                mapHeight,
                centerX,
                centerY,
                rotation,
                preset,
              );
            }),
            Button("清空提示", { type: ButtonType.Text }).onClick(() => {
              notice.set("");
              copied.set("");
            }),
          ]),
          noticeLine(),
        ]),
      ]),
      Card([
        Column({ space: 8 }, [
          Text("屏幕").fontWeight("medium"),
          Text(`已检测 ${screen.widthPx} × ${screen.heightPx}`).fontSize(20),
          Text("校准会铺满这块屏幕，圈只出在中间的 4:3 playfield 里。")
            .fontSize(12)
            .fontColor("var(--hmos-color-text-tertiary)"),
        ]),
      ]),
      Card([
        Column({ space: 12 }, [
          Text("打法").fontWeight("medium"),
          field("输入", input),
          field("BPM（90–200，默认 120）", bpm),
          Text(
            "默认跟拍按 Z 或 X，记下的是按下那一瞬间笔尖的位置。笔触模式才是点在哪记在哪。",
          )
            .fontSize(12)
            .fontColor("var(--hmos-color-text-tertiary)"),
        ]),
      ]),
      Button("进入全屏并开始").onClick(() => {
        begin(width, height, mapWidth, mapHeight, centerX, centerY, rotation);
      }),
    ]),
  );
}

function captureView(current: "coarse" | "fine"): HTMLElement {
  const total = current === "coarse" ? coarsePlan.length : finePlan.length;
  const label = current === "coarse" ? "粗调" : "细调";
  const host = document.createElement("div");
  host.className = "orat-capture";
  host.style.position = "absolute";
  host.style.inset = "0";
  const observer = new MutationObserver(() => {
    if (!host.isConnected) return;
    observer.disconnect();
    attachStage(host, current);
  });
  observer.observe(document, { childList: true, subtree: true });
  const progress = new State(cursor);
  progressWatch = progress;
  const view = Stack([
    host,
    Column([
      Row({ space: 12 }, [
        Bind(() =>
          Text(`${label} ${Math.min(progress.value + 1, total)}/${total}`)
            .fontSize(20)
            .fontWeight("medium"),
        ),
        Blank(),
        Text(
          inputMode === "keys"
            ? "Z / X 击打 · Esc 中止"
            : "笔触点击 · Esc 中止",
        )
          .fontSize(14)
          .fontColor("var(--hmos-color-text-secondary)"),
      ]).padding(16),
    ]).width("100%"),
  ])
    .width("100%")
    .height("100%");
  view.style.position = "fixed";
  view.style.inset = "0";
  return view;
}

function resultView(): HTMLElement {
  const current = session.value;
  const recommended = current.recommended;
  const region = current.region;
  if (!recommended || !region) {
    return page(
      Column({ space: 12 }, [
        Text("还没有校准结果"),
        Button("返回").onClick(backToSetup),
      ]),
    );
  }
  const name = TextInput({
    placeholder: "握笔档案名，例如 抓握A",
    text: form.profileName,
  });
  remember(name, (value) => {
    form.profileName = value;
  });
  return page(
    Column({ space: 16 }, [
      Text("校准结果").fontSize(28).fontWeight("bold"),
      Text(
        `舒适区 ${region.minXmm.toFixed(1)}–${region.maxXmm.toFixed(1)} × ${region.minYmm.toFixed(1)}–${region.maxYmm.toFixed(1)} mm`,
      ).fontColor("var(--hmos-color-text-secondary)"),
      comparison(current.mapping, recommended),
      Row({ space: 12 }, [
        Button("复制参数").onClick(() => {
          void copyText(formatOtdMapping(recommended)).then(
            () => copied.set("已复制到剪贴板"),
            (error: unknown) => copied.set(errorText(error)),
          );
        }),
        Button("导出 OTD 预设", { type: ButtonType.Normal }).onClick(() => {
          downloadPreset(recommended);
          copied.set("已下载 orat-mapping.json");
        }),
        Button("重新校准", { type: ButtonType.Text }).onClick(backToSetup),
      ]),
      Bind(() =>
        Text(copied.value).fontSize(14).fontColor("var(--hmos-color-success)"),
      ),
      noticeLine(),
      Card([
        Column({ space: 12 }, [
          Text("保存为握笔档案").fontWeight("medium"),
          Row({ space: 12 }, [
            name,
            Button("保存").onClick(() => {
              saveNamed(name.value.trim() || "未命名", recommended, region);
            }),
          ]),
          profileList(),
        ]),
      ]),
    ]),
  );
}

function comparison(
  current: AreaMapping,
  recommended: AreaMapping,
): HTMLElement {
  const rows: Array<[string, number, number, string]> = [
    ["宽", current.widthMm, recommended.widthMm, "mm"],
    ["高", current.heightMm, recommended.heightMm, "mm"],
    ["中心 X", current.centerXmm, recommended.centerXmm, "mm"],
    ["中心 Y", current.centerYmm, recommended.centerYmm, "mm"],
    ["旋转", current.rotationDeg, recommended.rotationDeg, "°"],
  ];
  return Card([
    Column({ space: 8 }, [
      Row([
        Text("项目").fontWeight("medium"),
        Blank(),
        Text("当前").fontWeight("medium"),
        Text("推荐").fontWeight("medium"),
        Text("变化").fontWeight("medium"),
      ]),
      Divider(),
      ...rows.map(([label, before, after, unit]) => {
        const delta = after - before;
        const changed = Math.abs(delta) >= 0.01;
        return Row({ space: 12 }, [
          Text(label),
          Blank(),
          Text(`${before.toFixed(2)} ${unit}`),
          Text(`${after.toFixed(2)} ${unit}`).fontColor(
            changed ? "var(--hmos-color-primary)" : "inherit",
          ),
          Text(deltaText(delta, unit)).fontColor(
            changed
              ? "var(--hmos-color-alert)"
              : "var(--hmos-color-text-tertiary)",
          ),
        ]);
      }),
    ]),
  ]);
}

function profileList(): HTMLElement {
  const items = profiles.value;
  if (items.length === 0) {
    return Text("还没有握笔档案")
      .fontSize(14)
      .fontColor("var(--hmos-color-text-tertiary)");
  }
  return Column({ space: 8 }, [
    ForEach(
      items,
      (item) =>
        Row({ space: 12 }, [
          Column({ space: 2 }, [
            Text(item.name).fontWeight("medium"),
            Text(formatOtdMapping(item.mapping))
              .fontSize(12)
              .fontColor("var(--hmos-color-text-secondary)"),
          ]),
          Blank(),
          Button("删除", { type: ButtonType.Text }).onClick(() => {
            deleteProfile(item.id);
            refreshProfiles();
          }),
        ]),
      (item) => item.id,
    ),
  ]);
}

function noticeLine(): HTMLElement {
  return Bind(() => {
    const message = notice.value;
    if (!message) return Text("");
    const good = message.startsWith("已");
    return Text(message)
      .fontSize(14)
      .fontColor(
        good ? "var(--hmos-color-success)" : "var(--hmos-color-alert)",
      );
  });
}

function page(content: HTMLElement): HTMLElement {
  const view = Column([content]).padding(24).width("100%");
  view.style.maxWidth = "760px";
  view.style.margin = "0 auto";
  view.style.minHeight = "100%";
  return view;
}

function field(label: string, input: HTMLElement): HTMLElement {
  return Column({ space: 4 }, [
    Text(label).fontSize(12).fontColor("var(--hmos-color-text-secondary)"),
    input,
  ]);
}

function numberField(placeholder: string, value: string): HTMLInputElement {
  const input = TextInput({ text: value, type: "number" });
  input.placeholder = placeholder;
  return input;
}

function remember(
  input: HTMLInputElement | HTMLTextAreaElement,
  write: (value: string) => void,
): void {
  input.addEventListener("input", () => {
    write(input.value);
  });
}

function begin(
  width: HTMLInputElement,
  height: HTMLInputElement,
  mapWidth: HTMLInputElement,
  mapHeight: HTMLInputElement,
  centerX: HTMLInputElement,
  centerY: HTMLInputElement,
  rotation: HTMLInputElement,
): void {
  const tablet = readTablet(width.value, height.value);
  const mapping = readMapping(
    mapWidth.value,
    mapHeight.value,
    centerX.value,
    centerY.value,
    rotation.value,
  );
  if (!tablet || !mapping) {
    notice.set("板子尺寸和映射参数都要是有限数字，宽高必须大于 0");
    return;
  }
  notice.set("");
  activeBpm = clampBpm(Number(form.bpm));
  inputMode = form.input;
  const screen = detectScreen();
  session.set({
    tablet,
    mapping,
    screen,
    coarseHits: [],
    fineHits: [],
    recommended: null,
    region: null,
  });
  coarsePlan = coarseTargets(screen);
  cursor = 0;
  pendingHits = [];
  pointer = null;
  burst = null;
  clockStart = performance.now();
  void startAudio();
  void requestFullScreen();
  phase.set("coarse");
}

function fillFromSettings(
  json: string,
  width: HTMLInputElement,
  height: HTMLInputElement,
  mapWidth: HTMLInputElement,
  mapHeight: HTMLInputElement,
  centerX: HTMLInputElement,
  centerY: HTMLInputElement,
  rotation: HTMLInputElement,
  preset: HTMLSelectElement,
): void {
  try {
    const parsed = parseOtdSettings(json);
    form.width = String(parsed.tablet.widthMm);
    form.height = String(parsed.tablet.heightMm);
    form.mapWidth = String(parsed.mapping.widthMm);
    form.mapHeight = String(parsed.mapping.heightMm);
    form.centerX = String(parsed.mapping.centerXmm);
    form.centerY = String(parsed.mapping.centerYmm);
    form.rotation = String(parsed.mapping.rotationDeg);
    form.preset = "custom";
    width.value = form.width;
    height.value = form.height;
    mapWidth.value = form.mapWidth;
    mapHeight.value = form.mapHeight;
    centerX.value = form.centerX;
    centerY.value = form.centerY;
    rotation.value = form.rotation;
    preset.value = form.preset;
    notice.set("已从 settings.json 填入板子尺寸和映射");
  } catch (error) {
    notice.set(errorText(error));
  }
}

function attachStage(host: HTMLElement, current: "coarse" | "fine"): void {
  if (stage) return;
  const plan = current === "coarse" ? coarsePlan : finePlan;
  stage = createStage({
    onFrame: (frame) => {
      metronome?.tick(frame.time);
      const target = plan[cursor];
      if (!target || !frame.ctx) return;
      drawTarget(frame.ctx, frame.width, frame.height, target, frame.time);
    },
    onPointerMove: (point) => {
      pointer = { x: point.x, y: point.y };
    },
    onPointerDown: (point) => {
      pointer = { x: point.x, y: point.y };
      if (inputMode === "pen") recordHit(current, point, performance.now());
    },
  });
  const surface = stage.element;
  surface.style.position = "absolute";
  surface.style.inset = "0";
  host.replaceChildren(surface);
  stage.start();
}

function recordHit(
  current: "coarse" | "fine",
  point: StagePointer | Vec2,
  at: number,
): void {
  const plan = current === "coarse" ? coarsePlan : finePlan;
  const target = plan[cursor];
  if (!target) return;
  const due = noteHitTime(clockStart, cursor, activeBpm);
  burst = { x: point.x, y: point.y, at, grade: judgeOffset(at - due) };
  pendingHits.push({ x: point.x, y: point.y });
  cursor += 1;
  progressWatch?.set(cursor);
  if (cursor < plan.length) return;
  if (current === "coarse") startFine();
  else finish();
}

function startFine(): void {
  releaseStage();
  const current = session.value;
  const tabletPoints = pendingHits.map((point) =>
    screenToTablet(point, current.screen, current.tablet, current.mapping),
  );
  const region =
    safeRegion(tabletPoints, current.tablet) ?? fullRegion(current.tablet);
  const preliminary = recommendMapping(region, current.mapping);
  finePlan = fineTargets(current.screen, current.tablet, preliminary);
  cursor = 0;
  pendingHits = [];
  burst = null;
  clockStart = performance.now();
  metronome?.start(activeBpm, clockStart);
  session.set({ ...current, coarseHits: tabletPoints });
  phase.set("fine");
}

function finish(): void {
  releaseStage();
  void exitFullScreen();
  const current = session.value;
  const fineTablet = pendingHits.map((point) =>
    screenToTablet(point, current.screen, current.tablet, current.mapping),
  );
  const all = [...current.coarseHits, ...fineTablet];
  const region = safeRegion(all, current.tablet);
  if (!region) {
    notice.set("有效落点不足，无法估计舒适区");
    phase.set("setup");
    return;
  }
  session.set({
    ...current,
    fineHits: fineTablet,
    region,
    recommended: recommendMapping(region, current.mapping),
  });
  phase.set("result");
}

function drawTarget(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  target: Vec2,
  time: number,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 0, width, height);

  const due = noteHitTime(clockStart, cursor, activeBpm);
  const progress = approachProgress(time, due, activeBpm);
  const approach = HIT_RADIUS + (1 - progress) * (HIT_RADIUS * 2.6);
  strokeCircle(
    ctx,
    target.x,
    target.y,
    approach,
    "rgba(255, 255, 255, 0.85)",
    3,
  );
  ctx.beginPath();
  ctx.arc(target.x, target.y, HIT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10, 89, 247, 0.28)";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#0A59F7";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(target.x, target.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  if (pointer) {
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }

  if (!burst) return;
  const age = (time - burst.at) / BURST_MS;
  if (age >= 1) return;
  const color = burst.grade === "great" ? "0, 203, 135" : "255, 196, 0";
  strokeCircle(
    ctx,
    burst.x,
    burst.y,
    12 + age * 42,
    `rgba(${color}, ${1 - age})`,
    3,
  );
}

function strokeCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  width: number,
): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function onKeyDown(event: KeyboardEvent): void {
  if (phase.value !== "coarse" && phase.value !== "fine") return;
  if (event.key === "Escape") {
    releaseStage();
    void exitFullScreen();
    notice.set("已中止校准");
    phase.set("setup");
    return;
  }
  if (inputMode !== "keys" || event.repeat) return;
  if (
    event.key !== "z" &&
    event.key !== "Z" &&
    event.key !== "x" &&
    event.key !== "X"
  )
    return;
  if (!pointer) return;
  event.preventDefault();
  recordHit(phase.value, pointer, performance.now());
}

function backToSetup(): void {
  releaseStage();
  notice.set("");
  phase.set("setup");
}

function releaseStage(): void {
  stage?.dispose();
  stage = null;
  progressWatch = null;
  metronome?.stop();
}

async function startAudio(): Promise<void> {
  metronome ??= createMetronome();
  await metronome.resume();
  metronome.start(activeBpm, clockStart);
}

function saveNamed(
  name: string,
  mapping: AreaMapping,
  region: ComfortRegion,
): void {
  const profile: CalibrationProfile = {
    id: createId(),
    name,
    createdAt: new Date().toISOString(),
    mapping,
    region,
  };
  saveProfile(profile);
  refreshProfiles();
  notice.set(`已保存「${name}」`);
}

function refreshProfiles(): void {
  try {
    profiles.set(listProfiles());
  } catch {
    profiles.set([]);
  }
}

function downloadPreset(mapping: AreaMapping): void {
  const blob = new Blob([exportOtdPreset(mapping)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "orat-mapping.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard) throw new Error("当前环境没有剪贴板");
  await navigator.clipboard.writeText(text);
}

function requestFullScreen(): Promise<void> {
  const target = document.documentElement as HTMLElement & {
    requestFullscreen?: () => Promise<void>;
  };
  if (!target.requestFullscreen) return Promise.resolve();
  return target.requestFullscreen().catch(() => undefined);
}

function exitFullScreen(): Promise<void> {
  if (!document.fullscreenElement) return Promise.resolve();
  return document.exitFullscreen().catch(() => undefined);
}

function detectScreen(): { widthPx: number; heightPx: number } {
  const width =
    positive(window.screen?.width) ?? positive(window.innerWidth) ?? 1920;
  const height =
    positive(window.screen?.height) ?? positive(window.innerHeight) ?? 1080;
  return { widthPx: width, heightPx: height };
}

function positive(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function readTablet(width: string, height: string): TabletSpec | null {
  const widthMm = Number(width);
  const heightMm = Number(height);
  if (
    !Number.isFinite(widthMm) ||
    !Number.isFinite(heightMm) ||
    widthMm <= 0 ||
    heightMm <= 0
  )
    return null;
  return { widthMm, heightMm };
}

function readMapping(
  width: string,
  height: string,
  centerX: string,
  centerY: string,
  rotation: string,
): AreaMapping | null {
  const values = [width, height, centerX, centerY, rotation].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  const [widthMm, heightMm, centerXmm, centerYmm, rotationDeg] = values as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (widthMm <= 0 || heightMm <= 0) return null;
  return { widthMm, heightMm, centerXmm, centerYmm, rotationDeg };
}

function safeRegion(points: Vec2[], tablet: TabletSpec): ComfortRegion | null {
  try {
    return estimateComfortRegion(points, { tablet });
  } catch {
    return null;
  }
}

function fullRegion(tablet: TabletSpec): ComfortRegion {
  return {
    minXmm: 0,
    maxXmm: tablet.widthMm,
    minYmm: 0,
    maxYmm: tablet.heightMm,
  };
}

function emptySession(): Session {
  const preset =
    TABLET_PRESETS.find((item) => item.id === DEFAULT_PRESET_ID) ??
    TABLET_PRESETS[0]!;
  return {
    tablet: preset.spec,
    mapping: {
      widthMm: preset.spec.widthMm,
      heightMm: preset.spec.heightMm,
      centerXmm: preset.spec.widthMm / 2,
      centerYmm: preset.spec.heightMm / 2,
      rotationDeg: 0,
    },
    screen: { widthPx: 1920, heightPx: 1080 },
    coarseHits: [],
    fineHits: [],
    recommended: null,
    region: null,
  };
}

function deltaText(delta: number, unit: string): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)} ${unit}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "发生了未知错误";
}

function createId(): string {
  const cryptoId = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (cryptoId) return cryptoId();
  return `profile-${Date.now().toString(36)}`;
}
