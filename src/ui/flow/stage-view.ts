import { Stage, type StageHandle, type StageOptions } from "../hmos/index.ts";

/** 校准阶段的全屏画布。单独隔开，方便测试替换。 */
export function createStage(options: StageOptions): StageHandle {
  return Stage(options);
}
