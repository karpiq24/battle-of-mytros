import { BOM } from "../config.mjs";
import { BattleState } from "../data/battle-state.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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

  static TABS = {
    sheet: {
      tabs: [
        { id: "overview", group: "sheet", icon: "fas fa-eye", label: "BOM.tab.overview" },
        { id: "battle", group: "sheet", icon: "fas fa-swords", label: "BOM.tab.battle" },
        { id: "aftermath", group: "sheet", icon: "fas fa-heart-crack", label: "BOM.tab.aftermath" },
        { id: "setup", group: "sheet", icon: "fas fa-gear", label: "BOM.tab.setup" }
      ],
      initial: "overview",
      labelPrefix: ""
    }
  };

  /** Get or create the singleton dashboard instance */
  static getInstance() {
    if (!this._instance) this._instance = new this();
    return this._instance;
  }

  /* ─── Data Preparation ─── */

  async _prepareContext(options) {
    const state = BattleState.get();
    const legions = state.legions.map(l => ({
      ...l,
      stats: BattleState.computeStats(l),
      statusKey: l.destroyed ? "destroyed" : l.routed ? "routed" : "active"
    }));

    return {
      state,
      legions,
      alliedLegions: legions.filter(l => l.faction === "allied"),
      enemyLegions: legions.filter(l => l.faction === "enemy"),
      activeLegions: legions.filter(l => !l.destroyed),
      phaseLabel: `BOM.phase.${state.phase}`,
      allTags: BOM.allTags,
      maneuverBenefits: BOM.maneuverBenefits,
      salvageBenefits: BOM.salvageBenefits,
      pcActions: BOM.pcActions,
      maxInjuries: BOM.maxInjuries,
      moraleCap: BOM.moraleCap,
      tabs: this.tabGroups
    };
  }

  _preparePartContext(partId, context) {
    context.tab = this.tabGroups.sheet;
    return context;
  }

  /** Only render the visible tab */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    const activeTab = this.tabGroups.sheet;
    for (const [key, part] of Object.entries(parts)) {
      if (key === "tabs") continue;
      part.hidden = key !== activeTab;
    }
    return parts;
  }

  /* ─── Action Handlers ─── */

  static async #onNewRound(event, target) {
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
    if (!legion?.commander?.tags?.[tagIdx]) return;
    legion.commander.tags[tagIdx].used = !legion.commander.tags[tagIdx].used;
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
    if (!battleId) return;
    // Will be implemented in Phase 4
    ui.notifications.info("Aftermath resolution coming soon.");
  }
}
