/** 砂金•戏浪（1513）。 */
import { fmt } from "../format.ts";
import { ATTACK_ORDER, TALENT_ATTACK_KINDS } from "../modules/elation.ts";
import type { KitContext } from "../types.ts";
import type { Unit } from "../unit.ts";
import { Kit } from "./base.ts";

/** 【热意】阈值：E0 只有 10（上限 30）；E1 加 20/30；E2 加 40/50（上限 50）。 */
const FERVOR_THRESHOLDS = [[10], [10, 20, 30], [10, 20, 30, 40, 50]];

export class SandKit extends Kit {
  readonly id = "1513";
  readonly elationNumber = 156;
  readonly ascensionTrace = "欢愉万相★三赌牌局";
  readonly ascensionNote = (level: 1 | 2): string => level === 1
    ? "砂金•戏浪固有行迹【欢愉万相★三赌牌局】：仅当队伍里另一名欢愉只有星神★阿哈时，纵享惊涛加强为全队速度 +15%、队友攻击热意 +1、笑点 +1"
    : "砂金•戏浪固有行迹【欢愉万相★三赌牌局】2级：仅当队伍里另一名欢愉只有星神★阿哈时，纵享惊涛加强为全队速度 +25%、队友攻击热意 +2、笑点 +2";
  fervor = 0;
  private readonly armed = [false, false, false, false, false];
  /** 下一次【阿哈时刻】欢愉技升级为《All in！》。 */
  allIn = false;
  /** 【旧梦淘金】剩余次数。 */
  jiumeng = 6;

  protected setup(): void {
    this.engine.addSpeedModifier(() => (this.sanduActive() ? { pct: this.sanduPct() } : {}));
    this.engine.on("attack", ({ unit, kind }) => this.onAttack(unit, kind), ATTACK_ORDER.sandTalent);
  }

  /** 三赌牌局：队伍里只有阿哈和戏浪两名欢愉，且【欢愉万相】生效。 */
  sanduActive(): boolean {
    if (!this.engine.findUnit("1511")) return false;
    return this.el.elationUnits().length === 2 && this.el.huanyuActive();
  }

  /** 2 级：全队速度 25%，队友攻击热意、笑点各 +2（4.6.53 版本行迹 151329）。设置里填了数就听设置。 */
  sanduPct(): number {
    return this.el.cfg.sanduTeamSpdPct ?? (this.el.ascensionLevel() === 2 ? 25 : 15);
  }

  private sanduGain(value: number | null): number {
    return value ?? (this.el.ascensionLevel() === 2 ? 2 : 1);
  }

  private soloElation(): boolean {
    const elation = this.el.elationUnits();
    return elation.length === 1 && elation[0] === this.self;
  }

  private onAttack(unit: Unit, kind: string): void {
    if (unit === this.self) return;
    const el = this.el;
    if (TALENT_ATTACK_KINDS.includes(kind)) {
      this.gainFervor(1);
      el.gainPunchline(1);
      if (this.jiumeng > 0) {
        this.jiumeng -= 1;
        this.gainFervor(2);
      }
      if (this.sanduActive()) {
        this.gainFervor(this.sanduGain(el.cfg.sanduFervorGain));
        el.gainPunchline(this.sanduGain(el.cfg.sanduPunchlineGain));
      }
    }
    // 行迹 2【纵享惊涛】：队友攻击 → 【阿哈时刻】+25 固定速度，到下一次阿哈时刻结束。
    if ((this.soloElation() || this.sanduActive()) && el.ahaFlat < 25) {
      el.ahaFlat = 25;
      this.engine.notes.push("【纵享惊涛】触发：【阿哈时刻】固定速度 +25（到下一次阿哈时刻结束）");
    }
  }

  gainFervor(amount: number): void {
    if (amount <= 0) return;
    const cap = this.self.eidolon >= 2 ? 50 : 30;
    this.fervor = Math.min(cap, this.fervor + amount);
    const thresholds = FERVOR_THRESHOLDS[Math.min(this.self.eidolon, 2)];
    thresholds.forEach((threshold, index) => {
      if (this.fervor >= threshold && !this.armed[index]) {
        this.armed[index] = true;
        this.toast();
      } else if (this.fervor < threshold) {
        this.armed[index] = false;
      }
    });
  }

  /** 热意过阈值：回合外欢愉技《举杯！》。好活当赏固定记 20，不进笑点池。 */
  private toast(): void {
    const { engine, self, el } = this;
    engine.record("elation_skill", self, "举杯！敬炽烈一夏（回合外欢愉技）", {
      details: ["好活当赏计入 20（不进笑点池）", "下一次【阿哈时刻】欢愉技升级为《All in！》", "基础回能 5 × (1+ERR)"],
      extra: true,
    });
    el.grantHaohuo(el.elationUnits(), 20, "举杯！敬炽烈一夏");
    this.allIn = true;
    engine.gainEnergy(self, 5, { reason: "欢愉技" });
    el.elationCommon(self);
    if (self.eidolon >= 2) this.gainFervor(4);
    engine.attack(self, "elation_skill");
  }

  castElation = (): void => {
    const { engine, self, el } = this;
    let label = "举杯！敬炽烈一夏（欢愉技）";
    let account = "举杯！敬炽烈一夏";
    let details = ["好活当赏计入 20（不进笑点池）", "基础回能 5 × (1+ERR)"];
    if (this.allIn) {
      this.allIn = false;
      this.fervor = 0;
      this.armed.fill(false);
      label = "All in！敬炽烈一夏（欢愉技）";
      account = "All in！敬炽烈一夏";
      details = ["好活当赏计入 20（不进笑点池）", "消耗全部热意", "基础回能 5 × (1+ERR)"];
    }
    engine.record("elation_skill", self, label, { details });
    el.grantHaohuo(el.elationUnits(), 20, account);
    engine.gainEnergy(self, 5, { reason: "欢愉技" });
    el.elationCommon(self);
    if (self.eidolon >= 2) this.gainFervor(4);
    engine.attack(self, "elation_skill");
  };

  onTechnique({ engine, self }: KitContext): void {
    engine.record("tech", self, "砂金•戏浪秘技", { details: ["热意 +2", "全队好活当赏 +20"] });
    this.gainFervor(2);
    this.el.grantHaohuo([...engine.units], 20, "砂金•戏浪秘技");
  }

  protected skill(extra: boolean): void {
    const { engine, self, el } = this;
    engine.record("skill", self, `${self.name} 的战技`, { details: ["笑点 +4", "热意 +4", "旧梦淘金充能重置 6", "基础回能 30 × (1+ERR)"], extra });
    el.gainPunchline(4);
    this.jiumeng = 6;
    this.gainFervor(4);
    engine.gainEnergy(self, 30, { reason: "战技" });
    engine.attack(self, "skill", extra);
  }

  onUltimate({ engine, self }: KitContext): void {
    const pct = this.el.cfg.ultSpdPct;
    engine.record("note", self, "胜局，凌越飓浪之上", { details: ["笑点 +6", "热意 +8", `自身速度 +${fmt(pct, 0)}%（4 回合）`, "基础回能返还 +5 × (1+ERR)"] });
    this.el.gainPunchline(6);
    this.gainFervor(8);
    engine.addSpeedBuff(self, { kind: "pct", value: pct, turns: 4, label: "胜局，凌越飓浪之上" });
    engine.attack(self, "ultimate");
  }

  mechanics = () => ({ fervor: this.fervor, jiumengLeft: this.jiumeng, allInArmed: this.allIn });
}
