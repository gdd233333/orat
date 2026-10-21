// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test } from "vitest";
import { startApp } from "../src/ui/flow/app.ts";

const fixture = readFileSync("tests/fixtures/otd-settings.json", "utf8");

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

function boot(): HTMLDivElement {
  const root = document.createElement("div");
  document.body.append(root);
  startApp(root);
  return root;
}

function button(root: ParentNode, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find(
    (item) => item.textContent === label,
  );
  if (!found) throw new Error(`找不到按钮「${label}」`);
  return found;
}

function field(root: ParentNode, placeholder: string): HTMLInputElement {
  const found = root.querySelector<HTMLInputElement>(
    `input[placeholder="${placeholder}"]`,
  );
  if (!found) throw new Error(`找不到输入框 ${placeholder}`);
  return found;
}

describe("calibration flow", () => {
  test("fills the form from settings.json and explains invalid JSON in Chinese", () => {
    const root = boot();
    expect(root.textContent).toContain("已检测");

    const paste = root.querySelector("textarea");
    if (!paste) throw new Error("缺少 settings 文本框");
    paste.value = "{";
    button(root, "从 JSON 填充").click();
    expect(root.textContent).toContain("settings.json 不是合法的 JSON");

    paste.value = fixture;
    button(root, "从 JSON 填充").click();
    expect(field(root, "物理宽度 mm").value).toBe("152");
    expect(field(root, "物理高度 mm").value).toBe("95");
    expect(field(root, "映射宽度 mm").value).toBe("60");
    expect(field(root, "映射高度 mm").value).toBe("33.75");
    expect(field(root, "中心 X mm").value).toBe("76");
    expect(field(root, "中心 Y mm").value).toBe("47.5");
    expect(field(root, "旋转（度）").value).toBe("15");
    expect(root.textContent).toContain("已从 settings.json 填入");
  });

  test("walks coarse and fine targets, then compares and saves a profile", async () => {
    const root = boot();
    button(root, "进入全屏并开始").click();
    await Promise.resolve();

    expect(root.textContent).toContain("粗调 1/9");
    const stage = root.querySelector<HTMLElement>(".hmos-stage");
    if (!stage) throw new Error("粗调没有舞台");

    for (let index = 0; index < 9; index += 1) {
      stage.dispatchEvent(
        new PointerEvent("pointerdown", {
          clientX: 80 + index,
          clientY: 60 + index,
        }),
      );
    }
    await Promise.resolve();
    expect(root.textContent).toContain("细调 1/");

    const fine = root.querySelector<HTMLElement>(".hmos-stage");
    if (!fine) throw new Error("细调没有舞台");
    let guard = 0;
    while (!root.textContent?.includes("校准结果") && guard < 40) {
      fine.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 100 + guard, clientY: 80 }),
      );
      guard += 1;
    }
    expect(root.textContent).toContain("校准结果");
    expect(root.textContent).toContain("当前");
    expect(root.textContent).toContain("推荐");

    button(root, "保存").click();
    expect(root.textContent).toContain("抓握A");
    expect(root.textContent).toContain("已保存");

    button(root, "删除").click();
    expect(root.textContent).toContain("还没有握笔档案");
  });

  test("Escape aborts a running capture and returns to setup", async () => {
    const root = boot();
    button(root, "进入全屏并开始").click();
    await Promise.resolve();
    expect(root.textContent).toContain("粗调 1/9");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(root.textContent).toContain("已中止校准");
    expect(root.textContent).toContain("进入全屏并开始");
  });
});
