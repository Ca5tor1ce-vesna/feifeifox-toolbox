/**
 * 变身、忆灵和召唤物。依据 4.6 正服版本资料。
 * 引擎不模拟生命值、敌方和战技点，相关效果列进 notSimulated，结果里会提示。
 * 文案没写清的时序（已在场时重复召唤、衣匠速度是否随阿格莱雅变化）按最直接的读法，待实测。
 */
import { HimekoNovaKit } from "./himeko-nova.ts";
import { fmt } from "../format.ts";
import type { ActContext, CharacterKit, KitContext } from "../types.ts";
import { DIST_BASE, type SummonActor, type Unit } from "../unit.ts";
import type { SkillPoints } from "../modules/skill-points.ts";
import { StatefulKit } from "./stateful-roster.ts";

abstract class SummonKit extends StatefulKit {
  /** 召唤物或忆灵的一次攻击，回能归主人。fua 是文案写明的追加攻击，其余算忆灵技。 */
  protected summonAttack(name: string, label: string, energy: number, options: { fua?: boolean; details?: string[] } = {}): void {
    const { engine, self } = this;
    if (options.fua) self.followUps += 1;
    const kind = options.fua ? "fua" : "memosprite";
    engine.record(kind, self, label, { kind: "summon", name, details: options.details });
    engine.gainEnergy(self, energy, { reason: label });
    engine.attack(self, kind);
  }

  /** 能量不足时补到上限的一定比例（战斗开始或结界解除）。 */
  protected topUp(ratio: number, label: string): void {
    const target = this.self.maxEnergy * ratio;
    if (this.self.energy >= target) return;
    this.note(label, `能量补到 ${Math.round(ratio * 100)}%`);
    this.engine.gainEnergy(this.self, target - this.self.energy, { fixed: true, reason: label });
  }

  protected removeBuff(label: string): void {
    this.self.buffs = this.self.buffs.filter((buff) => buff.label !== label);
  }
}

/** 能存超过上限的能量，开大时溢出部分先留出来，放完再恢复。 */
abstract class OverflowKit extends SummonKit {
  private restore = 0;

  protected allowOverflow(amount: number): void {
    this.self.energyCap = this.self.maxEnergy + amount;
  }

  payUltimate({ self }: KitContext) {
    this.restore = Math.max(0, self.energy - self.maxEnergy);
    self.energy = Math.max(0, self.energy - this.restore - self.ultCost);
    return this.restore > 0 ? { details: [`溢出能量 ${this.restore} 开大后恢复`] } : {};
  }

  onUltimate(): void {
    const amount = this.restore;
    this.restore = 0;
    this.engine.gainEnergy(this.self, amount, { fixed: true, reason: "溢出恢复" });
  }
}

/** 景元：神君 60 速 3 段，每多 1 段速度 +10，行动后恢复。 */
class JingYuanKit extends SummonKit {
  private hits = 3;

  constructor() {
    super({ id: "1204", rules: [{ on: "battleStart", do: (k) => k.gain("行迹【绸缪】", 15) }] });
  }

  protected setup(): void {
    this.engine.addActor({
      name: "【神君】",
      speed: () => 60 + 10 * (this.hits - 3),
      onTurn: () => {
        const energy = this.self.eidolon >= 4 ? 2 * this.hits : 0;
        this.summonAttack("【神君】", "【神君】追加攻击", energy, { fua: true, details: [`${this.hits} 段`] });
        this.hits = 3;
      },
    });
  }

  private addHits(amount: number): void {
    this.hits = Math.min(10, this.hits + amount);
  }

  onTechnique(): void {
    this.addHits(3);
  }

  afterAct({ kind }: ActContext): void {
    if (kind === "skill") this.addHits(2);
  }

  onUltimate(): void {
    this.addHits(3);
  }
}

/** 托帕：假设我方的攻击都打在【负债证明】目标上。追加攻击拉账账 50%。 */
class TopazKit extends SummonKit {
  private numby!: SummonActor;
  private stonks = 0;
  private bonus = false;

  constructor() {
    super({ id: "1112", notSimulated: ["假设我方都攻击【负债证明】目标"] });
  }

  protected setup(): void {
    this.numby = this.engine.addActor({ name: "账账", speed: () => 80, onTurn: () => this.numbyAttack(true) });
    this.engine.on("attack", ({ kind }) => {
      const direct = ["basic", "skill", "enhanced_basic", "ultimate"].includes(kind);
      if (kind === "fua" || (this.stonks > 0 && direct)) this.engine.advance(this.numby, 50);
    });
  }

  private numbyAttack(ownTurn: boolean): void {
    if (ownTurn && this.self.eidolon >= 4) this.advanceSelf("E4", 20);
    const boosted = this.stonks > 0;
    if (boosted) this.stonks -= 1;
    this.summonAttack("账账", "账账追加攻击", boosted ? 10 : 0, { fua: true, details: boosted ? ["【涨幅惊人！】额外回能 10"] : [] });
    if (ownTurn && this.self.eidolon >= 2) this.gain("E2", 5);
    if (this.bonus) {
      this.bonus = false;
      this.gain("秘技", 60);
    }
  }

  onTechnique(): void {
    this.bonus = true;
  }

  afterAct({ kind }: ActContext): void {
    if (kind === "skill") this.numbyAttack(false);
  }

  onUltimate(): void {
    this.stonks = this.self.eidolon >= 6 ? 3 : 2;
  }
}

/** 丹恒•腾荒：战技定【同袍】并召唤 165 速龙灵。默认放一次战技，之后打普攻。 */
class DanHengPermansorKit extends SummonKit {
  private comrade: Unit | null = null;
  private dragon: SummonActor | null = null;

  constructor() {
    super({ id: "1414", rules: [{ on: "battleStart", do: (k) => k.advanceSelf("行迹【葳蕤】", 40) }] });
  }

  protected setup(): void {
    this.engine.on("attack", ({ unit }) => {
      if (unit !== this.comrade) return;
      this.engine.gainEnergy(this.self, 6, { reason: "行迹【葳蕤】" });
      if (this.dragon) this.engine.advance(this.dragon, 15);
    });
  }

  private bindComrade(): void {
    this.comrade = this.targeted("战技") ?? this.self;
    if (this.dragon) return;
    this.dragon = this.engine.addActor({
      name: "【龙灵】",
      speed: () => 165,
      onTurn: () => {
        this.engine.record("note", this.self, "【龙灵】行动", { kind: "summon", name: "【龙灵】", details: ["全队护盾"] });
        this.healOrShield("【龙灵】护盾");
      },
    });
  }

  advanceDragon(): void {
    if (this.dragon) this.engine.advance(this.dragon, 100);
  }

