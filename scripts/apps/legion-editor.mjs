import { BOM } from "../config.mjs";
import { BattleState } from "../data/battle-state.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for adding or editing a legion.
 * Commander assignment is done via dropdown (commanders are separate entities).
 */
export class LegionEditor extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "bom-legion-editor",
    position: { width: 420, height: "auto" },
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
    const state = BattleState.get();

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
        commanderId: null
      },
      commanders: state.commanders ?? [],
      factions: [
        { id: "allied", label: "BOM.faction.allied" },
        { id: "enemy", label: "BOM.faction.enemy" }
      ]
    };
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);

    const legionData = {
      name: data.name,
      faction: data.faction,
      vitBase: Number(data.vitBase),
      morBase: Number(data.morBase),
      witBase: Number(data.witBase),
      injuries: Number(data.injuries) || 0,
      moraleMod: Number(data.moraleMod) || 0,
      commanderId: data.commanderId || null
    };

    if (this._legionId) {
      await BattleState.updateLegion(this._legionId, legionData);
    } else {
      await BattleState.addLegion(legionData);
    }

    if (this._dashboard?.render) this._dashboard.render();
  }
}
