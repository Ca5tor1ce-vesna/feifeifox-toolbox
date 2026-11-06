/**
 * 有状态的角色：战技不结束回合、强化普攻、额外资源。依据 4.6 正服版本资料。
 * 引擎是确定性的，也不模拟战技点和敌方。默认出招按常见打法，用户可以逐动覆盖。
 */
import { fmt } from "../format.ts";
import { TALENT_ATTACK_KINDS } from "../modules/elation.ts";
import type { SkillPoints } from "../modules/skill-points.ts";
import { EPS } from "../engine.ts";
import type { ActContext, CharacterKit, EnergyGain, KitContext } from "../types.ts";
import type { SummonActor, Unit } from "../unit.ts";
import { SimpleKit } from "./declarative.ts";

const FOLLOW_UP_TO_ATTACK = "fua";

export abstract class StatefulKit extends SimpleKit {
  /** 这一动是不是用户用逐动覆盖指定的。 */
  protected isScripted(): boolean {
    return this.self.script[this.self.actions - 1] !== undefined;
  }

  /** 不结束回合的战技：没有攻击事件时只记一条，回能由调用方决定。 */
  protected preparation(label: string, details: string[], extra: boolean): void {
    this.engine.record("skill", this.self, label, { details, extra });
  }

  protected enhanced(label: string, energy: number, extra: boolean, kind = "enhanced_basic"): void {
    this.engine.record(kind, this.self, label, { details: [`基础回能 ${fmt(energy, 0)} × (1+ERR)`], extra });
    this.engine.gainEnergy(this.self, energy, { reason: label });
    this.engine.attack(this.self, "enhanced_basic", extra);
  }

  protected followUp(label: string, energy: number): void {
    this.self.followUps += 1;
    this.engine.record("fua", this.self, label, { details: [`基础回能 ${fmt(energy, 0)} × (1+ERR)`] });
    this.engine.gainEnergy(this.self, energy, { reason: label });
    this.engine.attack(this.self, FOLLOW_UP_TO_ATTACK);
  }
}

/** 青雀：战技不结束回合。默认每回合一次战技接普攻。抽牌随机，强化普攻不计入。 */
class QingqueKit extends StatefulKit {
  constructor() {
    super({ id: "1201", notSimulated: ["抽牌随机：【暗杠】强化普攻和行迹【抢杠】速度提高", "E2 抽牌回能"] });
  }

  act({ kind, extra }: ActContext): void {
    if (kind === "skill") this.preparation(`${this.self.name} 的战技`, ["本回合不结束", "战技不回能"], extra);
    this.engine.defaultAct(this.self, "basic", extra);
  }
}

/**
 * 卡芙卡：天赋【温柔亦同残酷】队友攻击后立即追加攻击，基础回能 10（4.6.54 版本资料）。
 * 原版：只认队友的普攻，每回合 1 次（按她自己的回合开始重置，和飞霄同一口径，2026-11-06 用户确认飞霄这样算）。
 * 强化版（3.4）：队友任意攻击都算，最多存 2 次，她回合结束时恢复 1 次；行迹【荆棘】施放终结技后再恢复 1 次。
 */
class KafkaKit extends StatefulKit {
  private charges = 1;

  constructor() {
    super({ id: "1005", notSimulated: ["持续伤害相关回能（触电伤害、触电目标被消灭）"] });
  }

  private max(): number {
    return this.self.enhanced ? 2 : 1;
  }

  protected setup(): void {
    this.charges = this.max();
    this.engine.on("attack", ({ unit, kind }) => {
      if (unit === this.self || this.charges <= 0) return;
      if (this.self.enhanced ? !TALENT_ATTACK_KINDS.includes(kind) : kind !== "basic" && kind !== "enhanced_basic") return;
      this.charges -= 1;
      this.followUp(`天赋【温柔亦同残酷】：${unit.name}${this.self.enhanced ? "攻击" : "普攻"}后追加攻击`, 10);
    });
  }

  onTurnStart(): void {
    if (!this.self.enhanced) this.charges = 1;
  }

  onTurnEnd(): void {
    if (this.self.enhanced) this.charges = Math.min(this.max(), this.charges + 1);
  }

  onUltimate(): void {
    super.onUltimate();
    if (this.self.enhanced) this.charges = Math.min(this.max(), this.charges + 1);
  }
}

/** 刃：地狱变 3 回合（含施放当回合），强化普攻回能 30；消耗生命叠充能，满层追击。 */
class BladeKit extends StatefulKit {
  private hell = 0;
  private charge = 0;

  constructor() {
    super({ id: "1205", notSimulated: ["受到攻击叠充能（只计自身消耗生命的部分）"] });
  }

  private addCharge(): void {
    const cap = this.self.eidolon >= 6 ? 4 : 5;
    this.charge += 1;
    if (this.charge >= cap) {
      this.charge = 0;
      this.followUp("天赋【倏忽恩赐】追加攻击", 10);
      // 强化版（3.4）行迹【坏劫隳亡】：天赋追击额外 +15 能量（4.6.54 版本资料）。
      if (this.self.enhanced) this.gain("行迹【坏劫隳亡】（强化）", 15);
    }
  }