  onTechnique(): void {
    this.bindComrade();
    this.gain("秘技：自动施放战技", this.self.energyGains.skill);
  }

  act({ kind, extra }: ActContext): void {
    const wantsSkill = kind === "skill" && (this.comrade === null || this.isScripted());
    this.engine.defaultAct(this.self, wantsSkill ? "skill" : "basic", extra);
    if (wantsSkill) this.bindComrade();
  }

  onUltimate(): void {
    if (this.self.eidolon >= 2) this.advanceDragon();
  }
}

/** 千冶•刃：开大展开结界，70 速倒计时结束。溢出 80。第一次开大本身不造成伤害。 */
class IncineratorBladeKit extends OverflowKit {
  private countdown: SummonActor | null = null;
  private charge = 0;

  constructor() {
    super({ id: "1507", notSimulated: ["受到攻击积攒充能（行迹【千锻魂】）", "E6 受到伤害或消耗生命积攒充能", "假设生命值足够施放战技和触发额外战技"] });
  }

  protected setup(): void {
    this.allowOverflow(80);
    this.engine.on("attack", () => {
      if (!this.countdown) return;
      this.charge += 1;
      const need = this.self.eidolon >= 2 ? 7 : 9;
      if (this.charge < need) return;
      this.charge -= need;
      // 天赋 Lv10 回 25，E3 Lv12 27（以前取了 Lv15 的 30）。
      this.engine.gainEnergy(this.self, this.self.eidolon >= 3 ? 27 : 25, { reason: "天赋【因果尽偿】" });
      this.followUp("天赋：额外施放战技", this.self.energyGains.skill);
      if (this.self.eidolon >= 1 && this.countdown) this.engine.delay(this.countdown, 15);
    });
  }

  onBattleStart(): void {
    this.topUp(0.75, "行迹【百炼骨】");
  }

  act({ kind, extra }: ActContext): void {
    if (!this.countdown) this.engine.defaultAct(this.self, "basic", extra);
    else if (kind === "skill") this.engine.defaultAct(this.self, "skill", extra);
    else this.enhanced("淬锋，断魄", this.self.energyGains.basic, extra);
  }

  onUltimate(): void {
    super.onUltimate();
    if (this.countdown) {
      this.engine.attack(this.self, "ultimate");
      return;
    }
    this.countdown = this.engine.addActor({
      name: "【无量忿怒】倒计时",
      role: "countdown",
      speed: () => 70,
      onTurn: (actor) => {
        this.engine.record("note", this.self, "结界解除，退出【无量忿怒】", { kind: "summon", name: actor.name });
        this.engine.removeActor(actor);
        this.countdown = null;
        this.topUp(0.75, "行迹【百炼骨】");
      },
    });
  }
}

/**
 * 万敌：按损失生命积攒充能。这里只计入他自己消耗的部分，受击实际会更快。
 * 生命按百分比算，进入【血仇】时生命上限提高造成的比例变化不计。
 */
class MydeiKit extends SummonKit {
  charge = 0;
  private hp = 100;
  private blood = false;
  private casting = false;

  constructor() {
    super({ id: "1404", notSimulated: ["受到敌方攻击损失生命积攒充能，实际进入【血仇】会比轴上早"] });
  }

  private lose(ratio: number): void {
    const loss = this.hp * ratio;
    this.hp = Math.max(1, this.hp - loss);
    this.addCharge(loss);
  }

  private addCharge(amount: number): void {
    if (this.casting) return;
    this.charge = Math.min(200, this.charge + amount);
    if (!this.blood && this.charge >= 100) {
      this.charge -= 100;
      this.enterBlood();
    }
    if (this.blood && this.charge >= this.godCost()) {
      this.charge -= this.godCost();
      this.engine.extraTurn(this.self, "【血仇】：充能满，额外回合", { before: () => { this.casting = true; }, after: () => { this.casting = false; } });
    }
  }

  private enterBlood(): void {
    this.blood = true;
    // 天赋 Lv10 回复 25% 生命，E5 Lv12 27%（以前取了 Lv15 的 30%）。
    this.hp = Math.min(100, this.hp + (this.self.eidolon >= 5 ? 27 : 25));
    this.note("进入【血仇】", "行动提前 100%");
    this.engine.advance(this.self, 100, { selfSource: true });
  }

  private godCost(): number {
    return this.self.eidolon >= 6 ? 100 : 150;
  }

  /** 昔涟的【献予「纷争」之诗】：在【血仇】里自动放一次不耗充能的弑神登神，否则提前 100%。 */
  receivePoem(): void {
    if (this.blood) {
      this.casting = true;
      this.enhanced("弑神登神", 10, true, "skill");
      this.casting = false;
    } else {
      this.advanceSelf("【献予「纷争」之诗】", 100);
    }
  }

  onTechnique(): void {
    this.addCharge(50);
  }

  onBattleStart(): void {
    if (this.self.eidolon >= 6) this.enterBlood();
  }

  act({ kind, extra }: ActContext): void {
    if (this.casting) {
      this.enhanced("弑神登神", 10, true, "skill");
    } else if (this.blood) {
      this.enhanced("弑王成王", 30, extra, "skill");
      this.lose(0.35);
    } else {
      this.engine.defaultAct(this.self, kind, extra);
      if (kind === "skill") this.lose(0.5);
    }
  }

  onUltimate(): void {
    // 终结技 Lv10 回复 20% 生命，E5 Lv12 21%（以前取了 Lv15 的 22.5%）。
    this.hp = Math.min(100, this.hp + (this.self.eidolon >= 5 ? 21 : 20));
    this.addCharge(20);
  }
}

/** Saber：【炉心共鸣】够回满时战技消耗全部并立即行动。溢出 120（E6 200）。 */
class SaberKit extends OverflowKit {
  resonance = 1;
  private mana = true;
  private enhancedNext = false;

  constructor() {
    super({ id: "1014" });
  }

  protected setup(): void {
    this.allowOverflow(this.self.eidolon >= 6 ? 200 : 120);
    // 任意目标开大都 +3，包括自己。
    this.engine.on("ultimate", () => { this.resonance += 3; });
  }

  onTechnique(): void {
    this.resonance += 2;
  }

  onBattleStart(): void {
    this.topUp(0.6, "行迹【湖之祝福】");
  }

  act({ kind, extra }: ActContext): void {
    if (this.enhancedNext) {
      this.enhancedNext = false;
      this.enhanced("解放的金色王权", 30, extra);
      this.resonance += 2;
      this.mana = true;
    } else {
      this.engine.defaultAct(this.self, kind, extra);
      if (kind === "skill") this.resolveSkill();
    }
    if (this.self.eidolon >= 1) this.resonance += 1;
  }

