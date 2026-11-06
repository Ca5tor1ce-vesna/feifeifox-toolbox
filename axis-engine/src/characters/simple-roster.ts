/**
 * 机制简单的角色。依据 4.6 正服版本资料，2026-11-02 查证。
 * 只写影响我方行动轴的部分；依赖敌方（受击、消灭、击破、敌方状态）或概率的效果，
 * 引擎是确定性的且不模拟敌方，列进 notSimulated，结果里会提示用户。
 */
import type { SkillPoints } from "../modules/skill-points.ts";
import type { Unit } from "../unit.ts";
import { simple, type CharacterSpec, type SimpleKit } from "./declarative.ts";

// 规格在各场战斗间共用，每场的状态按角色模块实例记。
/** 布洛妮娅 E2：等着行动后提速的战技目标。 */
const bronyaE2 = new WeakMap<SimpleKit, Unit>();
/** 停云的【赐福】：目标和剩余回合；施放时目标正在自己回合里，这一回合不算。 */
/** 花火强化版：战技给的暴击伤害效果在谁身上、还剩几回合（按目标自己的回合数）。 */
const sparkleBuff = new WeakMap<SimpleKit, Map<Unit, number>>();
const tingyunBlessing = new WeakMap<SimpleKit, { unit: Unit; turns: number; armed: boolean }>();
/** 寒鸦的终结技效果：持有者和剩余回合，规则同上。 */
const hanyaUlt = new WeakMap<SimpleKit, { unit: Unit; turns: number; armed: boolean }>();

