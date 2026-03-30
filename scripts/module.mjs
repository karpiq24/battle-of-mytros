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

Hooks.once("init", async function () {
    console.log("Battle of Mytros | Initializing module");

    Handlebars.registerHelper("eq", function (a, b) {
        return a === b;
    });

    Handlebars.registerHelper("ne", function (a, b) {
        return a !== b;
    });

    Handlebars.registerHelper("add", function (a, b) {
        return a + b;
    });

    // Register Handlebars partials
    const templatePaths = [
        "modules/battle-of-mytros/templates/partials/tab-overview.hbs",
        "modules/battle-of-mytros/templates/partials/tab-miracles.hbs",
        "modules/battle-of-mytros/templates/partials/tab-legions.hbs",
        "modules/battle-of-mytros/templates/partials/tab-commanders.hbs",
        "modules/battle-of-mytros/templates/partials/tab-setup.hbs",
    ];
    loadTemplates(templatePaths);

    game.settings.register("battle-of-mytros", "battleSceneId", {
        name: "Battlemap Scene ID",
        hint: "The ID of the scene acting as the main Battle of Mytros map. Region tracking only runs here.",
        scope: "world",
        config: false,
        type: String,
        default: "",
    });

    game.settings.register("battle-of-mytros", "currentRound", {
        name: "Current Round",
        hint: "The current round of the battle.",
        scope: "world",
        config: false,
        type: Number,
        default: 1,
    });

    game.settings.register("battle-of-mytros", "currentPhase", {
        name: "Current Phase",
        hint: "The current phase of the round (1-5).",
        scope: "world",
        config: false,
        type: Number,
        default: 1,
    });

    game.settings.register("battle-of-mytros", "deathToll", {
        name: "Civilian Death Toll",
        hint: "Running total of civilian casualties.",
        scope: "world",
        config: false,
        type: Number,
        default: 0,
    });

    game.settings.register("battle-of-mytros", "alliedMiracles", {
        name: "Allied Miracle Points",
        scope: "world",
        config: false,
        type: Number,
        default: 8,
    });

    game.settings.register("battle-of-mytros", "sydonMiracles", {
        name: "Sydon Miracle Points",
        scope: "world",
        config: false,
        type: Number,
        default: 10,
    });

    game.settings.register("battle-of-mytros", "reconResult", {
        name: "Reconnaissance Result",
        scope: "world",
        config: false,
        type: String,
        default: "",
    });

    game.settings.register("battle-of-mytros", "reconBonus", {
        name: "Reconnaissance Maneuver Bonus",
        scope: "world",
        config: false,
        type: Number,
        default: 0,
    });

    game.settings.register("battle-of-mytros", "completedEvents", {
        name: "Completed Major Events",
        scope: "world",
        config: false,
        type: String,
        default: "[]",
    });

    game.settings.register("battle-of-mytros", "destroyedObjectives", {
        name: "Destroyed Strategic Objectives",
        scope: "world",
        config: false,
        type: String,
        default: "[]",
    });

    game.settings.register("battle-of-mytros", "deathTollFrozen", {
        name: "Death Toll Frozen",
        scope: "world",
        config: false,
        type: Boolean,
        default: false,
    });

    game.settings.register("battle-of-mytros", "sydonObjectiveHalved", {
        name: "Sydon Objective Deaths Halved",
        scope: "world",
        config: false,
        type: Boolean,
        default: false,
    });

    game.settings.register("battle-of-mytros", "adjacencyPairs", {
        name: "Section Adjacency Pairs",
        hint: "JSON array of [regionId, regionId] pairs defining which sections are adjacent.",
        scope: "world",
        config: false,
        type: String,
        default: "[]",
    });

    game.settings.register("battle-of-mytros", "sectionPrefix", {
        name: "Section Region Prefix",
        hint: "Regions whose names start with this prefix are treated as battle sections.",
        scope: "world",
        config: false,
        type: String,
        default: "Section:",
    });

    game.settings.register("battle-of-mytros", "maxMorale", {
        name: "Maximum Morale",
        hint: "Hard cap for legion morale.",
        scope: "world",
        config: false,
        type: Number,
        default: 10,
    });

    game.settings.register("battle-of-mytros", "destroyThreshold", {
        name: "Injury Destroy Threshold",
        hint: "Injuries at which a legion is destroyed (Bulwark adds +1).",
        scope: "world",
        config: false,
        type: Number,
        default: 6,
    });

    game.settings.register("battle-of-mytros", "hopeDC", {
        name: "Hope Roll DC",
        hint: "DC for the Hope aftermath roll.",
        scope: "world",
        config: false,
        type: Number,
        default: 12,
    });

    game.settings.register("battle-of-mytros", "salvageDC", {
        name: "Salvage Roll DC",
        hint: "DC for the Salvage aftermath roll.",
        scope: "world",
        config: false,
        type: Number,
        default: 12,
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
    // v12: controls is an Array — find by name
    // v13: controls is a Record<string, SceneControl> — access by key
    if (Array.isArray(controls)) {
        const tokenControls = controls.find((c) => c.name === "token");
        if (tokenControls) {
            tokenControls.tools.push({
                name: "battleDashboard",
                title: "Battle of Mytros",
                icon: "fas fa-swords",
                visible: true,
                onClick: () => new BattleDashboard().render({ force: true }),
                button: true,
            });
        }
    } else if (controls.tokens) {
        // v13: tools is also a Record keyed by tool name
        controls.tokens.tools.battleDashboard = {
            name: "battleDashboard",
            title: "Battle of Mytros",
            icon: "fas fa-swords",
            order: Object.keys(controls.tokens.tools).length,
            button: true,
            visible: true,
            onChange: () => new BattleDashboard().render({ force: true }),
        };
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
        foundry.applications.instances.get("mytros-battle-dashboard")?.render({ force: true });
    }
});

Hooks.on("updateRegion", (region, changes, options, userId) => {
    if (changes.flags && changes.flags["battle-of-mytros"]) {
        foundry.applications.instances.get("mytros-battle-dashboard")?.render({ force: true });
    }
});

Hooks.on("updateActor", (actor, changes, options, userId) => {
    const isRelevant = globalThis.MytrosActorData.isLegion(actor) || globalThis.MytrosActorData.isCommander(actor);
    if (isRelevant) {
        foundry.applications.instances.get("mytros-battle-dashboard")?.render({ force: true });
    }
});

Hooks.on("updateItem", (item, changes, options, userId) => {
    if (item.parent && globalThis.MytrosActorData.isCommander(item.parent)) {
        foundry.applications.instances.get("mytros-battle-dashboard")?.render({ force: true });
    }
});

Hooks.on("createItem", (item, options, userId) => {
    if (item.parent && globalThis.MytrosActorData.isCommander(item.parent)) {
        foundry.applications.instances.get("mytros-battle-dashboard")?.render({ force: true });
    }
});

Hooks.on("deleteItem", (item, options, userId) => {
    if (item.parent && globalThis.MytrosActorData.isCommander(item.parent)) {
        foundry.applications.instances.get("mytros-battle-dashboard")?.render({ force: true });
    }
});

Hooks.on("updateSetting", (setting, changes, options, userId) => {
    if (setting.key.startsWith("battle-of-mytros.")) {
        foundry.applications.instances.get("mytros-battle-dashboard")?.render({ force: true });
    }
});

Hooks.on("deleteActor", async (actor, options, userId) => {
    if (game.user.id !== userId) return;
    if (globalThis.MytrosActorData.isCommander(actor)) {
        const legions = game.actors.filter(
            (a) => globalThis.MytrosActorData.isLegion(a) && a.getFlag("battle-of-mytros", "commanderId") === actor.id
        );
        for (const legion of legions) {
            await legion.setFlag("battle-of-mytros", "commanderId", null);
        }
    }
});