  private resolveSkill(): void {
    const restored = this.resonance * 8;
    if (this.resonance <= 0 || this.self.energy + restored < this.self.maxEnergy) {
      this.resonance += 3;
      return;
    }
    this.resonance = 0;
    if (this.mana) {
      this.mana = false;
      this.note("行迹【龙之骑士】", "立即行动");
      this.engine.advance(this.self, 100, { selfSource: true });
    }
    this.engine.gainEnergy(this.self, restored, { fixed: true, reason: "天赋【龙之炉心】" });
  }

  onUltimate(): void {
    super.onUltimate();
    this.enhancedNext = true;
    // 首次开大触发，之后每再放 3 次触发一次：第 1、4、7 次。
    if (this.self.eidolon >= 6 && (this.self.ultimates - 1) % 3 === 0) this.gain("E6", 300, { fixed: true });
  }
}

/** 吉尔伽美什：【兴致】每点速度 +10%。和 Saber 累计 8 次攻击连携。 */
class GilgameshKit extends SummonKit {
  private zest = 0;
  private inspired = false;
  private strikes = 0;
  private joining = false;

  constructor() {
    super({ id: "1509" });
  }

  private addZest(amount: number): void {
    this.zest += amount;
    if (this.zest >= 10) this.inspired = true;
  }

  protected setup(): void {
    if (this.self.eidolon >= 4) this.self.errBonus += 20;
    this.engine.addSpeedModifier((unit) => (unit === this.self ? { pct: 10 * this.zest } : {}));
    this.engine.on("turnStart", ({ unit }) => {
      if (unit !== this.self) this.addZest(1);
    });
    this.engine.on("summonTurn", ({ actor }) => {
      if (actor.role !== "countdown") this.addZest(1);
    });
    this.engine.on("ultimate", ({ unit }) => {
      if (unit === this.self) return;
      this.addZest(2);
      if (unit.energyType === "standard") {
        this.engine.gainEnergy(this.self, unit.ultCost * 0.3, { fixed: true, reason: "行迹【史诗的源头】" });
      }
    });
    this.engine.on("attack", ({ unit }) => {
      const saber = this.engine.findUnit("1014");
      if (this.joining || (unit !== this.self && unit !== saber)) return;
      this.strikes += 1;
      if (this.strikes >= 8) this.jointAttack(saber);
    });
  }

  private jointAttack(saber: Unit | undefined): void {
    this.strikes = 0;
    this.joining = true;
    this.self.followUps += 1;
    this.engine.record("fua", this.self, "连携追加攻击", { details: ["吉尔伽美什 +3 兴致", "Saber 固定 +120 能量"] });
    this.engine.gainEnergy(this.self, 10, { reason: "连携追加攻击" });
    this.engine.attack(this.self, "fua");
    this.joining = false;
    this.addZest(3);
    if (saber) this.engine.gainEnergy(saber, 120, { fixed: true, reason: "连携追加攻击" });
  }

  onTechnique(): void {
    this.addZest(3);
  }

  onBattleStart(): void {
    if (this.self.eidolon >= 2) this.addZest(5);
  }

  /** 初始自动打普攻；【兴致】首次到 10 后只能施放战技，施放后清空。 */
  act({ extra }: ActContext): void {
    if (!this.inspired) {
      this.engine.defaultAct(this.self, "basic", extra);
      return;
    }
    this.engine.defaultAct(this.self, "skill", extra);
    this.zest = 0;
    if (this.self.eidolon >= 1) this.gain("E1", 40, { fixed: true });
  }

  onUltimate(): void {
    this.addZest(this.self.eidolon >= 2 ? 7 : 2);
  }
}

/** 远坂凛：【宝石能量】≥15 时战技强化。战技点转宝石不模拟，所以实际强化得比轴上勤。 */
class RinKit extends SummonKit {
  gems = 20;
  private shadow = 0;
  /** 终结技「消耗至 2」期间由自身按 ×2 记账，屏蔽天赋的每点 +1。 */
  private suppressGems = false;

  constructor() {
    super({
      id: "1508",
      notSimulated: ["与 Archer 的连携追加攻击"],
      setup: (k) => {
        const kit = k as unknown as RinKit;
        const points = kit.engine.findModule<SkillPoints>("skill-points");
        if (points) kit.wireSkillPoints();
      },
      rules: [{ on: "battleStart", do: (k) => k.speed("行迹【淑女风范】", k.self, "pct", 20, 3) }],
    });
  }

  private get points(): SkillPoints | undefined {
    return this.engine.findModule<SkillPoints>("skill-points");
  }

  /** 天赋：我方单位目标每消耗或恢复 1 点战技点，远坂凛获得 1 点【宝石能量】（4.6.54 版本资料）。 */
  wireSkillPoints(): void {
    this.engine.addResourceView((unit) => (unit === this.self ? { gems: this.gems } : {}));
    this.engine.on("spChanged", ({ unit, amount }) => {
      if (amount === 0 || this.suppressGems) return;
      const delta = Math.abs(amount);
      this.gems += delta;
      this.engine.record("note", this.self, "【宝石能量】", {
        details: [`${unit.name} ${amount > 0 ? "恢复" : "消耗"} ${delta} 点战技点：宝石能量 +${delta}（现有 ${this.gems}）`],
      });
    });
  }

  onTechnique(): void {
    this.gems += 10;
  }

  act({ kind, extra }: ActContext): void {
    const spEnough = (this.points?.sp ?? 0) >= 7;
    if (kind !== "skill" || (this.shadow <= 0 && this.gems < 15 && !spEnough)) {
      this.engine.defaultAct(this.self, kind, extra);
      return;
    }
    if (this.shadow > 0) {
      this.shadow = 0;
    } else {
      const used = this.gems - (this.gems % 3);
      this.gems -= used;
      if (this.self.eidolon >= 1 && used >= 30) this.shadow = used;
    }
    this.enhanced("第二魔法实验", 30, extra, "skill");
    this.speed("行迹【淑女风范】", this.self, "pct", 20, 3);
  }

  onUltimate(): void {
    this.gems += this.self.eidolon >= 6 ? 36 : 12;
    // 终结技：当前战技点大于 2 时消耗至 2，每消耗 1 点获得 2 点【宝石能量】。
    const points = this.points;
    if (points && points.sp > 2) {
      this.suppressGems = true;
      try {
        const used = points.drainTo(this.self, 2, "终结技：消耗战技点至 2");
        this.gems += used * 2;
        this.engine.record("note", this.self, "【宝石能量】", {
          details: [`终结技把战技点消耗至 2：${used} 点 × 2 → 宝石能量 +${used * 2}（现有 ${this.gems}）`],
        });
      } finally {
        this.suppressGems = false;
      }
    }
    if (this.self.eidolon >= 6) this.engine.extraTurn(this.self, "E6：额外回合");
  }
}

