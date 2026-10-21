/**
 * ArkUI-flavoured declarative DOM builders.
 *
 * Components return real HTMLElements. Chainable modifiers mutate the node
 * and return it, the way `.fontSize(28).fontWeight(FontWeight.Bold)` does in
 * ArkTS. {@link State} is a tiny `@State`: assigning `.value` notifies
 * subscribers, which rebuild only the subtree that read the state.
 */
import "./tokens.css";

export type HmosNode = HTMLElement;

export type HmosChild = HmosNode | string | number | null | undefined | false;

export type HmosLength = number | string;

export const FontWeight = {
  Regular: "400",
  Medium: "500",
  Bold: "700",
} as const;

export type FontWeightName = keyof typeof FontWeight;

export const ButtonType = {
  Capsule: "capsule",
  Circle: "circle",
  Normal: "normal",
  Text: "text",
} as const;

export type ButtonTypeName = (typeof ButtonType)[keyof typeof ButtonType];

export const FlexAlign = {
  Start: "flex-start",
  Center: "center",
  End: "flex-end",
  SpaceBetween: "space-between",
  SpaceAround: "space-around",
  SpaceEvenly: "space-evenly",
} as const;

export type FlexAlignName = (typeof FlexAlign)[keyof typeof FlexAlign];

export const ItemAlign = {
  Start: "flex-start",
  Center: "center",
  End: "flex-end",
  Stretch: "stretch",
} as const;

export type ItemAlignName = (typeof ItemAlign)[keyof typeof ItemAlign];

export const BlurStyle = {
  Thin: "thin",
  Regular: "regular",
  Thick: "thick",
} as const;

export type BlurStyleName = (typeof BlurStyle)[keyof typeof BlurStyle];

export interface ColumnOptions {
  space?: number;
}

export interface RowOptions {
  space?: number;
}

export interface StackOptions {
  alignContent?:
    | "TopStart"
    | "Top"
    | "TopEnd"
    | "Start"
    | "Center"
    | "End"
    | "BottomStart"
    | "Bottom"
    | "BottomEnd";
}

export interface TextInputOptions {
  placeholder?: string;
  text?: string;
  type?: string;
}

export interface SelectOption {
  value: string;
  label?: string;
}

export interface SelectOptions {
  value?: string;
  options: ReadonlyArray<SelectOption | string>;
}

export interface DividerOptions {
  vertical?: boolean;
  strokeWidth?: number;
}

export interface ButtonOptions {
  /** Visual style. Does not change the underlying `HTMLButtonElement.type`, which stays `"button"`. */
  type?: ButtonTypeName;
  enabled?: boolean;
}

export interface StagePointer {
  /** CSS pixels relative to the stage element's top-left. */
  x: number;
  y: number;
  buttons: number;
  pointerId: number;
}

export interface StageFrame {
  /** 2D context already scaled so 1 unit is 1 CSS pixel. Absent when the host has no canvas. */
  ctx: CanvasRenderingContext2D;
  /** Stage size in CSS pixels. */
  width: number;
  height: number;
  /** `performance.now()` timestamp passed to the animation frame. */
  time: number;
}

export interface StageOptions {
  onFrame?: (frame: StageFrame) => void;
  onPointerDown?: (pointer: StagePointer) => void;
  onPointerMove?: (pointer: StagePointer) => void;
  onPointerUp?: (pointer: StagePointer) => void;
}

export interface StageHandle {
  readonly element: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  /** CSS-pixel size currently backing the canvas. */
  readonly size: { width: number; height: number };
  start(): void;
  stop(): void;
  /** Resize the backing store to the element's layout box. */
  resize(): void;
  dispose(): void;
}

type Subscriber = () => void;

/**
 * Minimal `@State`. Reading {@link State.value} during a render subscribes
 * that render; writing it rebuilds every subscribed subtree.
 */
export class State<T> {
  #value: T;
  #subscribers = new Set<Subscriber>();

  constructor(initial: T) {
    this.#value = initial;
  }

