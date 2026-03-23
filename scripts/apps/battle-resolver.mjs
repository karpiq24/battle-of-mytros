import { BOM } from "../config.mjs";
import { BattleState } from "../data/battle-state.mjs";
import { contestedRoll } from "../rolls/contested-roll.mjs";
import { sendBattleResultCard } from "../chat/chat-cards.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Step-by-step battle resolution dialog.
 * Walks through Maneuver → Charge → Clash phases.
 * Modifiers and advantage/disadvantage are entered manually per roll.
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
    }
  };

  static PARTS = {
    resolver: { template: "modules/battle-of-mytros/templates/dialogs/battle-resolver.hbs" }
  };

  _results = {
    maneuver: null, charge: null, clash: null,
    maneuverBenefit: null, counterA: 0, counterB: 0, winner: null
  };

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

    return {
      battle,
      alliedLegion,
      enemyLegion,
      alliedStats,
      enemyStats,
      alliedCmd,
      enemyCmd,
      results: this._results,
      maneuverBenefits: BOM.maneuverBenefits,
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
   * Build the full modifier breakdown for one side, including base stat,
   * situational bonuses, and manual modifier.
   */
  _buildBreakdown(baseStat, baseLabel, situational, manualMod) {
    const items = [{ label: baseLabel, value: baseStat }];
    for (const s of situational) {
      if (s.value !== 0) items.push(s);
    }
    if (manualMod !== 0) {
      items.push({ label: "Modifier", value: manualMod });
    }
    const total = items.reduce((s, i) => s + i.value, 0);
    return { items, total };
  }

  /** Read modifier inputs and advantage/disadvantage checkboxes from the form. */
  _readRollInputs(form) {
    return {
      manualA: Number(form.querySelector('[name="manualModA"]')?.value) || 0,
      manualB: Number(form.querySelector('[name="manualModB"]')?.value) || 0,
      advA: form.querySelector('[name="advA"]')?.checked ?? false,
      advB: form.querySelector('[name="advB"]')?.checked ?? false,
      disadvA: form.querySelector('[name="disadvA"]')?.checked ?? false,
      disadvB: form.querySelector('[name="disadvB"]')?.checked ?? false,
    };
  }

  /* ─── Action Handlers ─── */

  static async #onRollManeuver(event, target) {
    const { manualA, manualB, advA, advB, disadvA, disadvB } = this._readRollInputs(this.element);
    const ctx = await this._prepareContext();

    const bdA = this._buildBreakdown(ctx.alliedStats.wit, "Wit", [], manualA);
    const bdB = this._buildBreakdown(ctx.enemyStats.wit, "Wit", [], manualB);

    const result = await contestedRoll({
      nameA: ctx.alliedLegion.name,
      nameB: ctx.enemyLegion.name,
      bonusA: bdA.total,
      bonusB: bdB.total,
      breakdownA: bdA.items,
      breakdownB: bdB.items,
      advantageA: advA, disadvantageA: disadvA,
      advantageB: advB, disadvantageB: disadvB,
      flavor: game.i18n.localize("BOM.battle.maneuver")
    });

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
    const { manualA, manualB, advA, advB, disadvA, disadvB } = this._readRollInputs(this.element);
    const ctx = await this._prepareContext();

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

    const bdA = this._buildBreakdown(ctx.alliedStats.mor, "Morale", situationalA, manualA);
    const bdB = this._buildBreakdown(ctx.enemyStats.mor, "Morale", situationalB, manualB);

    const result = await contestedRoll({
      nameA: ctx.alliedLegion.name,
      nameB: ctx.enemyLegion.name,
      bonusA: bdA.total,
      bonusB: bdB.total,
      breakdownA: bdA.items,
      breakdownB: bdB.items,
      advantageA: advA, disadvantageA: disadvA,
      advantageB: advB, disadvantageB: disadvB,
      flavor: game.i18n.localize("BOM.battle.charge")
    });

    this._results.charge = result;
    this._results.counterA += result.counterA;
    this._results.counterB += result.counterB;
    this.render();
  }

  static async #onRollClash(event, target) {
    const { manualA, manualB, advA, advB, disadvA, disadvB } = this._readRollInputs(this.element);
    const ctx = await this._prepareContext();

    const situationalA = [], situationalB = [];
    if (this._results.charge?.winner === "a") situationalA.push({ label: "Charge Win", value: BOM.chargeWinClashBonus });
    else if (this._results.charge?.winner === "b") situationalB.push({ label: "Charge Win", value: BOM.chargeWinClashBonus });

    const ben = this._results.maneuverBenefit;
    const mWinner = this._results.maneuver?.winner;
    if (ben === "defensive") {
      if (mWinner === "a") situationalA.push({ label: "Defensive", value: BOM.maneuverDefensiveBonus });
      else if (mWinner === "b") situationalB.push({ label: "Defensive", value: BOM.maneuverDefensiveBonus });
    }

    const bdA = this._buildBreakdown(ctx.alliedStats.vit, "Vitality", situationalA, manualA);
    const bdB = this._buildBreakdown(ctx.enemyStats.vit, "Vitality", situationalB, manualB);

    const result = await contestedRoll({
      nameA: ctx.alliedLegion.name,
      nameB: ctx.enemyLegion.name,
      bonusA: bdA.total,
      bonusB: bdB.total,
      breakdownA: bdA.items,
      breakdownB: bdB.items,
      advantageA: advA, disadvantageA: disadvA,
      advantageB: advB, disadvantageB: disadvB,
      flavor: game.i18n.localize("BOM.battle.clash")
    });

    this._results.clash = result;
    // Clash winner scores two counter points instead of the standard one
    const clashExtra = BOM.counterClashWin - BOM.counterWin;
    this._results.counterA += result.counterA + (result.winner === "a" ? clashExtra : 0);
    this._results.counterB += result.counterB + (result.winner === "b" ? clashExtra : 0);

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