/** 流萤：战技固定回 65% 能量，开大进入完全燃烧。 */
class FireflyKit extends SummonKit {
  private burning: SummonActor | null = null;
  /** E2 触发后要隔一动才能再触发；这一动结束后放的额外回合。 */
  private e2Cooling = false;
  private e2Pending = false;

  constructor() {
    // 强化版（3.4）行迹【α模组-偏时迸发】：击破时「完全燃烧」倒计时延后 10%（每次最多 3 次），要看击破，引擎没有韧性。
    super({ id: "1310", notSimulated: ["强化版：击破时「完全燃烧」倒计时延后（取决于敌方韧性）"] });
  }

  protected setup(): void {
    super.setup();
    // E2：额外回合等这一动结算完再放。
    this.engine.on("actionDone", ({ unit }) => {
      if (unit !== this.self || !this.e2Pending) return;
      this.e2Pending = false;
      this.engine.extraTurn(this.self, "E2：额外回合");
    });
  }

  /**
   * E2：「完全燃烧」下强化普攻、强化战技消灭敌方或击破时，萨姆立即获得 1 个额外回合，1 回合后可再次触发。
   * 试装遗器之前条件按满足算，所以完全燃烧里每隔一动多 1 个额外回合。
   */
  private afterEnhanced(): void {
    if (this.self.eidolon < 2) return;
    if (this.e2Cooling) {
      this.e2Cooling = false;
      return;
    }
    this.e2Cooling = true;
    this.e2Pending = true;
    this.note("E2：消灭或击破（条件按满足算）", "获得 1 个额外回合");
  }

  canUltimate(): boolean {
    return this.burning === null;
  }

  onBattleStart(): void {
    this.topUp(0.5, "天赋【茧式源火中枢】");
  }

  act({ kind, extra }: ActContext): void {
    if (this.burning) {
      if (kind === "skill") this.enhanced("火萤Ⅳ型-死星过载", 0, extra, "skill");
      else this.enhanced("火萤Ⅳ型-底火斩击", 0, extra);
      this.afterEnhanced();
    } else if (kind === "skill") {
      // 战技 Lv10 固定回 60% 能量上限，E3 Lv12 62%（以前取了 Lv15 的 65%）。
      const restore = this.self.eidolon >= 3 ? 0.62 : 0.6;
      this.engine.record("skill", this.self, "指令-天火轰击", { details: [`固定恢复 ${fmt(restore * 100, 0)}% 能量上限`, "下一次行动提前 25%"], extra });
      this.engine.advance(this.self, 25, { selfSource: true });
      this.engine.gainEnergy(this.self, this.self.maxEnergy * restore, { fixed: true, reason: "战技" });
      this.engine.attack(this.self, "skill", extra);
    } else {
      this.engine.defaultAct(this.self, "basic", extra);
    }
  }

  onUltimate(): void {
    // 终结技 Lv10 速度 +60，E5 Lv12 +66（以前取了 Lv15 的 75）。
    const burn = this.self.eidolon >= 5 ? 66 : 60;
    this.engine.addSpeedBuff(this.self, { kind: "flat", value: burn, turns: null, label: "完全燃烧" });
    this.note("进入「完全燃烧」", `行动提前 100%，速度 +${burn}`);
    this.engine.advance(this.self, 100, { selfSource: true });
    this.burning = this.engine.addActor({
      name: "「完全燃烧」倒计时",
      role: "countdown",
      speed: () => 70,
      onTurn: (actor) => {
        this.engine.record("note", this.self, "解除完全燃烧", { kind: "summon", name: actor.name });
        this.engine.removeActor(actor);
        this.burning = null;
        this.removeBuff("完全燃烧");
        this.engine.maybeUltimate(this.self);
      },
    });
  }
}

/**
 * 阿格莱雅：衣匠速度是她局外面板速度的 35%，攻击叠速度。开大进入【至高之姿】，100 速倒计时。
 * 数值按游戏里练得到的技能等级（2026-11-06 改，以前取了资料里的最高一级，练不到）：
 * 衣匠每层 +55 速（忆灵天赋 Lv6，E3 起 Lv7 +57.2）；【至高之姿】每层 +15%（终结技 Lv10，E5 起 Lv12 +16%）。
 * 衣匠和阿格莱雅的局内增益互相独立，所以按开战时的速度（局外面板）算，不跟着她局内的加速变（两个攻略视频的说法）。
 */
class AglaeaKit extends SummonKit {
  private garmaker: SummonActor | null = null;
  private countdown: SummonActor | null = null;
  private stacks = 0;

  constructor() {
    super({ id: "1402", notSimulated: ["衣匠被敌方消灭", "假设我方总能攻击到【间隙织线】目标"] });
  }

  protected setup(): void {
    const perStack = this.self.eidolon >= 5 ? 16 : 15;
    this.engine.addSpeedModifier((unit) => (unit === this.self && this.countdown ? { pct: perStack * this.stacks } : {}));
  }

  /** 衣匠的速度：阿格莱雅局外面板的 35%（开战前没有快照时先用当前速度）+ 层数加速。 */
  private garmakerSpeed(): number {
    const panel = this.self.initialSpeed || this.self.speed();
    return panel * 0.35 + this.stacks * (this.self.eidolon >= 3 ? 57.2 : 55);
  }

  private maxStacks(): number {
    return this.self.eidolon >= 4 ? 7 : 6;
  }

  fillStacks(): void {
    this.stacks = this.maxStacks();
  }

  private addStack(): void {
    this.stacks = Math.min(this.maxStacks(), this.stacks + 1);
  }

  private summon(): void {
    if (this.garmaker) return;
    this.garmaker = this.engine.addActor({
      name: "衣匠",
      role: "memosprite",
      speed: () => this.garmakerSpeed(),
      remDist: 0, // 被召唤时行动提前 100%
      onTurn: () => {
        this.summonAttack("衣匠", "刺纹之陷", 10);
        this.addStack();
      },
    });
    this.engine.setMemosprite(this.self, true);
  }

  private unsummon(): void {
    if (!this.garmaker) return;
    this.engine.removeActor(this.garmaker);
    this.garmaker = null;
    this.stacks = Math.min(1, this.stacks);
    this.gain("衣匠消失", 20);
    this.engine.setMemosprite(this.self, false);
  }

