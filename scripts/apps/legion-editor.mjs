import { BOM } from "../config.mjs";
import { BattleState } from "../data/battle-state.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for adding or editing a legion and its commander.
 */
export class LegionEditor extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "bom-legion-editor",
    position: { width: 480, height: "auto" },
    window: {
      title: "BOM.action.addLegion",
      icon: "fas fa-shield-halved"
    },
    classes: ["bom-legion-editor"],
    tag: "form",
    form: {
      handler: LegionEditor.#onSubmit,
      closeOnSubmit: true
    },
    actions: {}
  };

  static PARTS = {
    form: { template: "modules/battle-of-mytros/templates/dialogs/legion-editor.hbs" }
  };

  constructor({ dashboard, legionId } = {}, options = {}) {
    super(options);
    this._dashboard = dashboard;
    this._legionId = legionId ?? null;
  }

  async _prepareContext(options) {
    const legion = this._legionId ? BattleState.getLegion(this._legionId) : null;
    const isEdit = !!legion;

    return {
      isEdit,
      legion: legion ?? {
        name: "",
        faction: "allied",
        vitBase: 2,
        morBase: 2,
        witBase: 2,
        injuries: 0,
        moraleMod: 0,
        commander: { name: "", vitBonus: 1, morBonus: 1, witBonus: 1, tags: [], alive: true }
      },
      allTags: BOM.allTags,
      factions: [
        { id: "allied", label: "BOM.faction.allied" },
        { id: "enemy", label: "BOM.faction.enemy" }
      ]
    };
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);

    // Parse tags from checkboxes
    const tags = [];
    for (const tagName of BOM.allTags) {
      if (data.tags?.[tagName]) {
        tags.push({ name: tagName, used: false });
      }
    }

    const legionData = {
      name: data.name,
      faction: data.faction,
      vitBase: Number(data.vitBase),
      morBase: Number(data.morBase),
      witBase: Number(data.witBase),
      injuries: Number(data.injuries) || 0,
      moraleMod: Number(data.moraleMod) || 0,
      commander: {
        name: data.commanderName,
        vitBonus: Number(data.cmdVit),
        morBonus: Number(data.cmdMor),
        witBonus: Number(data.cmdWit),
        tags,
        alive: data.cmdAlive !== false
      }
    };

    if (this._legionId) {
      await BattleState.updateLegion(this._legionId, legionData);
    } else {
      await BattleState.addLegion(legionData);
    }

    if (this._dashboard?.render) this._dashboard.render();
  }
}
