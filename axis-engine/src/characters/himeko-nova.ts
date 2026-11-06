/**
 * 姬子•启行（1510）：助战技【开拓，与你同行】。
 *
 * 口径（4.6.54 版本资料；细节按攻略实测 BV1cBMe69Ejk、BV1qANi6yEVS）：
 * - 助战技次数全队共用，上限 1（E2 为 2）。天赋开局给 1 次；她的战技补满次数并上【领航旗语】3 回合，
 *   持有期间她每回合开始补 1 次（E2 补 2 次），到期那个回合也补。她自己用不消耗次数。
 * - 助战技算姬子•启行施放了战技：她回 18 点能量（吃能量恢复效率），队友使用时自己 +4。
 * - 施放助战技会用掉当前回合；开拓同行角色用了以后立即有个额外回合（行迹【列车的脉搏在轰鸣】），等于不耽误行动，
 *   E2 起非开拓同行也有。没有额外回合的人用了就少一动（这一动只记「用掉了」）。她自己的助战技也会占回合，不模拟。
 * - 谁来用（2026-11-06 用户定）：用的人在自己回合开始先用一次。每位队友可设「用」「不用」；
 *   默认只让能白用的队友里第一个用的那位用（攻略：多名开拓同行时只让一个人放，避免来回切协议），
 *   有人手动设了「用」时默认的人都不用。
 * - 开拓同行队友用助战技决定【同行协议】：开拓者、丹恒•腾荒、星期日 →【裁决】；瓦尔特、三月七、长夜月、姬子 →【歼破】。
 *   【裁决】下队友主动开 2 次大（E1 1 次）送 1 次无消耗助战技；【歼破】按击中敌人数充能，不模拟敌方。
 *   送的助战技每次姬子•启行开大后最多 2 次（E1 3 次），开大刷新。
 */
import type { KitContext } from "../types.ts";
import type { Unit } from "../unit.ts";
import { Kit } from "./base.ts";

const ASSIST = "助战技【开拓，与你同行】";
const ASSIST_ENERGY = 18;
const USER_ENERGY = 4;
/** 开拓同行角色（原文名单）。开拓者各命途都算。 */
const COMPANIONS = new Set(["1003", "1510", "1001", "1224", "1413", "1002", "1213", "1414", "1004", "1313"]);
const isCompanion = (unit: Unit) => COMPANIONS.has(unit.id) || unit.id.startsWith("80");
/** 用助战技时决定的协议；丹恒、丹恒•饮月攻略里没说，不改协议。 */
const protocolOf = (unit: Unit): Protocol | null => {
  if (unit.id.startsWith("80") || unit.id === "1414" || unit.id === "1313") return "裁决";
  if (["1004", "1001", "1224", "1413", "1003"].includes(unit.id)) return "歼破";
  return null;
};
type Protocol = "裁决" | "歼破";

export class HimekoNovaKit extends Kit {
  readonly id = "1510";
  readonly enemyDependent = [
    "【同行协议：歼破】按击中敌人数充能送助战技（不模拟敌方）",
    "她自己施放助战技（会占用自己的回合，默认不用）",
  ];
  /** 全队共用的助战技次数。 */
  uses = 1;
  /** 【领航旗语】剩余回合。 */
  flag = 0;
  protocol: Protocol | null = null;
  /** 【裁决】计数：队友主动施放的终结技次数。 */
  ultCount = 0;
  /** 默认规则下用助战技的那位（第一个用的）。 */
  private autoUser: Unit | null = null;
  /** 本轮还能送的助战技次数，开大刷新。 */
  freeLeft = 2;

  private maxUses(): number {
    return this.self.eidolon >= 2 ? 2 : 1;
  }

  private freeCap(): number {
    return this.self.eidolon >= 1 ? 3 : 2;
  }

  protected setup(): void {
    this.freeLeft = this.freeCap();
    this.engine.on("turnStart", ({ unit }) => {
      if (unit === this.self || this.uses <= 0 || !this.wantsAssist(unit)) return;
      this.uses -= 1;
      if (unit.assist === "auto") this.autoUser = unit;
      this.assist(unit, `${unit.name} 回合开始使用（剩 ${this.uses} 次）`);
      if (!this.free(unit)) unit.skipAction = "施放了助战技（不是开拓同行，没有额外回合）";
    });
    this.engine.on("ultimate", ({ unit }) => {
      if (unit === this.self || this.protocol !== "裁决") return;
      this.ultCount += 1;
      this.tryFreeAssist();
    });
  }

  /** 能白用：开拓同行用完有额外回合，E2 起所有人都有。 */
  private free(unit: Unit): boolean {
    return isCompanion(unit) || this.self.eidolon >= 2;
  }

  /**
   * 这位队友这回合用不用助战技（2026-11-06 用户定）：手动设了「用」「不用」按设置；
   * 默认只让能白用的队友里第一个用的那位用（攻略：多名开拓同行时只让一个人放，不要来回切协议），
   * 有人手动设了「用」时默认的人都不用。
   */
  private wantsAssist(unit: Unit): boolean {
    if (unit.assist === "never") return false;
    if (unit.assist === "use") return true;
    if (this.engine.units.some((ally) => ally !== this.self && ally.assist === "use")) return false;
    if (!this.free(unit)) return false;
    return this.autoUser === null || this.autoUser === unit;
  }