  act({ kind, extra }: ActContext): void {
    if (this.hell <= 0) {
      if (kind !== "skill") {
        this.engine.defaultAct(this.self, "basic", extra);
        return;
      }
      this.preparation(`${this.self.name} 的战技《地狱变》`, ["本回合不结束", "战技不回能", "消耗生命，充能 +1"], extra);
      this.hell = 3;
      this.addCharge();
    }
    this.enhanced("无间剑树", 30, extra);
    this.addCharge();
  }

  onTurnEnd(): void {
    if (this.hell > 0) this.hell -= 1;
  }
}

/** 丹恒•饮月：默认三强普攻（战技点靠用户自己把握）。只打普攻用 rotation basic。 */
class ImbibitorKit extends StatefulKit {
  constructor() {
    super({
      id: "1213",
      rules: [
        { on: "battleStart", do: (k) => k.gain("行迹【伏辰】", 15) },
        { on: "ultimate", eidolon: 2, do: (k) => k.advanceSelf("E2", 100) },
      ],
    });
  }

  act({ kind, extra }: ActContext): void {
    if (kind !== "skill") {
      this.engine.defaultAct(this.self, "basic", extra);
      return;
    }
    this.preparation("龙力自在：强化 3 次", ["默认三强，本回合不结束"], extra);
    this.enhanced("盘拏耀跃", 40, extra);
  }
}

/** 波提欧：绝命对峙 2 回合，回合开始减 1。战技不回能，强化普攻回能 30。 */
class BoothillKit extends StatefulKit {
  private duel = 0;

  constructor() {
    super({ id: "1315", notSimulated: ["【优势口袋】及其回能（目标被消灭或弱点被击破后）"] });
  }

  onTurnStart(): void {
    if (this.duel > 0) this.duel -= 1;
  }

  act({ kind, extra }: ActContext): void {
    if (this.duel <= 0) {
      if (kind !== "skill") {
        this.engine.defaultAct(this.self, "basic", extra);
        return;
      }
      this.preparation(`${this.self.name} 的战技《炽砾舞者的探戈》`, ["进入【绝命对峙】2 回合", "本回合不结束，战技不回能"], extra);
      this.duel = 2;
    }
    this.enhanced("击锤连弩", 30, extra);
  }
}

/**
 * 藿藿：【禳命】期间我方回合开始或开大时触发治疗，行迹【怯惧应激】每次回能 1。
 * 天赋里「可以触发 6 次」限的是解除负面效果，回能没有次数上限（4.6.54 版本资料原文；2026-11-06 以前误把回能也限成 6 次）。
 * 原版：战技给【禳命】2 回合，开局行迹给 1 回合。强化版（3.4）：战技或终结技给 3 回合，开局 +30 能量并给 2 回合。E1 天赋给的再 +1 回合。
 */
class HuohuoKit extends StatefulKit {
  private rang = 0;

  constructor() {
    super({ id: "1217", notSimulated: ["生命值低于 50% 时的额外治疗触发（我方生命值不模拟）"] });
  }

  protected setup(): void {
    this.engine.addSpeedModifier(() => (this.self.eidolon >= 1 && this.rang > 0 ? { pct: 12 } : {}));
    this.engine.on("turnStart", () => this.onHeal());
    this.engine.on("ultimate", () => this.onHeal());
  }

  private onHeal(): void {
    if (this.rang <= 0) return;
    this.engine.gainEnergy(this.self, 1, { reason: "行迹【怯惧应激】" });
  }

  /** 天赋给【禳命】：原版战技 2 回合，强化版战技或终结技 3 回合；E1 +1。 */
  private grantRang(): void {
    this.rang = (this.self.enhanced ? 3 : 2) + (this.self.eidolon >= 1 ? 1 : 0);
  }

  onBattleStart(): void {
    if (this.self.enhanced) {
      this.gain("行迹【不敢自专】（强化）", 30);
      this.rang = 2;
    } else {
      this.rang = 1;
    }
  }

  onTurnStart(): void {
    if (this.rang > 0) this.rang -= 1;
  }

  afterAct({ kind }: ActContext): void {
    if (kind === "skill") this.grantRang();
  }

  onUltimate(): void {
    for (const unit of this.engine.units) {
      // 终结技 Lv10 回 20% 能量上限，E3 Lv12 21%（以前取了 Lv15 的 22.5%）。
      if (unit !== this.self) this.restoreFor("终结技", unit, unit.maxEnergy * (this.self.eidolon >= 3 ? 0.21 : 0.2), { fixed: true });
    }
    if (this.self.enhanced) this.grantRang();
  }
}

/**
 * 驭空：【鸣弦号令】层数决定行迹【气壮】回能（4.6.54 版本资料）。
 * - 战技、秘技各给 2 层，最多 2 层；每个我方目标回合结束移除 1 层，驭空放战技那个回合结束时不移除。
 * - 【气壮】：持有【鸣弦号令】时，我方目标每行动一次，驭空 +2 能量。
 * - E1 开局全队速度 +10%（2 回合）；E2 我方任意单体满能时 +5，每人 1 次，驭空开大后重置；E6 开大先得 1 层。
 * 召唤物、忆灵按我方目标算（行动后回能、回合结束扣层）；倒计时不算。
 */
