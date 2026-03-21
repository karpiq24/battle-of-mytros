import { BOM } from "./config.mjs";
import { BattleState } from "./data/battle-state.mjs";
import { BattleDashboard } from "./apps/battle-dashboard.mjs";

/* ─── Settings Registration ─── */
Hooks.once("init", () => {
  game.settings.register(BOM.moduleId, "battleState", {
    name: "Battle State",
    hint: "Stores the full battle-of-mytros state object.",
    scope: "world",
    config: false,
    type: Object,
    default: BattleState.defaultState()
  });

  // Register Handlebars helpers used in templates
  _registerHelpers();

  // Preload templates
  loadTemplates([
    "modules/battle-of-mytros/templates/dashboard/tabs.hbs",
    "modules/battle-of-mytros/templates/dashboard/overview.hbs",
    "modules/battle-of-mytros/templates/dashboard/battle.hbs",
    "modules/battle-of-mytros/templates/dashboard/aftermath.hbs",
    "modules/battle-of-mytros/templates/dashboard/setup.hbs",
    "modules/battle-of-mytros/templates/partials/legion-card.hbs",
    "modules/battle-of-mytros/templates/partials/commander-badge.hbs",
    "modules/battle-of-mytros/templates/partials/phase-result.hbs",
    "modules/battle-of-mytros/templates/partials/aftermath-result.hbs",
    "modules/battle-of-mytros/templates/dialogs/legion-editor.hbs",
    "modules/battle-of-mytros/templates/dialogs/battle-resolver.hbs",
    "modules/battle-of-mytros/templates/dialogs/maneuver-choice.hbs",
    "modules/battle-of-mytros/templates/dialogs/salvage-choice.hbs",
    "modules/battle-of-mytros/templates/chat/battle-result.hbs",
    "modules/battle-of-mytros/templates/chat/aftermath-result.hbs",
    "modules/battle-of-mytros/templates/chat/recon-result.hbs",
    "modules/battle-of-mytros/templates/chat/commander-death.hbs"
  ]);

  console.log(`${BOM.moduleId} | Initialized.`);
});

/* ─── Scene Control Button ─── */
// In V13, controls is a plain object (record keyed by name), not an array.
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;
  controls["battle-of-mytros"] = {
    name: "battle-of-mytros",
    title: game.i18n.localize("BOM.dashboard.title"),
    icon: "fas fa-swords",
    layer: "tokens",
    activeTool: "open-dashboard",
    tools: {
      "open-dashboard": {
        name: "open-dashboard",
        title: game.i18n.localize("BOM.dashboard.title"),
        icon: "fas fa-swords",
        button: true,
        onChange: () => BattleDashboard.getInstance().render(true)
      }
    }
  };
});

/* ─── Socket Handling ─── */
Hooks.once("ready", () => {
  game.socket.on(`module.${BOM.moduleId}`, (data) => {
    if (data.type === "refreshDashboard") {
      const dash = BattleDashboard._instance;
      if (dash?.rendered) dash.render();
    }
  });

  console.log(`${BOM.moduleId} | Ready.`);
});

/* ─── Handlebars Helpers ─── */
function _registerHelpers() {
  // {{eq a b}} — strict equality
  Handlebars.registerHelper("eq", (a, b) => a === b);

  // {{lte a b}} — less than or equal
  Handlebars.registerHelper("lte", (a, b) => a <= b);

  // {{gte a b}} — greater than or equal
  Handlebars.registerHelper("gte", (a, b) => a >= b);

  // {{sum a b}} — addition
  Handlebars.registerHelper("sum", (a, b) => Number(a) + Number(b));

  // {{concat a b ...}} — string concatenation
  Handlebars.registerHelper("concat", (...args) => {
    // Last arg is the Handlebars options object
    return args.slice(0, -1).join("");
  });

  // {{array "a" "b" "c"}} — create inline array for #each
  Handlebars.registerHelper("array", (...args) => args.slice(0, -1));

  // {{#times n}} — repeat block n times, @index available
  Handlebars.registerHelper("times", function (n, options) {
    let out = "";
    for (let i = 0; i < n; i++) {
      out += options.fn(this, { data: { ...options.data, index: i } });
    }
    return out;
  });

  // {{findIndex array key value}} — find index where array[i][key] === value
  Handlebars.registerHelper("findIndex", (arr, key, value) => {
    if (!Array.isArray(arr)) return -1;
    return arr.findIndex(item => item[key] === value);
  });

  // {{lookup obj key}} is built-in, no need to register
}
