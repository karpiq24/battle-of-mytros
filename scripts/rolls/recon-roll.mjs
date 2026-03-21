import { BOM } from "../config.mjs";
import { BattleState } from "../data/battle-state.mjs";

/**
 * Perform a reconnaissance roll for the allied side.
 * Uses the best allied Wit + Scout tag bonuses.
 * Sends result to chat.
 */
export async function reconRoll() {
  const state = BattleState.get();
  const alliedLegions = state.legions.filter(l => l.faction === "allied" && !l.destroyed && !l.routed);

  if (alliedLegions.length === 0) {
    ui.notifications.warn("No active allied legions for reconnaissance.");
    return null;
  }

  // Find best Wit among allied legions
  let bestWit = 0;
  for (const legion of alliedLegions) {
    const stats = BattleState.computeStats(legion);
    if (stats.wit > bestWit) bestWit = stats.wit;
  }

  // Count Scout tag bonuses
  let scoutBonus = 0;
  for (const legion of alliedLegions) {
    if (!legion.commander?.alive) continue;
    for (const tag of legion.commander.tags ?? []) {
      if (tag.name === "Scout" && !tag.used) {
        scoutBonus += BOM.scoutTagReconBonus;
      }
    }
  }

  const totalBonus = bestWit + scoutBonus;

  const roll = new Roll("1d20 + @bonus", { bonus: totalBonus });
  await roll.evaluate();

  // Determine result
  const total = roll.total;
  let resultKey = BOM.reconFullIntel;
  for (const threshold of BOM.reconThresholds) {
    if (total <= threshold.max) {
      resultKey = threshold.result;
      break;
    }
  }

  const resultText = game.i18n.localize(resultKey);

  // Send to chat
  const content = await renderTemplate(
    "modules/battle-of-mytros/templates/chat/recon-result.hbs",
    { total, bonus: totalBonus, scoutBonus, bestWit, resultText }
  );

  await ChatMessage.create({
    speaker: { alias: game.i18n.localize("BOM.recon.title") },
    content,
    rolls: [roll]
  });

  // Send roll to chat as well
  await roll.toMessage({
    speaker: { alias: game.i18n.localize("BOM.recon.title") },
    flavor: game.i18n.localize("BOM.recon.title")
  });

  return { total, resultKey, resultText };
}