class YukongKit extends StatefulKit {
  stacks = 0;
  private keepThisTurn = false;
  private e2Done = new Set<Unit>();

  constructor() {
    super({ id: "1207", rules: [{ on: "battleStart", eidolon: 1, do: (k) => k.speedTeam("E1", "pct", 10, 2) }] });
  }

  protected setup(): void {
    const acted = () => {
      if (this.stacks > 0) this.gain("行迹【气壮】", 2);
    };
    const turnOver = (isSelf: boolean) => {
      if (this.stacks <= 0) return;
      if (isSelf && this.keepThisTurn) return;
      this.stacks -= 1;
    };
    this.engine.on("actionDone", () => acted());
    this.engine.on("turnEnd", ({ unit }) => {
      turnOver(unit === this.self);
      if (unit === this.self) this.keepThisTurn = false;
    });
    this.engine.on("summonTurn", ({ actor }) => {
      if (actor.role === "countdown") return;
      acted();
      turnOver(false);
    });
    this.engine.on("energyGain", ({ unit }) => {
      if (this.self.eidolon < 2 || unit.energyType !== "standard" || this.e2Done.has(unit)) return;
      if (unit.energy < unit.energyCap - EPS) return;
      this.e2Done.add(unit);
      this.gain(`E2：${unit.name} 满能`, 5);
    });
  }

  private setStacks(count: number, label: string): void {
    this.stacks = Math.min(2, count);
    this.note(label, `【鸣弦号令】${this.stacks} 层`);
  }

  onTechnique(): void {
    this.setStacks(2, "秘技【云鸢逐风】");
  }

  afterAct({ kind }: ActContext): void {
    if (kind !== "skill") return;
    this.setStacks(2, "战技【天阙鸣弦】");
    this.keepThisTurn = true;
  }

  onUltimate(): void {
    this.e2Done.clear();
    if (this.self.eidolon >= 6) this.setStacks(this.stacks + 1, "E6");
  }

  mechanics = () => ({ stacks: this.stacks });
}

/** 灵砂：【浮元】90 速，3 次行动，最多累计 5 次。 */
class LingshaKit extends StatefulKit {
  private fuyuan: SummonActor | null = null;
  private fuyuanActions = 0;

  constructor() {
    super({ id: "1222", notSimulated: ["行迹【遗爇】（我方受到伤害时触发）"] });
  }

  private summon(): void {
    if (this.fuyuan) {
      this.fuyuanActions = Math.min(5, this.fuyuanActions + 3);
      return;
    }
    this.fuyuanActions = 3;
    this.fuyuan = this.engine.addActor({ name: "【浮元】", speed: () => 90, onTurn: (actor) => this.act2(actor) });
  }

  private act2(actor: SummonActor): void {
    const { engine, self } = this;
    this.fuyuanActions -= 1;
    engine.record("fua", self, "【浮元】追加攻击", { kind: "summon", name: "【浮元】", details: [`剩余 ${this.fuyuanActions} 次行动`] });
    engine.attack(self, "fua");
    if (this.fuyuanActions <= 0) {
      engine.removeActor(actor);
      this.fuyuan = null;
    }
  }

  onTechnique(): void {
    this.summon();
  }

  afterAct({ kind }: ActContext): void {
    if (kind === "basic") {
      this.gain("行迹【兰烟】", 10);
      return;
    }
    if (this.fuyuan) this.engine.advance(this.fuyuan, 20);
    this.summon();
  }

  onUltimate(): void {
    if (this.fuyuan) this.engine.advance(this.fuyuan, 100);
  }
}

/** 三月七•巡猎：先战技定【师父】，之后打普攻攒充能，满 7 立即行动打强化普攻。 */
class MarchHuntKit extends StatefulKit {
  charge = 0;
  master: Unit | null = null;
  private armedFollow = true;

  constructor() {
    super({
      id: "1224",
      notSimulated: ["强化普攻额外段数（60% 概率）"],
      rules: [
        { on: "technique", do: (k) => k.gain("秘技", 30) },
        { on: "battleStart", do: (k) => k.advanceSelf("行迹【惊鸿】", 25) },
        { on: "turnStart", eidolon: 4, do: (k) => k.gain("E4", 5) },
      ],
    });
  }

