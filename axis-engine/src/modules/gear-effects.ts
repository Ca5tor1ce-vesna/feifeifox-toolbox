/**
 * 光锥和遗器里影响行动轴的效果。依据 4.6 正服版本文案。
 * 这里只列影响速度、拉条和回能的部分；攻击力、伤害这些不算，战技点这版也不模拟。
 * 光锥的叠影数值从 axis_data.json 的 params 读。p[i] 对应文案里的 #(i+1)，顺序不一定和文案出现的顺序相同，
 * 不随叠影变化的常量也占位（比如能量不足 50% 的 0.5），下标要对着原文的占位符查。
 * 依赖敌方、生命值或随机的写进 notSimulated，结果里会提示，不猜结果。
 */
import type { AxisEngine } from "../engine.ts";
import { fmt } from "../format.ts";
import type { SpeedBuff } from "../types.ts";
import type { Unit } from "../unit.ts";
import { kitOf, TALENT_ATTACK_KINDS, type Elation } from "./elation.ts";

/** 战技或终结技以我方单体、我方全体为目标的角色，给「对我方目标施放…」这类条件用。按 4.6 版本文案整理。 */
const SINGLE_ALLY_SKILL = new Set(["1001", "1101", "1105", "1110", "1202", "1203", "1211", "1217", "1225", "1301", "1306", "1313", "1314", "1412", "1414"]);
const SINGLE_ALLY_ULT = new Set(["1202", "1215", "1313", "1503", "1512", "8009", "8010"]);
const ALL_ALLY_ULT = new Set(["1009", "1101", "1104", "1105", "1110", "1207", "1211", "1217", "1222", "1303", "1306", "1309", "1409", "1414", "1415", "1502", "8005", "8006"]);
/** 欢愉技对我方全体施放的角色。 */
const ALL_ALLY_ELATION = new Set(["1503"]);
/** 终结技对自身单体施放的角色（《欢迎来到银河城》）。 */
const SELF_ULT = new Set(["1506"]);

const percent = (ratio: number): number => Math.round(ratio * 1e6) / 1e4;
const isBasic = (cast: string): boolean => cast === "basic" || cast === "enhanced_basic";

/** 一件穿在身上的装备。效果写法都走这里，时间轴上留说明，用户能看到发生了什么。 */
export class Worn {
  readonly engine: AxisEngine;
  readonly unit: Unit;
  readonly name: string;
  readonly p: readonly number[];

  constructor(engine: AxisEngine, unit: Unit, name: string, params: readonly number[]) {
    this.engine = engine;
    this.unit = unit;
    this.name = name;
    this.p = params;
  }

  note(detail: string): void {
    this.engine.record("note", this.unit, this.name, { details: [detail] });
  }

  /** 常驻属性。同一件装备有两条时用 suffix 区分，同名增益会互相覆盖。 */
  always(kind: SpeedBuff["kind"], value: number, suffix = ""): void {
    this.engine.addSpeedBuff(this.unit, { kind, value, turns: null, label: this.name + suffix });
  }

  /** 按持有者回合计时的增益，规则和速度增益相同。 */
  timed(kind: SpeedBuff["kind"], value: number, turns: number, target: Unit = this.unit, suffix = ""): void {
    this.engine.addSpeedBuff(target, { kind, value, turns, label: this.name + suffix });
  }

  team(kind: SpeedBuff["kind"], value: number, turns: number, suffix = "·全队"): void {
    const unit = kind === "flat" ? " 点" : "%";
    this.note(`我方全体速度 +${fmt(value, 1)}${unit}，持续 ${turns} 回合`);
    for (const ally of this.engine.units) this.timed(kind, value, turns, ally, suffix);
  }

  has(suffix = ""): boolean {
    return this.unit.buffs.some((buff) => buff.label === this.name + suffix);
  }

  drop(suffix = ""): void {
    this.unit.buffs = this.unit.buffs.filter((buff) => buff.label !== this.name + suffix);
  }

