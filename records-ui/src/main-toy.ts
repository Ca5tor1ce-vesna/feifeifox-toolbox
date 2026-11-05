/** 角色顶分页入口（B站 Toy 版）：读随包的数据快照，不连外网，打出来的 ui.js 里没有镜像地址。
 * tools/package.mjs 打 Toy 包时用它换掉 features/records/ui.js。 */
import { recordsFeature } from "./feature.ts";
import { loadSnapshot, SNAPSHOT_FILE } from "./snapshot.ts";

const url = new URL(SNAPSHOT_FILE, import.meta.url).href;

export default recordsFeature(() => loadSnapshot(url));
