/** 终结技卡片里的大招动画片段（2026-11-04 用户要求）。
 *
 * 文件在 modules/honkai-star-rail/assets/ult/<角色 id>.webm：每人截大招动画里角色特写的约 2.2 秒，
 * 无声、VP9。y 是画面在卡片横幅里的竖直取景（object-position 的百分比，越小越靠上）。
 * 没有条目的角色显示静态立绘（现在每个角色都有片段）。
 * 片段和截取表由测试服包里的工具生成（beta/tools/ult_clips），这里只记哪些角色有片段和取景。
 */
import { ASSET_ROOT, ULT_CLIPS_ENABLED } from "../../ui-shared/src/asset-root.ts";

export interface UltClip {
  src: string;
  y: number;
}

/** 角色 id → 竖直取景。 */
export const ULT_CLIP_FRAMING: Record<string, number> = {
  "1001": 19, "1002": 8, "1003": 19, "1004": 19, "1005": 29, "1006": 29, "1008": 29, "1009": 8,
  "1013": 8, "1014": 8, "1015": 19, "1101": 19, "1102": 19, "1103": 19, "1104": 8, "1105": 40,
  "1106": 19, "1107": 19, "1108": 8, "1109": 19, "1110": 29, "1111": 29, "1112": 19, "1201": 19,
  "1202": 8, "1203": 19, "1204": 8, "1205": 19, "1206": 8, "1207": 19, "1208": 19, "1209": 8,
  "1210": 8, "1211": 8, "1212": 19, "1213": 8, "1214": 19, "1215": 19, "1217": 8, "1218": 19,
  "1220": 19, "1221": 29, "1222": 8, "1223": 19, "1224": 8, "1225": 19, "1301": 19, "1302": 19,
  "1303": 19, "1304": 8, "1305": 19, "1306": 19, "1307": 19, "1308": 8, "1309": 8, "1310": 19,
  "1312": 19, "1313": 19, "1314": 8, "1315": 8, "1317": 19, "1321": 8, "1401": 19, "1402": 19,
  "1403": 29, "1404": 19, "1405": 19, "1406": 19, "1407": 19, "1408": 8, "1409": 8, "1410": 19,
  "1412": 19, "1413": 19, "1414": 19, "1415": 19, "1501": 40, "1502": 19, "1503": 29, "1504": 19,
  "1505": 40, "1506": 19, "1507": 19, "1508": 19, "1509": 19, "1510": 19, "1511": 8, "1512": 19,
  "1513": 19, "8001": 8, "8003": 19, "8005": 19, "8007": 19, "8009": 19,
};

export function ultClipOf(id: string): UltClip | undefined {
  const y = ULT_CLIP_FRAMING[id];
  return y === undefined || !ULT_CLIPS_ENABLED ? undefined : { src: `${ASSET_ROOT}ult/${id}.webm`, y };
}

// 同一时间只放一个片段：出轴时大招接连出现，前一个还没放完就停掉，免得好几个视频一起解码拖慢滚动。
// 循环播放的（选中的卡、鼠标停着的卡）优先：别的卡出场时只放一遍的片段抢不走它，
// 否则刚点开的卡会被旁边后出场的卡停掉、再也不放（2026-11-05 CI 上慢，偶尔这样）。
let stopCurrent: (() => void) | null = null;
let currentLoops = false;
/** 要开始放片段时先占位；返回 false 表示正有循环播放的片段，这次只放一遍的就不放了。 */
export function claimClipPlayback(stop: () => void, loop = false): boolean {
  if (stopCurrent && stopCurrent !== stop) {
    if (currentLoops && !loop) return false;
    stopCurrent();
  }
  stopCurrent = stop;
  currentLoops = loop;
  return true;
}
export function releaseClipPlayback(stop: () => void): void {
  if (stopCurrent !== stop) return;
  stopCurrent = null;
  currentLoops = false;
}
