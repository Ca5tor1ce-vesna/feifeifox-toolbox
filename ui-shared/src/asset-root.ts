/** 页面代码里自己拼的素材路径从这里取。按站点根目录（index.html 所在目录）算：
 * 工具箱和 exe 在根上，是 /modules/...；B站 Toy 在 /toy/<id>/ 下，是 /toy/<id>/modules/...。
 * 测试里没有 document，按根目录算。
 */
const doc = (globalThis as { document?: { baseURI: string } }).document;
const base = doc ? new URL(".", doc.baseURI).pathname : "/";
export const ASSET_ROOT = `${base}modules/honkai-star-rail/assets/`;
/** 大招动画片段。需要时可以打一个不带片段、只显示静态立绘的小包。 */
export const ULT_CLIPS_ENABLED = true;
