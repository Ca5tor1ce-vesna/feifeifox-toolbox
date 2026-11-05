import type { Directive } from "vue";

/** 图片骨架：加载完给 <img> 挂上 is-loaded，样式里没加载完的图片透明、外框显示闪动的底色，加载完淡入。
 *
 * 海外打开 B站 Toy 时图片来得很慢，空框看着像坏了（2026-11-04 用户要求）。
 * 换了 src 的图片重新进入「加载中」；加载失败也算结束，交给各组件自己的兜底（比如显示名字首字）。
 * 轴上的头像和立绘不用 loading="lazy"：B站 Toy 页面里懒加载不触发，要点开卡片（详情直接加载同一张立绘）才显示
 * （2026-11-04 用户反馈）。一支队伍只有几张不同的图，懒加载也省不了什么；只有选人列表保留懒加载。
 */
function settle(image: HTMLImageElement): void {
  image.dataset.loadSrc = image.getAttribute("src") ?? "";
  if (image.complete) image.classList.add("is-loaded");
  else image.classList.remove("is-loaded");
}

const done = (event: Event): void => (event.currentTarget as HTMLImageElement).classList.add("is-loaded");

export const vLoad: Directive<HTMLImageElement> = {
  mounted(image) {
    image.classList.add("axis-img");
    image.addEventListener("load", done);
    image.addEventListener("error", done);
    settle(image);
  },
  updated(image) {
    if (image.dataset.loadSrc !== (image.getAttribute("src") ?? "")) settle(image);
  },
  unmounted(image) {
    image.removeEventListener("load", done);
    image.removeEventListener("error", done);
  },
};
