import { BOM } from "../config.mjs";
import { BattleState } from "../data/battle-state.mjs";

/**
 * Perform a single aftermath check using Foundry's Roll API.
 *
 * @param {object} opts
 * @param {string} opts.legionName - Name for chat speaker
 * @param {number} opts.bonus - Roll modifier
 * @param {number} opts.dc - Target DC
 * @param {string} opts.flavor - Chat flavor text
 * @param {boolean} [opts.advantage=false]
 * @param {boolean} [opts.disadvantage=false]
 * @returns {Promise<{roll: number, total: number, dc: number, passed: boolean}>}
 */
async function _aftermathCheck({ legionName, bonus, dc, flavor, advantage = false, disadvantage = false }) {
  const dice = (advantage && !disadvantage) ? "2d20kh" : (disadvantage && !advantage) ? "2d20kl" : "1d20";
  const advStr = advantage ? " (Advantage)" : disadvantage ? " (Disadvantage)" : "";
  const roll = new Roll(`${dice} + @bonus`, { bonus });
  await roll.evaluate();
  await roll.toMessage({
    speaker: { alias: legionName },
    flavor: `${flavor}${advStr}`
  });
  return {
    roll: roll.dice[0].total,
    bonus,
    total: roll.total,
    dc,
    passed: roll.total >= dc
  };
}

/**
 * Recovery check for a legion after battle.
 * DC = recoveryBaseDC + current injuries
 *
 * @param {object} legion - Legion data object
 * @param {boolean} isWinner
 * @param {object} [opts]
 * @param {number} [opts.manualBonus=0]
 * @param {boolean} [opts.advantage=false]
 * @param {boolean} [opts.disadvantage=false]
 * @returns {Promise<{passed: boolean, injuriesGained: number, result: object}>}
 */
export async function recoveryCheck(legion, isWinner, { manualBonus = 0, advantage = false, disadvantage = false } = {}) {
  const stats = BattleState.computeStats(legion);
  const dc = BOM.recoveryBaseDC + legion.injuries;
  const result = await _aftermathCheck({
    legionName: legion.name,
    bonus: stats.vit + manualBonus,
    dc,
    flavor: game.i18n.localize("BOM.aftermath.recovery"),
    advantage,
    disadvantage
  });

  let injuriesGained;
  if (isWinner) {
    injuriesGained = result.passed ? BOM.recovery.winnerPass : BOM.recovery.winnerFail;
  } else {
    injuriesGained = result.passed ? BOM.recovery.loserPass : BOM.recovery.loserFail;
  }

  return { passed: result.passed, injuriesGained, result };
}

/**
 * Hope check (morale) for a legion after battle.
 * Modifier = current effective morale - hopeMoraleOffset
 *
 * @param {object} legion
 * @param {boolean} isWinner
 * @param {object} [opts]
 * @param {number} [opts.manualBonus=0]
 * @param {boolean} [opts.advantage=false]
 * @param {boolean} [opts.disadvantage=false]
 * @returns {Promise<{passed: boolean, moraleChange: number, result: object}>}
 */
export async function hopeCheck(legion, isWinner, { manualBonus = 0, advantage = false, disadvantage = false } = {}) {
  const stats = BattleState.computeStats(legion);
  const bonus = stats.mor - BOM.hopeMoraleOffset + manualBonus;
  const result = await _aftermathCheck({
    legionName: legion.name,
    bonus,
    dc: BOM.hopeDC,
    flavor: game.i18n.localize("BOM.aftermath.hope"),
    advantage,
    disadvantage
  });

  let moraleChange;
  if (isWinner) {
    moraleChange = result.passed ? BOM.hope.winnerPass : BOM.hope.winnerFail;
  } else {
    moraleChange = result.passed ? BOM.hope.loserPass : BOM.hope.loserFail;
  }

  return { passed: result.passed, moraleChange, result };
}

