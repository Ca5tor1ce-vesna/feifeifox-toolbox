/** 预设队伍，从旧欢愉队页面搬过来，格式是旧存档的格式，由 legacy-team.ts 统一转换。
 * 带测试服角色的预设放在测试服包里，构建测试服时由 beta/axis/index.ts 补进来。 */
import type { LegacyRecord } from "./legacy-team.ts";

export type TeamPreset = LegacyRecord & { label: string; short: string; desc: string };

export const TEAM_PRESETS: Record<string, TeamPreset> = {
  aha_quad: {
    label: "阿哈 / 戏浪 / 真珠 / 爻光",
    short: "阿哈 / 戏浪 / 真珠 / 爻光",
    desc: "星神★阿哈【欢愉令使】锁定砂金•戏浪；真珠【美学底本】锁定砂金•戏浪，开大按欢愉人数拉条 10%/15%/30%，4 名欢愉角色时赋予 1 个额外回合；砂金•戏浪开大触发真珠【艺术壁垒】固定回能 90 点；星神★阿哈开大拉条【阿哈时刻】20% 并开启 3 回合【欢愉万相】；砂金•戏浪开大自身提速 30%（4 回合），队友攻击累积【热意】满 10 点后回合外施放欢愉技。",
    config: {
      maxAV: 300,
      useAeonAha: true,
      useTech: true,
      trace3Advance: true,
      ultAdvanceAha: 20,
      e1Wishpower: 5,
      ultSpdPct: 30,
      sanduTeamSpdPct: 15,
      aeonAhaBaseSpd: 94,
      aeonAhaLcBaseSpd: 12,
      ahaSpdPct: 0,
      ahaAdvancePct: 0,
    },
    team: [
      {
        id: "1511", name: "星神★阿哈", elation: true, baseSpd: 94, lcBaseSpd: 12, traceSpd: 5,
        permPct: 12, permFlat: 35, err: 0, eidolon: 0, initAdv: 0, targetSlot: 1, rotation: "skill",
        equipment: { vonwacq: false, godJoy: true, windSet4: false, danceS5: false, hasSigLc: true, hasSummerLc: false },
      },
      {
        id: "1513", name: "砂金•戏浪", elation: true, baseSpd: 107, lcBaseSpd: 0, traceSpd: 9,
        permPct: 6, permFlat: 28, err: 19.4, eidolon: 0, initAdv: 0, targetSlot: 0, rotation: "skill",
        equipment: { vonwacq: false, godJoy: false, windSet4: false, danceS5: false, hasSigLc: false, hasSummerLc: true },
      },
      {
        id: "1503", name: "真珠", elation: true, baseSpd: 99, lcBaseSpd: 0, traceSpd: 9,
        permPct: 12, permFlat: 26, err: 24.4, eidolon: 0, initAdv: 0, targetSlot: 1, rotation: "auto",
        equipment: { vonwacq: true, godJoy: false, windSet4: false, danceS5: false, hasSigLc: false, hasSummerLc: false },
      },
      {
        id: "1502", name: "爻光", elation: true, baseSpd: 101, lcBaseSpd: 0, traceSpd: 9,
        permPct: 18, permFlat: 45, err: 24.4, eidolon: 0, initAdv: 0, targetSlot: 1, rotation: "skill",
        equipment: { vonwacq: true, godJoy: false, windSet4: false, danceS5: false, hasSigLc: false, hasSummerLc: false },
      },
    ],
  },
  sandu_duel: {
    label: "戏浪 / 阿哈 / 星期日 / 砂金(存护)",
    short: "戏浪 / 阿哈 / 星期日 / 砂金(存护)",
    desc: "队内欢愉角色为砂金•戏浪与星神★阿哈 2 人；星神★阿哈开大进入【欢愉万相】后，砂金•戏浪【三赌牌局】使全队速度 +15%；行迹【纵享惊涛】使队友攻击时【阿哈时刻】速度 +25；星期日终结技为指定目标回复能量；砂金(存护)开大与护盾联动星神★阿哈行迹2。",
    config: {
      maxAV: 300,
      useAeonAha: true,
      useTech: true,
      trace3Advance: true,
      ultAdvanceAha: 20,
      e1Wishpower: 5,
      ultSpdPct: 30,
      sanduTeamSpdPct: 15,
      aeonAhaBaseSpd: 94,
      aeonAhaLcBaseSpd: 12,
      ahaSpdPct: 0,
      ahaAdvancePct: 0,
    },
    team: [
      {
        id: "1513", name: "砂金•戏浪", elation: true, baseSpd: 107, lcBaseSpd: 0, traceSpd: 9,
        permPct: 6, permFlat: 30, err: 19.4, eidolon: 1, initAdv: 0, targetSlot: 0, rotation: "skill",
        equipment: { vonwacq: false, godJoy: false, windSet4: false, danceS5: false, hasSigLc: false, hasSummerLc: true },
      },
      {
        id: "1511", name: "星神★阿哈", elation: true, baseSpd: 94, lcBaseSpd: 12, traceSpd: 5,
        permPct: 12, permFlat: 35, err: 0, eidolon: 1, initAdv: 0, targetSlot: 0, rotation: "skill",
        equipment: { vonwacq: false, godJoy: true, windSet4: false, danceS5: false, hasSigLc: true, hasSummerLc: false },
      },
      {
        id: "1313", name: "星期日", elation: false, baseSpd: 96, lcBaseSpd: 0, traceSpd: 0,
        permPct: 6, permFlat: 33, err: 24.4, eidolon: 0, initAdv: 0, targetSlot: 0, rotation: "skill",
        equipment: { vonwacq: false, godJoy: false, windSet4: false, danceS5: true, hasSigLc: false, hasSummerLc: false },
      },
      {
        id: "1304", name: "砂金(存护)", elation: false, baseSpd: 106, lcBaseSpd: 0, traceSpd: 0,
        permPct: 6, permFlat: 28, err: 19.4, eidolon: 0, initAdv: 0, targetSlot: 0, rotation: "skill",
        equipment: { vonwacq: false, godJoy: false, windSet4: false, danceS5: false, hasSigLc: false, hasSummerLc: false },
      },
    ],
  },
  feiying_aha: {
    label: "绯英 / 阿哈 / 真珠 / 爻光",
    short: "绯英 / 阿哈 / 真珠 / 爻光",
    desc: "本预设将绯英开局能量设为 480（试算配置，并非角色固有满能机制），先结算秘技与阿哈额外回合，再在 0 AV 连开两次终结技；之后每次达到 240 即在合法时点开大，每次消耗 240 并保留余能。真珠【美学底本】与星神★阿哈【欢愉令使】均锁定绯英。转移按参演编号判断，与站位无关；只累计实际获得的能量，满能截掉的部分不触发狐狸老师。点击「绯英能量」可核对逐次回能，不模拟敌方行动与受击回能。",
    config: {
      maxAV: 300,
      useAeonAha: true,
      useTech: true,
      trace3Advance: true,
      ultAdvanceAha: 20,
      e1Wishpower: 5,
      ultSpdPct: 30,
      sanduTeamSpdPct: 15,
      aeonAhaBaseSpd: 94,
      aeonAhaLcBaseSpd: 12,
      ahaSpdPct: 0,
      ahaAdvancePct: 0,
    },
    team: [
      {
        id: "1505", name: "绯英", initialEnergy: 480, elation: true, baseSpd: 104, lcBaseSpd: 0, traceSpd: 5,
        permPct: 6, permFlat: 25, err: 0, eidolon: 0, initAdv: 0, targetSlot: 0, rotation: "skill",
        equipment: { vonwacq: false, godJoy: false, windSet4: false, danceS5: false, hasSigLc: false, hasSummerLc: false },
      },
      {
        id: "1511", name: "星神★阿哈", elation: true, baseSpd: 94, lcBaseSpd: 12, traceSpd: 5,
        permPct: 12, permFlat: 35, err: 0, eidolon: 0, initAdv: 0, targetSlot: 0, rotation: "skill",
        equipment: { vonwacq: false, godJoy: true, windSet4: false, danceS5: false, hasSigLc: true, hasSummerLc: false },
      },
      {
        id: "1503", name: "真珠", elation: true, baseSpd: 99, lcBaseSpd: 0, traceSpd: 9,
        permPct: 12, permFlat: 26, err: 24.4, eidolon: 2, initAdv: 0, targetSlot: 0, rotation: "auto",
        equipment: { vonwacq: true, godJoy: false, windSet4: false, danceS5: false, hasSigLc: false, hasSummerLc: false },
      },
      {
        id: "1502", name: "爻光", elation: true, baseSpd: 101, lcBaseSpd: 0, traceSpd: 9,
        permPct: 18, permFlat: 50, err: 24.4, eidolon: 2, initAdv: 0, targetSlot: 0, rotation: "skill",
        equipment: { vonwacq: true, godJoy: false, windSet4: false, danceS5: false, hasSigLc: false, hasSummerLc: false },
      },
    ],
  },
  wolf_sparkle: {
    label: "银狼 / 火花 / 爻光 / 真珠",
    short: "银狼 / 火花 / 爻光 / 真珠",
    desc: "【阿哈时刻】底速 80；银狼LV.999 将笑点转化为【隐藏分】，满 60 点开大并进入【无敌玩家】；火花在【阿哈时刻】结束后获得额外回合（2魂）；真珠锁定银狼拉条 30%、赋予额外回合，并在目标开大时触发【艺术壁垒】固定回能 90 点。",
    config: {
      maxAV: 300,
      useAeonAha: false,
      useTech: true,
      trace3Advance: false,
      ultAdvanceAha: 20,
      e1Wishpower: 5,
      ultSpdPct: 30,
      sanduTeamSpdPct: 15,
      aeonAhaBaseSpd: 80,
      aeonAhaLcBaseSpd: 0,
      ahaSpdPct: 0,
      ahaAdvancePct: 0,
    },
    team: [
      {
        id: "1506", name: "银狼LV.999", elation: true, baseSpd: 110, lcBaseSpd: 0, traceSpd: 9,
        permPct: 18, permFlat: 50, err: 0, eidolon: 0, initAdv: 0, targetSlot: 0, rotation: "skill",
        equipment: { vonwacq: false, godJoy: false, windSet4: false, danceS5: false, hasSigLc: false, hasSummerLc: false },
      },
      {
        id: "1501", name: "火花", elation: true, baseSpd: 107, lcBaseSpd: 0, traceSpd: 0,
        permPct: 6, permFlat: 43, err: 19.4, eidolon: 2, initAdv: 0, targetSlot: 0, rotation: "skill",
        equipment: { vonwacq: false, godJoy: false, windSet4: false, danceS5: false, hasSigLc: false, hasSummerLc: false },
      },
      {
        id: "1502", name: "爻光", elation: true, baseSpd: 101, lcBaseSpd: 0, traceSpd: 9,
        permPct: 18, permFlat: 70, err: 24.4, eidolon: 1, initAdv: 0, targetSlot: 0, rotation: "skill",
        equipment: { vonwacq: false, godJoy: false, windSet4: false, danceS5: false, hasSigLc: false, hasSummerLc: false },
      },
      {
        id: "1503", name: "真珠", elation: true, baseSpd: 99, lcBaseSpd: 0, traceSpd: 9,
        permPct: 0, permFlat: 26, err: 24.4, eidolon: 0, initAdv: 0, targetSlot: 0, rotation: "auto",
        equipment: { vonwacq: false, godJoy: false, windSet4: false, danceS5: false, hasSigLc: false, hasSummerLc: false },
      },
    ],
  },
};
