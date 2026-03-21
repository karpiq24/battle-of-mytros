import { BOM } from "../config.mjs";
import { BattleState } from "../data/battle-state.mjs";
import { contestedRoll } from "../rolls/contested-roll.mjs";
import { sendBattleResultCard } from "../chat/chat-cards.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Step-by-step battle resolution dialog.
 * Walks through Maneuver → Charge → Clash phases.
 * Supports commander tag bonuses, manual terrain modifiers, and Fanatic activation.
 */
export class BattleResolver extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "bom-battle-resolver",
    position: { width: 600, height: "auto" },
    window: {
      title: "BOM.battle.result",
      icon: "fas fa-swords"
    },
    classes: ["bom-battle-resolver"],
    actions: {
      rollManeuver: BattleResolver.#onRollManeuver,
      pickManeuverBenefit: BattleResolver.#onPickManeuverBenefit,
      rollCharge: BattleResolver.#onRollCharge,
      rollClash: BattleResolver.#onRollClash,
      rollTiebreaker: BattleResolver.#onRollTiebreaker,
      finalize: BattleResolver.#onFinalize,
      toggleFanatic: BattleResolver.#onToggleFanatic
    }
  };

  static PARTS = {
    resolver: { template: "modules/battle-of-mytros/templates/dialogs/battle-resolver.hbs" }
  };

  _results = {
    maneuver: null, charge: null, clash: null,
    maneuverBenefit: null, counterA: 0, counterB: 0, winner: null
  };

  // Whether Fanatic tag is being activated for this phase
  _fanaticA = false;
  _fanaticB = false;

  constructor({ dashboard, battleId } = {}, options = {}) {
    super(options);
    this._dashboard = dashboard;
    this._battleId = battleId;
  }

  async _prepareContext(options) {
    const state = BattleState.get();
    const battle = state.battles.find(b => b.id === this._battleId);
    const alliedLegion = state.legions.find(l => l.id === battle?.alliedLegionId);
    const enemyLegion = state.legions.find(l => l.id === battle?.enemyLegionId);
    const alliedStats = alliedLegion ? BattleState.computeStats(alliedLegion) : { vit: 0, mor: 0, wit: 0 };
    const enemyStats = enemyLegion ? BattleState.computeStats(enemyLegion) : { vit: 0, mor: 0, wit: 0 };

    const alliedCmd = BattleState.getCommander(alliedLegion?.commanderId);
    const enemyCmd = BattleState.getCommander(enemyLegion?.commanderId);

    const step = this._currentStep();

    // Pre-compute tag bonuses for the current phase so the template can show them
    const alliedTagBonuses = alliedCmd ? this._tagBonuses(alliedCmd, step, alliedStats) : [];
    const enemyTagBonuses = enemyCmd ? this._tagBonuses(enemyCmd, step, enemyStats) : [];
    const alliedHasFanatic = !!(alliedCmd?.tags?.find(t => t.name === "Fanatic" && !t.used));
    const enemyHasFanatic = !!(enemyCmd?.tags?.find(t => t.name === "Fanatic" && !t.used));

    return {
      battle,
      alliedLegion,
      enemyLegion,
      alliedStats,
      enemyStats,
      alliedCmd,
      enemyCmd,
      alliedTagBonuses,
      enemyTagBonuses,
      alliedHasFanatic,
      enemyHasFanatic,
      fanaticA: this._fanaticA,
      fanaticB: this._fanaticB,
      results: this._results,
      maneuverBenefits: BOM.maneuverBenefits,
      fanaticBonus: BOM.fanaticBonus,
      step
    };
  }

  _currentStep() {
    if (!this._results.maneuver) return "maneuver";
    if (!this._results.maneuverBenefit && this._results.maneuver.winner !== "tie") return "maneuverChoice";
    if (!this._results.charge) return "charge";
    if (!this._results.clash) return "clash";
    if (this._results.winner === null) return "tiebreaker";
    return "done";
  }

  /**
   * Compute automatic tag bonuses for a commander for the given phase.
   * Returns array of {label, value, tagName} items.
   * @param {object} cmd - Commander entity
   * @param {string} phase - "maneuver"|"charge"|"clash"|"tiebreaker"
   * @param {object} stats - Computed stats {vit,mor,wit}
   */
  _tagBonuses(cmd, phase, stats) {
    const bonuses = [];
    if (!cmd) return bonuses;
    const tags = cmd.tags ?? [];
    const hasTag = (name) => tags.find(t => t.name === name && !t.used);

    if (phase === "maneuver") {
      if (hasTag("Tactician")) bonuses.push({ label: "Tactician", value: BOM.tacticianManeuverBonus, tagName: "Tactician" });
      if (hasTag("Mage")) bonuses.push({ label: "Mage", value: BOM.mageManeuverBonus, tagName: "Mage" });
    }
    if (phase === "charge") {
      if (hasTag("Vanguard")) bonuses.push({ label: "Vanguard", value: BOM.vanguardChargeBonus, tagName: "Vanguard" });
    }
    if (phase === "clash" || phase === "tiebreaker") {
      if (hasTag("Warden")) bonuses.push({ label: "Warden", value: BOM.wardenClashBonus, tagName: "Warden" });
    }
    // Zealot: +1 to all combat phases if morale is high enough (not consumed on use)
    if (["maneuver", "charge", "clash"].includes(phase)) {
      if (stats && stats.mor >= BOM.zealotMoraleThreshold && hasTag("Zealot")) {
        bonuses.push({ label: "Zealot", value: BOM.zealotBonus, tagName: null });
      }
    }

    return bonuses;
  }

  /**
   * Build the full modifier breakdown for one side, including base stat,
   * situational bonuses, tag bonuses, and manual modifier.
   */
  _buildBreakdown(baseStat, baseLabel, situational, tagBonuses, manualMod, fanaticActive) {
    const items = [{ label: baseLabel, value: baseStat }];
    for (const s of situational) {
      if (s.value !== 0) items.push(s);
    }
    for (const t of tagBonuses) {
      items.push({ label: t.label, value: t.value });
    }
    if (fanaticActive) {
      items.push({ label: "Fanatic", value: BOM.fanaticBonus });
    }
    if (manualMod !== 0) {
      items.push({ label: "Modifier", value: manualMod });
    }
    const total = items.reduce((s, i) => s + i.value, 0);
    return { items, total };
  }

  /** Mark tag names as used on the commander, persisting to state. */
  async _markTagsUsed(commanderId, tagNames) {
    if (!commanderId || !tagNames.length) return;
    const state = BattleState.get();
    const cmd = state.commanders?.find(c => c.id === commanderId);
    if (!cmd) return;
    for (const name of tagNames) {
      const tag = cmd.tags?.find(t => t.name === name);
      if (tag) tag.used = true;
    }
    await BattleState.set(state);
  }

  /* ─── Action Handlers ─── */

  static async #onToggleFanatic(event, target) {
    const side = target.dataset.side;
    if (side === "a") this._fanaticA = !this._fanaticA;
    else if (side === "b") this._fanaticB = !this._fanaticB;
    this.render();
  }

  static async #onRollManeuver(event, target) {
    const form = this.element;
    const manualA = Number(form.querySelector('[name="manualModA"]')?.value) || 0;
    const manualB = Number(form.querySelector('[name="manualModB"]')?.value) || 0;

    const ctx = await this._prepareContext();
    const tagBonusesA = this._tagBonuses(ctx.alliedCmd, "maneuver", ctx.alliedStats);
    const tagBonusesB = this._tagBonuses(ctx.enemyCmd, "maneuver", ctx.enemyStats);

    const bdA = this._buildBreakdown(ctx.alliedStats.wit, "Wit", [], tagBonusesA, manualA, this._fanaticA);
    const bdB = this._buildBreakdown(ctx.enemyStats.wit, "Wit", [], tagBonusesB, manualB, this._fanaticB);

    const result = await contestedRoll({
      nameA: ctx.alliedLegion.name,
      nameB: ctx.enemyLegion.name,
      bonusA: bdA.total,
      bonusB: bdB.total,
      breakdownA: bdA.items,
      breakdownB: bdB.items,
      flavor: game.i18n.localize("BOM.battle.maneuver")
    });

    // Mark tags used
    await this._markTagsUsed(ctx.alliedLegion.commanderId, tagBonusesA.filter(t => t.tagName).map(t => t.tagName));
    await this._markTagsUsed(ctx.enemyLegion.commanderId, tagBonusesB.filter(t => t.tagName).map(t => t.tagName));
    if (this._fanaticA) await this._markTagsUsed(ctx.alliedLegion.commanderId, ["Fanatic"]);
    if (this._fanaticB) await this._markTagsUsed(ctx.enemyLegion.commanderId, ["Fanatic"]);
    this._fanaticA = false;
    this._fanaticB = false;

    this._results.maneuver = result;
    this._results.counterA += result.counterA;
    this._results.counterB += result.counterB;
    this.render();
  }

  static async #onPickManeuverBenefit(event, target) {
    const benefitId = target.dataset.benefit;
    if (!benefitId) return;
    this._results.maneuverBenefit = benefitId;
    this.render();
  }

  static async #onRollCharge(event, target) {
    const form = this.element;
    const manualA = Number(form.querySelector('[name="manualModA"]')?.value) || 0;
    const manualB = Number(form.querySelector('[name="manualModB"]')?.value) || 0;

    const ctx = await this._prepareContext();
    const tagBonusesA = this._tagBonuses(ctx.alliedCmd, "charge", ctx.alliedStats);
    const tagBonusesB = this._tagBonuses(ctx.enemyCmd, "charge", ctx.enemyStats);

    // Situational: maneuver benefit, momentum
    const situationalA = [], situationalB = [];
    const ben = this._results.maneuverBenefit;
    const mWinner = this._results.maneuver?.winner;
    if (ben === "flanking") {
      if (mWinner === "a") situationalA.push({ label: "Flanking", value: BOM.maneuverFlankingBonus });
      else if (mWinner === "b") situationalB.push({ label: "Flanking", value: BOM.maneuverFlankingBonus });
    } else if (ben === "disrupted") {
      if (mWinner === "a") situationalB.push({ label: "Disrupted", value: BOM.maneuverDisruptedPenalty });
      else if (mWinner === "b") situationalA.push({ label: "Disrupted", value: BOM.maneuverDisruptedPenalty });
    }
    if (ctx.alliedLegion.wonLastRound) situationalA.push({ label: "Momentum", value: BOM.momentumBonus });
    if (ctx.enemyLegion.wonLastRound) situationalB.push({ label: "Momentum", value: BOM.momentumBonus });

    const bdA = this._buildBreakdown(ctx.alliedStats.mor, "Morale", situationalA, tagBonusesA, manualA, this._fanaticA);
    const bdB = this._buildBreakdown(ctx.enemyStats.mor, "Morale", situationalB, tagBonusesB, manualB, this._fanaticB);

    const result = await contestedRoll({
      nameA: ctx.alliedLegion.name,
      nameB: ctx.enemyLegion.name,
      bonusA: bdA.total,
      bonusB: bdB.total,
      breakdownA: bdA.items,
      breakdownB: bdB.items,
      flavor: game.i18n.localize("BOM.battle.charge")
    });

    await this._markTagsUsed(ctx.alliedLegion.commanderId, tagBonusesA.filter(t => t.tagName).map(t => t.tagName));
    await this._markTagsUsed(ctx.enemyLegion.commanderId, tagBonusesB.filter(t => t.tagName).map(t => t.tagName));
    if (this._fanaticA) await this._markTagsUsed(ctx.alliedLegion.commanderId, ["Fanatic"]);
    if (this._fanaticB) await this._markTagsUsed(ctx.enemyLegion.commanderId, ["Fanatic"]);
    this._fanaticA = false;
    this._fanaticB = false;

    this._results.charge = result;
    this._results.counterA += result.counterA;
    this._results.counterB += result.counterB;
    this.render();
  }

  static async #onRollClash(event, target) {
    const form = this.element;
    const manualA = Number(form.querySelector('[name="manualModA"]')?.value) || 0;
    const manualB = Number(form.querySelector('[name="manualModB"]')?.value) || 0;

    const ctx = await this._prepareContext();
    const tagBonusesA = this._tagBonuses(ctx.alliedCmd, "clash", ctx.alliedStats);
    const tagBonusesB = this._tagBonuses(ctx.enemyCmd, "clash", ctx.enemyStats);

    const situationalA = [], situationalB = [];
    if (this._results.charge?.winner === "a") situationalA.push({ label: "Charge Win", value: BOM.chargeWinClashBonus });
    else if (this._results.charge?.winner === "b") situationalB.push({ label: "Charge Win", value: BOM.chargeWinClashBonus });

    const ben = this._results.maneuverBenefit;
    const mWinner = this._results.maneuver?.winner;
    if (ben === "defensive") {
      if (mWinner === "a") situationalA.push({ label: "Defensive", value: BOM.maneuverDefensiveBonus });
      else if (mWinner === "b") situationalB.push({ label: "Defensive", value: BOM.maneuverDefensiveBonus });
    }

    const bdA = this._buildBreakdown(ctx.alliedStats.vit, "Vitality", situationalA, tagBonusesA, manualA, this._fanaticA);
    const bdB = this._buildBreakdown(ctx.enemyStats.vit, "Vitality", situationalB, tagBonusesB, manualB, this._fanaticB);

    const result = await contestedRoll({
      nameA: ctx.alliedLegion.name,
      nameB: ctx.enemyLegion.name,
      bonusA: bdA.total,
      bonusB: bdB.total,
      breakdownA: bdA.items,
      breakdownB: bdB.items,
      flavor: game.i18n.localize("BOM.battle.clash")
    });

    await this._markTagsUsed(ctx.alliedLegion.commanderId, tagBonusesA.filter(t => t.tagName).map(t => t.tagName));
    await this._markTagsUsed(ctx.enemyLegion.commanderId, tagBonusesB.filter(t => t.tagName).map(t => t.tagName));
    if (this._fanaticA) await this._markTagsUsed(ctx.alliedLegion.commanderId, ["Fanatic"]);
    if (this._fanaticB) await this._markTagsUsed(ctx.enemyLegion.commanderId, ["Fanatic"]);
    this._fanaticA = false;
    this._fanaticB = false;

    this._results.clash = result;
    this._results.counterA += result.counterA;
    this._results.counterB += result.counterB;

    if (this._results.counterA > this._results.counterB) this._results.winner = "allied";
    else if (this._results.counterB > this._results.counterA) this._results.winner = "enemy";

    this.render();
  }

  static async #onRollTiebreaker(event, target) {
    const ctx = await this._prepareContext();
    const result = await contestedRoll({
      nameA: ctx.alliedLegion.name,
      nameB: ctx.enemyLegion.name,
      bonusA: ctx.alliedStats.vit,
      bonusB: ctx.enemyStats.vit,
      breakdownA: [{ label: "Vitality", value: ctx.alliedStats.vit }],
      breakdownB: [{ label: "Vitality", value: ctx.enemyStats.vit }],
      flavor: game.i18n.localize("BOM.battle.tiebreaker")
    });
    if (result.winner === "a") this._results.winner = "allied";
    else if (result.winner === "b") this._results.winner = "enemy";
    else this._results.winner = "allied";
    this.render();
  }

  static async #onFinalize(event, target) {
    const phases = [
      { phaseName: game.i18n.localize("BOM.battle.maneuver"), ...this._formatPhase(this._results.maneuver) },
      { phaseName: game.i18n.localize("BOM.battle.charge"), ...this._formatPhase(this._results.charge) },
      { phaseName: game.i18n.localize("BOM.battle.clash"), ...this._formatPhase(this._results.clash) }
    ];

    await BattleState.updateBattle(this._battleId, {
      phases,
      counterAllied: this._results.counterA,
      counterEnemy: this._results.counterB,
      winner: this._results.winner,
      maneuverBenefit: this._results.maneuverBenefit,
      resolved: true
    });

    const state = BattleState.get();
    const battle = state.battles.find(b => b.id === this._battleId);
    if (battle) {
      const winId = this._results.winner === "allied" ? battle.alliedLegionId : battle.enemyLegionId;
      const loseId = this._results.winner === "allied" ? battle.enemyLegionId : battle.alliedLegionId;
      const winLegion = state.legions.find(l => l.id === winId);
      const loseLegion = state.legions.find(l => l.id === loseId);
      if (winLegion) winLegion.wonLastRound = true;
      if (loseLegion) loseLegion.wonLastRound = false;
      await BattleState.set(state);
    }

    const ctx = await this._prepareContext();
    await sendBattleResultCard({
      alliedName: ctx.alliedLegion.name,
      enemyName: ctx.enemyLegion.name,
      phases,
      counterAllied: this._results.counterA,
      counterEnemy: this._results.counterB,
      winner: this._results.winner
    });

    if (this._dashboard?.render) this._dashboard.render();
    this.close();
  }

  _formatPhase(result) {
    if (!result) return {};
    return {
      rollA: result.rollA,
      rollB: result.rollB,
      bonusA: result.bonusA,
      bonusB: result.bonusB,
      totalA: result.totalA,
      totalB: result.totalB,
      nat20A: result.nat20A,
      nat20B: result.nat20B,
      nat1A: result.nat1A,
      nat1B: result.nat1B,
      breakdownA: result.breakdownA ?? [],
      breakdownB: result.breakdownB ?? [],
      winner: result.winner === "a" ? "Allied" : result.winner === "b" ? "Enemy" : "Tie"
    };
  }
}
