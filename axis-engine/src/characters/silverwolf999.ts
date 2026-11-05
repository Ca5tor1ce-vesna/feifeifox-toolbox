/** 银狼LV.999（1506）。隐藏分 = 全队获得的笑点；基础合计上限 300，升格后 360。 */
import { EPS } from "../engine.ts";
import { fmt } from "../format.ts";
import type { HaohuoGrant } from "../modules/elation.ts";
import type { ActContext, EnergyGain, KitContext } from "../types.ts";
import { Kit } from "./base.ts";

const WOLF_LC_PUNCHLINE = 20;

export class SilverWolf999Kit extends Kit {
  readonly id = "1506";
  readonly elationNumber = 999;
  readonly ascensionTrace = "欢愉万相★全息幻象";
  readonly ascensionNote = (level: 1 | 2): string => level === 1
    ? "银狼固有行迹【欢愉万相★全息幻象】生效：隐藏分可溢出至 360，暴击伤害 +40%；获得好活当赏时隐藏分 +该次的 20%"
    : "银狼固有行迹【欢愉万相★全息幻象】2级：隐藏分可溢出至 999，暴击伤害 +40%；获得好活当赏时隐藏分 +该次的 40%";
  /** 【无敌玩家】剩余强化普攻次数，期间不能开大。 */
  invincible = 0;
  /** 超出 60 的隐藏分，不触发终结技。 */
  overflow = 0;
  /** E2：本次【无敌玩家】里隐藏分累计提高了多少（含进入时已有的），每 120 点给 1 个额外回合。 */
  e2Score = 0;
  e2Granted = 0;
  /** E2 已达成、等这一动结束再放的额外回合。 */
  e2Pending = 0;
  private e2Running = false;

  readonly enemyDependent = ["E2 进入【无敌玩家】后自身增益延长 1 回合"];

  protected setup(): void {
    // 隐藏分多半在别人的行动里涨，额外回合等那一动结束再放，不插进别人行动的中间。
    // 【阿哈时刻】和开大不算行动，这时攒下的等这一步结算完再放。
    this.engine.on("actionDone", () => this.releaseE2Turns());
    this.engine.on("stepDone", () => this.releaseE2Turns());
    // 隐藏分合计 = 能开大的 60 点 + 溢出部分，页面上那一列显示这个。
    this.engine.addResourceView((unit) => (unit === this.self ? { hiddenScore: this.self.energy + this.overflow } : {}));
  }

  canUltimate(): boolean {
    return this.invincible <= 0;
  }

  gainEnergy({ engine, self }: KitContext, { amount }: EnergyGain): void {
    const level = this.el.ascensionLevel();
    const totalCap = level === 2 ? 999 : level === 1 ? 360 : self.maxEnergy + 240;
    const room = Math.max(0, totalCap - (self.energy + this.overflow));
    const applied = Math.min(amount, room);
    const intoMeter = Math.min(Math.max(0, self.maxEnergy - self.energy), applied);
    const spill = applied - intoMeter;
    self.energy += intoMeter;
    this.overflow += spill;
    self.energyTotal += applied;
    if (this.invincible > 0) this.countE2(applied);
    if (spill > EPS) engine.record("note", self, "隐藏分溢出", { details: [`隐藏分溢出 +${fmt(spill)}（合计上限 ${fmt(totalCap, 0)}）`] });
    if (amount - applied > EPS) engine.record("note", self, "隐藏分溢出", { details: [`超出 ${fmt(totalCap, 0)} 的隐藏分不再计入`] });
    engine.maybeUltimate(self);
  }

  onPunchlineGain = (amount: number): void => {
    this.engine.gainEnergy(this.self, amount, { fixed: true, reason: "隐藏分·笑点同步" });
  };

  onHaohuo = ({ applied }: HaohuoGrant): void => {
    const level = this.el.ascensionLevel();
    if (!level || applied <= EPS) return;
    const pct = level === 2 ? 40 : 20;
    const bonus = (applied * pct) / 100;
    this.engine.record("note", this.self, "欢愉万相★全息幻象", { details: [`好活当赏 ${fmt(applied, 0)} 的 ${pct}% → 隐藏分 +${fmt(bonus)}`] });
    this.engine.gainEnergy(this.self, bonus, { fixed: true, reason: "全息幻象" });
  };

  /** 先打强化普攻（此时仍在【无敌玩家】中，不能开大），再递减、退出后清隐藏分。 */
  act(context: ActContext): void {
    if (this.invincible > 0) {
      const { engine, self } = this;
      engine.record("enhanced_basic", self, `${self.name} 的强化普攻（无敌玩家）`, { details: ["笑点 +5"], extra: context.extra });
      this.el.gainPunchline(5);
      engine.attack(self, "enhanced_basic", context.extra);
      this.invincible -= 1;
      if (this.invincible === 0) this.exitInvincible();
      return;
    }
    super.act(context);
  }