  protected setup(): void {
    this.engine.addSpeedModifier((unit) => {
      // 战技 Lv10 +10%，E3 Lv12 +10.8%（以前取了 Lv15 的 12%）。
      if (unit === this.master) return { pct: this.self.eidolon >= 3 ? 10.8 : 10 };
      if (unit === this.self && this.master && this.self.eidolon >= 1) return { pct: 10 };
      return {};
    });
    // 天赋：【师父】施放攻击或终结技后，每次最多 +1 充能。终结技不算攻击的师父（星期日、布洛妮娅…）开大也给，
    // 算攻击的终结技只给一次（按终结技算，攻击事件里跳过）。2026-11-06 以前只认攻击，前一种开大漏了。
    this.engine.on("ultimate", ({ unit }) => {
      if (unit === this.master) this.addCharge(1);
    });
    this.engine.on("attack", ({ unit, kind }) => {
      if (unit !== this.master) return;
      if (TALENT_ATTACK_KINDS.includes(kind) && kind !== "ultimate") this.addCharge(1);
      if (this.self.eidolon >= 2 && this.armedFollow && (kind === "basic" || kind === "skill")) {
        this.armedFollow = false;
        this.followUp("E2 追加攻击", 5);
        this.addCharge(1);
      }
    });
    this.engine.on("turnStart", () => { this.armedFollow = true; });
  }

  private addCharge(amount: number): void {
    const before = this.charge;
    this.charge = Math.min(10, this.charge + amount);
    if (before < 7 && this.charge >= 7) this.engine.advance(this.self, 100, { selfSource: true });
  }

  act({ kind, extra }: ActContext): void {
    if (this.charge >= 7) {
      this.charge -= 7;
      this.enhanced("一扎眉攒，二扎心", 30, extra);
      return;
    }
    const wantsSkill = this.isScripted() ? kind === "skill" : this.master === null && kind === "skill";
    if (!wantsSkill) {
      this.engine.defaultAct(this.self, "basic", extra);
      this.addCharge(1);
      return;
    }
    this.engine.defaultAct(this.self, "skill", extra);
    const target = this.targeted("战技");
    if (target) this.master = target;
  }
}

/** 符玄：阵开着就打普攻，快到期再补战技。阵开启时战技额外回能 20。 */
class FuXuanKit extends StatefulKit {
  private field = 0;
  private armed = false;

  constructor() {
    super({ id: "1208", notSimulated: ["E4 受击回能"] });
  }

  onTurnStart(): void {
    this.armed = this.field > 0;
  }

  onTurnEnd(): void {
    if (this.armed && this.field > 0) this.field -= 1;
  }

  act({ kind, extra }: ActContext): void {
    const wantsSkill = this.isScripted() ? kind === "skill" : kind === "skill" && this.field <= 1;
    if (!wantsSkill) {
      this.engine.defaultAct(this.self, "basic", extra);
      return;
    }
    const active = this.field > 0;
    this.engine.defaultAct(this.self, "skill", extra);
    if (active) this.gain("行迹【太乙式盘】", 20);
    this.field = 3;
    this.armed = false;
  }
}

/** 彦卿：天赋追击有概率，不计入。E2 持有【智剑连心】时能量恢复效率 +10%。 */
class YanqingKit extends StatefulKit {
  private sync = 0;
  private armed = false;

  constructor() {
    super({ id: "1209", notSimulated: ["天赋追击（65% 概率）及其回能", "行迹【轻吕】（暴击时触发）", "【智剑连心】受到伤害后消失"] });
  }

  private refresh(): void {
    this.self.errBonus = this.self.eidolon >= 2 && this.sync > 0 ? 10 : 0;
  }

  onTurnStart(): void {
    this.armed = this.sync > 0;
  }

  onTurnEnd(): void {
    if (this.armed && this.sync > 0) this.sync -= 1;
    this.refresh();
  }

  afterAct({ kind }: ActContext): void {
    if (kind !== "skill") return;
    this.sync = 1;
    this.armed = false;
    this.refresh();
  }
}

/**
 * 镜流：两层【朔望】进入转魄，强化战技消耗一层。
 * 原版：【朔望】上限 3，E6 转魄时上限 +1 并额外 +1 层；行迹【剑首】战技后行动提前 10%。
 * 强化版（3.4）：进转魄额外 +1 层、上限 4，E6 上限 +1 并额外 +2 层；【剑首】改为战技 +15、强化战技 +8 能量（4.6.54 版本资料）。
 */
class JingliuKit extends StatefulKit {
  private moon = 0;
  private transmigrated = false;

  constructor() {
    super({ id: "1212", notSimulated: ["强化版：我方受到伤害或消耗生命累计 20 次获得【朔望】"] });
  }

  private cap(): number {
    return (this.self.enhanced ? 4 : 3) + (this.transmigrated && this.self.eidolon >= 6 ? 1 : 0);
  }

  private addMoon(amount: number): void {
    this.moon = Math.min(this.cap(), this.moon + amount);
    if (!this.transmigrated && this.moon >= 2) {
      this.transmigrated = true;
      const bonus = (this.self.enhanced ? 1 : 0) + (this.self.eidolon >= 6 ? (this.self.enhanced ? 2 : 1) : 0);
      this.moon = Math.min(this.cap(), this.moon + bonus);
      this.note("天赋：进入【转魄】", `行动提前 100%${bonus ? `，【朔望】额外 +${bonus}` : ""}`);
      this.engine.advance(this.self, 100, { selfSource: true });
    }
  }

  onTechnique(): void {
    this.gain("秘技", 15);
    this.addMoon(1);
  }