  gain(amount: number, options: { fixed?: boolean; target?: Unit } = {}): void {
    const target = options.target ?? this.unit;
    // 用特殊资源开大的角色（【残梦】【飞黄】【隐藏分】等）不吃能量恢复。
    if (target.energyType !== "standard") {
      this.note(`${target.name} 用${target.energyName ? `【${target.energyName}】` : "特殊资源"}开大，不吃能量恢复`);
      return;
    }
    this.note(`${target.name} 能量 +${fmt(amount, 1)}${options.fixed ? "（固定）" : ""}`);
    this.engine.gainEnergy(target, amount, { fixed: options.fixed, reason: this.name });
  }

  gainTeam(amount: number): void {
    for (const ally of this.engine.units) this.gain(amount, { target: ally });
  }

  /** 自身拉条。回合内触发时挂起到回合结束。 */
  advance(pct: number): void {
    this.note(`自身行动提前 ${fmt(pct, 1)}%`);
    this.engine.advance(this.unit, pct, { selfSource: true });
  }

  onBattle(work: () => void): void {
    this.engine.on("battleTraits", ({ unit }) => { if (unit === this.unit) work(); });
  }

  onOpening(work: () => void): void {
    this.engine.on("openingAdvance", ({ unit }) => { if (unit === this.unit) work(); });
  }

  onTurnStart(work: () => void): void {
    this.engine.on("turnStart", ({ unit }) => { if (unit === this.unit) work(); });
  }

  /** 这一动结束后，casts 是这一动实际施放的普攻、战技。 */
  afterCast(work: (casts: readonly string[]) => void): void {
    this.engine.on("actionDone", ({ unit, casts }) => { if (unit === this.unit) work(casts); });
  }

  /** 排在角色自己的终结技效果之后。 */
  onUltimate(work: () => void, priority = 100): void {
    this.engine.on("ultimate", ({ unit }) => { if (unit === this.unit) work(); }, priority);
  }

  /** 装备者自己的攻击，含追加攻击，不含忆灵。 */
  onAttack(work: (kind: string) => void): void {
    this.engine.on("attack", ({ unit, kind }) => {
      if (unit === this.unit && kind !== "memosprite") work(kind);
    });
  }

  onMemosprite(work: (present: boolean) => void): void {
    this.engine.on("memosprite", ({ unit, present }) => { if (unit === this.unit) work(present); });
  }

  /** 「单个回合内不可重复触发」：任意单位回合开始时重置。 */
  oncePerTurn(): () => boolean {
    let used = false;
    this.engine.on("turnStart", () => { used = false; });
    return () => {
      if (used) return false;
      used = true;
      return true;
    };
  }
}

export interface GearEffect {
  name: string;
  apply?: (w: Worn) => void;
  notSimulated?: string[];
  /** 「基础速度提高」的数值在 params 里的位置，进百分比乘区，开战前就要算好。 */
  baseSpeedParam?: number;
}

const staticSpeed = (name: string, index = 0): GearEffect => ({
  name,
  apply: (w) => w.always("pct", percent(w.p[index])),
});
const staticErr = (name: string, index: number): GearEffect => ({
  name,
  apply: (w) => w.always("err", percent(w.p[index])),
});
const onAttackOncePerTurn = (w: Worn, amount: number): void => {
  const first = w.oncePerTurn();
  w.onAttack(() => { if (first()) w.gain(amount); });
};

