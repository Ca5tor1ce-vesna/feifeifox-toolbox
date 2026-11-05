/** 导入确认框的数据：扫描文件的差异统计，或者每张战绩分享图的识别结果。 */
import type { LibraryDiff } from "../../ui-shared/src/import/merge.ts";
import type { CardResult } from "../../ui-shared/src/import/record-card/recognize.ts";

export interface CardItem { name: string; status: "waiting" | "working" | "done" | "failed"; progress: number; result?: CardResult; error?: string; include: boolean }
export type Review =
  | { kind: "file"; diff: LibraryDiff; skipped: string[]; characters: number; relics: number }
  | { kind: "cards"; items: CardItem[] };