  act({ extra }: ActContext): void {
    if (this.transmigrated) {
      this.enhanced("寒川映月", 30, extra, "skill");
      if (this.self.enhanced) this.gain("行迹【剑首】（强化）：寒川映月", 8);
      this.moon -= 1;
      if (this.moon <= 0) this.transmigrated = false;
      return;
    }
    this.engine.defaultAct(this.self, "skill", extra);
    if (this.self.enhanced) {
      this.gain("行迹【剑首】（强化）：无罅飞光", 15);
    } else {
      this.note("行迹【剑首】", "下次行动提前 10%");
      this.engine.advance(this.self, 10, { selfSource: true });
    }
    this.addMoon(1);
  }

  onUltimate(): void {
    this.addMoon(1);
  }
}

/** 银枝：回能取决于命中目标数。默认等 180 能量放强力终结技。 */
class ArgentiKit extends StatefulKit {
  constructor() {
    super({
      id: "1302",
      rules: [{ on: "battleStart", do: (k) => k.gain("行迹【慷慨】", 2 * k.engine.enemyCount) }],
    });
  }

  afterAct({ kind }: ActContext): void {
    this.gain("天赋", 3 * (kind === "basic" ? 1 : this.engine.enemyCount));
  }

  onUltimate(): void {
    this.gain("天赋", 3 * this.engine.enemyCount);
  }
}

/**
 * 飞霄：【飞黄】6 点可开大，每 2 次攻击 +1，队友攻击时每回合追击一次。
 * E2：我方任意目标每施放 1 次追加攻击 +1 点【飞黄】，每回合最多 6 次（4.6.54 版本资料；2026-11-05 以前只算飞霄自己的）。
 * 「每回合」按飞霄回合开始时重置算，和天赋追击的次数一样（待实测）。
 */
class FeixiaoKit extends StatefulKit {
  private attacks = 0;
  private followed = false;
  private followedLastTurn = false;
  private e2Count = 0;

  constructor() {
    super({
      id: "1220",
      rules: [
        { on: "battleStart", do: (k) => k.gain("行迹【天通】", 3) },
      ],
    });
  }

  protected setup(): void {
    this.engine.on("attack", ({ unit, kind }) => {
      if (unit === this.self && kind === "ultimate") return;
      this.countAttack();
      if (kind === "fua" && this.self.eidolon >= 2 && this.e2Count < 6) {
        this.e2Count += 1;
        this.gain(`E2：${unit.name}的追加攻击（本回合第 ${this.e2Count} 次）`, 1);
      }
      if (unit !== this.self && !this.followed) {
        this.followed = true;
        this.followedLastTurn = true;
        this.followUp("天赋【雷狩】追加攻击", 0);
        if (this.self.eidolon >= 4) this.speed("E4", this.self, "pct", 8, 2);
      }
    });
  }

  /**
   * 每次攻击记半点。飞黄满 12 时凑满的这一点先存在攻击计数里，开大后再补上：
   * 实际最多 13 点，满格时开大剩 7 点（2026-11-06 两个攻略视频各自实测，技能说明只写了 12）。
   */
  private countAttack(): void {
    this.attacks = Math.min(2, this.attacks + 1);
    if (this.attacks < 2 || this.self.energy >= this.self.maxEnergy - EPS) return;
    this.attacks = 0;
    this.engine.gainEnergy(this.self, 1, { reason: "天赋【雷狩】" });
  }

  onUltimate(): void {
    super.onUltimate();
    if (this.attacks < 2) return;
    this.attacks = 0;
    this.gain("天赋【雷狩】：飞黄满时存下的 1 点", 1);
  }

  onTurnStart(): void {
    if (!this.followedLastTurn) this.countAttack();
    this.followed = false;
    this.followedLastTurn = false;
    this.e2Count = 0;
  }
}

const hasAcheronLc = (unit: Unit): boolean => unit.gear?.lightcone?.id === "23024" && unit.gear.lightcone.active;
const hasLc = (unit: Unit, id: string): boolean => unit.gear?.lightcone?.id === id && unit.gear.lightcone.active;

/**
 * 这次施放让敌人陷入负面效果的来源（黄泉的天赋按「每次施放最多 1 次」+1【残梦】）。负面效果按基础概率必中算。
 * 只登记常配黄泉的队友（2026-11-06 用户决定先做这些）：佩拉、银狼、椒丘、加拉赫、托帕、卡芙卡、黑天鹅，
 * 光锥「决心如汗珠般闪耀」和黄泉专武。原文都是 4.6.54 版本资料。kind 为 "ultimate" 时表示终结技。
 */
