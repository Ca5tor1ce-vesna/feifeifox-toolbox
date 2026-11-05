/**
 * 机制简单的角色。依据 4.6 正服版本资料，2026-11-02 查证。
 * 只写影响我方行动轴的部分；依赖敌方（受击、消灭、击破、敌方状态）或概率的效果，
 * 引擎是确定性的且不模拟敌方，列进 notSimulated，结果里会提示用户。
 */
import type { Unit } from "../unit.ts";
import { simple, type CharacterSpec, type SimpleKit } from "./declarative.ts";

// 规格在各场战斗间共用，每场的状态按角色模块实例记。
/** 布洛妮娅 E2：等着行动后提速的战技目标。 */
const bronyaE2 = new WeakMap<SimpleKit, Unit>();
/** 停云的【赐福】：目标和剩余回合；施放时目标正在自己回合里，这一回合不算。 */
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
          const target = k.otherTarget();
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
    notSimulated: ["天赋额外回合（消灭敌方后）", "E4 消灭回能"],
    rules: [
      { on: "basic", do: (k) => k.advanceSelf("行迹【涟漪】", 20) },
      { on: "skill", do: (k) => k.speed("战技", k.self, "pct", 25, 2) },
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
    rules: [{ on: "ultimate", do: (k) => k.speedTeam("终结技", "flat", 57, 2) }],
  },
  {
    id: "1101",
    rules: [
      { on: "basic", do: (k) => k.advanceSelf("天赋", 37.5) },
      // 对自身施放时无法触发立即行动。
      {
        on: "skill",
        do: (k) => {
          const target = k.otherTarget();
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
    setup: (k) => k.engine.on("actionDone", ({ unit }) => {
      if (bronyaE2.get(k) !== unit) return;
      bronyaE2.delete(k);
      k.speed("E2：战技目标行动后", unit, "pct", 30, 1);
    }),
  },
  {
    id: "1202",
    notSimulated: ["E2 消灭回能"],
    rules: [
      { on: "technique", do: (k) => k.gain("秘技", 50) },
      { on: "turnStart", do: (k) => k.gain("行迹【亨通】", 5) },
      // 【赐福】持续 3 回合，只对最新的战技目标生效。
      { on: "skill", do: (k) => tingyunBlessing.set(k, { unit: k.target(), turns: 3, armed: !k.target().inTurn }) },
      { on: "skill", do: (k) => k.speed("行迹【驻晴】", k.self, "pct", 20, 1) },
      { on: "ultimate", do: (k) => k.gainFor("终结技", k.target(), k.self.eidolon >= 6 ? 60 : 50) },
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
    id: "1207",
    notSimulated: ["行迹【气壮】回能（【鸣弦号令】层数取决于秘技和战技）", "E2 回能（队友满能条件）"],
    rules: [{ on: "battleStart", eidolon: 1, do: (k) => k.speedTeam("E1", "pct", 10, 2) }],
  },
  {
    id: "1215",
    notSimulated: ["行迹【还阳】回能（战技点恢复有概率）"],
    rules: [
      { on: "skill", eidolon: 2, do: (k) => k.speed("E2", k.self, "pct", 20, 1) },
      {
        on: "ultimate",
        do: (k) => {
          const target = k.target();
          k.speed("终结技", target, "flat", k.self.speed() * 0.225, 2);
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
            if (unit !== k.self) k.speed("天赋", unit, "pct", 11, null);
          }
        },
      },
      { on: "turnStart", do: (k) => k.gain("行迹【日消遐思长】", 5) },
    ],
  },
  {
    id: "1306",
    rules: [
      { on: "basic", do: (k) => k.gain("行迹【岁时记】", 10) },
      // 对自身施放时无法触发行动提前。
      {
        on: "skill",
        do: (k) => {
          const target = k.otherTarget();
          if (target) k.advanceUnit("战技", target, 50);
        },
      },
    ],
  },
  {
    id: "1403",
    notSimulated: ["行迹回能（每击中 1 个目标，取决于敌方数量）", "天赋追击回能"],
    rules: [{ on: "battleStart", do: (k) => k.gain("行迹", 30) }],
  },
  {
    id: "1412",
    notSimulated: ["持有【军功】角色攻击时的回能（待接入攻击事件）"],
    rules: [
      {
        on: "skill",
        do: (k) => {
          k.speed("行迹【征服者】", k.self, "flat", 20, 3);
          const target = k.otherTarget();
          if (target) k.speed("行迹【征服者】", target, "flat", 20, 3);
        },
      },
      { on: "skill", eidolon: 1, do: (k) => k.gainFor("E1", k.target(), 2) },
    ],
  },

  // ---- 虚无 ---- //
  {
    id: "1004",
    notSimulated: ["E2 回能（天赋：攻击减速状态的敌方）", "禁锢延后敌方"],
    rules: [{ on: "ultimate", do: (k) => k.gain("行迹【审判】", 10) }],
  },
  { id: "1005", notSimulated: ["天赋追击（队友攻击目标后）的回能", "持续伤害相关回能"] },
  { id: "1006", notSimulated: ["E1 回能（取决于敌方负面状态）"] },
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
  { id: "1312", notSimulated: ["天赋回能（战技点消耗，引擎不模拟战技点）"] },
  {
    id: "8001",
    notSimulated: ["E1 消灭回能"],
    rules: [{ on: "battleStart", do: (k) => k.gain("行迹【蓄势】", 15) }],
  },
];

export const SIMPLE_KITS = Object.fromEntries(specs.map((spec) => [spec.id, simple(spec)]));