export const LIGHTCONE_EFFECTS: Record<string, GearEffect> = {
  20008: { name: "嘉果", apply: (w) => w.onBattle(() => w.gainTeam(w.p[0])) },
  20012: {
    name: "轮契",
    notSimulated: ["受到攻击后的回能"],
    apply: (w) => onAttackOncePerTurn(w, w.p[0]),
  },
  20013: {
    name: "灵钥",
    apply: (w) => {
      const first = w.oncePerTurn();
      w.afterCast((casts) => { if (casts.includes("skill") && first()) w.gain(w.p[0]); });
    },
  },
  20014: { name: "相抗", notSimulated: ["消灭敌方目标后的速度提高"] },
  20015: {
    name: "蕃息",
    apply: (w) => w.afterCast((casts) => { if (casts.some(isBasic)) w.advance(percent(w.p[0])); }),
  },
  20019: { name: "调和", apply: (w) => w.onBattle(() => w.team("flat", w.p[0], 1)) },
  20021: {
    name: "焚影",
    apply: (w) => {
      let done = false;
      w.onMemosprite((present) => {
        if (!present || done) return;
        done = true;
        w.gain(w.p[1]);
      });
    },
  },
  21000: staticErr("一场术后对话", 0),
  21004: { name: "记忆中的模样", apply: (w) => onAttackOncePerTurn(w, w.p[1]) },
  21007: {
    name: "同一种心情",
    apply: (w) => w.afterCast((casts) => { if (casts.includes("skill")) w.gainTeam(w.p[1]); }),
  },
  21013: { name: "别让世界静下来", apply: (w) => w.onBattle(() => w.gain(w.p[1])) },
  21018: {
    name: "舞！舞！舞！",
    apply: (w) => w.onUltimate(() => {
      const pct = percent(w.p[0]);
      w.note(`我方全体行动提前 ${fmt(pct, 1)}%`);
      w.engine.advanceAllies(w.unit, pct);
    }, 30),
  },
  21021: {
    name: "等价交换",
    notSimulated: ["多名队友能量不足 50% 时随机选 1 名，这时不计入"],
    apply: (w) => w.onTurnStart(() => {
      const low = w.engine.units.filter((ally) =>
        ally !== w.unit && ally.energyType === "standard" && ally.energy < ally.maxEnergy * 0.5);
      if (low.length === 1) w.gain(w.p[1], { target: low[0] });
    }),
  },
  21024: {
    name: "春水初生",
    notSimulated: ["受到伤害后速度提高失效（这里按一直生效）"],
    apply: (w) => w.always("pct", percent(w.p[0])),
  },
  21032: { name: "镂月裁云之意", notSimulated: ["随机生效的能量恢复效率提高"] },
  21045: {
    name: "谐乐静默之后",
    apply: (w) => w.onUltimate(() => {
      w.note(`速度 +${fmt(percent(w.p[1]), 1)}%，持续 2 回合`);
      w.timed("pct", percent(w.p[1]), 2);
    }),
  },
  21047: {
    name: "黑夜如影随行",
    notSimulated: ["造成击破伤害后再次提速"],
    apply: (w) => w.onBattle(() => w.timed("pct", percent(w.p[1]), 2)),
  },
  21048: {
    name: "梦的蒙太奇",
    notSimulated: ["攻击弱点击破状态的敌人时回能"],
    apply: (w) => w.always("pct", percent(w.p[0])),
  },
  22000: { name: "新手任务开始前", notSimulated: ["攻击防御力被降低的敌人时回能"] },
  23003: staticErr("但战斗还未结束", 0),
  23006: {
    name: "只需等待",
    apply: (w) => {
      let stacks = 0;
      w.onAttack(() => {
        stacks = Math.min(3, stacks + 1);
        w.always("pct", percent(w.p[2]) * stacks);
      });
    },
  },
  23008: {
    name: "棺的回响",
    apply: (w) => {
      // 每击中 1 名不同目标回能，最多 3 名。普攻按单体，其余按敌人数量，实际取决于攻击范围。
      w.onAttack((kind) => {
        const hits = kind === "basic" || kind === "enhanced_basic" ? 1 : Math.min(3, w.engine.enemyCount);
        w.engine.gainEnergy(w.unit, w.p[2] * hits, { reason: w.name });
      });
      w.onUltimate(() => w.team("flat", w.p[1], 1));
    },
  },
  23011: staticErr("她已闭上双眼", 3),
  23015: {
    name: "比阳光更明亮的",
    apply: (w) => {
      let stacks = 0;
      w.afterCast((casts) => {
        if (!casts.some(isBasic)) return;
        stacks = w.has() ? Math.min(2, stacks + 1) : 1;
        w.timed("err", percent(w.p[4]) * stacks, 2);
      });
    },
  },
  23017: staticErr("惊魂夜", 0),
  23019: {
    name: "镜中故我",
    apply: (w) => w.onBattle(() => {
      // 同类技能无法重复生效：两人都穿也只回一次。
      if (w.engine.onceInBattle(w.name)) w.gainTeam(w.p[4]);
    }),
  },
  23026: {
    name: "夜色流光溢彩",
    apply: (w) => {
      let stacks = 0;
      w.engine.on("attack", ({ kind }) => {
        if (kind === "memosprite" || !TALENT_ATTACK_KINDS.includes(kind) || stacks >= 5) return;
        stacks += 1;
        w.always("err", percent(w.p[0]) * stacks);
      }, 50);
      w.onUltimate(() => {
        stacks = 0;
        w.drop();
      });
    },
  },
  23027: {
    name: "驶向第二次生命",
    notSimulated: ["速度提高要求击破特攻 ≥ 150%，这里假设满足"],
    apply: (w) => w.always("pct", percent(w.p[3])),
  },
  23033: {
    name: "忍法帖•缭乱破魔",
    apply: (w) => {
      let basics = -1; // -1：没有【雷遁】。
      w.onBattle(() => w.gain(w.p[1]));
      w.onUltimate(() => { basics = 0; });
      w.afterCast((casts) => {
        if (basics < 0 || !casts.some(isBasic)) return;
        basics += 1;
        if (basics < 2) return;
        basics = -1;
        w.advance(percent(w.p[2]));
      });
    },
  },
  23034: {
    name: "回到大地的飞行",
    apply: (w) => {
      w.afterCast((casts) => {
        if (casts.includes("skill") && SINGLE_ALLY_SKILL.has(w.unit.id)) w.gain(w.p[0]);
      });
      w.onUltimate(() => { if (SINGLE_ALLY_ULT.has(w.unit.id)) w.gain(w.p[0]); });
    },
  },
  23036: { name: "将光阴织成黄金", baseSpeedParam: 0 },
  23038: {
    name: "如果时间是一朵花",
    apply: (w) => {
      w.onBattle(() => w.gain(21));
      w.onAttack((kind) => { if (kind === "fua") w.gain(12); });
    },
  },
  23040: {
    name: "让告别，更美一些",
    apply: (w) => {
      let armed = true;
      w.onMemosprite((present) => {
        if (present || !armed) return;
        armed = false;
        w.advance(percent(w.p[3]));
      });
      w.onUltimate(() => { armed = true; });
    },
  },
  23041: { name: "生命当付之一炬", apply: (w) => w.onTurnStart(() => w.gain(10)) },
  23042: staticSpeed("愿虹光永驻天空"),
  23043: staticSpeed("谎言在风中飘扬"),
  23044: { name: "黎明恰如此燃烧", baseSpeedParam: 0 },
  23045: {
    name: "没有回报的加冕",
    apply: (w) => w.onUltimate(() => {
      if (w.unit.maxEnergy >= 300) w.gain(w.unit.maxEnergy * 0.1, { fixed: true });
    }),
  },
  23047: { name: "海洋为何而歌", notSimulated: ["攻击【魂迷】状态的敌人时提速（依赖敌方状态和概率）"] },
  23049: {
    name: "致长夜的星光",
    apply: (w) => w.onMemosprite((present) => { if (!present) w.gain(w.p[3]); }),
  },
  23052: staticSpeed("爱如此刻永恒"),
  23054: {
    name: "当她决定看见",
    apply: (w) => {
      w.always("pct", percent(w.p[0]), "·速度");
      w.onBattle(() => {
        w.timed("err", percent(w.p[4]), 3);
        w.note("每波次开始：固定能量 +15（这里只算一波）");
        w.engine.gainEnergy(w.unit, 15, { fixed: true, reason: w.name });
      });
      w.onUltimate(() => {
        if (SINGLE_ALLY_ULT.has(w.unit.id) || ALL_ALLY_ULT.has(w.unit.id)) w.timed("err", percent(w.p[4]), 3);
      });
    },
  },
  23055: {
    name: "献给明日的色彩",
    apply: (w) => w.onAttack((kind) => {
      if (kind !== "elation_skill" || !ALL_ALLY_ELATION.has(w.unit.id)) return;
      w.gain(10, { fixed: true });
      // 同一下「为我方全体回复生命值」：星神★阿哈行迹 2 受到队友治疗 +1 愿力（4.6.54 版本资料；2026-11-07 群里反馈）。
      const aha = w.engine.findUnit("1511");
      if (aha) kitOf(aha)?.onHealOrShield?.("真珠专武《献给明日的色彩》群疗");
    }),
  },
  23057: {
    name: "欢迎来到银河城",
    apply: (w) => {
      w.always("pct", percent(w.p[0]));
      let armed = true;
      let basics = 0;
      w.onUltimate(() => {
        if (!armed || !SELF_ULT.has(w.unit.id)) return;
        armed = false;
        basics = 0;
        w.note(`对自身开大：笑点 +${fmt(w.p[2], 0)}`);
        w.engine.module<Elation>("elation")?.gainPunchline(w.p[2]);
      });
      w.afterCast((casts) => {
        if (casts.some(isBasic) && ++basics >= 3) armed = true;
      });
    },
  },
  23058: {
    name: "邂逅于下一个花季",
    apply: (w) => {
      const over = Math.min(360, Math.max(0, w.unit.maxEnergy - 120));
      w.always("err", percent(w.p[3]) + 0.3 * Math.floor(over / 10));
    },
  },
  23059: {
    name: "灼尽炼狱的新骸",
    apply: (w) => {
      let done = false;
      w.onTurnStart(() => {
        if (done) return;
        done = true;
        w.gain(20, { fixed: true });
      });
    },
  },
  23060: {
    name: "当一颗星照亮夜空",
    // 装备者施放助战技时回能。攻略实测 BV1cBMe69Ejk 2:36：队友用助战技、协议送的也算（都算姬子•启行施放）。
    apply: (w) => w.engine.on("assist", ({ owner }) => {
      if (owner === w.unit) w.gain(w.p[1]);
    }),
  },
  23062: staticErr("所见即我", 1),
  23063: {
    name: "你将起身歌唱",
    apply: (w) => {
      w.onOpening(() => {
        w.timed("pct", 0, 2, w.unit, "·新声");
        w.advance(percent(w.p[1]));
      });
      w.engine.addSpeedModifier(() => (w.has("·新声") ? { pct: percent(w.p[2]) } : {}));
    },
  },
  23064: {
    name: "向浪花掷下盛夏",
    apply: (w) => w.onAttack((kind) => {
      if (kind === "elation_skill") w.always("pct", percent(w.p[1]));
    }),
  },
  // 以下两件 4.6.54 版本资料（和星神★阿哈同版本进正式服）。
  23065: {
    name: "当第一声「阿哈」响起",
    baseSpeedParam: 0,
    // 战技给笑点写在星神★阿哈的模块里（每 2 回合 1 次）；别人穿只算基础速度。
    apply: (w) => {
      if (w.unit.id !== "1511") w.onBattle(() => w.note("对我方其他单体施放战技获得笑点：只给星神★阿哈算"));
    },
  },
  24003: { name: "孤独的疗愈", notSimulated: ["持续伤害目标被消灭时回能"] },
  24004: { name: "不息的演算", notSimulated: ["一次击中 3 名以上敌人时提速"] },
  24005: staticSpeed("记忆永不落幕"),
};

