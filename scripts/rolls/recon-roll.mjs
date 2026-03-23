import { BOM } from "../config.mjs";
import { BattleState } from "../data/battle-state.mjs";

/**
 * Perform a reconnaissance roll for the allied side.
 * Uses the highest allied Wit as the base modifier.
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

  const roll = new Roll("1d20 + @bonus", { bonus: bestWit });
  await roll.evaluate();

  // Determine result — rolls above the highest threshold return the last entry
  const total = roll.total;
  let resultKey = BOM.reconThresholds[BOM.reconThresholds.length - 1].result;
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
    { total, bonus: bestWit, bestWit, resultText }
  );

  await ChatMessage.create({
    speaker: { alias: game.i18n.localize("BOM.recon.title") },
    content,
    rolls: [roll]
  });

  return { total, resultKey, resultText };
}
