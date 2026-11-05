import type { CatalogItem } from "./model.ts";

/** 图片都随包带，直接用站内路径。 */
export function imageOf(path: string | undefined): string {
  return path ?? "";
}

export const iconOf = (item: CatalogItem | undefined): string => imageOf(item?.icon);
export const splashOf = (item: CatalogItem | undefined): string => imageOf(item?.splash);
