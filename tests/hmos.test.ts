// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  Bind,
  Blank,
  Button,
  ButtonType,
  Column,
  Divider,
  ForEach,
  Row,
  Select,
  Show,
  Stack,
  State,
  Text,
  TextInput,
  dispose,
  Stage,
  mount,
} from "../src/ui/hmos/index.ts";

afterEach(() => {
  document.body.replaceChildren();
});

describe("builders", () => {
  test("Column lays out the declared text and button", () => {
    const view = Column({ space: 16 }, [
      Text("映射校准").fontSize(28).fontWeight("bold"),
      Button("开始校准").buttonType(ButtonType.Capsule),
    ]);

    expect(view).toBeInstanceOf(HTMLElement);
    expect(view.tagName).toBe("DIV");
    expect(view.classList.contains("hmos-column")).toBe(true);
    expect(view.style.gap).toBe("16px");
    expect(view.children).toHaveLength(2);

    const title = view.children[0] as HTMLElement;
    expect(title.tagName).toBe("P");
    expect(title.textContent).toBe("映射校准");
    expect(title.style.fontSize).toBe("28px");
    expect(title.style.fontWeight).toBe("700");

    const button = view.children[1] as HTMLButtonElement;
    expect(button.tagName).toBe("BUTTON");
    expect(button.textContent).toBe("开始校准");
    expect(button.classList.contains("hmos-button-capsule")).toBe(true);
  });

  test("Row, Stack, ForEach, Show, Blank and Divider build the right structure", () => {
    const view = Column([
      Row({ space: 8 }, [Text("左"), Blank(), Text("右")]),
      Stack({ alignContent: "Center" }, [Text("底"), Text("顶")]),
      ForEach(
        ["圆", "方"],
        (item) => Text(item),
        (item) => item,
      ),
      Show(false, Text("隐藏")),
      Show(true, () => Text("可见")),
      Divider({ vertical: true, strokeWidth: 2 }),
    ]);

    const row = view.children[0] as HTMLElement;
    expect(row.classList.contains("hmos-row")).toBe(true);
    expect(row.style.gap).toBe("8px");
    expect(row.children[1]?.classList.contains("hmos-blank")).toBe(true);

    const stack = view.children[1] as HTMLElement;
    expect(stack.classList.contains("hmos-stack")).toBe(true);
    expect(stack.childElementCount).toBe(2);
    expect(stack.style.alignItems).toBe("center");

    const list = view.children[2] as HTMLElement;
    expect(list.classList.contains("hmos-foreach")).toBe(true);
    expect(list.textContent).toBe("圆方");
    expect((list.children[0] as HTMLElement).dataset.hmosKey).toBe("圆");

    const hidden = view.children[3] as HTMLElement;
    expect(hidden.childElementCount).toBe(0);
    const shown = view.children[4] as HTMLElement;
    expect(shown.textContent).toBe("可见");

    const divider = view.children[5] as HTMLElement;
    expect(divider.classList.contains("hmos-divider-vertical")).toBe(true);
    expect(divider.style.width).toBe("2px");
  });

  test("chainable modifiers write inline styles", () => {
    const card = Column([Text("标题")])
      .width(320)
      .height("100%")
      .padding(16)
      .backgroundColor("#242424")
      .borderRadius(16)
      .opacity(0.9);

    expect(card.style.width).toBe("320px");
    expect(card.style.height).toBe("100%");
    expect(card.style.padding).toBe("16px");
    expect(card.style.backgroundColor).toBe("#242424");
    expect(card.style.borderRadius).toBe("16px");
    expect(card.style.opacity).toBe("0.9");
  });

  test("Button onClick fires and TextInput reports its value", () => {
    const onClick = vi.fn();
    const button = Button("开始校准").onClick(onClick);
    document.body.append(button);
    button.click();
    expect(onClick).toHaveBeenCalledOnce();

    const seen: string[] = [];
    const input = TextInput({ placeholder: "配置名" }).onChange((value) => {
      seen.push(value);
    });
    input.value = "默认";
    input.dispatchEvent(new Event("input"));
    expect(input.getAttribute("placeholder")).toBe("配置名");
    expect(seen).toEqual(["默认"]);

    const select = Select({
      value: "b",
      options: [
        { value: "a", label: "甲" },
        { value: "b", label: "乙" },
      ],
    });
    expect(select.value).toBe("b");
    expect(select.options).toHaveLength(2);
  });
});

describe("State", () => {
  test("setting state re-renders only the bound subtree", () => {
    const title = new State("映射校准");
    const count = new State(0);
    const view = Column([
      Text("固定"),
      Bind(() => Text(`${title.value} #${count.value}`).fontSize(28)),
    ]);
    document.body.append(view);

    const bound = view.children[1] as HTMLElement;
    expect(bound.textContent).toBe("映射校准 #0");
    const text = bound.firstElementChild as HTMLElement;
    expect(text.style.fontSize).toBe("28px");

    count.set(1);
    expect(bound.textContent).toBe("映射校准 #1");
    expect(view.children[0]?.textContent).toBe("固定");
    expect(bound.firstElementChild).not.toBe(text);

    title.set("重新校准");
    expect(bound.textContent).toBe("重新校准 #1");
  });

  test("Text bound to State updates, and dispose stops further updates", () => {
    const label = new State("开始");
    const text = Text(label);
    document.body.append(text);
    expect(text.textContent).toBe("开始");

    label.set("校准中");
    expect(text.textContent).toBe("校准中");

    dispose(text);
    label.set("完成");
    expect(text.textContent).toBe("校准中");
  });

  test("mount applies the theme root and replaces the parent contents", () => {
    const root = document.createElement("div");
    root.textContent = "旧内容";
    const mounted = mount(root, Column([Text("映射校准")]));
    expect(root.classList.contains("hmos-root")).toBe(true);
    expect(root.textContent).toBe("映射校准");
    expect(mounted.classList.contains("hmos-column")).toBe(true);
    expect(mounted).toBeInstanceOf(HTMLDivElement);
  });
});

describe("Stage", () => {
  test("sizes the canvas by devicePixelRatio and reports css pointer coordinates", () => {
    const downs: Array<{ x: number; y: number }> = [];
    const stage = Stage({
      onPointerDown: (pointer) => {
        downs.push({ x: pointer.x, y: pointer.y });
      },
    });
    document.body.append(stage.element);
    stage.element.getBoundingClientRect = () =>
      ({
        x: 10,
        y: 20,
        left: 10,
        top: 20,
        right: 310,
        bottom: 220,
        width: 300,
        height: 200,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 2,
    });

    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        queueMicrotask(() => {
          callback(16);
        });
        return 1;
      });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    stage.start();
    expect(stage.canvas.width).toBe(600);
    expect(stage.canvas.height).toBe(400);
    expect(stage.size).toEqual({ width: 300, height: 200 });
    expect(raf).toHaveBeenCalledOnce();

    stage.element.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 40,
        clientY: 70,
        pointerId: 3,
      }),
    );
    expect(downs).toEqual([{ x: 30, y: 50 }]);

    stage.dispose();
    expect(raf).toHaveBeenCalled();
  });
});
