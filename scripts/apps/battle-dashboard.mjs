import { BOM } from "../config.mjs";
import { BattleState } from "../data/battle-state.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Show benefit picker dialog(s) for a legion that passed its salvage check.
 * Nat 20 grants a second pick (excluding the first choice).
 * Returns an array of chosen benefit labels for display.
 *
 * @param {object} legion
 * @param {{ passed: boolean, nat20: boolean }} salvage
 * @param {string} enemyLegionId
 * @param {Function} applyFn - bound applyAftermathEffects
 * @returns {Promise<string[]>}
 */
async function _pickSalvageBenefits(legion, salvage, enemyLegionId, applyFn) {
  if (!salvage.passed) return [];

  const pick = async (excludeIds = []) => {
    const available = BOM.salvageBenefits.filter(b => !excludeIds.includes(b.id));
    return foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("BOM.aftermath.salvage") },
      content: `<p>Choose a salvage benefit for <strong>${legion.name}</strong>:</p>`,
      buttons: available.map(b => ({
        label: `${game.i18n.localize(b.label)} — ${game.i18n.localize(b.desc)}`,
        action: b.id
      })),
      rejectClose: false
    });
  };

  const labels = [];

  const first = await pick();
  if (first) {
    labels.push(game.i18n.localize(BOM.salvageBenefits.find(b => b.id === first)?.label ?? ""));
    await applyFn(legion.id, { salvageBenefit: first, enemyLegionId });
  }

  if (salvage.nat20 && first) {
    const second = await pick([first]);
    if (second) {
      labels.push(game.i18n.localize(BOM.salvageBenefits.find(b => b.id === second)?.label ?? ""));
      await applyFn(legion.id, { salvageBenefit: second, enemyLegionId });
    }
  }

  return labels;
}

/**
 * Main Battle Dashboard — persistent, resizable, tabbed ApplicationV2 window.
 * Provides Overview, Battle, Aftermath, and Setup tabs for managing mass combat.
 */
