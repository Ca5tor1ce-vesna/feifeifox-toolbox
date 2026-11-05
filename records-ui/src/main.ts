/** 角色顶分页入口（工具箱、exe）：数据在浏览器里从镜像拉，缓存在浏览器本地，不经过后端。
 * B站 Toy 版的入口是 main-toy.ts。 */
import { recordsFeature } from "./feature.ts";
import { loadRecords, localCache } from "./records.ts";

export default recordsFeature((refresh) => loadRecords({ refresh, cache: localCache() }));