const relicSpeed = (name: string, notSimulated?: string[]): GearEffect => ({ name, notSimulated, apply: (w) => w.always("pct", 6, "·2件") });
const relicErr = (name: string): GearEffect => ({ name, apply: (w) => w.always("err", 5, "·2件") });

/** 键是「套装 id:件数」，4 件套同时生效 2 件效果。 */
export const RELIC_EFFECTS: Record<string, GearEffect> = {
  "102:4": { name: "野穗伴行的快枪手", apply: (w) => w.always("pct", 6, "·4件") },
  "106:4": { name: "戍卫风雪的铁卫", notSimulated: ["生命值 ≤ 50% 时回合开始回能"] },
  "110:4": {
    name: "晨昏交界的翔鹰",
    apply: (w) => w.onUltimate(() => w.advance(25), 20),
  },
  "111:4": { name: "流星追迹的怪盗", notSimulated: ["击破敌方弱点后回能"] },
  "114:2": relicSpeed("骇域漫游的信使"),
  "114:4": {
    name: "骇域漫游的信使",
    apply: (w) => w.onUltimate(() => {
      if (SINGLE_ALLY_ULT.has(w.unit.id) || ALL_ALLY_ULT.has(w.unit.id)) w.team("pct", 12, 1);
    }),
  },
  "121:2": relicSpeed("重循苦旅的司铎"),
  "123:4": {
    name: "凯歌祝捷的英豪",
    apply: (w) => w.engine.addSpeedModifier((unit) => (unit === w.unit && unit.memosprite ? { pct: 6 } : {})),
  },
  "124:4": { name: "哀歌覆国的诗人", apply: (w) => w.always("pct", -8, "·4件") },
  "125:2": relicSpeed("烈阳惊雷的女武神"),
  "125:4": {
    name: "烈阳惊雷的女武神",
    notSimulated: ["【甘霖】要求治疗队友，这里假设每次行动都治疗"],
    apply: (w) => w.afterCast(() => w.timed("pct", 6, 2, w.unit, "·甘霖")),
  },
  "130:2": relicSpeed("应天涉远的卜者"),
  "133:2": relicSpeed("戏梦点星的伶人"),
  "308:2": {
    name: "生命的翁瓦克",
    apply: (w) => {
      w.always("err", 5, "·2件");
      // 试装遗器之前，有条件的开局拉条一律按满足算。
      w.onOpening(() => {
        if (w.unit.initialSpeed < 120 && w.unit.measured) {
          // 用「角色与遗器」的实际装配时按真实速度判断（1.2）。
          w.note(`速度 ${fmt(w.unit.initialSpeed, 1)} < 120，不触发`);
          return;
        }
        if (w.unit.initialSpeed < 120) w.note(`速度 ${fmt(w.unit.initialSpeed, 1)} < 120，条件按满足算`);
        w.advance(40);
      });
    },
  },
  "312:2": relicErr("梦想之地匹诺康尼"),
  "316:2": relicSpeed("劫火莲灯铸炼宫"),
  "317:2": relicErr("沉陆海域露莎卡"),
  "320:2": relicSpeed("渊思寂虑的巨树"),
  "323:2": {
    name: "永恒之地翁法罗斯",
    // 该效果无法叠加：两人都穿也只算一次。
    apply: (w) => {
      if (!w.engine.onceInBattle(w.name)) return;
      const wearers = w.engine.units.filter((unit) => unit.gear?.relics.some((relic) => relic.id === "323"));
      w.engine.addSpeedModifier(() => (wearers.some((unit) => unit.memosprite) ? { pct: 8 } : {}));
    },
  },
  // 以下两套 4.6.54 版本资料。
  "329:2": {
    name: "神的瞬息欢愉",
    // 「当装备者的欢愉度大于等于 40% 时，进入战斗时立刻使行动提前 40%。」本工具不算欢愉度，
    // 试装遗器之前按满足算。星神★阿哈速度 ≥ 125 时行迹【盒中蕴藏的世界】给欢愉度 +120%，本来就够。
    apply: (w) => {
      w.always("pct", 6, "·2件");
      w.onOpening(() => {
        const aha = w.unit.id === "1511" && w.unit.initialSpeed >= 125;
        const measured = w.unit.measured;
        if (measured && !aha) {
          // 用「角色与遗器」的实际装配时按面板欢愉度判断（1.2）。
          const elation = `${(Math.floor(measured.elation * 1000 + 1e-6) / 10).toFixed(1)}%`;
          if (measured.elation < 0.4 - 1e-9) {
            w.note(`欢愉度 ${elation} < 40%，不触发`);
            return;
          }
          w.note(`欢愉度 ${elation} ≥ 40%`);
          w.advance(40);
          return;
        }
        w.note(aha ? `速度 ${fmt(w.unit.initialSpeed, 1)} ≥ 125：行迹【盒中蕴藏的世界】欢愉度 +120% 以上，满足 40%` : "欢愉度 ≥ 40% 的条件按满足算");
        w.advance(40);
      });
    },
  },
  "330:2": relicSpeed("亚空异容所"),
};