  get value(): T {
    const active = currentRender;
    if (active) {
      this.#subscribers.add(active.notify);
      active.deps.add(this.#subscribers);
    }
    return this.#value;
  }

  set value(next: T) {
    if (Object.is(this.#value, next)) return;
    this.#value = next;
    for (const notify of [...this.#subscribers]) notify();
  }

  set(next: T): void {
    this.value = next;
  }
}

interface RenderScope {
  notify: Subscriber;
  deps: Set<Set<Subscriber>>;
}

let currentRender: RenderScope | null = null;

function trackRender(notify: Subscriber, render: () => void): void {
  const scope: RenderScope = { notify, deps: new Set() };
  const previous = currentRender;
  currentRender = scope;
  try {
    render();
  } finally {
    currentRender = previous;
  }
}

function lengthOf(value: HmosLength): string {
  return typeof value === "number" ? `${value}px` : value;
}

function isChildList(value: unknown): value is readonly HmosChild[] {
  return Array.isArray(value);
}

function appendChildren(
  parent: HTMLElement,
  children: readonly HmosChild[],
): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : child,
    );
  }
}

function resolveWeight(weight: FontWeightName | number | string): string {
  if (typeof weight === "number") return String(weight);
  const named = FontWeight[weight as FontWeightName];
  if (named) return named;
  switch (weight.toLowerCase()) {
    case "bold":
      return FontWeight.Bold;
    case "medium":
      return FontWeight.Medium;
    case "regular":
    case "normal":
      return FontWeight.Regular;
    default:
      return weight;
  }
}

function blurOf(radius: number | BlurStyleName): string {
  if (radius === BlurStyle.Thin) return "var(--hmos-blur-thin)";
  if (radius === BlurStyle.Regular) return "var(--hmos-blur-regular)";
  if (radius === BlurStyle.Thick) return "var(--hmos-blur-thick)";
  return `${radius}px`;
}

/**
 * Chainable ArkUI modifiers. Installed as own properties so a builder result
 * is a real `HTMLElement` (`el.fontSize(28).fontWeight("bold")`) and can be
 * appended directly, without shadowing native fields such as `button.type`.
 */
interface ModifierFields<T> {
  fontSize(size: HmosLength): T;
  fontWeight(weight: FontWeightName | number | string): T;
  fontColor(color: string): T;
  fontFamily(family: string): T;
  backgroundColor(color: string): T;
  borderRadius(radius: HmosLength): T;
  width(value: HmosLength): T;
  height(value: HmosLength): T;
  padding(value: HmosLength): T;
  margin(value: HmosLength): T;
  opacity(value: number): T;
  backdropBlur(radius: number | BlurStyleName): T;
  onClick(handler: (event: MouseEvent) => void): T;
  enabled(value: boolean): T;
}

type Modifiers<T extends HTMLElement> = ModifierFields<HmosOf<T>>;

type HmosOf<T extends HTMLElement> = T & Modifiers<T>;

const MODIFIERS: ModifierFields<HTMLElement> = {
  fontSize(this: HTMLElement, size) {
    this.style.fontSize = lengthOf(size);
    return this;
  },
  fontWeight(this: HTMLElement, weight) {
    this.style.fontWeight = resolveWeight(weight);
    return this;
  },
  fontColor(this: HTMLElement, color) {
    this.style.color = color;
    return this;
  },
  fontFamily(this: HTMLElement, family) {
    this.style.fontFamily = family;
    return this;
  },
  backgroundColor(this: HTMLElement, color) {
    this.style.backgroundColor = color;
    return this;
  },
  borderRadius(this: HTMLElement, radius) {
    this.style.borderRadius = lengthOf(radius);
    return this;
  },
  width(this: HTMLElement, value) {
    this.style.width = lengthOf(value);
    return this;
  },
  height(this: HTMLElement, value) {
    this.style.height = lengthOf(value);
    return this;
  },
  padding(this: HTMLElement, value) {
    this.style.padding = lengthOf(value);
    return this;
  },
  margin(this: HTMLElement, value) {
    this.style.margin = lengthOf(value);
    return this;
  },
  opacity(this: HTMLElement, value) {
    this.style.opacity = String(value);
    return this;
  },
  backdropBlur(this: HTMLElement, radius) {
    const blur = `blur(${blurOf(radius)})`;
    this.style.backdropFilter = blur;
    this.style.setProperty("-webkit-backdrop-filter", blur);
    return this;
  },
  onClick(this: HTMLElement, handler) {
    this.addEventListener("click", handler);
    return this;
  },
  enabled(this: HTMLElement, value) {
    if ("disabled" in this) {
      (this as { disabled: boolean }).disabled = !value;
    }
    return this;
  },
};

function createHmos<T extends keyof HTMLElementTagNameMap>(
  tag: T,
  className: string,
): HmosOf<HTMLElementTagNameMap[T]> {
  const element = document.createElement(tag);
  element.className = className;
  Object.assign(element, MODIFIERS);
  return element as HmosOf<HTMLElementTagNameMap[T]>;
}

function layout(
  direction: "column" | "row",
  options: ColumnOptions | RowOptions | undefined,
  children: readonly HmosChild[],
): HmosOf<HTMLDivElement> {
  const node = createHmos(
    "div",
    direction === "column" ? "hmos-column" : "hmos-row",
  );
  const space = options?.space ?? 0;
  node.style.gap = space ? `${space}px` : "";
  appendChildren(node, children);
  return node;
}

/** ArkUI `Column`. Lays children out vertically with an optional `space`. */
export function Column(
  optionsOrChildren?: ColumnOptions | readonly HmosChild[],
  children?: readonly HmosChild[],
): HmosOf<HTMLDivElement> {
  if (isChildList(optionsOrChildren)) {
    return layout("column", undefined, optionsOrChildren);
  }
  return layout("column", optionsOrChildren, children ?? []);
}

/** ArkUI `Row`. Lays children out horizontally with an optional `space`. */
export function Row(
  optionsOrChildren?: RowOptions | readonly HmosChild[],
  children?: readonly HmosChild[],
): HmosOf<HTMLDivElement> {
  if (isChildList(optionsOrChildren)) {
    return layout("row", undefined, optionsOrChildren);
  }
  return layout("row", optionsOrChildren, children ?? []);
}

const STACK_ALIGN: Record<NonNullable<StackOptions["alignContent"]>, string> = {
  TopStart: "start start",
  Top: "start center",
  TopEnd: "start end",
  Start: "center start",
  Center: "center",
  End: "center end",
  BottomStart: "end start",
  Bottom: "end center",
  BottomEnd: "end end",
};

/** ArkUI `Stack`. Children occupy the same grid cell, aligned by `alignContent`. */
export function Stack(
  optionsOrChildren?: StackOptions | readonly HmosChild[],
  children?: readonly HmosChild[],
): HmosOf<HTMLDivElement> {
  const options = isChildList(optionsOrChildren)
    ? undefined
    : optionsOrChildren;
  const content = isChildList(optionsOrChildren)
    ? optionsOrChildren
    : (children ?? []);
  const node = createHmos("div", "hmos-stack");
  if (options?.alignContent) {
    const [alignItems, justifyItems] =
      STACK_ALIGN[options.alignContent].split(" ");
    node.style.justifyItems = justifyItems ?? "center";
    node.style.alignItems = alignItems ?? "center";
  }
  appendChildren(node, content);
  return node;
}

/** ArkUI `Text`. A `State<string>` rewrites this node when the state changes. */
export function Text(
  content: string | State<string>,
): HmosOf<HTMLParagraphElement> {
  const node = createHmos("p", "hmos-text");
  if (typeof content === "string") {
    node.textContent = content;
    return node;
  }
  bindHost(node, () => {
    node.textContent = content.value;
  });
  return node;
}

export interface HmosButton extends HmosOf<HTMLButtonElement> {
  /** ArkUI `Button.type`. Capsule is the default. The native `type` stays `"button"`. */
  buttonType(kind: ButtonTypeName): this;
}

/**
 * ArkUI `Button`. Defaults to {@link ButtonType.Capsule}.
 * `Button("label")` or `Button("label", { type })`.
 */
function applyButtonType(node: HTMLElement, kind: ButtonTypeName): void {
  node.classList.remove(
    "hmos-button-capsule",
    "hmos-button-circle",
    "hmos-button-normal",
    "hmos-button-text",
  );
  node.classList.add(`hmos-button-${kind}`);
}

export function Button(label: string, options?: ButtonOptions): HmosButton {
  const node = createHmos(
    "button",
    "hmos-button hmos-button-capsule",
  ) as HmosButton;
  node.type = "button";
  node.textContent = label;
  node.buttonType = function buttonType(
    this: HmosButton,
    kind: ButtonTypeName,
  ): HmosButton {
    applyButtonType(this, kind);
    return this;
  };
  if (options?.type) node.buttonType(options.type);
  if (options?.enabled === false) node.enabled(false);
  return node;
}

export interface HmosInput extends HmosOf<HTMLInputElement> {
  /** Sets the placeholder attribute. Named to keep the native `placeholder` field. */
  placeholderText(value: string): this;
  /** Sets the current value. Named `inputText` so it does not hide the native `value`. */
  inputText(value: string): this;
  onChange(handler: (value: string) => void): this;
}

/** ArkUI `TextInput`. */
export function TextInput(options?: TextInputOptions): HmosInput {
  const node = createHmos("input", "hmos-input") as HmosInput;
  node.type = options?.type ?? "text";
  if (options?.placeholder)
    node.setAttribute("placeholder", options.placeholder);
  if (options?.text !== undefined) node.value = options.text;
  node.placeholderText = function placeholderText(
    this: HmosInput,
    value: string,
  ): HmosInput {
    this.placeholder = value;
    return this;
  };
  node.inputText = function inputText(
    this: HmosInput,
    value: string,
  ): HmosInput {
    this.value = value;
    return this;
  };
  node.onChange = function onChange(
    this: HmosInput,
    handler: (value: string) => void,
  ): HmosInput {
    this.addEventListener("input", () => {
      handler(this.value);
    });
    return this;
  };
  return node;
}

export interface HmosSelect extends HmosOf<HTMLSelectElement> {
  onChange(handler: (value: string) => void): this;
}

/** ArkUI `Select`. Options are `{ value, label }` or plain strings. */
export function Select(options: SelectOptions): HmosSelect {
  const node = createHmos("select", "hmos-select") as HmosSelect;
  for (const option of options.options) {
    const item = document.createElement("option");
    if (typeof option === "string") {
      item.value = option;
      item.textContent = option;
    } else {
      item.value = option.value;
      item.textContent = option.label ?? option.value;
    }
    node.append(item);
  }
  if (options.value !== undefined) node.value = options.value;
  node.onChange = function onChange(
    this: HmosSelect,
    handler: (value: string) => void,
  ): HmosSelect {
    this.addEventListener("change", () => {
      handler(this.value);
    });
    return this;
  };
  return node;
}

/** ArkUI `Divider`. `vertical: true` draws a column separator. */
export function Divider(options?: DividerOptions): HmosOf<HTMLDivElement> {
  const node = createHmos(
    "div",
    options?.vertical
      ? "hmos-divider hmos-divider-vertical"
      : "hmos-divider hmos-divider-horizontal",
  );
  node.setAttribute("role", "separator");
  if (options?.strokeWidth !== undefined) {
    node.style[options.vertical ? "width" : "height"] =
      `${options.strokeWidth}px`;
  }
  return node;
}

/** ArkUI `Blank`. A flex spacer that consumes the remaining free space. */
export function Blank(): HmosOf<HTMLDivElement> {
  return createHmos("div", "hmos-blank");
}

/**
 * ArkUI `ForEach`. Each item is rendered by `itemGenerator`; the optional
 * `keyGenerator` is stored as `data-hmos-key` for stable identity.
 */
export function ForEach<T>(
  items: readonly T[],
  itemGenerator: (item: T, index: number) => HmosChild,
  keyGenerator?: (item: T, index: number) => string,
): HmosOf<HTMLDivElement> {
  const host = createHmos("div", "hmos-foreach");
  items.forEach((item, index) => {
    const child = itemGenerator(item, index);
    if (child === null || child === undefined || child === false) return;
    const node =
      typeof child === "string" || typeof child === "number"
        ? document.createTextNode(String(child))
        : child;
    if (keyGenerator && node instanceof HTMLElement) {
      node.dataset.hmosKey = keyGenerator(item, index);
    }
    host.append(node);
  });
  return host;
}

/**
 * Conditional render, the `if` inside an ArkUI `build()`.
 * `false`, `null`, and `undefined` conditions render nothing visible.
 */
export function Show(
  condition: unknown,
  content: HmosChild | (() => HmosChild),
): HmosOf<HTMLDivElement> {
  const host = createHmos("div", "hmos-show");
  if (condition) {
    const resolved = typeof content === "function" ? content() : content;
    appendChildren(host, [resolved]);
  }
  return host;
}

/**
 * Reactive subtree. `render` is called immediately and again whenever a
 * {@link State} read inside it changes. Only this host's children are rebuilt.
 */
export function Bind(
  render: () => HmosChild | readonly HmosChild[],
): HmosOf<HTMLDivElement> {
  const host = createHmos("div", "hmos-bind");
  const paint = (): void => {
    host.replaceChildren();
    trackRender(paint, () => {
      const produced = render();
      const children = Array.isArray(produced) ? produced : [produced];
      appendChildren(host, children);
    });
  };
  bindHost(host, paint);
  return host;
}

function bindHost(host: HTMLElement, paint: () => void): void {
  let disposed = false;
  const stop = (): void => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
  };
  const notify = (): void => {
    if (!disposed) paint();
  };
  trackRender(notify, paint);
  // Watch the parent for this host being removed. Attaching the observer
  // lazily avoids observing the whole document, and never observes a node
  // that is not connected yet.
  let observer: MutationObserver | null = null;
  const arm = (): void => {
    const parent = host.parentNode;
    if (!parent || observer) return;
    observer = new MutationObserver(() => {
      if (!host.isConnected) stop();
    });
    observer.observe(parent, { childList: true });
  };
  if (host.isConnected) arm();
  else queueMicrotask(arm);
  host.addEventListener("hmos-dispose", stop);
}

/** Mark a reactive host so it stops rebuilding. Safe to call on any element. */
export function dispose(node: Node): void {
  if (node instanceof HTMLElement) {
    node.dispatchEvent(new Event("hmos-dispose"));
  }
}

const BLUR_VAR: Record<BlurStyleName, string> = {
  thin: "var(--hmos-blur-thin)",
  regular: "var(--hmos-blur-regular)",
  thick: "var(--hmos-blur-thick)",
};

/**
 * Card surface: large corner radius on the tertiary background.
 * Pass a {@link BlurStyleName} for a frosted-glass panel (ArkUI `backdropBlur`).
 */
export function Card(
  children: readonly HmosChild[],
  options?: { glass?: boolean | BlurStyleName; padding?: number },
): HmosOf<HTMLDivElement> {
  const glass = options?.glass;
  const node = createHmos("div", glass ? "hmos-card hmos-glass" : "hmos-card");
  node.style.padding =
    options?.padding !== undefined
      ? `${options.padding}px`
      : "var(--hmos-space-4)";
  if (typeof glass === "string") {
    const blur = `blur(${BLUR_VAR[glass]})`;
    node.style.backdropFilter = blur;
    node.style.setProperty("-webkit-backdrop-filter", blur);
  }
  appendChildren(node, children);
  return node;
}

/**
 * Fullscreen canvas stage. The backing store follows devicePixelRatio and
 * resizes with the element; the context is pre-scaled so drawing uses CSS
 * pixels. Pointer callbacks receive CSS-pixel coordinates.
 */
export function Stage(options: StageOptions = {}): StageHandle {
  const element = document.createElement("div");
  element.className = "hmos-stage";
  const canvas = document.createElement("canvas");
  canvas.className = "hmos-stage-canvas";
  element.append(canvas);

  // happy-dom (and any host without a canvas implementation) returns null.
  // The stage still resizes and reports pointers; frames are skipped.
  const context = canvas.getContext("2d");

  const size = { width: 0, height: 0 };
  let frameId = 0;
  let running = false;

  const resize = (): void => {
    const rect = element.getBoundingClientRect();
    const width = Math.max(0, Math.round(rect.width));
    const height = Math.max(0, Math.round(rect.height));
    const dpr = window.devicePixelRatio || 1;
    const nextWidth = Math.max(1, Math.round(width * dpr));
    const nextHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    context?.setTransform(dpr, 0, 0, dpr, 0, 0);
    size.width = width;
    size.height = height;
  };

  const pointerOf = (event: PointerEvent): StagePointer => {
    const rect = element.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      buttons: event.buttons,
      pointerId: event.pointerId,
    };
  };

