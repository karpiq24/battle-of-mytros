import { MytrosActorData } from "./models/actor-data.mjs";
import { MytrosRegionManager } from "./regions/region-manager.mjs";
import { BattleDashboard } from "./apps/dashboard.mjs";
import { MytrosCSVParser } from "./utils/csv-parser.mjs";
import { BattleRoller } from "./utils/battle-roller.mjs";
import { TagEngine } from "./utils/tag-engine.mjs";

globalThis.MytrosActorData = MytrosActorData; // expose for macros/testing
globalThis.MytrosRegionManager = MytrosRegionManager;
globalThis.MytrosCSVParser = MytrosCSVParser;
globalThis.BattleRoller = BattleRoller;
globalThis.TagEngine = TagEngine;

Hooks.once('init', async function() {
    console.log("Battle of Mytros | Initializing module");

    Handlebars.registerHelper('eq', function (a, b) {
        return a === b;
    });

    game.settings.register("battle-of-mytros", "battleSceneId", {
        name: "Battlemap Scene ID",
        hint: "The ID of the scene acting as the main Battle of Mytros map. Region tracking only runs here.",
        scope: "world",
        config: true,
        type: String,
        default: ""
    });

    game.settings.register("battle-of-mytros", "currentRound", {
        name: "Current Round",
        hint: "The current round of the battle.",
        scope: "world",
        config: false,
        type: Number,
        default: 1
    });

    game.settings.register("battle-of-mytros", "currentPhase", {
        name: "Current Phase",
        hint: "The current phase of the round (1-5).",
        scope: "world",
        config: false,
        type: Number,
        default: 1
    });

    game.settings.register("battle-of-mytros", "deathToll", {
        name: "Civilian Death Toll",
        hint: "Running total of civilian casualties.",
        scope: "world",
        config: false,
        type: Number,
        default: 0
    });

    game.settings.register("battle-of-mytros", "alliedMiracles", {
        name: "Allied Miracle Points",
        scope: "world",
        config: false,
        type: Number,
        default: 8
    });

    game.settings.register("battle-of-mytros", "sydonMiracles", {
        name: "Sydon Miracle Points",
        scope: "world",
        config: false,
        type: Number,
        default: 10
    });
});

Hooks.on("canvasReady", async () => {
    if (!game.user.isGM) return;
    
    const battleSceneId = game.settings.get("battle-of-mytros", "battleSceneId");
    if (canvas.scene.id !== battleSceneId) return;

    const sections = MytrosRegionManager.getActiveSections();
    for (const section of sections) {
        await MytrosRegionManager.initSectionFlags(section);
    }
});

Hooks.on("getSceneControlButtons", (controls) => {
    const tokenControls = controls.find(c => c.name === "token");
    if (tokenControls) {
        tokenControls.tools.push({
            name: "battleDashboard",
            title: "Battle of Mytros",
            icon: "fas fa-swords",
            visible: true, 
            onClick: () => {
                new BattleDashboard().render({ force: true });
            },
            button: true
        });
    }
});

Hooks.on("regionEvent", (region, event) => {
    if (!game.user.isGM) return;
    const battleSceneId = game.settings.get("battle-of-mytros", "battleSceneId");
    if (canvas.scene?.id !== battleSceneId) return;
    if (!region.name.startsWith(MytrosRegionManager.SECTION_PREFIX)) return;

    if (event.name === "tokenEnter" || event.name === "tokenExit") {
        // Find our active dashboard app and force a re-render
        for (const app of Object.values(ui.windows)) {
            if (app.id === "mytros-battle-dashboard") {
                app.render({ force: true });
            }
        }
    }
});

Hooks.on("updateRegion", (region, changes, options, userId) => {
    if (changes.flags && changes.flags["battle-of-mytros"]) {
        for (const app of Object.values(ui.windows)) {
            if (app.id === "mytros-battle-dashboard") {
                app.render({ force: true });
            }
        }
    }
});