export class BattleDashboard extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @type {BattleDashboard|null} Singleton instance */
  static _instance = null;

  static DEFAULT_OPTIONS = {
    id: "battle-dashboard",
    position: { width: 920, height: 720 },
    window: {
      title: "BOM.dashboard.title",
      icon: "fas fa-swords",
      resizable: true
    },
    classes: ["bom-dashboard"],
    actions: {
      newRound: BattleDashboard.#onNewRound,
      endDay: BattleDashboard.#onEndDay,
      addLegion: BattleDashboard.#onAddLegion,
      editLegion: BattleDashboard.#onEditLegion,
      deleteLegion: BattleDashboard.#onDeleteLegion,
      addCommander: BattleDashboard.#onAddCommander,
      editCommander: BattleDashboard.#onEditCommander,
      deleteCommander: BattleDashboard.#onDeleteCommander,
      addBattle: BattleDashboard.#onAddBattle,
      removeBattle: BattleDashboard.#onRemoveBattle,
      addObjective: BattleDashboard.#onAddObjective,
      removeObjective: BattleDashboard.#onRemoveObjective,
      spendMiracle: BattleDashboard.#onSpendMiracle,
      refundMiracle: BattleDashboard.#onRefundMiracle,
      resetState: BattleDashboard.#onResetState,
      importCSV: BattleDashboard.#onImportCSV,
      exportState: BattleDashboard.#onExportState,
      importState: BattleDashboard.#onImportState,
      reconRoll: BattleDashboard.#onReconRoll,
      advancePhase: BattleDashboard.#onAdvancePhase,
      toggleTag: BattleDashboard.#onToggleTag,
      resolveBattle: BattleDashboard.#onResolveBattle,
      resolveAftermath: BattleDashboard.#onResolveAftermath,
    }
  };

  static PARTS = {
    tabs: { template: "modules/battle-of-mytros/templates/dashboard/tabs.hbs" },
    overview: { template: "modules/battle-of-mytros/templates/dashboard/overview.hbs", scrollable: [""] },
    battle: { template: "modules/battle-of-mytros/templates/dashboard/battle.hbs", scrollable: [""] },
    aftermath: { template: "modules/battle-of-mytros/templates/dashboard/aftermath.hbs", scrollable: [""] },
    setup: { template: "modules/battle-of-mytros/templates/dashboard/setup.hbs", scrollable: [""] }
  };

  // Tab definitions passed through context — not used by the framework directly
  static TAB_DEFS = [
    { id: "overview", group: "sheet", icon: "fas fa-eye", label: "BOM.tab.overview" },
    { id: "battle", group: "sheet", icon: "fas fa-swords", label: "BOM.tab.battle" },
    { id: "aftermath", group: "sheet", icon: "fas fa-heart-crack", label: "BOM.tab.aftermath" },
    { id: "setup", group: "sheet", icon: "fas fa-gear", label: "BOM.tab.setup" }
  ];

  // V13: tabGroups tracks the active tab per group; initialized here as instance property
  tabGroups = { sheet: "overview" };

  /** Get or create the singleton dashboard instance */
  static getInstance() {
    if (!this._instance) this._instance = new this();
    return this._instance;
  }

  /* ─── Data Preparation ─── */

  async _prepareContext(options) {
    const state = BattleState.get();
    const commanders = state.commanders ?? [];

    const legions = state.legions.map(l => ({
      ...l,
      commander: commanders.find(c => c.id === l.commanderId) ?? null,
      stats: BattleState.computeStats(l),
      statusKey: l.destroyed ? "destroyed" : l.routed ? "routed" : "active"
    }));

    const activeTab = this.tabGroups.sheet ?? "overview";

    return {
      state,
      legions,
      commanders,
      alliedLegions: legions.filter(l => l.faction === "allied"),
      enemyLegions: legions.filter(l => l.faction === "enemy"),
      activeLegions: legions.filter(l => !l.destroyed),
      commandersByFaction: {
        allied: commanders.filter(c => c.faction === "allied"),
        enemy: commanders.filter(c => c.faction === "enemy")
      },
      phaseLabel: `BOM.phase.${state.phase}`,
      allTags: BOM.allTags,
      maneuverBenefits: BOM.maneuverBenefits,
      salvageBenefits: BOM.salvageBenefits,
      pcActions: BOM.pcActions,
      maxInjuries: BOM.maxInjuries,
      moraleCap: BOM.moraleCap,
      activeTab,
      tabDefs: BattleDashboard.TAB_DEFS
    };
  }

  _preparePartContext(partId, context) {
    // activeTab is already in context from _prepareContext
    return context;
  }

  /* ─── Tab Handling ─── */

  /** Wire up tab clicks and commander-assign dropdowns after render */
  _onRender(context, options) {
    super._onRender?.(context, options);

    // Tab switching
    this.element.querySelectorAll(".bom-tabs .item[data-tab]").forEach(el => {
      el.addEventListener("click", (ev) => {
        const tab = ev.currentTarget.dataset.tab;
        if (tab && tab !== this.tabGroups.sheet) {
          this.tabGroups.sheet = tab;
          this.render();
        }
      });
    });

    // Quick commander assignment dropdowns on legion cards
    this.element.querySelectorAll(".bom-commander-select").forEach(el => {
      el.addEventListener("change", async (ev) => {
        const legionId = ev.currentTarget.dataset.legionId;
        const commanderId = ev.currentTarget.value || null;
        await BattleState.assignCommander(legionId, commanderId);
        this.render();
      });
    });
  }

  /* ─── Action Handlers ─── */

  static async #onNewRound(event, target) {
    const state = BattleState.get();
    // Force-end the current round by jumping to the last phase, then advancePhase rolls over
    state.phase = BOM.phases[BOM.phases.length - 1];
    await BattleState.set(state);
    await BattleState.advancePhase();
    this.render();
  }

  static async #onEndDay(event, target) {
    const state = BattleState.get();
    // Force end of day by setting round past limit
    state.round = state.roundsPerDay;
    await BattleState.set(state);
    await BattleState.advancePhase();
    this.render();
  }

  static async #onAddLegion(event, target) {
    const { LegionEditor } = await import("./legion-editor.mjs");
    new LegionEditor({ dashboard: this }).render(true);
  }

  static async #onEditLegion(event, target) {
    const legionId = target.dataset.legionId;
    if (!legionId) return;
    const { LegionEditor } = await import("./legion-editor.mjs");
    new LegionEditor({ dashboard: this, legionId }).render(true);
  }

  static async #onAddCommander(event, target) {
    const { CommanderEditor } = await import("./commander-editor.mjs");
    new CommanderEditor({ dashboard: this }).render(true);
  }

  static async #onEditCommander(event, target) {
    const commanderId = target.dataset.commanderId;
    if (!commanderId) return;
    const { CommanderEditor } = await import("./commander-editor.mjs");
    new CommanderEditor({ dashboard: this, commanderId }).render(true);
  }

  static async #onDeleteCommander(event, target) {
    const commanderId = target.dataset.commanderId;
    if (!commanderId) return;
    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("BOM.action.deleteCommander") },
      content: `<p>${game.i18n.localize("BOM.confirm.deleteCommander")}</p>`
    });
    if (!confirm) return;
    await BattleState.removeCommander(commanderId);
    this.render();
  }

  static async #onDeleteLegion(event, target) {
    const legionId = target.dataset.legionId;
    if (!legionId) return;
    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("BOM.action.deleteLegion") },
      content: `<p>${game.i18n.localize("BOM.confirm.deleteLegion")}</p>`
    });
    if (!confirm) return;
    await BattleState.removeLegion(legionId);
    this.render();
  }

  static async #onAddBattle(event, target) {
    const form = target.closest(".bom-battle-pairing-form");
    if (!form) return;
    const alliedId = form.querySelector('[name="alliedLegionId"]')?.value;
    const enemyId = form.querySelector('[name="enemyLegionId"]')?.value;
    if (!alliedId || !enemyId) return;
    await BattleState.addBattle(alliedId, enemyId);
    this.render();
  }

  static async #onRemoveBattle(event, target) {
    const battleId = target.dataset.battleId;
    if (!battleId) return;
    await BattleState.removeBattle(battleId);
    this.render();
  }

  static async #onAddObjective(event, target) {
    const form = target.closest(".bom-objective-form");
    if (!form) return;
    const name = form.querySelector('[name="objectiveName"]')?.value;
    const section = form.querySelector('[name="objectiveSection"]')?.value;
    if (!name) return;
    await BattleState.addObjective({ name, section });
    this.render();
  }

  static async #onRemoveObjective(event, target) {
    const objId = target.dataset.objectiveId;
    if (!objId) return;
    await BattleState.removeObjective(objId);
    this.render();
  }

  static async #onSpendMiracle(event, target) {
    const faction = target.dataset.faction;
    if (!faction) return;
    await BattleState.spendMiracle(faction);
    this.render();
  }

  static async #onRefundMiracle(event, target) {
    const faction = target.dataset.faction;
    if (!faction) return;
    const state = BattleState.get();
    const m = state.miracles[faction];
    if (m.used > 0) {
      m.used -= 1;
      await BattleState.set(state);
    }
    this.render();
  }

  static async #onResetState(event, target) {
    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("BOM.action.reset") },
      content: `<p>${game.i18n.localize("BOM.confirm.reset")}</p>`
    });
    if (!confirm) return;
    await BattleState.resetState();
    this.render();
  }

  static async #onImportCSV(event, target) {
    const form = target.closest(".bom-csv-import");
    if (!form) return;
    const legionsCsv = form.querySelector('[name="legionsCsv"]')?.value;
    const commandersCsv = form.querySelector('[name="commandersCsv"]')?.value;
    if (!legionsCsv || !commandersCsv) {
      ui.notifications.warn("Paste both Legions CSV and Commanders CSV.");
      return;
    }
    await BattleState.importFromCSV(legionsCsv, commandersCsv);
    ui.notifications.info("CSV imported successfully.");
    this.render();
  }

  static async #onExportState(event, target) {
    const json = BattleState.exportState();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "battle-of-mytros-state.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  static async #onImportState(event, target) {
    const form = target.closest(".bom-json-import");
    if (!form) return;
    const json = form.querySelector('[name="stateJson"]')?.value;
    if (!json) return;
    try {
      await BattleState.importState(json);
      ui.notifications.info("State imported successfully.");
      this.render();
    } catch (e) {
      ui.notifications.error(`Import failed: ${e.message}`);
    }
  }

  static async #onReconRoll(event, target) {
    const { reconRoll } = await import("../rolls/recon-roll.mjs");
    await reconRoll();
    this.render();
  }

  static async #onAdvancePhase(event, target) {
    await BattleState.advancePhase();
    this.render();
  }

  static async #onToggleTag(event, target) {
    const legionId = target.dataset.legionId;
    const tagIdx = Number(target.dataset.tagIndex);
    if (!legionId || isNaN(tagIdx)) return;
    const state = BattleState.get();
    const legion = state.legions.find(l => l.id === legionId);
    if (!legion) return;
    const cmd = state.commanders?.find(c => c.id === legion.commanderId);
    if (!cmd?.tags?.[tagIdx]) return;
    cmd.tags[tagIdx].used = !cmd.tags[tagIdx].used;
    await BattleState.set(state);
    this.render();
  }

  static async #onResolveBattle(event, target) {
    const battleId = target.dataset.battleId;
    if (!battleId) return;
    const { BattleResolver } = await import("./battle-resolver.mjs");
    new BattleResolver({ dashboard: this, battleId }).render(true);
  }

  static async #onResolveAftermath(event, target) {
    const battleId = target.dataset.battleId;
    const check = target.dataset.check;
    if (!battleId || !check) return;

    const state = BattleState.get();
    const battle = state.battles.find(b => b.id === battleId);
    if (!battle?.resolved) return;

    const alliedLegion = state.legions.find(l => l.id === battle.alliedLegionId);
    const enemyLegion = state.legions.find(l => l.id === battle.enemyLegionId);
    if (!alliedLegion || !enemyLegion) return;

    const { recoveryCheck, hopeCheck, salvageCheck, casualtyCheck, applyAftermathEffects } =
      await import("../rolls/aftermath-rolls.mjs");
    const { sendAftermathCard, sendCommanderDeathCard } = await import("../chat/chat-cards.mjs");

    const isAlliedWinner = battle.winner === "allied";
    const winLegion = isAlliedWinner ? alliedLegion : enemyLegion;
    const loseLegion = isAlliedWinner ? enemyLegion : alliedLegion;

    // Read per-check modifier inputs from the aftermath card UI
    const card = target.closest(".bom-aftermath-card");
    const _num = (name) => Number(card?.querySelector(`[name="${name}"]`)?.value) || 0;
    const _chk = (name) => card?.querySelector(`[name="${name}"]`)?.checked ?? false;

    if (check === "recovery") {
      const alliedOpts = { manualBonus: _num("modAllied_recovery"), advantage: _chk("advAllied_recovery"), disadvantage: _chk("disadvAllied_recovery") };
      const enemyOpts  = { manualBonus: _num("modEnemy_recovery"),  advantage: _chk("advEnemy_recovery"),  disadvantage: _chk("disadvEnemy_recovery") };
      const alliedRec = await recoveryCheck(alliedLegion, isAlliedWinner, alliedOpts);
      const enemyRec = await recoveryCheck(enemyLegion, !isAlliedWinner, enemyOpts);
      await applyAftermathEffects(alliedLegion.id, { injuriesGained: alliedRec.injuriesGained });
      await applyAftermathEffects(enemyLegion.id, { injuriesGained: enemyRec.injuriesGained });

      const injLabel = (n) => n === 0 ? "No injuries" : `+${n} ${n === 1 ? "injury" : "injuries"}`;
      await sendAftermathCard({ legionName: alliedLegion.name, isWinner: isAlliedWinner,
        recovery: { ...alliedRec.result, effect: injLabel(alliedRec.injuriesGained) } });
      await sendAftermathCard({ legionName: enemyLegion.name, isWinner: !isAlliedWinner,
        recovery: { ...enemyRec.result, effect: injLabel(enemyRec.injuriesGained) } });

    } else if (check === "hope") {
      const alliedOpts = { manualBonus: _num("modAllied_hope"), advantage: _chk("advAllied_hope"), disadvantage: _chk("disadvAllied_hope") };
      const enemyOpts  = { manualBonus: _num("modEnemy_hope"),  advantage: _chk("advEnemy_hope"),  disadvantage: _chk("disadvEnemy_hope") };
      const alliedHope = await hopeCheck(alliedLegion, isAlliedWinner, alliedOpts);
      const enemyHope = await hopeCheck(enemyLegion, !isAlliedWinner, enemyOpts);
      await applyAftermathEffects(alliedLegion.id, { moraleChange: alliedHope.moraleChange });
      await applyAftermathEffects(enemyLegion.id, { moraleChange: enemyHope.moraleChange });

      const morLabel = (n) => n > 0 ? `+${n} Morale` : n < 0 ? `${n} Morale` : "No morale change";
      await sendAftermathCard({ legionName: alliedLegion.name, isWinner: isAlliedWinner,
        hope: { ...alliedHope.result, effect: morLabel(alliedHope.moraleChange) } });
      await sendAftermathCard({ legionName: enemyLegion.name, isWinner: !isAlliedWinner,
        hope: { ...enemyHope.result, effect: morLabel(enemyHope.moraleChange) } });

    } else if (check === "salvage") {
      const alliedOpts = { manualBonus: _num("modAllied_salvage"), advantage: _chk("advAllied_salvage"), disadvantage: _chk("disadvAllied_salvage") };
      const enemyOpts  = { manualBonus: _num("modEnemy_salvage"),  advantage: _chk("advEnemy_salvage"),  disadvantage: _chk("disadvEnemy_salvage") };

      const alliedSalvage = await salvageCheck(alliedLegion, alliedOpts);
      const enemySalvage  = await salvageCheck(enemyLegion, enemyOpts);

      const alliedLabels = await _pickSalvageBenefits(alliedLegion, alliedSalvage, enemyLegion.id, applyAftermathEffects);
      const enemyLabels  = await _pickSalvageBenefits(enemyLegion, enemySalvage, alliedLegion.id, applyAftermathEffects);

      await sendAftermathCard({ legionName: alliedLegion.name, isWinner: isAlliedWinner,
        salvage: { ...alliedSalvage.result, benefit: alliedLabels.join(", ") || null } });
      await sendAftermathCard({ legionName: enemyLegion.name, isWinner: !isAlliedWinner,
        salvage: { ...enemySalvage.result, benefit: enemyLabels.join(", ") || null } });

    } else if (check === "casualty") {
      const counterDiff = Math.abs(battle.counterAllied - battle.counterEnemy);
      const isCrushed = counterDiff >= Math.abs(BOM.casualtyCrushedThreshold);
      const alliedOutcome = isAlliedWinner ? "winner" : (isCrushed ? "crushed" : "loser");
      const enemyOutcome = !isAlliedWinner ? "winner" : (isCrushed ? "crushed" : "loser");

      const alliedOpts = { manualBonus: _num("modAllied_casualty"), advantage: _chk("advAllied_casualty"), disadvantage: _chk("disadvAllied_casualty") };
      const enemyOpts  = { manualBonus: _num("modEnemy_casualty"),  advantage: _chk("advEnemy_casualty"),  disadvantage: _chk("disadvEnemy_casualty") };
      const alliedCas = await casualtyCheck(alliedLegion, alliedOutcome, alliedOpts);
      const enemyCas = await casualtyCheck(enemyLegion, enemyOutcome, enemyOpts);

      if (alliedCas.result) {
        await applyAftermathEffects(alliedLegion.id, { commanderDied: !alliedCas.survived });
        if (!alliedCas.survived) {
          const cmd = BattleState.getCommander(alliedLegion.commanderId);
          await sendCommanderDeathCard({ commanderName: cmd?.name ?? "Unknown", legionName: alliedLegion.name });
        }
        await sendAftermathCard({ legionName: alliedLegion.name, isWinner: isAlliedWinner,
          casualty: { ...alliedCas.result, survived: alliedCas.survived } });
      }
      if (enemyCas.result) {
        await applyAftermathEffects(enemyLegion.id, { commanderDied: !enemyCas.survived });
        if (!enemyCas.survived) {
          const cmd = BattleState.getCommander(enemyLegion.commanderId);
          await sendCommanderDeathCard({ commanderName: cmd?.name ?? "Unknown", legionName: enemyLegion.name });
        }
        await sendAftermathCard({ legionName: enemyLegion.name, isWinner: !isAlliedWinner,
          casualty: { ...enemyCas.result, survived: enemyCas.survived } });
      }
    }

    // Mark this check as done on the battle
    const aftermathDone = { ...(battle.aftermathDone ?? {}), [check]: true };
    await BattleState.updateBattle(battleId, { aftermathDone });
    this.render();
  }
}