  onTechnique(): void {
    this.gain("秘技", 30);
    this.summon();
  }

  onBattleStart(): void {
    this.topUp(0.5, "行迹【飞驰之阳】");
  }

  /** 默认：衣匠不在场时战技，在场时普攻。 */
  act({ kind, extra }: ActContext): void {
    if (this.countdown) {
      this.enhanced("孤锋千吻", 20, extra);
    } else if (kind === "skill" && (!this.garmaker || this.isScripted())) {
      this.engine.defaultAct(this.self, "skill", extra);
      if (!this.garmaker) {
        this.summon();
        this.engine.advance(this.self, 100, { selfSource: true });
      }
    } else {
      this.engine.defaultAct(this.self, "basic", extra);
    }
    if (this.garmaker && this.self.eidolon >= 4) this.addStack();
  }

  onUltimate(): void {
    this.summon();
    this.note("进入【至高之姿】", "立即行动");
    this.engine.advance(this.self, 100, { selfSource: true });
    if (this.countdown) {
      this.countdown.remDist = DIST_BASE;
      return;
    }
    this.countdown = this.engine.addActor({
      name: "【至高之姿】倒计时",
      role: "countdown",
      speed: () => 100,
      onTurn: (actor) => {
        this.engine.record("note", this.self, "衣匠自毁，解除【至高之姿】", { kind: "summon", name: actor.name });
        this.engine.removeActor(actor);
        this.countdown = null;
        this.unsummon();
      },
    });
  }
}

/** 风堇：小伊卡速度 0，不进行动序列。首次召唤回能 45；已在场时再放战技不算被召唤。 */
class HyacineKit extends SummonKit {
  private summoned = false;
  private clearSky = 0;

  constructor() {
    super({ id: "1409", notSimulated: ["小伊卡消失（生命值不模拟）", "E2 速度提高（我方生命值降低时）"] });
  }

  private summon(): void {
    if (this.summoned) return;
    this.summoned = true;
    this.gain("首次召唤小伊卡", 45);
    this.engine.setMemosprite(this.self, true);
  }

  /** 【雨过天晴】期间施放技能后，小伊卡立即获得额外回合。 */
  private ikarunTurn(): void {
    if (this.clearSky > 0) this.summonAttack("小伊卡", "乌云乌云快走开！", 5);
  }

  onTurnStart(): void {
    if (this.clearSky > 0) this.clearSky -= 1;
  }

  afterAct({ kind }: ActContext): void {
    if (kind === "skill") this.summon();
    this.ikarunTurn();
  }

  onUltimate(): void {
    this.summon();
    this.clearSky = 3;
    this.ikarunTurn();
  }
}

/** 开拓者•记忆：迷迷 130 速。回能累计 10 点 +1% 充能，满充能拉队友 100%。默认召唤后打普攻。 */
class TrailblazerRemembranceKit extends SummonKit {
  charge = 0;
  private mimi: SummonActor | null = null;
  private epic = 0;
  private summonedOnce = false;
  private ready = false;
  private energyPool = 0;
  private cheerUsed = false;

  constructor() {
    super({
      id: "8007",
      notSimulated: ["迷迷消失（生命值不模拟）"],
      rules: [{ on: "battleStart", do: (k) => k.advanceSelf("行迹【追念之权杖】", 30) }],
    });
  }

  protected setup(): void {
    this.engine.on("energyGain", ({ unit, gain }) => {
      if (unit.energyType !== "standard") return;
      this.energyPool += gain;
      const whole = Math.floor(this.energyPool / 10);
      if (whole <= 0) return;
      this.energyPool -= whole * 10;
      this.addCharge(whole);
    });
    // E4（4.6.54 版本资料）：能量上限为 0 的我方目标（用【残梦】【火种】这类特殊资源开大的）主动施放技能时，迷迷 +3% 充能。
    // 「主动施放」按实际放出来的普攻、战技和终结技算，追击不算。
    const e4 = (unit: Unit) => {
      if (this.self.eidolon >= 4 && unit !== this.self && unit.energyType !== "standard") this.addCharge(3);
    };
    this.engine.on("actionDone", ({ unit, casts }) => {
      if (casts.length > 0) e4(unit);
    });
    this.engine.on("ultimate", ({ unit }) => e4(unit));
    this.engine.on("summonTurn", ({ actor }) => {
      if (actor === this.mimi || actor.role !== "memosprite") return;
      if (this.self.eidolon >= 2 && !this.cheerUsed) {
        this.cheerUsed = true;
        this.gain("E2", 8);
      }
    });
  }

  private addCharge(amount: number): void {
    this.charge = Math.min(100, this.charge + amount);
    if (this.charge >= 100 && this.mimi && !this.ready) {
      this.ready = true;
      this.engine.advance(this.mimi, 100, { selfSource: true });
    }
  }

  private mimiTurn(): void {
    const { engine, self } = this;
    if (!this.ready) {
      this.summonAttack("迷迷", "坏人！麻烦！", 10);
      this.addCharge(5);
      return;
    }
    this.ready = false;
    this.charge = 0;
    engine.record("note", self, "我会！帮你！", { kind: "summon", name: "迷迷", details: ["指定队友行动提前 100%"] });
    engine.gainEnergy(self, 10, { reason: "我会！帮你！" });
    const target = this.targeted("忆灵技【我会！帮你！】");
    if (target) engine.advance(target, 100, { source: self });
  }

  private summon(): void {
    if (this.mimi) return;
    this.mimi = this.engine.addActor({ name: "迷迷", role: "memosprite", speed: () => 130, onTurn: () => this.mimiTurn() });
    this.engine.setMemosprite(this.self, true);
    this.addCharge(this.summonedOnce ? 50 : 90);
    this.summonedOnce = true;
  }

  onTurnStart(): void {
    this.cheerUsed = false;
  }

  act({ kind, extra }: ActContext): void {
    if (kind === "skill" && (!this.mimi || this.isScripted())) {
      const present = this.mimi !== null;
      this.engine.defaultAct(this.self, "skill", extra);
      if (present) this.addCharge(10);
      else this.summon();
    } else if (this.epic > 0 && this.mimi) {
      this.epic -= 1;
      this.enhanced("明天，一同写下！", 30, extra);
      this.addCharge(10);
    } else {
      this.engine.defaultAct(this.self, "basic", extra);
    }
  }

  onUltimate(): void {
    this.summon();
    this.addCharge(40);
    this.epic = Math.min(2, this.epic + 1);
  }
}

