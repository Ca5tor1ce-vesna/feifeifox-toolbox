/** 星神★阿哈（1511）。愿力上限 8，可溢出到 10，不吃能量恢复效率。 */
import { fmt } from "../format.ts";
import { kitOf } from "../modules/elation.ts";
import type { EnergyGain, KitContext } from "../types.ts";
import { Kit } from "./base.ts";
import type { PearlKit } from "./pearl.ts";

const WISHPOWER_MAX = 10;

/** 专武《当第一声「阿哈」响起》。 */
export const SIG_LC = "23065";

export class AhaKit extends Kit {
  readonly id = "1511";
  readonly elationNumber = 0;
  readonly castsLast = true;
  readonly ascensionTrace = "欢愉万相★无中生有";
  huanyu = 0;
  trace2Used = false;
  sigLcCooldown = 0;
  lingshiSlot: number | null = null;
  lingshiPrefer = 0;
  private techniqueExtra = false;

  protected setup(): void {
    this.lingshiPrefer = this.engine.resolveTarget(this.self, 0);
    this.engine.on("turnStart", ({ unit }) => {
      if (this.lingshiSlot === null || unit.slot !== this.lingshiSlot) return;
      this.engine.record("note", unit, "【「欢愉」令使】回合开始", { details: ["星神★阿哈愿力 +1"] });
      this.gainWishpower(1);
    });
  }

  isAscended = (): boolean => this.huanyu > 0;

  gainWishpower(amount: number): void {
    if (amount <= 0) return;
    this.self.energy = Math.min(WISHPOWER_MAX, this.self.energy + amount);
    this.self.energyTotal += amount;
    this.engine.maybeUltimate(this.self);
  }

  gainEnergy(_context: KitContext, gain: EnergyGain): void {
    this.gainWishpower(gain.amount);
  }

  onPunchline40 = (): void => {
    this.engine.record("note", this.self, "天赋：笑点首达 40", { details: ["愿力 +1", "全队暴伤 +40%，3 回合（伤害不模拟）", "【阿哈时刻】结束后可再次触发"] });
    this.gainWishpower(1);
    // 天赋 10 级 #9 = 0.4。15 级是 50%，这里按用户指定的 40%。
    this.engine.notes.push("笑点首达 40：星神★阿哈 +1 愿力，全队暴伤 +40%（3 回合，本工具不模拟伤害）");
  };

  /** 行迹 2【戏中人的异想国】：受队友治疗或护盾 +1 愿力，每个终结技周期 1 次。 */
  onHealOrShield = (label: string): void => {
    if (this.trace2Used) return;
    this.trace2Used = true;
    this.engine.record("note", this.self, "戏中人的异想国", { details: [`${label} → 愿力 +1`] });
    this.gainWishpower(1);
  };

  onTechnique({ engine, self }: KitContext): void {
    engine.record("tech", self, "秘技《ABRACADABRA！》", { details: ["【阿哈时刻】获得 1 个计入 20 笑点的额外回合"] });
    this.techniqueExtra = true;
  }

  /** 秘技给的额外回合等全部秘技结算完再走，更接近进战顺序。 */
  onTechniqueDone({ engine }: KitContext): void {
    if (!this.techniqueExtra) return;
    this.el.doAha(true, 20);
    // 绯英 + 真珠同队：这次额外回合会把进战那一层【艺术壁垒】消耗掉，此后按真珠开大挂层、美学底本开大消耗循环。
    const pearl = engine.kitOf<PearlKit>("1503");
    if (engine.findUnit("1505") && pearl) pearl.fireBarrier("绯英同队：阿哈秘技的【阿哈时刻】额外回合之后消耗掉进战那一层");
  }

  onOpeningEnd({ engine, self }: KitContext): void {
    const cfg = this.el.cfg;
    if (cfg.trace3Advance) {
      engine.record("note", self, "行迹3【盒中蕴藏的世界】", { details: ["进战自身拉条 30%"] });
      engine.advance(self, 30);
    }
    if (self.eidolon >= 1 && cfg.e1Wishpower > 0) {
      engine.record("note", self, "E1 开局回能", { details: [`愿力 +${fmt(cfg.e1Wishpower, 0)}`] });
      this.gainWishpower(cfg.e1Wishpower);
    }
    if (self.initialSpeed >= 150) self.notes.push("实战速度 ≥ 150：欢愉度 +150%");
    else if (self.initialSpeed >= 125) self.notes.push("实战速度 ≥ 125：欢愉度 +120%");
    if (self.notes.length > 0) engine.record("note", self, "行迹3 速度阈值", { details: [...self.notes] });
  }

  onTurnStart({ engine, self }: KitContext): void {
    if (this.huanyu > 0) {
      this.huanyu -= 1;
      if (this.huanyu === 0) engine.record("note", self, "【欢愉万相】结束");
    }
    if (this.sigLcCooldown > 0) this.sigLcCooldown -= 1;
  }