const specs: CharacterSpec[] = [
  // ---- 存护 ---- //
  { id: "1001", notSimulated: ["天赋反击（受到攻击后）", "E1 冻结回能"] },
  { id: "1104", notSimulated: ["天赋【不屈之身】及其回能（受到致命攻击后）", "E6 立即行动"] },

  // ---- 智识 ---- //
  { id: "1003", notSimulated: ["天赋【乘胜追击】（弱点被击破后）", "终结技消灭回能", "E1 速度提高"] },
  { id: "1013", notSimulated: ["天赋追击（敌方生命值条件）"] },
  {
    id: "1103",
    notSimulated: ["E2 附加伤害回能（概率）"],
    rules: [{ on: "battleStart", do: (k) => k.gain("行迹【电音】", 15) }],
  },
  {
    id: "1314",
    notSimulated: ["天赋追击的回能（充能取决于命中的敌方数量）"],
    rules: [
      { on: "battleStart", do: (k) => k.advanceSelf("行迹【折牙票】", 50) },
      // 成为【收债人】的是自己时，无法获得速度提高效果。
      {
        on: "skill",
        do: (k) => {
          const target = k.targeted("战技");
          if (target) k.speed("战技【收债人】", target, "flat", 30, 3);
        },
      },
    ],
  },
  {
    id: "1405",
    notSimulated: ["回合开始 +30 能量（取决于敌方【质性揭露】状态）", "天赋额外战技（取决于敌方状态）"],
    rules: [{ on: "basic", do: (k) => k.gain("行迹【流浪的能指】", 10) }],
  },

  // ---- 丰饶 ---- //
  { id: "1105", notSimulated: ["E4 受击回能"] },
  { id: "1110", notSimulated: ["行迹【提前勘测】受击回能"] },
  { id: "1203", notSimulated: ["战技自动触发（我方生命值条件）"] },
  { id: "1211", notSimulated: ["E1 回能（我方生命值条件）"] },
  {
    id: "1301",
    rules: [
      { on: "battleStart", eidolon: 1, do: (k) => k.gain("E1", 20) },
      { on: "ultimate", do: (k) => k.advanceSelf("行迹【天然酵母】", 100) },
    ],
  },

  // ---- 巡猎 ---- //
  {
    id: "1002",
    notSimulated: ["行迹【绝影】速度提高（50% 概率）"],
    // E4：施放终结技消灭敌方目标时立即行动。试装遗器之前条件按满足算：每次开大都立即行动。
    rules: [{ on: "ultimate", eidolon: 4, do: (k) => k.advanceSelf("E4：终结技消灭敌方（条件按满足算）立即行动", 100) }],
  },
  {
    id: "1102",
    notSimulated: ["天赋额外回合（消灭敌方后）", "E4 消灭回能", "强化版：敌方生命值 ≤50% 时自动施放战技"],
    // 战技提速 25%：原版持续 2 回合，强化版（3.4）3 回合（4.6.54 版本资料）。
    rules: [
      { on: "basic", do: (k) => k.advanceSelf("行迹【涟漪】", 20) },
      { on: "skill", enhanced: false, do: (k) => k.speed("战技", k.self, "pct", 25, 2) },
      { on: "skill", enhanced: true, do: (k) => k.speed("战技（强化）", k.self, "pct", 25, 3) },
    ],
  },
  {
    id: "1206",
    notSimulated: ["天赋速度提高（弱点被击破后）", "行迹【破敌】拉条（敌方弱点击破状态）"],
    rules: [{ on: "ultimate", do: (k) => k.advanceSelf("终结技：立即行动", 100) }],
  },
  {
    id: "1223",
    notSimulated: ["天赋追击和附加伤害回能（取决于标记敌方受击）", "离场解除时拉条"],
    rules: [
      { on: "battleStart", do: (k) => k.advanceSelf("行迹【手奋匕尺】", 30) },
      { on: "battleStart", eidolon: 1, do: (k) => k.gain("E1", 20) },
    ],
  },
  { id: "1305", notSimulated: ["天赋反击（受到攻击后）及其回能"] },

  // ---- 同谐 ---- //
  {
    id: "1009",
    notSimulated: ["E4 能量恢复效率（蓄能取决于命中的敌方）"],
    // 技能数值按游戏里练得到的等级：终结技 Lv10 +50，E5 Lv12 +52.8（以前取了 Lv15 的 57）。
    rules: [{ on: "ultimate", do: (k) => k.speedTeam("终结技", "flat", k.self.eidolon >= 5 ? 52.8 : 50, 2) }],
  },
  {
    id: "1101",
    rules: [
      // 天赋 Lv10 提前 30%，E3 Lv12 33%（以前取了 Lv15 的 37.5%）。
      { on: "basic", do: (k) => k.advanceSelf("天赋", k.self.eidolon >= 3 ? 33 : 30) },
      // 对自身施放时无法触发立即行动。
      {
        on: "skill",
        do: (k) => {
          const target = k.targeted("战技");
          if (target) k.advanceUnit("战技：立即行动", target, 100);
        },
      },
      // E2：被指定的目标在行动后速度提高 30%，持续 1 回合。只算队友：对自己施放不立即行动。
      {
        on: "skill",
        eidolon: 2,
        do: (k) => {
          const target = k.otherTarget();
          if (target) bronyaE2.set(k, target);
        },
      },
    ],
    // E2 的「行动后」：施放终结技也算行动（攻略视频 BV1n2oqYxE76 3:50：被拉的队友在自己回合前先开大，这时就触发加速，
    // 加速持续 1 回合，到他自己那回合结束就没了）。以前只认普通行动。
    setup: (k) => {
      const trigger = (unit: Unit, label: string) => {
        if (bronyaE2.get(k) !== unit) return;
        bronyaE2.delete(k);
        k.speed(label, unit, "pct", 30, 1);
      };
      k.engine.on("actionDone", ({ unit }) => trigger(unit, "E2：战技目标行动后"));
      k.engine.on("ultimate", ({ unit }) => trigger(unit, "E2：战技目标施放终结技后"));
    },
  },
  {
    id: "1202",
    notSimulated: ["E2 消灭回能"],
    rules: [
      { on: "technique", do: (k) => k.gain("秘技", 50) },
      { on: "turnStart", do: (k) => k.gain("行迹【亨通】", 5) },
      // 【赐福】持续 3 回合，只对最新的战技目标生效。
      { on: "skill", do: (k) => void k.targeted("战技") },
      { on: "ultimate", do: (k) => void k.targeted("终结技") },
      { on: "skill", do: (k) => tingyunBlessing.set(k, { unit: k.target(), turns: 3, armed: !k.target().inTurn }) },
      { on: "skill", do: (k) => k.speed("行迹【驻晴】", k.self, "pct", 20, 1) },
      // 终结技给的能量不吃目标的能量恢复效率（攻略视频 BV18z4y187BB 2:24；早期文案没写「固定」）。
      { on: "ultimate", do: (k) => k.restoreFor("终结技", k.target(), k.self.eidolon >= 6 ? 60 : 50, { fixed: true }) },
    ],
    setup: (k) => {
      k.engine.on("turnEnd", ({ unit }) => {
        const blessing = tingyunBlessing.get(k);
        if (blessing?.unit !== unit) return;
        if (!blessing.armed) blessing.armed = true;
        else if (--blessing.turns <= 0) tingyunBlessing.delete(k);
      });
      // E1：得到【赐福】的我方单体施放终结技后速度提高 20%，持续 1 回合。
      k.engine.on("ultimate", ({ unit }) => {
        if (k.self.eidolon >= 1 && tingyunBlessing.get(k)?.unit === unit) k.speed("E1：【赐福】目标施放终结技后", unit, "pct", 20, 1);
      });
    },
  },
  {
    id: "1215",
    // 行迹【还阳】的能量（战技点恢复时触发）写在战技点系统的未计入里。
    rules: [
      { on: "skill", eidolon: 2, do: (k) => k.speed("E2", k.self, "pct", 20, 1) },
      {
        on: "ultimate",
        do: (k) => {
          const target = k.target();
          k.targeted("终结技");
          // 终结技 Lv10 是寒鸦速度的 20%，E5 Lv12 21%（以前取了 Lv15 的 22.5%）。
          k.speed("终结技", target, "flat", k.self.speed() * (k.self.eidolon >= 5 ? 0.21 : 0.2), 2);
          hanyaUlt.set(k, { unit: target, turns: 2, armed: !target.inTurn });
        },
      },
    ],
    // E1：持有终结技效果的我方目标消灭敌方目标时，寒鸦行动提前 15%，每回合 1 次。
    // 试装遗器之前条件按满足算：目标每次攻击都算消灭。
    setup: (k) => {
      if (k.self.eidolon < 1) return;
      let used = false;
      k.engine.on("turnStart", () => { used = false; });
      k.engine.on("turnEnd", ({ unit }) => {
        const held = hanyaUlt.get(k);
        if (held?.unit !== unit) return;
        if (!held.armed) held.armed = true;
        else if (--held.turns <= 0) hanyaUlt.delete(k);
      });
      k.engine.on("attack", ({ unit, kind }) => {
        if (used || kind === "memosprite" || hanyaUlt.get(k)?.unit !== unit) return;
        used = true;
        k.advanceSelf(`E1：${unit.name} 消灭敌方（条件按满足算）`, 15);
      });
    },
  },
  {
    id: "1303",
    notSimulated: ["终结技【残梅绽】延后敌方"],
    rules: [
      {
        on: "battleStart",
        do: (k) => {
          for (const unit of k.engine.units) {
            // 天赋 Lv10 +10%，E3 Lv12 +10.4%（以前取了 Lv15 的 11%）。
            if (unit !== k.self) k.speed("天赋", unit, "pct", k.self.eidolon >= 3 ? 10.4 : 10, null);
          }
        },
      },
      { on: "turnStart", do: (k) => k.gain("行迹【日消遐思长】", 5) },
    ],
  },
  {
    id: "1306",
    // 强化版（3.4）：秘技开局 +20 能量；战技的暴击伤害效果持续 2 回合（4.6.54 版本资料）。
    // 战技点相关的条目统一写在 modules/skill-points.ts 的未计入里。
    rules: [
      { on: "basic", do: (k) => k.gain("行迹【岁时记】", 10) },
      { on: "technique", enhanced: true, do: (k) => k.gain("秘技（强化）", 20) },
      // 终结技：为我方恢复 6 个战技点（溢出记录最多 10 点不模拟）。
      { on: "ultimate", do: (k) => k.engine.findModule<SkillPoints>("skill-points")?.restore(k.self, 6, "终结技") },
      // 对自身施放时无法触发行动提前。
      {
        on: "skill",
        do: (k) => {
          const target = k.targeted("战技");
          if (target) k.advanceUnit("战技", target, 50);
          if (k.self.enhanced) sparkleBuff.get(k)?.set(target ?? k.self, 2);
        },
      },
    ],
    setup: (k) => {
      if (!k.self.enhanced) return;
      const buffs = new Map<Unit, number>();
      sparkleBuff.set(k, buffs);
      k.engine.on("turnEnd", ({ unit }) => {
        const left = buffs.get(unit);
        if (left) buffs.set(unit, left - 1);
      });
      // 强化版：持有她暴伤效果的角色消耗战技点时，花火 +1 能量。
      // 开了战技点系统就按真实消耗记账；没开时沿用「施放战技」这个近似。
      if (k.engine.findModule("skill-points")) {
        k.engine.on("spChanged", ({ spend, amount }) => {
          if (!spend || amount === 0) return;
          k.gain(`行迹【岁时记】（强化）：消耗 ${Math.abs(amount)} 点战技点`, Math.abs(amount));
        });
      } else {
        k.engine.on("actionDone", ({ unit, casts }) => {
          if (!casts.includes("skill") || !(buffs.get(unit)! > 0)) return;
          k.gain(`行迹【岁时记】（强化）：${unit.name} 消耗战技点`, 1);
        });
      }
    },
  },
  {
    id: "1403",
    notSimulated: ["行迹回能（每击中 1 个目标，取决于敌方数量）"],
    rules: [{ on: "battleStart", do: (k) => k.gain("行迹", 30) }],
    // 天赋：我方其他角色施放终结技后，缇宝追加攻击（基础回能 5）；每个角色最多触发 1 次，缇宝开大时重置。
    // E6：缇宝开大后也发动一次。不依赖敌方（4.6.54 版本资料；攻略视频 BV1HaAieBEsf 3:00 演示每人一次）。
    setup: (k) => {
      const used = new Set<Unit>();
      const followUp = (label: string) => {
        k.self.followUps += 1;
        k.engine.record("fua", k.self, label, { details: ["基础回能 5 × (1+ERR)"] });
        k.engine.gainEnergy(k.self, 5, { reason: label });
        k.engine.attack(k.self, "fua");
      };
      k.engine.on("ultimate", ({ unit }) => {
        if (unit === k.self) {
          used.clear();
          if (k.self.eidolon >= 6) followUp("E6：缇宝开大后的天赋追加攻击");
          return;
        }
        if (used.has(unit)) return;
        used.add(unit);
        followUp(`天赋【好忙好忙的缇宝】：${unit.name}开大后追加攻击`);
      });
    },
  },

  // ---- 虚无 ---- //
  {
    id: "1004",
    notSimulated: ["E2 回能（天赋：攻击减速状态的敌方）", "禁锢、【失重】延后敌方"],
    // 原版：行迹【审判】开大额外 +10。强化版（3.4）：行迹【惩戒】开局 +30，【裁决】开大额外 +5（4.6.54 版本资料）。
    rules: [
      { on: "ultimate", enhanced: false, do: (k) => k.gain("行迹【审判】", 10) },
      { on: "battleStart", enhanced: true, do: (k) => k.gain("行迹【惩戒】（强化）", 30) },
      { on: "ultimate", enhanced: true, do: (k) => k.gain("行迹【裁决】（强化）", 5) },
    ],
  },
  {
    id: "1006",
    notSimulated: ["E1 回能（取决于敌方负面状态）"],
    // 强化版（3.4）行迹【注入】：战斗开始 +20，自己回合开始 +5（4.6.54 版本资料）。原版没有。
    rules: [
      { on: "battleStart", enhanced: true, do: (k) => k.gain("行迹【注入】（强化）", 20) },
      { on: "turnStart", enhanced: true, do: (k) => k.gain("行迹【注入】（强化）：回合开始", 5) },
    ],
  },
  { id: "1106", notSimulated: ["天赋回能（敌方负面状态条件）", "E1 消灭回能", "E2 速度提高（解除敌方增益）"] },
  {
    id: "1108",
    rules: [{ on: "ultimate", do: (k) => k.gain("行迹【后手】", 10) }],
  },
  { id: "1111", notSimulated: ["行迹回能（【斗志】层数取决于队友攻击裂伤敌方）"] },
  {
    id: "1210",
    notSimulated: ["E4 灼烧回能"],
    rules: [{ on: "battleStart", do: (k) => k.advanceSelf("行迹【投狭】", 25) }],
  },
  {
    id: "1218",
    rules: [{ on: "battleStart", do: (k) => k.gain("行迹【爟火】", 15) }],
  },
  {
    id: "1225",
    notSimulated: ["E2 弱点击破回能"],
    rules: [{ on: "ultimate", eidolon: 2, do: (k) => k.advanceAll("E2", 24) }],
  },
  // 强化版（3.4）E4 去掉了「每次【揭露】最多 1 次」的限制，仍然看敌方状态。
  { id: "1307", notSimulated: ["E4 回能（敌方【揭露】状态）"] },
  { id: "1406", notSimulated: ["天赋追击（队友攻击目标后）回能"] },
  { id: "1410" },

  // ---- 毁灭 ---- //
  { id: "1008" },
  { id: "1107", notSimulated: ["天赋反击（受到攻击后）及其回能"] },
  {
    id: "1109",
    notSimulated: ["天赋回能（攻击灼烧敌方）"],
    rules: [
      {
        on: "ultimate",
        do: (k) => {
          k.advanceSelf("行迹【玩火】", 20);
          k.gain("行迹【玩火】", 5);
        },
      },
    ],
  },
  { id: "1214", notSimulated: ["天赋追击（敌方条件）及其回能"] },
  { id: "1312" },
  {
    id: "8001",
    notSimulated: ["E1 消灭回能"],
    rules: [{ on: "battleStart", do: (k) => k.gain("行迹【蓄势】", 15) }],
  },
];

export const SIMPLE_KITS = Object.fromEntries(specs.map((spec) => [spec.id, simple(spec)]));
