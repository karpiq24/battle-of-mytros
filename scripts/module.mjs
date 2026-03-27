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

    Handlebars.registerHelper('ne', function (a, b) {
        return a !== b;
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

    game.settings.register("battle-of-mytros", "reconResult", {
        name: "Reconnaissance Result",
        scope: "world",
        config: false,
        type: String,
        default: ""
    });

    game.settings.register("battle-of-mytros", "reconBonus", {
        name: "Reconnaissance Maneuver Bonus",
        scope: "world",
        config: false,
        type: Number,
        default: 0
    });

    game.settings.register("battle-of-mytros", "completedEvents", {
        name: "Completed Major Events",
        scope: "world",
        config: false,
        type: String,
        default: "[]"
    });

    game.settings.register("battle-of-mytros", "deathTollFrozen", {
        name: "Death Toll Frozen",
        scope: "world",
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register("battle-of-mytros", "sydonObjectiveHalved", {
        name: "Sydon Objective Deaths Halved",
        scope: "world",
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register("battle-of-mytros", "adjacencyPairs", {
        name: "Section Adjacency Pairs",
        hint: "JSON array of [regionId, regionId] pairs defining which sections are adjacent.",
        scope: "world",
        config: false,
        type: String,
        default: "[]"
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
    const tokenControls = Array.isArray(controls)
        ? controls.find(c => c.name === "token")
        : controls.token ?? controls.get?.("token");
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
        // Re-render dashboard; routedContested sections will show a DM-confirmation button.
        // No auto-disbanding here — tokenEnter fires for every region a token passes through
        // during a drag, not just the destination.
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

Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (globalThis.MytrosActorData.isLegion(actor) && changes.flags?.["battle-of-mytros"]) {
        for (const app of Object.values(ui.windows)) {
            if (app.id === "mytros-battle-dashboard") {
                app.render({ force: true });
            }
        }
    }
});

Hooks.on("deleteActor", async (actor, options, userId) => {
    if (game.user.id !== userId) return;
    if (globalThis.MytrosActorData.isCommander(actor)) {
        const legions = game.actors.filter(a => globalThis.MytrosActorData.isLegion(a) && 
            a.getFlag("battle-of-mytros", "commanderId") === actor.id);
        for (const legion of legions) {
            await legion.setFlag("battle-of-mytros", "commanderId", null);
        }
    }
});