/** 遐蝶：【新蕊】靠我方掉血累积，引擎算不出，用手动开大。死龙 165 速，3 回合后消失。 */
class CastoriceKit extends SummonKit {
  readonly dataNotice = "【新蕊】靠我方损失生命累积，这里算不出开大时点。默认第 2 动后开大，请按实际调整「第几动后开大」。";
  private dragon: SummonActor | null = null;

  constructor() {
    super({
      id: "1407",
      notSimulated: ["【新蕊】累积（依赖我方生命值）", "死龙生命耗尽提前消失", "假设遐蝶生命值保持在 50% 以上（速度 +40%）"],
      rules: [{ on: "battleStart", do: (k) => k.speed("行迹【倒置的火炬】", k.self, "pct", 40, null) }],
    });
  }

  canUltimate(): boolean {
    return this.dragon === null;
  }

  private summon(): void {
    let turns = 3;
    this.dragon = this.engine.addActor({
      name: "死龙",
      role: "memosprite",
      speed: () => 165,
      remDist: 0,
      onTurn: (actor) => {
        turns -= 1;
        this.summonAttack("死龙", "死龙行动", 0, { details: [`还剩 ${turns} 回合`] });
        if (turns > 0) return;
        this.engine.record("note", this.self, "死龙消失", { kind: "summon", name: "死龙" });
        this.engine.removeActor(actor);
        this.dragon = null;
        this.engine.setMemosprite(this.self, false);
      },
    });
    this.engine.setMemosprite(this.self, true);
  }

  onTechnique(): void {
    this.summon();
  }

  onUltimate(): void {
    this.summon();
    if (this.self.eidolon >= 2) this.advanceSelf("E2", 100);
  }
}

/** 长夜月：长夜 160 速，进战召唤。【忆质】满 16 立即行动施放迷梦，之后消失。 */
class EvernightKit extends SummonKit {
  memory = 0;
  poem = false;
  private night: SummonActor | null = null;
  private armed = true;
  private dark = 0;
  private hastened = false;

  constructor() {
    super({ id: "1413", notSimulated: ["长夜月或长夜生命值降低时获得【忆质】"] });
  }

  protected setup(): void {
    this.engine.on("summonTurn", ({ actor }) => {
      if (actor.role === "memosprite") this.candle();
    });
  }

  /** 行迹【烛火起，烛火熄】：她或我方忆灵施放技能时。 */
  private candle(): void {
    this.engine.gainEnergy(this.self, 5, { reason: "行迹【烛火起，烛火熄】" });
    this.addMemory(1);
  }

  private addMemory(amount: number): void {
    this.memory += amount + (this.self.eidolon >= 2 ? 2 : 0);
    this.checkDream();
  }

  private checkDream(): void {
    if (this.memory < 16 || !this.night || !this.armed) return;
    this.armed = false;
    this.engine.advance(this.night, 100, { selfSource: true });
  }

  private summon(): void {
    if (this.night) return;
    this.night = this.engine.addActor({ name: "长夜", role: "memosprite", speed: () => 160, remDist: 0, onTurn: (actor) => this.nightTurn(actor) });
    this.engine.setMemosprite(this.self, true);
    this.checkDream();
  }

  private nightTurn(actor: SummonActor): void {
    if (this.memory < 16) {
      this.summonAttack("长夜", "追忆，蹁跹，如雨", 20);
      this.addMemory(1);
      return;
    }
    const consumed = this.memory;
    this.summonAttack("长夜", "迷梦，流失，如露", 10, { details: [`消耗 ${consumed} 点【忆质】`] });
    if (this.dark > 0) this.dark -= 1;
    this.memory = 0;
    this.armed = true;
    this.engine.removeActor(actor);
    this.night = null;
    this.engine.setMemosprite(this.self, false);
    this.engine.addSpeedBuff(this.self, { kind: "pct", value: 10 + Math.min(40, consumed), turns: null, label: "与你，再见，无期" });
    this.hastened = true;
    if (this.self.eidolon >= 6) this.addMemory(Math.floor(consumed * 0.3));
  }

  onEntry(): void {
    this.summon();
  }

  onTechnique(): void {
    this.addMemory(1);
  }

  onBattleStart(): void {
    this.gain("行迹【烛火起，烛火熄】", 70);
    this.addMemory(1);
  }

  onTurnStart(): void {
    if (!this.hastened) return;
    this.hastened = false;
    this.removeBuff("与你，再见，无期");
  }

  afterAct({ kind }: ActContext): void {
    this.candle();
    if (kind !== "skill") return;
    this.summon();
    this.addMemory(this.dark > 0 ? 14 : 2);
    if (this.poem) this.addMemory(1);
  }

  onUltimate(): void {
    this.summon();
    this.dark = this.self.eidolon >= 2 ? 4 : 2;
    this.candle();
    if (this.poem) this.addMemory(1);
  }
}

/** 知更鸟•晴歌：气氛 6、12 依次召唤乐手；三人登台进入 Fever，她自己不再行动。 */
class RobinSummerKit extends SummonKit {
  atmosphere = 0;
  members = 0;
  private band: SummonActor | null = null;
  private countdown: SummonActor | null = null;
  private guest: Unit | null = null;
  private guestTurns = 0;
  private bonusUsed = false;

  constructor() {
    super({
      id: "1512",
      notSimulated: ["受到队友治疗或护盾时的【律动】回能", "我方提供治疗或护盾时的气氛值"],
    });
  }

  protected setup(): void {
    this.engine.on("attack", ({ unit, kind }) => {
      let amount = unit === this.guest ? 3 : 1;
      if (this.self.eidolon >= 2 && !this.bonusUsed && kind !== "fua" && kind !== "memosprite") {
        this.bonusUsed = true;
        amount += 2;
      }
      this.addAtmosphere(amount);
    });
    this.engine.on("turnStart", ({ unit }) => {
      this.bonusUsed = false;
      if (unit !== this.guest) return;
      this.guestTurns -= 1;
      if (this.guestTurns <= 0) this.setGuest(null);
    });
    this.engine.on("summonTurn", () => { this.bonusUsed = false; });
  }

  private capacity(): number {
    return this.self.eidolon >= 2 ? 70 : 50;
  }

  addAtmosphere(amount: number): void {
    this.atmosphere = Math.min(this.capacity(), this.atmosphere + amount);
    if (this.members === 1 && this.atmosphere >= 6) this.addMember();
    if (this.members === 2 && this.atmosphere >= 12) this.addMember();
  }

  private addMember(): void {
    this.members += 1;
    this.gain("「晴空乐手」被召唤", 20);
    if (this.members === 3) this.enterFever();
  }