  protected basic(extra: boolean): void {
    const { engine, self } = this;
    // 星神★阿哈的普攻是 +1 愿力，不是标准能量表上的 +20。
    engine.record("basic", self, `${self.name} 的普攻`, { details: ["愿力 +1"], extra });
    this.gainWishpower(1);
    engine.attack(self, "basic", extra);
  }

  protected skill(extra: boolean): void {
    const { engine, self } = this;
    const details: string[] = [];
    // 施放时再取目标：逐动改目标能让这一动指定别人。【「欢愉」令使】持续到切换下一个目标（4.6.54 版本资料）。
    const target = engine.unitAt(engine.resolveTarget(self, this.lingshiPrefer));
    engine.targetAlly(self, target, "战技");
    if (target && this.lingshiSlot !== target.slot) {
      const previous = engine.unitAt(this.lingshiSlot);
      this.lingshiSlot = target.slot;
      details.push(previous
        ? `【「欢愉」令使】从 ${previous.name} 换到 ${target.name}（欢愉度 +20%）`
        : `指定 ${target.name} 为【「欢愉」令使】（欢愉度 +20%）`);
    }
    if (self.equip.hasSigLc && this.sigLcCooldown <= 0) {
      this.sigLcCooldown = 2;
      // 页面上明确选了专武就按叠影取笑点（#2）；没选光锥时按设置里的数值（默认叠 1 的 10）。
      const worn = self.gear?.lightcone;
      const punchline = worn?.id === SIG_LC && worn.active ? worn.params[1] : this.el.cfg.sigLcPunchline;
      this.el.gainPunchline(punchline);
      details.push(`专武：笑点 +${fmt(punchline, 0)}`);
    }
    details.push("愿力 +1");
    engine.record("skill", self, `${self.name} 的战技`, { details, extra });
    this.gainWishpower(1);
    self.followUps += 1;
    engine.record("fua", self, "此乃令使，阿哈认证™·量子欢愉追击", { details: ["算队友攻击（砂金•戏浪天赋/纵享惊涛）"], extra });
    engine.attack(self, "fua", extra);
  }

  elationDetails = (): string[] => [];

  onElationCast = (): void => {
    this.engine.record("note", this.self, "自身动作回能", { details: ["愿力 +1"] });
    this.gainWishpower(1);
  };

  payUltimate({ self }: KitContext) {
    self.energy = Math.max(0, self.energy - 8);
    return { details: ["消耗 8 愿力"] };
  }

  onUltimate({ engine, self }: KitContext): void {
    const el = this.el;
    this.trace2Used = false;
    const details: string[] = [];
    // E6：首次终结技使阿哈行动提前 100% 并获得 100 笑点。之后每次仍按设定的拉条。
    if (self.eidolon >= 6 && self.ultimates === 1) {
      el.advanceAha(100);
      el.gainPunchline(100);
      details.push("E6 首次终结技：【阿哈时刻】拉条 100% + 笑点 +100");
    } else {
      el.advanceAha(el.cfg.ultAdvanceAha);
      details.push(`【阿哈时刻】拉条 ${fmt(el.cfg.ultAdvanceAha, 0)}%`);
    }
    engine.record("note", self, "啊哈！宇宙笑点大爆炸", { details });
    this.huanyu = 3;
    engine.notes.push("星神★阿哈进入【欢愉万相】3 回合（笑点升格爽点，阿哈时刻结束返还 10%）");
    this.noteAscensionTraces();
    const sand = engine.kitOf<Kit & { sanduActive(): boolean; sanduPct(): number }>("1513");
    if (sand?.sanduActive()) {
      engine.notes.push(`三赌牌局生效：全队速度 +${fmt(sand.sanduPct(), 0)}%（固有行迹【欢愉万相★三赌牌局】${el.ascensionLevel()}级）`);
    }
    engine.attack(self, "ultimate");
  }

  /** 各欢愉角色的固有行迹在【欢愉万相】开始时记一笔，数值效果在对应结算里。 */
  private noteAscensionTraces(): void {
    const level = this.self.eidolon >= 2 ? 2 : 1;
    const crit = level === 2 ? 20 : 12;
    const defense = level === 2 ? 60 : 30;
    this.engine.notes.push(
      `固有行迹【欢愉万相★无中生有】${level}级：返还消耗笑点的 10%，暴击率 +${crit}%，无视防御 ${defense}%`
      + "（伤害不模拟；笑点与好活当赏改称爽点与绝活共赏，不另做强化）",
    );
    for (const unit of this.engine.units) {
      const text = kitOf(unit)?.ascensionNote?.(level);
      if (text) this.engine.notes.push(text);
    }
  }

  mechanics = () => ({
    wishpower: this.self.energy,
    wishpowerTotal: this.self.energyTotal,
    huanyuWanxiangTurns: this.huanyu,
    trace2Used: this.trace2Used,
    lingshiSlot: this.lingshiSlot,
  });
}
