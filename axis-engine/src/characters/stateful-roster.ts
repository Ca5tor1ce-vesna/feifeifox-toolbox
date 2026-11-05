/**
 * 有状态的角色：战技不结束回合、强化普攻、额外资源。依据 4.6 正服版本资料。
 * 引擎是确定性的，也不模拟战技点和敌方。默认出招按常见打法，用户可以逐动覆盖。
 */
import { fmt } from "../format.ts";
import { TALENT_ATTACK_KINDS } from "../modules/elation.ts";
import type { ActContext, CharacterKit } from "../types.ts";
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

/** 藿藿：【禳命】期间我方回合开始或开大时触发治疗，回能 1。 */
class HuohuoKit extends StatefulKit {
  private rang = 0;
  private charges = 6;

  constructor() {
    super({ id: "1217", notSimulated: ["生命值低于 50% 时的额外治疗触发（我方生命值不模拟）"] });
  }

  protected setup(): void {
    this.engine.addSpeedModifier(() => (this.self.eidolon >= 1 && this.rang > 0 ? { pct: 12 } : {}));
    this.engine.on("turnStart", () => this.onHeal());
    this.engine.on("ultimate", () => this.onHeal());
  }

  private onHeal(): void {
    if (this.rang <= 0 || this.charges <= 0) return;
    this.charges -= 1;
    this.engine.gainEnergy(this.self, 1, { reason: "行迹【怯惧应激】" });
  }

  onBattleStart(): void {
    this.rang = 1;
  }

  onTurnStart(): void {
    if (this.rang > 0) this.rang -= 1;
  }

  afterAct({ kind }: ActContext): void {
    if (kind !== "skill") return;
    this.rang = this.self.eidolon >= 1 ? 3 : 2;
    this.charges = 6;
  }

  onUltimate(): void {
    for (const unit of this.engine.units) {
      if (unit !== this.self) this.gainFor("终结技", unit, unit.maxEnergy * 0.225, { fixed: true });
    }
  }
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
      if (unit === this.master) return { pct: 12 };
      if (unit === this.self && this.master && this.self.eidolon >= 1) return { pct: 10 };
      return {};
    });
    this.engine.on("attack", ({ unit, kind }) => {
      if (unit !== this.master) return;
      if (TALENT_ATTACK_KINDS.includes(kind)) this.addCharge(1);
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
    const target = this.otherTarget();
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

/** 镜流：两层【朔望】进入转魄，强化战技消耗一层。 */
class JingliuKit extends StatefulKit {
  private moon = 0;
  private transmigrated = false;

  constructor() {
    super({ id: "1212" });
  }

  private addMoon(amount: number): void {
    const cap = this.transmigrated && this.self.eidolon >= 6 ? 4 : 3;
    this.moon = Math.min(cap, this.moon + amount);
    if (!this.transmigrated && this.moon >= 2) {
      this.transmigrated = true;
      if (this.self.eidolon >= 6) this.moon += 1;
      this.note("天赋：进入【转魄】", "行动提前 100%");
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
      this.moon -= 1;
      if (this.moon <= 0) this.transmigrated = false;
      return;
    }
    this.engine.defaultAct(this.self, "skill", extra);
    this.note("行迹【剑首】", "下次行动提前 10%");
    this.engine.advance(this.self, 10, { selfSource: true });
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

/** 飞霄：【飞黄】6 点可开大，每 2 次攻击 +1，队友攻击时每回合追击一次。 */
class FeixiaoKit extends StatefulKit {
  private attacks = 0;
  private followed = false;
  private followedLastTurn = false;

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
      if (unit !== this.self && !this.followed) {
        this.followed = true;
        this.followedLastTurn = true;
        this.followUp("天赋【雷狩】追加攻击", 0);
        if (this.self.eidolon >= 2) this.gain("E2", 1);
        if (this.self.eidolon >= 4) this.speed("E4", this.self, "pct", 8, 2);
      }
    });
  }

  private countAttack(): void {
    this.attacks += 1;
    if (this.attacks >= 2) {
      this.attacks = 0;
      this.engine.gainEnergy(this.self, 1, { reason: "天赋【雷狩】" });
    }
  }

  onTurnStart(): void {
    if (!this.followedLastTurn) this.countAttack();
    this.followed = false;
    this.followedLastTurn = false;
  }
}

/** 黄泉：【残梦】9 点开大。队友施加负面状态也会回，依赖敌方，不计入。 */
class AcheronKit extends StatefulKit {
  constructor() {
    super({
      id: "1308",
      notSimulated: ["队友施加负面效果时获得【残梦】（敌方状态不模拟），实际开大会比轴上早"],
      rules: [
        { on: "battleStart", do: (k) => k.gain("行迹【赤鬼】", 5) },
        { on: "turnStart", eidolon: 2, do: (k) => k.gain("E2", 1) },
        { on: "skill", do: (k) => k.gain("战技", 1) },
      ],
    });
  }
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

  constructor() {
    super({ id: "1015", notSimulated: ["【回路连接】连续施放战技（取决于战技点，可用逐动覆盖）"] });
  }

  protected setup(): void {
    this.engine.on("attack", ({ unit, kind }) => {
      if (unit === this.self || kind === "fua" || this.charge <= 0) return;
      this.charge -= 1;
      this.followUp("天赋【心眼（真）】追加攻击", 5);
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
  1205: () => new BladeKit(),
  1213: () => new ImbibitorKit(),
  1315: () => new BoothillKit(),
  1217: () => new HuohuoKit(),
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
