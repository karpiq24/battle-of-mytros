/**
 * Rich ChatMessage builders for battle results, aftermath, and events.
 */

/**
 * Send a battle result chat card.
 * @param {object} data - { alliedName, enemyName, phases, counterAllied, counterEnemy, winner, maneuverBenefit }
 */
export async function sendBattleResultCard(data) {
  const content = await renderTemplate(
    "modules/battle-of-mytros/templates/chat/battle-result.hbs",
    data
  );
  await ChatMessage.create({
    speaker: { alias: game.i18n.localize("BOM.chat.battleResult") },
    content
  });
}

/**
 * Send an aftermath result chat card.
 * @param {object} data - { legionName, isWinner, recovery, hope, salvage, casualty }
 */
export async function sendAftermathCard(data) {
  const content = await renderTemplate(
    "modules/battle-of-mytros/templates/chat/aftermath-result.hbs",
    data
  );
  await ChatMessage.create({
    speaker: { alias: game.i18n.localize("BOM.chat.aftermathResult") },
    content
  });
}

/**
 * Send a commander death chat card.
 * @param {object} data - { commanderName, legionName, cause }
 */
export async function sendCommanderDeathCard(data) {
  const content = await renderTemplate(
    "modules/battle-of-mytros/templates/chat/commander-death.hbs",
    data
  );
  await ChatMessage.create({
    speaker: { alias: game.i18n.localize("BOM.chat.commanderDeath") },
    content
  });
}
