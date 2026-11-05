/** 页面里几个组件共用的角色条目和自定义角色 id。 */
export interface CharacterItem {
  id: string;
  name: string;
  pathName?: string;
  elementName?: string;
  rarity?: number;
  baseSpeed?: number;
  traceSpeed?: number;
  effectiveBaseSpeed?: number;
  icon?: string;
  iconLarge?: string;
  splash?: string;
  splashLarge?: string | null;
  path?: string;
}

export const CUSTOM_ID = "__custom__";
