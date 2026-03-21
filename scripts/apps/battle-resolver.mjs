import { BOM } from "../config.mjs";
import { BattleState } from "../data/battle-state.mjs";
import { contestedRoll } from "../rolls/contested-roll.mjs";
import { sendBattleResultCard } from "../chat/chat-cards.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Step-by-step battle resolution dialog.
 * Walks through Maneuver → Charge → Clash phases.
 */
export class BattleResolver extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "bom-battle-resolver",
    position: { width: 560, height: "auto" },
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
      finalize: BattleResolver.#onFinalize
    }
  };

  static PARTS = {
    resolver: { template: "modules/battle-of-mytros/templates/dialogs/battle-resolver.hbs" }
  };

  /** @type {{ maneuver: object|null, charge: object|null, clash: object|null, maneuverBenefit: string|null, counterA: number, counterB: number, winner: string|null }} */
  _results = { maneuver: null, charge: null, clash: null, maneuverBenefit: null, counterA: 0, counterB: 0, winner: null };

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

    return {
      battle,
      alliedLegion,
      enemyLegion,
      alliedStats,
      enemyStats,
      results: this._results,
      maneuverBenefits: BOM.maneuverBenefits,
      step: this._currentStep()
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

  /* ─── Phase Handlers ─── */

  static async #onRollManeuver(event, target) {
    const ctx = await this._prepareContext();
    const result = await contestedRoll({
      nameA: ctx.alliedLegion.name,
      nameB: ctx.enemyLegion.name,
      bonusA: ctx.alliedStats.wit,
      bonusB: ctx.enemyStats.wit,
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
    const ctx = await this._prepareContext();
    let bonusA = ctx.alliedStats.mor;
    let bonusB = ctx.enemyStats.mor;

    // Apply maneuver benefits
    const ben = this._results.maneuverBenefit;
    const maneuverWinner = this._results.maneuver?.winner;
    if (ben === "flanking") {
      if (maneuverWinner === "a") bonusA += BOM.maneuverFlankingBonus;
      else if (maneuverWinner === "b") bonusB += BOM.maneuverFlankingBonus;
    } else if (ben === "disrupted") {
      if (maneuverWinner === "a") bonusB += BOM.maneuverDisruptedPenalty;
      else if (maneuverWinner === "b") bonusA += BOM.maneuverDisruptedPenalty;
    }

    // Vanguard tag bonus for attacker
    // Momentum bonus if won last round
    if (ctx.alliedLegion.wonLastRound) bonusA += BOM.momentumBonus;
    if (ctx.enemyLegion.wonLastRound) bonusB += BOM.momentumBonus;

    const result = await contestedRoll({
      nameA: ctx.alliedLegion.name,
      nameB: ctx.enemyLegion.name,
      bonusA,
      bonusB,
      flavor: game.i18n.localize("BOM.battle.charge")
    });
    this._results.charge = result;
    this._results.counterA += result.counterA;
    this._results.counterB += result.counterB;
    this.render();
  }

  static async #onRollClash(event, target) {
    const ctx = await this._prepareContext();
    let bonusA = ctx.alliedStats.vit;
    let bonusB = ctx.enemyStats.vit;

    // Charge winner gets +1 to clash
    if (this._results.charge?.winner === "a") bonusA += BOM.chargeWinClashBonus;
    else if (this._results.charge?.winner === "b") bonusB += BOM.chargeWinClashBonus;

    // Defensive Footing from maneuver
    const ben = this._results.maneuverBenefit;
    const maneuverWinner = this._results.maneuver?.winner;
    if (ben === "defensive") {
      if (maneuverWinner === "a") bonusA += BOM.maneuverDefensiveBonus;
      else if (maneuverWinner === "b") bonusB += BOM.maneuverDefensiveBonus;
    }

    const result = await contestedRoll({
      nameA: ctx.alliedLegion.name,
      nameB: ctx.enemyLegion.name,
      bonusA,
      bonusB,
      flavor: game.i18n.localize("BOM.battle.clash")
    });
    this._results.clash = result;
    this._results.counterA += result.counterA;
    this._results.counterB += result.counterB;

    // Determine winner
    if (this._results.counterA > this._results.counterB) {
      this._results.winner = "allied";
    } else if (this._results.counterB > this._results.counterA) {
      this._results.winner = "enemy";
    }
    // If tied, need tiebreaker

    this.render();
  }

  static async #onRollTiebreaker(event, target) {
    const ctx = await this._prepareContext();
    const result = await contestedRoll({
      nameA: ctx.alliedLegion.name,
      nameB: ctx.enemyLegion.name,
      bonusA: ctx.alliedStats.vit,
      bonusB: ctx.enemyStats.vit,
      flavor: game.i18n.localize("BOM.battle.tiebreaker")
    });
    // Tiebreaker: no counter, just raw winner
    if (result.winner === "a") this._results.winner = "allied";
    else if (result.winner === "b") this._results.winner = "enemy";
    else {
      // Still tied — allied wins by convention or re-roll
      this._results.winner = "allied";
    }
    this.render();
  }

  static async #onFinalize(event, target) {
    const phases = [
      { phaseName: game.i18n.localize("BOM.battle.maneuver"), ...this._formatPhase(this._results.maneuver) },
      { phaseName: game.i18n.localize("BOM.battle.charge"), ...this._formatPhase(this._results.charge) },
      { phaseName: game.i18n.localize("BOM.battle.clash"), ...this._formatPhase(this._results.clash) }
    ];

    // Update battle state
    await BattleState.updateBattle(this._battleId, {
      phases,
      counterAllied: this._results.counterA,
      counterEnemy: this._results.counterB,
      winner: this._results.winner,
      maneuverBenefit: this._results.maneuverBenefit,
      resolved: true
    });

    // Update wonLastRound
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

    // Send chat card
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
      winner: result.winner === "a" ? "Allied" : result.winner === "b" ? "Enemy" : "Tie"
    };
  }
}