  enterFever(): void {
    const { engine, self } = this;
    if (self.eidolon >= 4) this.atmosphere = Math.min(this.capacity(), this.atmosphere + 12);
    this.note("进入【Fever】", "知更鸟•晴歌不再行动");
    self.paused = true;
    if (self.eidolon >= 6) this.gain("E6", 140, { fixed: true });
    this.band = engine.addActor({
      name: "「晴空乐手」",
      role: "memosprite",
      // 知更鸟•晴歌局外面板速度的 180%，召唤时就定了，她局内吃到的加速不带给乐手（攻略视频：「和战斗内水鸟的速度无关」）。
      speed: () => (self.initialSpeed || self.speed()) * 1.8 * (self.eidolon >= 4 ? 1.2 + this.atmosphere * 0.005 : 1),
      onTurn: () => this.summonAttack("「晴空乐手」", "叽叽啾啾四重奏", 20),
    });
    this.countdown = engine.addActor({
      name: "Fever 倒计时",
      role: "countdown",
      speed: () => 140,
      onTurn: () => {
        this.atmosphere = Math.max(0, this.atmosphere - Math.max(12, this.atmosphere * 0.5));
        if (self.eidolon >= 6) this.gain("E6", 140, { fixed: true });
        if (this.atmosphere <= 0) this.exitFever();
      },
    });
  }

  /** 她在 Fever 期间的行动条停在进入时的位置，退出时从那里提前 50%（待实测）。 */
  private exitFever(): void {
    const { engine, self } = this;
    engine.record("note", self, "退出【Fever】", { details: ["「晴空乐手」消失，行动提前 50%"] });
    if (this.band) engine.removeActor(this.band);
    if (this.countdown) engine.removeActor(this.countdown);
    this.band = null;
    this.countdown = null;
    this.members = 0;
    self.paused = false;
    engine.advance(self, 50);
    engine.setMemosprite(self, false);
  }

  onTechnique(): void {
    this.advanceSelf("秘技", 20);
    this.addAtmosphere(6);
  }

  afterAct({ kind }: ActContext): void {
    if (kind !== "skill") return;
    if (this.members > 0) {
      this.addAtmosphere(6);
      return;
    }
    this.members = 1;
    this.gain("「晴空乐手」被召唤", 20);
    this.engine.setMemosprite(this.self, true);
    this.addAtmosphere(0);
  }

  onUltimate(): void {
    const target = this.targeted("终结技");
    if (!target) return;
    this.advanceUnit("终结技", target, 100);
    // 终结技 Lv10 固定回 20% 能量上限，E5 Lv12 21.6%（以前取了 Lv15 的 24%）。
    this.restoreFor("终结技", target, target.maxEnergy * (this.self.eidolon >= 5 ? 0.216 : 0.2), { fixed: true });
    this.setGuest(target);
    this.guestTurns = 2;
  }

  /** 【特邀嘉宾】只有一个持有者：持有期间不能给其他队友拉条（4.6.54 版本资料），换人或到期时解除。 */
  private setGuest(target: Unit | null): void {
    if (this.guest) this.guest.allyAdvanceBlock = null;
    this.guest = target;
    if (target) target.allyAdvanceBlock = "【特邀嘉宾】";
  }
}

/** 白厄：火种 12 点变身，队友离场。8 个额外回合按基础速度的 60%（E1 66%）。 */
class PhainonKit extends SummonKit {
  private kaos: SummonActor | null = null;
  private left = 0;

  constructor() {
    super({
      id: "1408",
      notSimulated: ["成为敌方技能目标时获得【火种】（不模拟敌方）", "队友「我方全体」的群体技能没给【火种】（只算单体、扩散能选中白厄的技能），实际开大可能比轴上早", "变身期间 E2 额外回合（依赖【毁伤】）", "E1 消灭敌人时的速度继承提高"],
      rules: [
        { on: "technique", do: (k) => {
          for (const unit of k.engine.units) {
            if (unit !== k.self) k.restoreFor("秘技", unit, 25);
          }
        } },
        { on: "battleStart", do: (k) => k.gain("行迹【行向世界终点】", k.self.eidolon >= 6 ? 6 : 1) },
        { on: "skill", do: (k) => k.gain("战技", 2) },
      ],
    });
  }

  protected setup(): void {
    // 【火种】可溢出 3 点，E6 不再有上限。溢出部分放完大后留着，变身结束时还在。
    this.self.energyCap = this.self.eidolon >= 6 ? Infinity : this.self.maxEnergy + 3;
    // 天赋（4.6.54 版本资料）：成为其他目标的技能目标时 +1【火种】。队友这边：单体、扩散圈能选到白厄的战技、终结技、忆灵技都算，
    // 只能选自己的群体增益（驭空、阮•梅、缇宝、知更鸟的战技等）不算（攻略视频 BV1pp3tzhERW 2:47）。
    this.engine.on("allyTargeted", ({ caster, target, ability }) => {
      if (target === this.self) this.gain(`天赋：成为${caster.name}的${ability}目标`, 1);
    });
  }

  canUltimate(): boolean {
    return this.kaos === null;
  }

  private setBench(paused: boolean): void {
    for (const unit of this.engine.units) unit.paused = paused;
    for (const actor of this.engine.summons) {
      if (actor !== this.kaos) actor.paused = paused;
    }
  }

  onUltimate(): void {
    const { engine, self } = this;
    this.left = 8;
    this.kaos = engine.addActor({
      name: "卡厄斯兰那",
      speed: () => self.baseSpd * (self.eidolon >= 1 ? 0.66 : 0.6),
      onTurn: (actor) => this.kaosTurn(actor),
    });
    this.setBench(true);
  }

  private kaosTurn(actor: SummonActor): void {
    const { engine, self } = this;
    this.left -= 1;
    engine.record("skill", self, this.left === 0 ? "最后一击" : "卡厄斯兰那的额外回合", {
      kind: "summon",
      name: "卡厄斯兰那",
      details: [`还剩 ${this.left} 个额外回合`],
    });
    engine.attack(self, "skill");
    if (this.left > 0) return;
    engine.removeActor(actor);
    this.kaos = null;
    this.setBench(false);
    for (const unit of engine.units) engine.addSpeedBuff(unit, { kind: "pct", value: 15, turns: 1, label: "变身结束" });
    this.gain("行迹【行向世界终点】", 3);
  }
}

/** 黄金裔。昔涟的行迹按除她之外的黄金裔和记忆命途人数给开局【追忆】。 */
const CHRYSOS_HEIRS = new Set(["1402", "1403", "1404", "1405", "1406", "1407", "1408", "1409", "1410", "1412", "1413", "1414"]);