function debuffSource(unit: Unit, kind: string, team: readonly Unit[], afterUlt: Set<Unit>): string | null {
  const attack = kind !== "ultimate" || unit.ultimateAttacks;
  switch (unit.id) {
    case "1106": // 佩拉：终结技【通解】；E4 战技降冰抗。战技本身只解除增益。
      if (kind === "ultimate") return "终结技【通解】";
      if (kind === "skill" && unit.eidolon >= 4) return "E4 战技降冰抗";
      break;
    case "1006": // 银狼：天赋每次攻击植入【缺陷】。
      if (["basic", "skill", "ultimate"].includes(kind)) return "天赋【缺陷】";
      break;
    case "1218": // 椒丘：普攻、战技、终结技击中施加【烬煨】。
      if (["basic", "skill", "ultimate"].includes(kind)) return "【烬煨】";
      break;
    case "1301": // 加拉赫：终结技【酩酊】；终结技后的下一次普攻是【酒花奔涌】降攻击。
      if (kind === "ultimate") return "终结技【酩酊】";
      if (kind === "basic" && afterUlt.delete(unit)) return "【酒花奔涌】降攻击";
      break;
    case "1112": // 托帕：战技【负债证明】；E1 追加攻击给【被执行】（账账和普攻都是追加攻击）。
      if (kind === "skill") return "战技【负债证明】";
      if (unit.eidolon >= 1 && (kind === "fua" || kind === "basic")) return "E1【被执行】";
      break;
    case "1005": // 卡芙卡：终结技、天赋追击使敌人触电。战技只引爆。
      if (kind === "ultimate") return "终结技触电";
      if (kind === "fua") return "追击触电";
      break;
    case "1307": // 黑天鹅：普攻、战技【奥迹】，终结技【揭露】。
      if (["basic", "skill", "ultimate"].includes(kind)) return kind === "ultimate" ? "终结技【揭露】" : "【奥迹】";
      break;
  }
  if (!attack) return null;
  if (hasLc(unit, "21015")) return "决心如汗珠般闪耀【攻陷】";
  if (unit.id === "1308" && (kind === "basic" || kind === "skill") && hasAcheronLc(unit)) return "专武【泡影】";
  if (team.some((ally) => ally.id === "1307" && ally !== unit && ally.eidolon >= 6)) return "黑天鹅 E6【奥迹】";
  return null;
}

/**
 * 黄泉：【残梦】9 点开大。队友施加负面状态也会回，依赖敌方，不计入。
 * 行迹【赤鬼】：【残梦】满了以后每溢出 1 点得 1 层【四相断我】，最多 3 层；秘技进战斗也给 1 层。
 * 【四相断我】：施放终结技后每层回 1 点【残梦】（4.6.54 版本资料；2026-11-05 以前溢出直接丢了）。
 */
class AcheronKit extends StatefulKit {
  /** 【四相断我】层数。 */
  quadrivalent = 0;

  constructor() {
    super({
      id: "1308",
      notSimulated: [
        "其他队友施加负面效果时的【残梦】只计入佩拉、银狼、椒丘、加拉赫、托帕、卡芙卡、黑天鹅和「决心如汗珠般闪耀」，别的队友上的负面没算，实际开大可能比轴上早",
        "负面效果按必中算，「决心如汗珠般闪耀」按每次攻击都挂【攻陷】算：实际【残梦】可能更少，开大可能比轴上晚",
      ],
      rules: [
        { on: "technique", do: (k) => (k as AcheronKit).addStacks("秘技【四相断我】", 1) },
        { on: "battleStart", do: (k) => k.gain("行迹【赤鬼】", 5) },
        { on: "turnStart", eidolon: 2, do: (k) => k.gain("E2", 1) },
        { on: "skill", do: (k) => k.gain("战技", 1) },
      ],
    });
  }

  /** 加拉赫开完大、下一次普攻是【酒花奔涌】。 */
  private brewReady = new Set<Unit>();

  protected setup(): void {
    super.setup();
    // 天赋：任意单位施放技能使敌人陷入负面效果时 +1【残梦】，每次施放最多 1 次（一次攻击事件或一次终结技算一次施放）。
    // 专武【泡影】也走这里，和别的来源在同一次施放里不重复。战技自带的【集真赤】不是负面效果（攻略实测）。
    const check = (unit: Unit, kind: string) => {
      const source = debuffSource(unit, kind, this.engine.units, this.brewReady);
      if (source) this.gain(`天赋：${unit.name}${source}`, 1);
    };
    this.engine.on("ultimate", ({ unit }) => {
      check(unit, "ultimate");
      if (unit.id === "1301") this.brewReady.add(unit);
    });
    this.engine.on("attack", ({ unit, kind }) => {
      if (kind !== "ultimate") check(unit, kind);
    });
  }

  addStacks(label: string, count: number): void {
    const added = Math.min(3 - this.quadrivalent, count);
    if (added <= 0) return;
    this.quadrivalent += added;
    this.note(label, `【四相断我】+${added}（现有 ${this.quadrivalent} 层，最多 3 层）`);
  }

  /** 【残梦】是固定点数，不吃能量恢复效率；满了以后溢出的变成【四相断我】。 */
  gainEnergy({ engine, self }: KitContext, { amount }: EnergyGain): void {
    const before = self.energy;
    self.energy = Math.min(self.maxEnergy, before + amount);
    const applied = self.energy - before;
    self.energyTotal += applied;
    const spill = Math.floor(amount - applied + EPS);
    if (spill > 0) this.addStacks("行迹【赤鬼】：【残梦】溢出", spill);
    engine.maybeUltimate(self);
  }