/**
 * Salvage check for the winning legion after battle.
 * DC = salvageDC.
 *
 * @param {object} legion
 * @param {object} [opts]
 * @param {number} [opts.manualBonus=0]
 * @param {boolean} [opts.advantage=false]
 * @param {boolean} [opts.disadvantage=false]
 * @returns {Promise<{passed: boolean, nat20: boolean, result: object}>}
 */
export async function salvageCheck(legion, { manualBonus = 0, advantage = false, disadvantage = false } = {}) {
  const stats = BattleState.computeStats(legion);
  const result = await _aftermathCheck({
    legionName: legion.name,
    bonus: stats.wit + manualBonus,
    dc: BOM.salvageDC,
    flavor: game.i18n.localize("BOM.aftermath.salvage"),
    advantage,
    disadvantage
  });

  return {
    passed: result.passed,
    nat20: result.roll === 20,
    result
  };
}

/**
 * Commander Casualty check.
 * DC depends on battle outcome. No automatic tag bonuses — use manualBonus.
 *
 * @param {object} legion
 * @param {"winner"|"loser"|"crushed"} outcome
 * @param {object} [opts]
 * @param {number} [opts.manualBonus=0]
 * @param {boolean} [opts.advantage=false]
 * @param {boolean} [opts.disadvantage=false]
 * @returns {Promise<{survived: boolean, result: object}>}
 */
export async function casualtyCheck(legion, outcome, { manualBonus = 0, advantage = false, disadvantage = false } = {}) {
  const cmd = BattleState.getCommander(legion.commanderId);
  if (!cmd?.alive) return { survived: true, result: null };

  const dc = BOM.casualtyDC[outcome] ?? BOM.casualtyDC.loser;

  let bonus = cmd.vitBonus ?? 0;

  if (legion.injuries >= BOM.casualtyInjuredAt) {
    bonus += BOM.casualtyInjuredPenalty;
  }

  bonus += manualBonus;

  const result = await _aftermathCheck({
    legionName: `${cmd.name} (${legion.name})`,
    bonus,
    dc,
    flavor: game.i18n.localize("BOM.aftermath.casualty"),
    advantage,
    disadvantage
  });

  return { survived: result.passed, result };
}

/**
 * Apply all aftermath effects to a legion after checks are complete.
 *
 * @param {string} legionId
 * @param {object} effects - { injuriesGained, moraleChange, commanderDied, salvageBenefit, enemyLegionId }
 */
export async function applyAftermathEffects(legionId, effects) {
  const state = BattleState.get();
  const legion = state.legions.find(l => l.id === legionId);
  if (!legion) return;

  // Apply injuries
  if (effects.injuriesGained) {
    legion.injuries = Math.min(BOM.maxInjuries, legion.injuries + effects.injuriesGained);
    if (legion.injuries >= BOM.maxInjuries) {
      legion.destroyed = true;
    }
  }

  // Apply morale
  if (effects.moraleChange) {
    legion.moraleMod += effects.moraleChange;
    const stats = BattleState.computeStats(legion);
    if (stats.mor <= BOM.routThreshold && !legion.destroyed) {
      legion.routed = true;
    }
  }

  // Commander death
  if (effects.commanderDied && legion.commanderId) {
    const cmd = state.commanders?.find(c => c.id === legion.commanderId);
    if (cmd) cmd.alive = false;
    legion.moraleMod -= BOM.commanderDeathMoraleLoss;
  }

  // Salvage benefits
  if (effects.salvageBenefit) {
    _applySalvage(legion, effects.salvageBenefit, state, effects.enemyLegionId);
  }

  await BattleState.set(state);
}

function _applySalvage(legion, benefitId, state, enemyLegionId) {
  switch (benefitId) {
    case "supplies":
      legion.injuries = Math.max(0, legion.injuries - 1);
      break;
    case "insight":
      legion.witTempBonus += BOM.salvageInsightBonus;
      break;
    case "shaken":
      if (enemyLegionId) {
        const enemy = state.legions.find(l => l.id === enemyLegionId);
        if (enemy) enemy.moraleMod -= 1;
      }
      break;
    case "fortify":
      // Fortification is tracked elsewhere (map/section based)
      break;
  }
}
