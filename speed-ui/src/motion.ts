/** 页面动效：弹性打底，和 axis-ui/src/motion.ts 同一个方向。页面在后台或用户要求减少动态效果时不动。 */
export const SPRING_EASE = "cubic-bezier(.34, 1.56, .64, 1)";

export const motionOff = (): boolean =>
  document.hidden || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);

export function animate(element: Element | null | undefined, keyframes: Keyframe[], options: KeyframeAnimationOptions): void {
  if (element && !motionOff() && typeof (element as HTMLElement).animate === "function") (element as HTMLElement).animate(keyframes, options);
}

export const bounce = (element: Element | null | undefined): void =>
  animate(element, [{ transform: "scale(.88)" }, { transform: "none" }], { duration: 320, easing: SPRING_EASE });

export const rise = (element: Element | null | undefined): void =>
  animate(element, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: "cubic-bezier(.2, .8, .2, 1)" });

export const fix = (value: unknown, digits = 2): string =>
  Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "-";

/** 数字滚动到新值。结果是即时算好的，滚动只有一小段，到时间一定写上最终值（页面在后台时动画帧不跑）。 */
const ROLL_MS = 280;
const rolls = new Map<HTMLElement, { frame: number; timer: number }>();

export function rollNumber(element: HTMLElement | null, value: unknown, digits: number): void {
  if (!element) return;
  const finalText = fix(value, digits);
  const from = Number(element.textContent);
  const running = rolls.get(element);
  if (running) {
    clearTimeout(running.timer);
    cancelAnimationFrame(running.frame);
    rolls.delete(element);
  }
  if (motionOff() || !Number.isFinite(from) || !Number.isFinite(Number(value)) || element.textContent === finalText) {
    element.textContent = finalText;
    return;
  }
  const started = performance.now();
  const roll = {
    frame: 0,
    timer: window.setTimeout(() => {
      cancelAnimationFrame(roll.frame);
      rolls.delete(element);
      element.textContent = finalText;
    }, ROLL_MS + 60),
  };
  const step = (now: number): void => {
    const progress = Math.min(1, (now - started) / ROLL_MS);
    if (progress >= 1) {
      clearTimeout(roll.timer);
      rolls.delete(element);
      element.textContent = finalText;
      return;
    }
    element.textContent = fix(from + (Number(value) - from) * (1 - (1 - progress) ** 3), digits);
    roll.frame = requestAnimationFrame(step);
  };
  roll.frame = requestAnimationFrame(step);
  rolls.set(element, roll);
}

export function stopRolls(): void {
  for (const roll of rolls.values()) {
    clearTimeout(roll.timer);
    cancelAnimationFrame(roll.frame);
  }
  rolls.clear();
}
