import { BOM } from "../config.mjs";
import { BattleState } from "../data/battle-state.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for adding or editing an independent commander entity.
 */
export class CommanderEditor extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "bom-commander-editor",
    position: { width: 460, height: "auto" },
    window: {
      title: "BOM.action.addCommander",
      icon: "fas fa-crown"
    },
    classes: ["bom-commander-editor"],
    tag: "form",
    form: {
      handler: CommanderEditor.#onSubmit,
      closeOnSubmit: true
    },
    actions: {}
  };

  static PARTS = {
    form: { template: "modules/battle-of-mytros/templates/dialogs/commander-editor.hbs" }
  };

  constructor({ dashboard, commanderId } = {}, options = {}) {
    super(options);
    this._dashboard = dashboard;
    this._commanderId = commanderId ?? null;
  }

  async _prepareContext(options) {
    const commander = this._commanderId ? BattleState.getCommander(this._commanderId) : null;
    const isEdit = !!commander;

    return {
      isEdit,
      commander: commander ?? {
        name: "",
        faction: "allied",
        vitBonus: 1,
        morBonus: 1,
        witBonus: 1,
        tags: [],
        alive: true
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

    const tags = [];
    for (const tagName of BOM.allTags) {
      if (data.tags?.[tagName]) {
        tags.push({ name: tagName, used: false });
      }
    }

    const cmdData = {
      name: data.name,
      faction: data.faction,
      vitBonus: Number(data.vitBonus) || 0,
      morBonus: Number(data.morBonus) || 0,
      witBonus: Number(data.witBonus) || 0,
      tags,
      alive: data.alive !== false
    };

    if (this._commanderId) {
      await BattleState.updateCommander(this._commanderId, cmdData);
    } else {
      await BattleState.addCommander(cmdData);
    }

    if (this._dashboard?.render) this._dashboard.render();
  }
}
