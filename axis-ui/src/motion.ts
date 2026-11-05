/** 动效的统一口径：弹性打底，演出只留给大招。数值集中在这里，改手感只改这一处。 */
export const SPRING = { type: "spring", stiffness: 420, damping: 30, mass: 0.9 } as const;
export const QUICK = { duration: 0.12 } as const;

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const NO_MOTION = { duration: 0 } as const;