  onUltimate(): void {
    super.onUltimate();
    if (this.quadrivalent <= 0) return;
    const count = this.quadrivalent;
    this.quadrivalent = 0;
    this.gain(`【四相断我】×${count}`, count, { fixed: true });
  }

  mechanics = () => ({ quadrivalent: this.quadrivalent });
}

/** 大丽花：进入战斗 +35。队友攻击后每回合追击一次：5 段，每段回能 2。 */
class DahliaKit extends StatefulKit {
  private followed = false;

  constructor() {
    super({
      id: "1321",
      notSimulated: ["行迹【弃旧，恋新】（添加弱点时）", "【共舞者】弱点击破相关效果"],
      rules: [{ on: "battleStart", do: (k) => k.gain("天赋", 35) }],
    });
  }

  protected setup(): void {
    this.engine.on("turnStart", () => { this.followed = false; });
    this.engine.on("attack", ({ unit, kind }) => {
      if (unit === this.self || kind === "fua" || this.followed) return;
      this.followed = true;
      const hits = this.self.eidolon >= 4 ? 10 : 5;
      this.followUp("天赋追加攻击", 2 * hits);
      if (this.self.eidolon >= 6) {
        this.advanceSelf("E6", 20);
        this.advanceUnit("E6", unit, 20);
      }
    });
  }
}

/** 不死途：假设队友都打在【饲饵】上。队友攻击固定 +8，消耗充能追击回能 5。 */
class CerydraKit extends StatefulKit {
  private charge = 2;

  constructor() {
    super({ id: "1504", notSimulated: ["假设队友都攻击【饲饵】；目标被消灭时的【婪酣】"] });
  }

  protected setup(): void {
    this.engine.on("attack", ({ unit, kind }) => {
      if (unit === this.self || !TALENT_ATTACK_KINDS.includes(kind)) return;
      this.engine.gainEnergy(this.self, 8, { fixed: true, reason: "天赋【宿怨】" });
      if (this.charge <= 0) return;
      this.charge -= 1;
      this.followUp("天赋【宿怨，切齿奉还】追加攻击", 5);
    });
  }

  onUltimate(): void {
    this.charge = Math.min(3, this.charge + 3);
  }
}

/** Archer：默认一回合一次战技（连放取决于战技点）。队友攻击消耗充能追击。 */
class ArcherKit extends StatefulKit {
  private charge = 1;
  /** 星魂 1：本回合已施放的战技次数。 */
  private skillsThisTurn = 0;

  constructor() {
    super({ id: "1015" });
  }

  /** 战技点模块（没开战技点系统时是 undefined，回点逻辑自然不生效）。 */
  private get points() {
    return this.engine.findModule<SkillPoints>("skill-points");
  }

  protected setup(): void {
    this.engine.on("attack", ({ unit, kind }) => {
      if (unit === this.self || kind === "fua" || this.charge <= 0) return;
      this.charge -= 1;
      this.followUp("天赋【心眼（真）】追加攻击", 5);
      // 天赋：追击「恢复 1 个战技点」（4.6.54 版本资料）。
      this.points?.restore(this.self, 1, "天赋【心眼（真）】追击");
    });
    // 星魂 6：回合开始为我方恢复 1 个战技点。
    this.engine.on("turnStart", ({ unit }) => {
      if (unit !== this.self) return;
      this.skillsThisTurn = 0;
      if (this.self.eidolon >= 6) this.points?.restore(this.self, 1, "E6：回合开始");
    });
    // 星魂 1：单个回合内施放 3 次战技后，为我方恢复 2 个战技点。
    this.engine.on("actionDone", ({ unit, casts }) => {
      if (unit !== this.self || !casts.includes("skill")) return;
      this.skillsThisTurn += 1;
      if (this.self.eidolon >= 1 && this.skillsThisTurn === 3) this.points?.restore(this.self, 2, "E1：单回合 3 次战技");
    });
  }

  onUltimate(): void {
    this.charge = Math.min(4, this.charge + 2);
  }
}

/** 开拓者•存护：【灼热意志】满 4 层普攻强化回能 30。回合开始持有护盾 +5。 */
class TrailblazerPreservationKit extends StatefulKit {
  private will = 0;
  private freeEnhance = false;
  private shield = 0;
  private armed = false;

  constructor() {
    super({ id: "8003", notSimulated: ["受到攻击叠【灼热意志】"] });
  }

  private refreshShield(): void {
    this.shield = 2;
    this.armed = false;
  }

  onBattleStart(): void {
    if (this.self.eidolon >= 4) this.will = 4;
  }

  onTurnStart(): void {
    this.armed = this.shield > 0;
    if (this.shield > 0) this.gain("行迹【行胜思】", 5);
  }

  onTurnEnd(): void {
    if (this.armed && this.shield > 0) this.shield -= 1;
  }

