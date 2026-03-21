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
    if (!battleId) return;
    // Will be implemented in Phase 4
    ui.notifications.info("Aftermath resolution coming soon.");
  }
}
