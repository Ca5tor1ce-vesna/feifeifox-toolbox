/* 配速查询 · 立绘：换角色时的进场动画，先显示随包的小图、加载完再换高清原图。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, ref } from "vue";
import { animate, SPRING_EASE } from "./motion.ts";
import type { PlanState } from "./plan-state.ts";

export function useSplash(s: PlanState) {
  const { currentCharacter } = s;
  const splash = ref<HTMLImageElement | null>(null);
  const splashMeta = ref<HTMLDivElement | null>(null);
  const splashSrc = ref("");
  const splashBroken = ref(false);
  const heroArtBroken = ref(false);
  let splashUpgraded = "";
  let shownCharacter: string | null = null;
  let alive = true;

  function updateSplash(): void {
    const character = currentCharacter.value;
    if (shownCharacter !== null && shownCharacter !== String(character.id)) {
      animate(splash.value, [{ opacity: 0, transform: "translateX(26px) scale(.97)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: "cubic-bezier(.2, .9, .3, 1.08)" });
      animate(splashMeta.value, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: SPRING_EASE });
    }
    shownCharacter = String(character.id);
    splashUpgraded = "";
    splashBroken.value = false;
    heroArtBroken.value = false;
    splashSrc.value = character.splash || "";
  }
  // 先显示随包的小立绘，加载完再换成同一张的原图（更大才换）。
  function onSplashLoad(): void {
    const character = currentCharacter.value;
    const source = character.splash || "";
    const high = character.splashLarge;
    const img = splash.value;
    if (!alive || !img || !high || !source || source.startsWith("data:") || splashUpgraded === String(character.id)) return;
    const probe = new Image();
    probe.onload = () => {
      if (!alive || currentCharacter.value !== character || !img.isConnected) return;
      if (probe.naturalWidth > img.naturalWidth || probe.naturalHeight > img.naturalHeight) {
        splashUpgraded = String(character.id);
        splashSrc.value = high;
      }
    };
    probe.src = high;
  }
  const charSpeed = computed(() => currentCharacter.value.effectiveBaseSpeed ?? currentCharacter.value.baseSpeed);
  const charTrace = computed(() => Number(currentCharacter.value.traceSpeed || 0));
  // 模板里不直接给状态赋值，经由这两个函数改
  const markSplashBroken = (): void => { splashBroken.value = true; };
  const markHeroArtBroken = (): void => { heroArtBroken.value = true; };
  const dispose = (): void => { alive = false; };

  return { splash, splashMeta, splashSrc, splashBroken, heroArtBroken, updateSplash, onSplashLoad, charSpeed, charTrace, markSplashBroken, markHeroArtBroken, dispose };
}
