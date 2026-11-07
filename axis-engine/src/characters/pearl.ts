/** 真珠（1503）。 */
import { EPS } from "../engine.ts";
import { fmt } from "../format.ts";
import type { ActContext, KitContext } from "../types.ts";
import { Kit } from "./base.ts";

const PEARL_LC_ENERGY = 10;

export class PearlKit extends Kit {
  readonly id = "1503";
  readonly elationNumber = 104;
  readonly ascensionTrace = "欢愉万相★跃然纸上";
  readonly ascensionNote = (level: 1 | 2): string => level === 1
    ? "真珠固有行迹【欢愉万相★跃然纸上】生效：好活当赏持有上限 75；终结技额外回合结束时保留该次好活当赏与笑点的 10%"
    : "真珠固有行迹【欢愉万相★跃然纸上】2级：好活当赏持有上限 75；终结技额外回合结束时保留该次好活当赏与笑点的 20%";
  /** 【深度学习】层数，有层数时用强化普攻。 */
  depth = 0;
  /** 【艺术壁垒】已武装。 */
  barrier = false;
  aesteSlot = 0;

  protected setup(): void {
    // 秘技：【美学底本】跟着当前操控的角色走，进战斗时在进场角色身上（只能是真珠以外的人）。
    // 没指定进场角色、没用秘技时，按用户选的【美学底本】目标算。开大后换成大招目标。
    const holder = this.engine.techniqueHolder();
    this.aesteSlot = holder && holder !== this.self ? holder.slot : this.engine.resolveTarget(this.self, 0);
    // 【美学底本】（欢愉）开大时，消耗一层【艺术壁垒】。排在开大者自己的效果之后、遗器之前。
    this.engine.on("ultimate", ({ unit }) => {
      if (unit === this.self || unit.slot !== this.aesteSlot || !unit.elation) return;
      this.fireBarrier();
    }, 10);
  }

  /**
   * 行迹 1503103：「进入战斗和施放终结技后，若【美学底本】为欢愉命途角色，
   * 使其下一次施放终结技时，为真珠固定恢复 90 点能量。该效果无法叠加。」
   * 所以不依赖秘技；已武装时再武装没有效果。
   */
  onEntry({ engine, self }: KitContext): void {
    if (this.barrier) return;
    const target = engine.unitAt(this.aesteSlot);
    if (!target || target === self || !target.elation) return;
    this.barrier = true;
    engine.record("note", self, "艺术壁垒武装", { details: [`【美学底本】${target.name} 下一次开大时为真珠 +90 固定能量`, "进入战斗"] });
  }

  fireBarrier(reason = ""): void {
    const { engine, self } = this;
    if (!this.barrier) return;
    this.barrier = false;
    const room = Math.max(0, self.maxEnergy - self.energy);
    const details = ["真珠 +90 固定能量（不吃 ERR）"];
    if (reason) details.push(reason);
    if (room < 90 - EPS) details.push(`真珠当前 ${fmt(self.energy, 0)}/${fmt(self.maxEnergy, 0)}，溢出 ${fmt(90 - room, 0)} 点未计入（上限封顶）`);
    engine.record("note", self, "艺术壁垒触发", { details });
    engine.gainEnergy(self, 90, { fixed: true, reason: "艺术壁垒" });
  }

  onTechnique({ engine, self }: KitContext): void {
    this.depth = 2;
    const details = ["【深度学习】2 层", "全队好活当赏 +20"];
    // 指定了进场角色才说明【美学底本】给了谁，不指定时和以前一样。
    const holder = engine.techniqueHolder();
    const aeste = engine.unitAt(this.aesteSlot);
    if (holder === self) details.unshift(`进场角色是真珠自己：【美学底本】只能给别人，按【美学底本】目标 ${aeste?.name ?? ""} 算`);
    else if (holder) details.unshift(`进场角色 ${holder.name} 成为【美学底本】`);
    engine.record("tech", self, "真珠秘技", { details });
    this.el.grantHaohuo([...engine.units], 20, "真珠秘技");
  }

  /** 有【深度学习】时自动打强化普攻，否则战技。 */
  act({ extra }: ActContext): void {
    if (this.depth > 0) this.enhancedBasic(extra);
    else this.skill(extra);
  }