  /** 一次助战技：姬子 +18（算她施放战技），队友使用 +4，开拓同行队友决定协议。 */
  private assist(user: Unit, detail: string): void {
    const { engine, self } = this;
    const details = [detail, `姬子•启行 能量 +${ASSIST_ENERGY} × (1+ERR)（视为她施放战技）`];
    if (user !== self) details.push(`${user.name} 能量 +${USER_ENERGY} × (1+ERR)`);
    if (user !== self && isCompanion(user)) details.push("开拓同行：用完立即获得额外回合，照常行动");
    else if (user !== self && this.free(user)) details.push("E2：非开拓同行也获得额外回合，照常行动");
    else if (user !== self) details.push("不是开拓同行：助战技用掉这一动");
    // 先结算再记说明：回能可能让姬子满能当场开大，终结技插在说明和使用者那一动之间时，
    // 页面会把说明挂到前一张卡上（2026-11-06 页面实测）。记在后面就紧挨着使用者那一动。
    engine.gainEnergy(self, ASSIST_ENERGY, { reason: "助战技" });
    if (user !== self) engine.gainEnergy(user, USER_ENERGY, { reason: "助战技" });
    engine.assisted(self, user, false);
    engine.attack(self, "skill");
    engine.record("note", user, ASSIST, { details });
    const protocol = user !== self ? protocolOf(user) : null;
    if (protocol && protocol !== this.protocol) {
      this.protocol = protocol;
      // 记在使用者身上：页面把说明挂到同一角色同一时刻的那一动上，记在姬子身上会挂到前一张卡（2026-11-06 页面实测）。
      engine.record("note", user, `同行协议：${protocol}`, {
        details: [`${user.name} 使用助战技，姬子•启行进入【同行协议：${protocol}】`, protocol === "裁决" ? `队友主动开 ${this.ultNeed()} 次大送 1 次助战技` : "按击中敌人数充能（不模拟敌方）"],
      });
      this.tryFreeAssist();
    }
  }

  private ultNeed(): number {
    return this.self.eidolon >= 1 ? 1 : 2;
  }

  /** 【裁决】计数够了且本轮还有次数时送 1 次；不够次数时计数先留着，开大刷新后再送。 */
  private tryFreeAssist(): void {
    const { engine, self } = this;
    while (this.protocol === "裁决" && this.ultCount >= this.ultNeed() && this.freeLeft > 0) {
      this.ultCount -= this.ultNeed();
      this.freeLeft -= 1;
      engine.record("note", self, "同行协议：裁决：额外助战技", {
        details: [`队友开大 ${this.ultNeed()} 次 → 无消耗助战技`, `姬子•启行 能量 +${ASSIST_ENERGY} × (1+ERR)`, `本轮还能送 ${this.freeLeft} 次`],
      });
      engine.gainEnergy(self, ASSIST_ENERGY, { reason: "助战技" });
      engine.assisted(self, self, true);
      engine.attack(self, "skill");
    }
  }

  private refill(label: string): void {
    this.uses = this.maxUses();
    this.flag = 3;
    this.engine.record("note", this.self, label, { details: [`助战技次数补满（${this.uses} 次）`, "【领航旗语】3 回合"] });
  }

  onTechnique({ engine, self }: KitContext): void {
    engine.record("tech", self, "秘技【拓星巡航】", { details: ["波次开始自动施放 1 次战技"] });
    engine.gainEnergy(self, self.energyGains.skill, { reason: "秘技：战技" });
    this.refill("战技（秘技）");
  }

  onTurnStart(): void {
    if (this.flag > 0) {
      const add = this.self.eidolon >= 2 ? 2 : 1;
      this.uses = Math.min(this.maxUses(), this.uses + add);
      this.flag -= 1;
      this.engine.record("note", this.self, "【领航旗语】", { details: [`回合开始：助战技次数 +${add} → ${this.uses}`, `剩 ${this.flag} 回合`] });
    }
    // 行迹【人类该向何处去】：回合开始时次数是满的，额外 +5。
    if (this.uses >= this.maxUses()) this.engine.gainEnergy(this.self, 5, { reason: "行迹【人类该向何处去】" });
  }

  protected skill(extra: boolean): void {
    // 补次数先记：放在战技那一行前面，页面会挂到战技卡上；记在后面会挂到紧接着的终结技卡上。
    this.refill("战技【升起领航的烽火】");
    this.engine.defaultAct(this.self, "skill", extra);
  }

  onUltimate(): void {
    this.freeLeft = this.freeCap();
    this.tryFreeAssist();
  }

  mechanics = () => ({ uses: this.uses, flag: this.flag, protocol: this.protocol, ultCount: this.ultCount, freeLeft: this.freeLeft });
}