/** 昔涟：【追忆】24 点开大，之后 12 点。队友行动消耗【未来】回 1 点，她行动后才补。 */
class CyreneKit extends SummonKit {
  private ascended = false;
  private future = new Set<Unit>();
  private story = 0;
  private dances = 0;
  /** 【浪漫】【暖流】：目标下一次攻击后回能。 */
  private nextAttack = new Map<Unit, number>();
  /** 【献予「创世」之诗】的对象（开拓者•记忆）。 */
  private genesis: Unit | null = null;

  constructor() {
    super({
      id: "1415",
      notSimulated: [
        "【永续的燃烧】刷新白厄的额外回合（依赖生命值）",
      ],
    });
  }

  protected setup(): void {
    this.self.energyCap = 27;
    this.engine.on("turnStart", ({ unit }) => {
      if (this.future.delete(unit)) this.engine.gainEnergy(this.self, 1, { reason: "天赋【未来】" });
    });
    // 忆灵的【未来】不会被消耗。
    this.engine.on("summonTurn", ({ actor }) => {
      if (actor.role === "memosprite") this.engine.gainEnergy(this.self, 1, { reason: "天赋【未来】" });
    });
    this.engine.on("actionDone", ({ unit, casts }) => {
      if (unit === this.genesis && casts.includes("enhanced_basic")) this.dance("【献予「创世」之诗】：额外回合");
    });
    this.engine.on("attack", ({ unit }) => {
      const amount = this.nextAttack.get(unit);
      if (amount === undefined) return;
      this.nextAttack.delete(unit);
      this.engine.gainEnergy(unit, amount, { reason: "德谬歌" });
    });
  }

  private refillFuture(): void {
    for (const unit of this.engine.units) {
      if (unit !== this.self) this.future.add(unit);
    }
  }

  onBattleStart(): void {
    this.refillFuture();
    const allies = this.engine.units.filter((unit) => unit !== this.self && (CHRYSOS_HEIRS.has(unit.id) || unit.path === "记忆")).length;
    if (allies > 0) this.gain("行迹【岁月的旅人】", [2, 3, 6][Math.min(allies, 3) - 1]);
    if (this.self.eidolon >= 2) this.gain("E2", 12);
  }

  act({ kind, extra }: ActContext): void {
    if (this.ascended) {
      this.enhanced("向着爱与明天♪", 0, extra);
      this.gain("强化普攻", 3);
    } else if (kind === "skill") {
      this.engine.defaultAct(this.self, "skill", extra);
      this.gain("战技", 3);
    } else {
      this.engine.defaultAct(this.self, "basic", extra);
      this.gain("普攻", 1);
    }
    this.refillFuture();
  }

  /** 【此诗，献予一切生命】里影响行动轴的部分。其余是伤害类，不计入。 */
  private dedicate(target: Unit): void {
    const kit = target.kit;
    if (kit instanceof MydeiKit) kit.receivePoem();
    else if (kit instanceof AglaeaKit) {
      kit.fillStacks();
      this.nextAttack.set(target, 70);
    } else if (kit instanceof DanHengPermansorKit) kit.advanceDragon();
    else if (kit instanceof EvernightKit) kit.poem = true;
    else if (target.id === "1405") this.advanceUnit("德谬歌", target, 100);
    // 忆灵技 Lv6 给风堇 24 点能量，E3 Lv7 26.4（以前取了 Lv10 的 33.6）。
    else if (target.id === "1409") this.gainFor("德谬歌", target, this.self.eidolon >= 3 ? 26.4 : 24);
    else if (target.id === "1410") this.nextAttack.set(target, 60);
    else if (target.id === "1408") this.gainFor("德谬歌", target, 6);
    else if (target.id === "8007") this.genesis = target;
  }

  /** 【故事】满 3 点时德谬歌放一次【花与箭的舞曲】。她不上轴，只结算 E1 和 E6 的效果。 */
  private addStory(amount: number): void {
    this.story += amount;
    if (this.story < 3) return;
    this.story = 0;
    this.dance("花与箭的舞曲");
  }

  /** 德谬歌放一次【花与箭的舞曲】：结算 E1 回能和 E6 的全队拉条。 */
  private dance(label: string): void {
    this.dances += 1;
    this.engine.record("memosprite", this.self, label, { kind: "summon", name: "德谬歌" });
    this.engine.attack(this.self, "memosprite");
    if (this.self.eidolon >= 1) this.gain("E1", 6);
    if (this.self.eidolon >= 6 && this.dances >= 2) this.advanceAll("E6", 24);
  }

  /** 第二次起是「一如初见的重逢」：消耗 12 点，只让德谬歌行动一次。 */
  onUltimate(): void {
    const first = !this.ascended;
    this.ascended = true;
    this.self.ultCost = 12;
    this.addStory(first ? 2 : 1); // 首次开大：被召唤和施放各算 1 点。
    if (!first) return;
    this.engine.setMemosprite(this.self, true);
    if (this.self.eidolon >= 6) this.advanceAll("E6", 100);
    const target = this.targeted("忆灵技【此诗，献予一切生命】");
    if (target) this.dedicate(target);
    this.activateTeamUltimates();
  }

  /**
   * 首次开大「激活全体队友的终结技」：把队友开大要的资源直接补到够开大（攻略实测：白厄【火种】变成 12 点）。
   * 这是激活，不是能量恢复，不触发回能相关的效果。之后按「能开就开」，队友当场开大。
   */
  private activateTeamUltimates(): void {
    const { engine, self } = this;
    for (const unit of engine.units) {
      if (unit === self || unit.energy >= unit.ultCost) continue;
      const before = unit.energy;
      unit.energy = unit.ultCost;
      engine.record("note", self, "激活终结技", { details: [`${unit.name} ${unit.energyName ?? "能量"} ${fmt(before)} → ${fmt(unit.ultCost)}`] });
    }
    for (const unit of engine.units) if (unit !== self) engine.maybeUltimate(unit);
  }
}

export const SUMMON_KITS: Record<string, () => CharacterKit> = {
  1204: () => new JingYuanKit(),
  1112: () => new TopazKit(),
  1414: () => new DanHengPermansorKit(),
  1507: () => new IncineratorBladeKit(),
  1404: () => new MydeiKit(),
  1014: () => new SaberKit(),
  1509: () => new GilgameshKit(),
  1508: () => new RinKit(),
  1510: () => new HimekoNovaKit(),
  1310: () => new FireflyKit(),
  1402: () => new AglaeaKit(),
  1409: () => new HyacineKit(),
  8007: () => new TrailblazerRemembranceKit(),
  1407: () => new CastoriceKit(),
  1413: () => new EvernightKit(),
  1512: () => new RobinSummerKit(),
  1408: () => new PhainonKit(),
  1415: () => new CyreneKit(),
};
