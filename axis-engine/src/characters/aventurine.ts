/** 砂金（存护，1304）。 */
import { fmt } from "../format.ts";
import { ATTACK_ORDER } from "../modules/elation.ts";
import type { KitContext } from "../types.ts";
import { Kit } from "./base.ts";

export class AventurineKit extends Kit {
  readonly id = "1304";
  /** 【盲注】层数，7 层触发追击。 */
  blind = 0;

  protected setup(): void {
    // 每次攻击 +1 层，自己的追击不再叠层。
    this.engine.on("attack", ({ unit, kind }) => {
      if (unit === this.self && kind === "fua") return;
      this.blind += 1;
      if (this.blind >= 7) {
        this.blind = 0;
        this.followUp();
      }
    }, ATTACK_ORDER.aventurineBlind);
  }

  private followUp(): void {
    const { engine, self } = this;
    self.followUps += 1;
    const segments = self.eidolon >= 4 ? 10 : 7;
    const label = self.eidolon >= 4 ? "砂金的 10 段追加攻击（盲注满层，E4 +3 段）" : "砂金的 7 段追加攻击（盲注满层）";
    engine.record("fua", self, label, { details: [`基础回能 ${fmt(segments, 0)} × (1+ERR)`, "全队护盾"] });
    engine.gainEnergy(self, segments, { reason: "追击" });
    this.healOrShield("砂金追击护盾");
    engine.attack(self, "fua");
  }

  onBattleStart({ engine, self }: KitContext): void {
    engine.record("note", self, "行迹【热手】", { details: ["战斗开始全队护盾"] });
    this.healOrShield("砂金【热手】开局护盾");
  }

  protected skill(extra: boolean): void {
    const { engine, self } = this;
    engine.record("skill", self, `${self.name} 的战技`, { details: ["全队护盾", "基础回能 30 × (1+ERR)"], extra });
    engine.gainEnergy(self, 30, { reason: "战技" });
    this.healOrShield("砂金战技护盾");
    engine.attack(self, "skill", extra);
  }

  onUltimate({ engine, self }: KitContext): void {
    if (self.eidolon < 1) return;
    engine.record("note", self, "E1 囚徒博弈", { details: ["终结技全队护盾"] });
    this.healOrShield("砂金 E1 终结技护盾");
  }

  mechanics = () => ({ blindStacks: this.blind });
}
