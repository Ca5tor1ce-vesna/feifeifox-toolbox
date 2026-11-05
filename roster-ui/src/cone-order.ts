/** 光锥列表的顺序和角标：专武第一，接着是游戏里推荐的，然后同命途的按星级，最后是别的命途。 */

export interface ConeInfo { id: string; name: string; path: string; rarity?: number }
export interface ConeOwner { path: string; signatureCone?: string; recommendedCones?: string[] }
export interface OrderedCone<T extends ConeInfo> { cone: T; badge: "专武" | "推荐" | ""; samePath: boolean }

export function orderCones<T extends ConeInfo>(owner: ConeOwner, cones: Iterable<T>): OrderedCone<T>[] {
  const picks = owner.recommendedCones ?? [];
  const rank = (cone: T): number => {
    if (cone.id === owner.signatureCone) return -1;
    const i = picks.indexOf(cone.id);
    return i >= 0 ? i : picks.length;
  };
  return [...cones]
    .map((cone) => ({ cone, badge: (cone.id === owner.signatureCone ? "专武" : picks.includes(cone.id) ? "推荐" : "") as OrderedCone<T>["badge"], samePath: cone.path === owner.path }))
    .sort((a, b) =>
      Number(b.samePath || !!b.badge) - Number(a.samePath || !!a.badge)
      || rank(a.cone) - rank(b.cone)
      || (b.cone.rarity ?? 0) - (a.cone.rarity ?? 0)
      || a.cone.name.localeCompare(b.cone.name, "zh"));
}