  const onPointerDown = (event: PointerEvent): void => {
    element.setPointerCapture?.(event.pointerId);
    options.onPointerDown?.(pointerOf(event));
  };
  const onPointerMove = (event: PointerEvent): void => {
    options.onPointerMove?.(pointerOf(event));
  };
  const onPointerUp = (event: PointerEvent): void => {
    options.onPointerUp?.(pointerOf(event));
  };

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerUp);

  const loop = (time: number): void => {
    if (!running) return;
    resize();
    if (context) {
      options.onFrame?.({
        ctx: context,
        width: size.width,
        height: size.height,
        time,
      });
    }
    frameId = window.requestAnimationFrame(loop);
  };

  const stop = (): void => {
    running = false;
    if (frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    }
  };

  const start = (): void => {
    if (running) return;
    running = true;
    resize();
    frameId = window.requestAnimationFrame(loop);
  };

  const observer =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          resize();
        })
      : null;
  observer?.observe(element);
  window.addEventListener("resize", resize);

  const disposeStage = (): void => {
    stop();
    observer?.disconnect();
    window.removeEventListener("resize", resize);
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("pointermove", onPointerMove);
    element.removeEventListener("pointerup", onPointerUp);
    element.removeEventListener("pointercancel", onPointerUp);
  };

  return { element, canvas, size, start, stop, resize, dispose: disposeStage };
}

/**
 * Mount a builder result into `parent` and apply the dark theme root class.
 * Returns the mounted element.
 */
export function mount(parent: HTMLElement, node: HTMLElement): HTMLElement {
  parent.classList.add("hmos-root");
  parent.replaceChildren(node);
  return node;
}