  private enhancedBasic(extra: boolean): void {
    const { engine, self } = this;
    this.depth -= 1;
    engine.record("enhanced_basic", self, "真珠的强化普攻《行笔，幻造星月》", { details: ["消耗 1 层【深度学习】", "群攻群疗", "基础回能 30 × (1+ERR)"], extra });
    engine.gainEnergy(self, 30, { reason: "强化普攻" });
    this.healOrShield("真珠强化普攻群疗");
    engine.attack(self, "enhanced_basic", extra);
  }

  protected skill(extra: boolean): void {
    const { engine, self } = this;
    engine.record("skill", self, `${self.name} 的战技`, { details: ["群疗", "全队好活当赏 +15", "基础回能 30 × (1+ERR)"], extra });
    this.el.grantHaohuo([...engine.units], 15, "真珠战技");
    engine.gainEnergy(self, 30, { reason: "战技" });
    this.healOrShield("真珠战技群疗");
    engine.attack(self, "skill", extra);
  }

  /** 持有上限只在升格后夹到 75，且只夹新获得的那一份。 */
  clampHaohuo = (count: number): number => {
    if (!this.el.huanyuActive()) return count;
    return Math.min(count, Math.max(0, 75 - this.el.haohuoSum(this.self)));
  };

  afterElationCommon = (): void => {
    if (!this.self.equip.hasPearlLc) return;
    this.engine.record("note", this.self, "献给明日的色彩", { details: ["施放欢愉技：固定能量 +10", "我方全体回复生命值"] });
    this.engine.gainEnergy(this.self, PEARL_LC_ENERGY, { fixed: true, reason: "专武" });
    // 专武的群疗也算队友治疗：星神★阿哈行迹 2 +1 愿力（每个终结技周期 1 次）。
    this.healOrShield("真珠专武《献给明日的色彩》群疗");
  };

  onUltimate({ engine, self }: KitContext): void {
    const el = this.el;
    el.grantHaohuo([...engine.units], 20, "真珠终结技");
    this.depth = 3;
    this.barrier = true;
    const count = el.elationUnits().length;
    const pct = count === 1 ? 10 : count === 2 ? 15 : 30;
    // 大招重新指定【美学底本】：秘技给的可能是进场角色，开大后换成用户选的大招目标。
    this.aesteSlot = engine.resolveTarget(self, 0);
    const target = engine.unitAt(this.aesteSlot);
    engine.targetAlly(self, target, "终结技");
    // E2：除真珠和【美学底本】外的其他欢愉角色也拉条。
    const e2Allies = self.eidolon >= 2 ? el.elationUnits().filter((ally) => ally !== self && ally.slot !== this.aesteSlot) : [];
    const details = ["全队好活当赏 +20", "【深度学习】充能 3", `欢愉 ${count} 人 → 【美学底本】拉条 ${fmt(pct, 0)}%`];
    if (count >= 4) details.push("4 欢愉：【美学底本】额外回合（+60 笑点，E2 +120）");
    if (e2Allies.length) details.push(`E2：${e2Allies.map((ally) => ally.name).join("、")} 也拉条 ${fmt(pct, 0)}%`);
    engine.record("note", self, "鉴映灵魂的底色", { details });
    if (target) engine.advance(target, pct, { source: self });
    if (count >= 4 && target) {
      const label = "真珠终结技·【美学底本】额外回合";
      el.extraTurnWithGrants(target, label, {
        punchline: self.eidolon >= 2 ? 120 : 60,
        haohuo: self.eidolon >= 2 ? 60 : 30,
        // 笑点的 10% 就是欢愉万相返还，不再加一次。这里只把该次好活当赏收到 10%。
        after: () => {
          const level = el.ascensionLevel();
          if (!level) return;
          const share = level === 2 ? 0.2 : 0.1;
          let kept = 0;
          const list = el.haohuoOf(target);
          for (let index = list.length - 1; index >= 0; index -= 1) {
            if (list[index].label === label) {
              kept = list[index].count * share;
              list[index].count = kept;
              break;
            }
          }
          engine.record("note", target, "欢愉万相★跃然纸上", {
            details: [`额外回合结束保留该次好活当赏的 ${share * 100}%（${fmt(kept)}）`, "笑点的 10% 已记在欢愉万相返还里，不再另加"],
            extra: true,
          });
        },
      });
    }
    for (const ally of e2Allies) engine.advance(ally, pct, { source: self });
  }

  mechanics = () => ({ depthCharges: this.depth, barrierArmed: this.barrier, aesteSlot: this.aesteSlot });
}