  act({ kind, extra }: ActContext): void {
    if (kind === "skill") {
      this.engine.defaultAct(this.self, "skill", extra);
      this.will = Math.min(8, this.will + 1);
    } else if (this.freeEnhance || this.will >= 4) {
      if (this.freeEnhance) this.freeEnhance = false;
      else this.will -= 4;
      this.enhanced("穿彻坚冰的烈芒（强化）", 30, extra);
    } else {
      this.engine.defaultAct(this.self, "basic", extra);
      this.will = Math.min(8, this.will + 1);
    }
    this.refreshShield();
  }

  onUltimate(): void {
    this.freeEnhance = true;
    this.refreshShield();
  }
}

/** 开拓者•同谐：E2 开局能量恢复效率 +25%，3 回合。 */
class TrailblazerHarmonyKit extends StatefulKit {
  private err = 0;

  constructor() {
    super({ id: "8005", notSimulated: ["天赋回能（敌方弱点被击破时）", "行迹【剧院之帽】延后敌方"] });
  }

  onBattleStart(): void {
    if (this.self.eidolon < 2) return;
    this.err = 3;
    this.self.errBonus = 25;
  }

  onTurnEnd(): void {
    if (this.err <= 0) return;
    this.err -= 1;
    if (this.err === 0) this.self.errBonus = 0;
  }
}

/** 乱破：开大进入【结印】，3 次强化普攻，立即获得额外回合。 */
class RappaKit extends StatefulKit {
  private ink = 0;

  constructor() {
    super({ id: "1317", notSimulated: ["充能和回能（敌方弱点被击破时）"] });
  }

  protected setup(): void {
    this.engine.addSpeedModifier(() => (this.self.eidolon >= 4 && this.ink > 0 ? { pct: 12 } : {}));
  }

  canUltimate(): boolean {
    return this.ink <= 0;
  }

  act({ kind, extra }: ActContext): void {
    if (this.ink <= 0) {
      this.engine.defaultAct(this.self, kind, extra);
      return;
    }
    this.enhanced("忍具•降魔花弁", 20, extra);
    this.ink -= 1;
    if (this.ink === 0 && this.self.eidolon >= 1) this.gain("E1", 20);
  }

  onUltimate(): void {
    this.ink = 3;
    this.engine.extraTurn(this.self, "终结技：立即获得额外回合");
  }
}

/** 大黑塔：我方攻击后固定回能，按命中目标数算，最多 5 个。开大后立即行动。 */
class HertaGreatKit extends StatefulKit {
  private inspiration = 0;

  constructor() {
    super({ id: "1401" });
  }

  protected setup(): void {
    const scholars = this.engine.units.filter((unit) => unit.path === "智识").length;
    const minimum = scholars >= 2 ? 3 : 1;
    this.engine.on("attack", ({ kind }) => {
      if (!TALENT_ATTACK_KINDS.includes(kind)) return;
      const hits = Math.min(5, Math.max(minimum, this.engine.enemyCount));
      this.engine.gainEnergy(this.self, 3 * hits, { fixed: true, reason: "行迹【冷漠的诚实】" });
    });
    this.engine.addSpeedModifier((unit) => (this.self.eidolon >= 4 && unit.path === "智识" ? { pct: 12 } : {}));
  }

  onBattleStart(): void {
    if (this.self.eidolon >= 2) this.inspiration += 1;
  }

  afterAct({ kind }: ActContext): void {
    if (kind !== "skill" || this.inspiration <= 0) return;
    this.inspiration -= 1;
    if (this.self.eidolon >= 2) this.advanceSelf("E2", 35);
  }

  onUltimate(): void {
    this.inspiration = Math.min(4, this.inspiration + (this.self.eidolon >= 2 ? 2 : 1));
    this.note("终结技", "施放后立即行动");
    this.engine.advance(this.self, 100, { selfSource: true });
  }
}

/** 云璃：终结技只消耗 120 能量。反击依赖敌方，不计入。 */
const YUNLI: CharacterKit & { readonly id: string } = { id: "1221", enemyDependent: ["天赋反击（受到攻击后）及其回能", "终结技【勘破】反击"] };

export const STATEFUL_KITS: Record<string, () => CharacterKit> = {
  1201: () => new QingqueKit(),
  1005: () => new KafkaKit(),
  1205: () => new BladeKit(),
  1213: () => new ImbibitorKit(),
  1315: () => new BoothillKit(),
  1217: () => new HuohuoKit(),
  1207: () => new YukongKit(),
  1222: () => new LingshaKit(),
  1224: () => new MarchHuntKit(),
  1208: () => new FuXuanKit(),
  1209: () => new YanqingKit(),
  1212: () => new JingliuKit(),
  1302: () => new ArgentiKit(),
  1220: () => new FeixiaoKit(),
  1308: () => new AcheronKit(),
  1221: () => ({ ...YUNLI }),
  1321: () => new DahliaKit(),
  1504: () => new CerydraKit(),
  1015: () => new ArcherKit(),
  8003: () => new TrailblazerPreservationKit(),
  8005: () => new TrailblazerHarmonyKit(),
  1317: () => new RappaKit(),
  1401: () => new HertaGreatKit(),
};
