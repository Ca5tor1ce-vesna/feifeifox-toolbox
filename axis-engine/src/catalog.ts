/** 欢愉队已收录角色、装备开关和可调参数。资料冲突时按「游戏内文案 > live 版资料 > 其他资料」采信。 */
export const CATALOG = {
  "ahaWeights": [
    {
      "divisor": 5,
      "rank": 1,
      "weight": 0.2
    },
    {
      "divisor": 10,
      "rank": 2,
      "weight": 0.1
    },
    {
      "divisor": 20,
      "rank": 3,
      "weight": 0.05
    },
    {
      "divisor": 40,
      "rank": 4,
      "weight": 0.025
    }
  ],
  "avNodes": [
    {
      "av": 150,
      "label": "0T 首轮 (150 AV)",
      "t": 0
    },
    {
      "av": 250,
      "label": "1T 次轮 (250 AV)",
      "t": 1
    },
    {
      "av": 350,
      "label": "2T 三轮 (350 AV)",
      "t": 2
    },
    {
      "av": 450,
      "label": "3T 四轮 (450 AV)",
      "t": 3
    }
  ],
  "config": [
    {
      "default": 300,
      "key": "maxAV",
      "label": "模拟上限 (AV)",
      "max": 1000,
      "min": 1,
      "type": "number"
    },
    {
      "default": null,
      "key": "useAeonAha",
      "label": "启用【阿哈时刻在】升格底速",
      "type": "bool"
    },
    {
      "default": true,
      "key": "useTech",
      "label": "计入秘技进战效果",
      "type": "bool"
    },
    {
      "default": true,
      "key": "trace3Advance",
      "label": "阿哈行迹3 进战自身拉条 30%",
      "type": "bool"
    },
    {
      "default": 20,
      "key": "ultAdvanceAha",
      "label": "阿哈终结技拉条【阿哈时刻】%",
      "max": 100,
      "min": 0,
      "type": "number"
    },
    {
      "default": 5,
      "key": "e1Wishpower",
      "label": "阿哈 E1 开局愿力",
      "max": 10,
      "min": 0,
      "type": "number"
    },
    {
      "default": 30,
      "key": "ultSpdPct",
      "label": "砂金•戏浪终结技自提速%",
      "max": 200,
      "min": 0,
      "type": "number"
    },
    {
      "default": 15,
      "key": "sanduTeamSpdPct",
      "label": "三赌牌局全队提速%",
      "max": 200,
      "min": 0,
      "type": "number"
    },
    {
      "default": 1,
      "key": "sanduFervorGain",
      "label": "三赌牌局每次队友攻击热意",
      "max": 10,
      "min": 0,
      "type": "number"
    },
    {
      "default": 1,
      "key": "sanduPunchlineGain",
      "label": "三赌牌局每次队友攻击笑点",
      "max": 10,
      "min": 0,
      "type": "number"
    },
    {
      "default": 24,
      "key": "dancePct",
      "label": "舞！舞！舞！全队拉条%",
      "max": 100,
      "min": 0,
      "type": "number"
    },
    {
      "default": 24,
      "key": "summerLcSpdPct",
      "label": "【风口】自提速%",
      "max": 200,
      "min": 0,
      "type": "number"
    },
    {
      "default": 10,
      "key": "sigLcPunchline",
      "label": "阿哈专武战技笑点",
      "max": 100,
      "min": 0,
      "type": "number"
    },
    {
      "default": 94,
      "key": "aeonAhaBaseSpd",
      "label": "【阿哈时刻】底速",
      "max": 1000,
      "min": 0,
      "type": "number"
    },
    {
      "default": 12,
      "key": "aeonAhaLcBaseSpd",
      "label": "【阿哈时刻】专武基础速度",
      "max": 1000,
      "min": 0,
      "type": "number"
    },
    {
      "default": 0,
      "key": "ahaSpdPct",
      "label": "【阿哈时刻】额外速度%",
      "max": 1000,
      "min": -100,
      "type": "number"
    },
    {
      "default": 0,
      "key": "ahaAdvancePct",
      "label": "开局拉条【阿哈时刻】%",
      "max": 100,
      "min": 0,
      "type": "number"
    },
    {
      "choices": [
        "punchline",
        "flat"
      ],
      "default": "punchline",
      "key": "feiyingHaohuoEnergyMode",
      "label": "绯英好活当赏回能方式",
      "type": "choice"
    },
    {
      "default": 20,
      "key": "feiyingHaohuoEnergy",
      "label": "绯英好活当赏固定回能（flat）",
      "max": 480,
      "min": 0,
      "type": "number"
    }
  ],
  "cycles": {
    "cycle0AV": 150,
    "cycleAV": 100,
    "distBase": 10000
  },
  "defaultTeam": [
    {
      "elation": true,
      "id": "1511"
    },
    {
      "elation": true,
      "id": "1513"
    },
    {
      "elation": true,
      "id": "1503",
      "targetSlot": 0
    },
    {
      "elation": true,
      "id": "1501"
    }
  ],
  "equipment": [
    {
      "id": "vonwacq",
      "name": "生命的翁瓦克 (2pc)",
      "text": "ERR +5%；进战时速度 ≥ 120 则开局拉条 40%"
    },
    {
      "id": "godJoy",
      "name": "神的瞬息欢愉 (2pc)",
      "text": "速度 +6%；开局 40% 拉条需要欢愉度 ≥ 40%（本工具不模拟欢愉度，因此不拉条）"
    },
    {
      "id": "windSet4",
      "name": "晨昏交界的翔鹰 (4pc)",
      "text": "施放终结技后自身拉条 25%（回合内开大则回合结束再扣）"
    },
    {
      "id": "danceS5",
      "name": "叠5 舞！舞！舞！",
      "text": "施放终结技后我方全体拉条 24%（可调 dancePct）"
    },
    {
      "id": "hasSigLc",
      "name": "星神★阿哈专武《当第一声「阿哈」响起》",
      "text": "基础速度 +12；战技给笑点（每 2 回合 1 次）"
    },
    {
      "id": "hasSummerLc",
      "name": "《向浪花掷下盛夏》",
      "text": "施放欢愉技获【风口】：自身速度 +24%~40%（按常驻处理）"
    },
    {
      "id": "hasPearlLc",
      "name": "真珠专武《献给明日的色彩》",
      "text": "装备者对我方全体施放欢愉技时固定恢复 10 点能量（S1）"
    },
    {
      "id": "hasYaoLc",
      "name": "爻光/开拓者专武《当她决定看见》",
      "text": "ERR +12%；每波次开始固定恢复 15 点能量（本工具=战斗开始一次）"
    },
    {
      "id": "hasFeiyLc",
      "name": "绯英专武《邂逅于下一个花季》",
      "text": "ERR +10%，能量上限超过 120 时每 10 点再 +0.3%，最多计 360 点（480 上限时共 +20.8%）"
    },
    {
      "id": "hasSundayLc",
      "name": "星期日专武《回到大地的飞行》",
      "text": "对我方单体施放战技/终结技后，自身恢复 6 点能量（S1）"
    },
    {
      "id": "hasRobinLc",
      "name": "知更鸟专武《夜色流光溢彩》",
      "text": "我方每次攻击叠 1 层【歌咏】，每层 ERR +3%，最多 5 层；开大时清空"
    },
    {
      "id": "hasWolfLc",
      "name": "银狼专武《欢迎来到银河城》",
      "text": "对自身施放终结技时获得 20 点笑点（S1），并同步为隐藏分"
    }
  ],
  "roster": [
    {
      "aliases": [
        "xuzhao",
        "aeon_aha"
      ],
      "baseSpd": 94,
      "elation": true,
      "energy": "wishpower",
      "energyName": "愿力",
      "id": "1511",
      "lcBaseSpd": 12,
      "maxSp": 8,
      "mechanics": [
        "特殊能量【愿力】：上限 8（可溢出到 10），不受 ERR 加成",
        "专属被动【阿哈时刻在】：【阿哈时刻】底速 = 本体基础速度（含专武）",
        "行迹3【盒中蕴藏的世界】：进战自身拉条 30%（速度 ≥125/150 时欢愉度 +120%/+150%）",
        "战技：指定【「欢愉」令使】并发动量子欢愉追击（净耗 0 战技点）",
        "终结技：拉条【阿哈时刻】20%，进入【欢愉万相】3 回合；E6 首次改为拉条 100% 并获得 100 笑点",
        "固有行迹【欢愉万相★无中生有】：开大后的【欢愉万相】使欢愉命途升格，返还消耗笑点的 10%（E2 只加强暴击与无视防御）"
      ],
      "name": "星神★阿哈",
      "path": "欢愉",
      "rotation": "skill",
      "traceSpd": 5
    },
    {
      "aliases": [
        "pearl"
      ],
      "baseSpd": 99,
      "elation": true,
      "energy": "standard",
      "energyName": "能量",
      "id": "1503",
      "lcBaseSpd": 0,
      "maxSp": 180,
      "mechanics": [
        "指定【美学底本】（不能是自己）",
        "战技：群疗 + 全队好活当赏 +15（基础回能 30 × ERR）",
        "有【深度学习】时自动打强化普攻（群攻群疗，基础回能 30 × ERR）",
        "终结技：真珠全体拉条 10%/15%/30%（按欢愉人数）；4 欢愉时给【美学底本】额外回合",
        "行迹3【艺术壁垒】：【美学底本】（欢愉）下一次开大时真珠 +90 固定能量",
        "固有行迹【欢愉万相★跃然纸上】：升格后好活当赏上限 75；终结技额外回合结束保留该次好活当赏与笑点的 10%"
      ],
      "name": "真珠",
      "path": "欢愉",
      "rotation": "auto",
      "traceSpd": 9
    },
    {
      "aliases": [
        "aventurine_sp"
      ],
      "baseSpd": 107,
      "elation": true,
      "energy": "standard",
      "energyName": "能量",
      "id": "1513",
      "lcBaseSpd": 0,
      "maxSp": 130,
      "mechanics": [
        "天赋：队友每次攻击 +1 热意 +1 笑点；行迹3【旧梦淘金】再 +2 热意（6 次/战技周期）",
        "战技：+4 笑点 +4 热意，【旧梦淘金】充能重置 6（基础回能 30 × ERR）",
        "终结技：+6 笑点 +8 热意，自身速度 +30%（4 回合）",
        "热意过阈值（E0 10，上限 30；E1 10/20/30；E2 10/20/30/40/50）立刻在回合外放《举杯！敬炽烈一夏》（好活当赏计入 20，不进笑点池），并把下一次阿哈时刻欢愉技升级为《All in！》",
        "行迹2【纵享惊涛】：单欢愉或三赌牌局时队友攻击 → 【阿哈时刻】+25 固定速度",
        "固有行迹【欢愉万相★三赌牌局】：升格且另一名欢愉只有星神★阿哈时，纵享惊涛加强为全队速度 +15%、攻击热意 +1、笑点 +1"
      ],
      "name": "砂金•戏浪",
      "path": "欢愉",
      "rotation": "skill",
      "traceSpd": 9
    },
    {
      "aliases": [
        "aventurine"
      ],
      "baseSpd": 106,
      "elation": false,
      "energy": "standard",
      "energyName": "能量",
      "id": "1304",
      "lcBaseSpd": 0,
      "maxSp": 110,
      "mechanics": [
        "战技/追击给全队护盾 → 触发阿哈行迹2（+1 愿力）",
        "【盲注】：每次攻击 +1 层，7 层触发 7 段追击（基础回能 7 × ERR）"
      ],
      "name": "砂金(存护)",
      "path": "存护",
      "rotation": "skill",
      "traceSpd": 0
    },
    {
      "aliases": [
        "yaoguang"
      ],
      "baseSpd": 101,
      "elation": true,
      "energy": "standard",
      "energyName": "能量",
      "id": "1502",
      "lcBaseSpd": 0,
      "maxSp": 180,
      "mechanics": [
        "普攻基础回能 30（战技 30，终结技返还 5）",
        "秘技/战技：展开 3 回合结界；结界内自己普攻/战技 +3 笑点，E2 全队速度 +12%",
        "终结技：+5 笑点并给【阿哈时刻】1 个额外回合（20 笑点，E1 为 40）",
        "欢愉万相★心灵感应（命途升格）：【大吉大利】倍率提高原倍率的 20%（10 级 20%→24%）；终结技 +12 固定能量 +10 笑点"
      ],
      "name": "爻光",
      "path": "欢愉",
      "rotation": "skill",
      "traceSpd": 9
    },
    {
      "aliases": [
        "sparxie"
      ],
      "baseSpd": 107,
      "elation": true,
      "energy": "standard",
      "energyName": "能量",
      "id": "1501",
      "lcBaseSpd": 0,
      "maxSp": 160,
      "mechanics": [
        "战技/普攻 +4 笑点（基础回能 30）",
        "终结技：2 + (2/4/8 按其他欢愉人数) 笑点，E4 再 +5",
        "E2：【阿哈时刻】每次结束立刻获得 1 个额外回合",
        "固有行迹【欢愉万相★兔子戏法】：升格后欢愉技倍率提高原倍率的 50%，我方伤害无视 15% 防御；红红火火的额外笑点不模拟"
      ],
      "name": "火花",
      "path": "欢愉",
      "rotation": "skill",
      "traceSpd": 0
    },
    {
      "aliases": [
        "tb_elation"
      ],
      "baseSpd": 106,
      "elation": true,
      "energy": "standard",
      "energyName": "能量",
      "id": "8009",
      "lcBaseSpd": 0,
      "maxSp": 160,
      "mechanics": [
        "天赋：普攻/战技后 +10 固定能量 +3 笑点",
        "终结技：+5 笑点；指定目标拥有欢愉技则立刻放 1 次（好活当赏计入 20，不进笑点池），否则拉条 50%",
        "固有行迹【欢愉万相★主角光环】：升格后若终结技目标是星神★阿哈，先放一次开拓者欢愉技，再放阿哈欢愉技"
      ],
      "name": "开拓者•欢愉",
      "path": "欢愉",
      "rotation": "skill",
      "traceSpd": 0
    },
    {
      "aliases": [
        "feiying"
      ],
      "baseSpd": 104,
      "elation": true,
      "energy": "standard",
      "energyName": "能量",
      "id": "1505",
      "lcBaseSpd": 0,
      "maxSp": 480,
      "mechanics": [
        "战技：+10 笑点、基础回能 30 × ERR",
        "能量与好活当赏双向同步（不循环互触发），单次同步好活当赏最多 100",
        "累计每 240 能量触发【狐狸老师】追击（基础回能 10 × ERR，单次累计最多 240）；E1 追击后施放欢愉技",
        "秘技自身好活当赏 +20；欢愉技额外 +5（E1 +15）；E6 好活当赏延长 1 回合",
        "瞰众乐/开不败：参演编号更小队友获得/任意队友到期的好活当赏转移 50%；E2 分别为 75%/100%",
        "能量上限 480，终结技每次消耗 240，能开即开且保留剩余能量；返还 5 × ERR",
        "E6：首次终结技固定 +120 能量，之后每 4 次终结技再触发",
        "固有行迹【欢愉万相★书中折花】：升格后溢出能量最多 60，开大后恢复且不触发天赋好活当赏"
      ],
      "name": "绯英",
      "path": "欢愉",
      "rotation": "skill",
      "traceSpd": 5
    },
    {
      "aliases": [
        "silverwolf999"
      ],
      "baseSpd": 110,
      "elation": true,
      "energy": "hidden",
      "energyName": "隐藏分",
      "id": "1506",
      "lcBaseSpd": 0,
      "maxSp": 60,
      "mechanics": [
        "战技 +5 笑点；隐藏分 = 全队获得的笑点（只有自己的欢愉技再 +15）",
        "隐藏分 ≥ 60 开大：自身拉条 100%，进入【无敌玩家】打 3 次强化普攻；无敌期间不能再开大，退出时清空隐藏分（E1 保留 20%）",
        "行迹【真结局】：欢愉技计入笑点 ≥20 / ≥40 各 +20 隐藏分；【隐藏关卡】：进入无敌玩家 +20",
        "基础天赋隐藏分可溢出 240；升格【全息幻象】溢出至 360，获得好活当赏时隐藏分 +该次的 20%"
      ],
      "name": "银狼LV.999",
      "path": "欢愉",
      "rotation": "skill",
      "traceSpd": 9
    },
    {
      "aliases": [
        "sunday"
      ],
      "baseSpd": 96,
      "elation": false,
      "energy": "standard",
      "energyName": "能量",
      "id": "1313",
      "lcBaseSpd": 0,
      "maxSp": 130,
      "mechanics": [
        "战技：指定目标拉条 100%",
        "终结技：给指定目标回能 max(40, 20% 能量上限)（固定回能）",
        "行迹【崇高拂尘】：战斗开始 +25 能量；E4：回合开始 +8 能量"
      ],
      "name": "星期日",
      "path": "同谐",
      "rotation": "skill",
      "traceSpd": 0
    },
    {
      "aliases": [
        "robin"
      ],
      "baseSpd": 102,
      "elation": false,
      "energy": "standard",
      "energyName": "能量",
      "id": "1309",
      "lcBaseSpd": 0,
      "maxSp": 160,
      "mechanics": [
        "天赋：我方每次攻击后恢复 2 点能量（E2 为 3）",
        "战技基础回能 35（30 + 行迹【模进乐段】5）",
        "秘技：每波次开始 +5 能量（本工具=战斗开始一次）",
        "终结技：其他队友全体拉条 100%，并召唤 90 速【协奏】倒计时；协奏期间本体不行动（E2 期间我方全体速度 +16%）",
        "行迹【华彩花腔】：战斗开始时自身行动提前 25%"
      ],
      "name": "知更鸟",
      "path": "同谐",
      "rotation": "skill",
      "traceSpd": 5
    }
  ]
};