  /**
   * E2（4.6.54 版本资料）：「本次【无敌玩家】状态下每使【隐藏分】提高 120 点（含初始【隐藏分】），
   * 获得 1 个额外回合并恢复 1 次强化普攻的可施放次数。」次数当场补上，免得这一下正好是最后一次强化普攻时先退出了状态。
   */
  private countE2(amount: number): void {
    if (this.self.eidolon < 2 || amount <= EPS) return;
    this.e2Score += amount;
    const due = Math.floor((this.e2Score + EPS) / 120) - this.e2Granted;
    if (due <= 0) return;
    this.e2Granted += due;
    this.e2Pending += due;
    this.invincible += due;
    this.engine.record("note", this.self, "E2：隐藏分每 120 点", {
      details: [`本次【无敌玩家】隐藏分累计 ${fmt(this.e2Score)}`, `额外回合 +${due}，强化普攻次数 +${due}`],
    });
  }

  private releaseE2Turns(): void {
    if (this.e2Running) return;
    this.e2Running = true;
    try {
      while (this.e2Pending > 0) {
        this.e2Pending -= 1;
        this.engine.extraTurn(this.self, "E2：【无敌玩家】额外回合");
      }
    } finally {
      this.e2Running = false;
    }
  }

  /** 退出【无敌玩家】：清空隐藏分，E1 保留 20%。 */
  private exitInvincible(): void {
    const { engine, self } = this;
    const total = self.energy + this.overflow;
    const kept = self.eidolon >= 1 ? total * 0.2 : 0;
    self.energy = Math.min(self.maxEnergy, kept);
    this.overflow = this.el.huanyuActive() ? Math.max(0, kept - self.maxEnergy) : 0;
    engine.record("note", self, "退出【无敌玩家】", { details: [`隐藏分清空${self.eidolon < 1 ? "" : "（E1 保留 20%）"}`] });
  }

  protected skill(extra: boolean): void {
    const { engine, self } = this;
    engine.record("skill", self, `${self.name} 的战技`, { details: ["笑点 +5", "隐藏分同步全队笑点"], extra });
    this.el.gainPunchline(5);
    engine.attack(self, "skill", extra);
  }

  elationDetails = (): string[] => [];

  onElationCast = (): void => {};

  beforeElationCommon = (): void => {
    const { engine, self, el } = this;
    engine.record("note", self, "隐藏分 +15", { details: [`${self.name} 施放欢愉技`] });
    engine.gainEnergy(self, 15, { fixed: true, reason: "欢愉技" });
    // 行迹【真结局】：欢愉技计入笑点 ≥20 / ≥40 各 +20。
    const counted = Math.max(0, el.punchline);
    if (counted >= 20 - EPS) engine.gainEnergy(self, 20, { fixed: true, reason: "真结局" });
    if (counted >= 40 - EPS) engine.gainEnergy(self, 20, { fixed: true, reason: "真结局" });
  };

  /** 官方：无敌玩家期间无法开大，隐藏分在退出【无敌玩家】时才清空。 */
  payUltimate() {
    return { details: ["【无敌玩家】期间隐藏分不清空"] };
  }

  onUltimate({ engine, self }: KitContext): void {
    engine.record("note", self, "无敌玩家，启动！", { details: ["自身拉条 100%", "【无敌玩家】：接下来 3 次强化普攻"] });
    this.invincible = 3;
    this.e2Score = 0;
    this.e2Granted = 0;
    if (self.eidolon >= 2) this.countE2(self.energy + this.overflow);
    engine.advance(self, 100, { selfSource: true });
    // 行迹【隐藏关卡】：进入【无敌玩家】+20 隐藏分。
    engine.record("note", self, "隐藏关卡", { details: ["进入【无敌玩家】：隐藏分 +20"] });
    engine.gainEnergy(self, 20, { fixed: true, reason: "隐藏关卡" });
    // 专武《欢迎来到银河城》：对自身开大获得 20 笑点（同步转换为隐藏分）。
    if (self.equip.hasWolfLc) {
      engine.record("note", self, "欢迎来到银河城", { details: ["对自身开大：笑点 +20 → 隐藏分同步"] });
      this.el.gainPunchline(WOLF_LC_PUNCHLINE);
    }
  }

  mechanics = () => ({ invincibleTurns: this.invincible, hiddenOverflow: this.overflow });
}
