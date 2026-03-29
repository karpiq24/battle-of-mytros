import { MAJOR_EVENTS, KNOWN_TAGS, OBJECTIVE_MIRACLE_REWARDS } from "./constants.mjs";
import * as overviewActions from "./actions/overview.mjs";
import * as sectionActions from "./actions/sections.mjs";
import * as legionActions from "./actions/legions.mjs";
import * as commanderActions from "./actions/commanders.mjs";
import * as dataIoActions from "./actions/data-io.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BattleDashboard extends HandlebarsApplicationMixin(ApplicationV2) {
    static STRATEGIC_OBJECTIVES = STRATEGIC_OBJECTIVES;
    static MAJOR_EVENTS = MAJOR_EVENTS;
    static KNOWN_TAGS = KNOWN_TAGS;

    static DEFAULT_OPTIONS = {
        id: "mytros-battle-dashboard",
        tag: "form",
        window: {
            title: "Battle of Mytros Dashboard",
            icon: "fas fa-swords",
            resizable: true,
        },
        position: { width: 860, height: 650 },
        actions: {
            // Tab & Settings
            changeTab: dataIoActions.changeTab,
            updateSetting: dataIoActions.updateSetting,
            importCSV: dataIoActions.importCSV,
            exportCSV: dataIoActions.exportCSV,
            // Overview
            rollRecon: overviewActions.rollRecon,
            spendMiracle: overviewActions.spendMiracle,
            triggerMajorEvent: overviewActions.triggerMajorEvent,
            triggerObjectiveDestroyed: overviewActions.triggerObjectiveDestroyed,
            disbandRoutedLegions: overviewActions.disbandRoutedLegions,
            advanceRound: overviewActions.advanceRound,
            setDeploymentMode: overviewActions.setDeploymentMode,
            openResolver: overviewActions.openResolver,
            resetCompletedEvents: overviewActions.resetCompletedEvents,
            nextPhase: overviewActions.nextPhase,
            prevPhase: overviewActions.prevPhase,
            // Sections
            toggleSectionFlag: sectionActions.toggleSectionFlag,
            setSectionControl: sectionActions.setSectionControl,
            addAdjacencyPair: sectionActions.addAdjacencyPair,
            removeAdjacencyPair: sectionActions.removeAdjacencyPair,
            // Legions
            toggleLegionFlag: legionActions.toggleLegionFlag,
            assignCommander: legionActions.assignCommander,
            createLegion: legionActions.createLegion,
            updateLegionStat: legionActions.updateLegionStat,
            updateLegionFaction: legionActions.updateLegionFaction,
            deleteLegion: legionActions.deleteLegion,
            toggleLegionDestroyed: legionActions.toggleLegionDestroyed,
            toggleLegionRouted: legionActions.toggleLegionRouted,
            // Commanders
            createCommander: commanderActions.createCommander,
            deleteCommander: commanderActions.deleteCommander,
            addCommanderTag: commanderActions.addCommanderTag,
            removeCommanderTag: commanderActions.removeCommanderTag,
        },
    };

    tab = "overview";

    static PARTS = {
        form: {
            template: "modules/battle-of-mytros/templates/dashboard.hbs",
        },
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.isGM = game.user.isGM;
        context.round = game.settings.get("battle-of-mytros", "currentRound");
        context.phase = game.settings.get("battle-of-mytros", "currentPhase");

        context.tab = this.tab;
        context.phaseNames = [
            game.i18n.localize("MYTROS.Phase1Name"),
            game.i18n.localize("MYTROS.Phase2Name"),
            game.i18n.localize("MYTROS.Phase3Name"),
            game.i18n.localize("MYTROS.Phase4Name"),
            game.i18n.localize("MYTROS.Phase5Name"),
        ];
        context.phaseName = context.phaseNames[(context.phase ?? 1) - 1];
        context.deathToll = game.settings.get("battle-of-mytros", "deathToll");
        context.alliedMiracles = game.settings.get("battle-of-mytros", "alliedMiracles");
        context.sydonMiracles = game.settings.get("battle-of-mytros", "sydonMiracles");

        context.commanders = game.actors
            .filter((a) => globalThis.MytrosActorData.isCommander(a))
            .map((a) => ({
                id: a.id,
                name: a.name,
            }));

        const battleSceneId = game.settings.get("battle-of-mytros", "battleSceneId");
        context.scenes = game.scenes.map((s) => ({ id: s.id, name: s.name, selected: s.id === battleSceneId }));

        context.reconResult = game.settings.get("battle-of-mytros", "reconResult");
        context.reconBonus = game.settings.get("battle-of-mytros", "reconBonus");
        context.deathTollFrozen = game.settings.get("battle-of-mytros", "deathTollFrozen");
        context.sydonObjectiveHalved = game.settings.get("battle-of-mytros", "sydonObjectiveHalved");
        context.sectionPrefix = game.settings.get("battle-of-mytros", "sectionPrefix") || "Section:";
        context.maxMorale = game.settings.get("battle-of-mytros", "maxMorale") ?? 10;
        context.destroyThreshold = game.settings.get("battle-of-mytros", "destroyThreshold") ?? 6;
        context.hopeDC = game.settings.get("battle-of-mytros", "hopeDC") ?? 12;
        context.salvageDC = game.settings.get("battle-of-mytros", "salvageDC") ?? 12;

        const completedEventIds = JSON.parse(game.settings.get("battle-of-mytros", "completedEvents") || "[]");
        context.majorEvents = MAJOR_EVENTS.map((e) => ({
            ...e,
            completed: completedEventIds.includes(e.id),
        }));

        const completedObjectives = JSON.parse(game.settings.get("battle-of-mytros", "destroyedObjectives") || "[]");
        context.strategicObjectives = STRATEGIC_OBJECTIVES.map((o) => ({
            ...o,
            destroyed: completedObjectives.includes(o.id),
        }));

        // Grab regions if we are on the battle scene
        context.isBattleScene = canvas.scene?.id === battleSceneId;

        if (context.isBattleScene) {
            const sections = globalThis.MytrosRegionManager.getActiveSections();
            context.sections = sections.map((r) => {
                const legions = globalThis.MytrosRegionManager.getLegionsInSection(r);
                const mappedLegions = legions.map((t) => {
                    const stats = t.actor.getFlag("battle-of-mytros", "stats") || {};
                    const commanderId = t.actor.getFlag("battle-of-mytros", "commanderId");
                    let commanderName = "None";
                    let hasVanguard = false;
                    if (commanderId) {
                        const actorCmdr = game.actors.get(commanderId);
                        if (actorCmdr) {
                            commanderName = actorCmdr.name;
                            hasVanguard = actorCmdr.items.some((i) => i.name.toLowerCase() === "vanguard");
                        }
                    }

                    return {
                        id: t.actor.id,
                        name: t.name,
                        faction: t.actor.getFlag("battle-of-mytros", "faction"),
                        commanderId: commanderId,
                        commanderName: commanderName,
                        hasVanguard: hasVanguard,
                        injuries: stats.injuries ?? 0,
                        morale: stats.morale ?? "?",
                        vitality: stats.vitality ?? "?",
                        wit: stats.wit ?? "?",
                        isRouted: t.actor.getFlag("battle-of-mytros", "isRouted") ?? false,
                        isDestroyed: t.actor.getFlag("battle-of-mytros", "isDestroyed") ?? false,
                        movedThree: t.actor.getFlag("battle-of-mytros", "movedThree") ?? false,
                    };
                });

                const supportTokens = globalThis.MytrosRegionManager.getSupportUnitsInSection(r);
                const supportUnits = supportTokens.map((t) => ({
                    id: t.id,
                    name: t.name,
                    actorId: t.actor.id,
                    deploymentMode: t.getFlag("battle-of-mytros", "deploymentMode") || "none",
                }));

                const hasActiveAllied = mappedLegions.some(
                    (l) => l.faction === "allied" && !l.isRouted && !l.isDestroyed
                );
                const hasSydon = mappedLegions.some((l) => l.faction === "sydon" && !l.isDestroyed);
                const pendingBattle = hasActiveAllied && hasSydon;
                const hasRoutedAllied = mappedLegions.some(
                    (l) => l.faction === "allied" && l.isRouted && !l.isDestroyed
                );
                const routedContested = hasRoutedAllied && hasSydon && !hasActiveAllied;

                return {
                    id: r.id,
                    name: r.name.replace(globalThis.MytrosRegionManager.SECTION_PREFIX, "").trim(),
                    control: r.getFlag("battle-of-mytros", "control"),
                    fortified: r.getFlag("battle-of-mytros", "fortified"),
                    legions: mappedLegions,
                    supportUnits: supportUnits,
                    pendingBattle: pendingBattle,
                    routedContested: routedContested,
                };
            });
        } else {
            context.sections = [];
        }

        // Adjacency configuration (for Setup tab)
        const allSections = globalThis.MytrosRegionManager.getActiveSections();
        const sectionOpts = allSections.map((r) => ({
            id: r.id,
            name: r.name.replace(globalThis.MytrosRegionManager.SECTION_PREFIX, "").trim(),
        }));
        const rawPairs = JSON.parse(game.settings.get("battle-of-mytros", "adjacencyPairs") || "[]");
        context.adjacencyPairs = rawPairs.map(([aId, bId], index) => ({
            index,
            aId,
            bId,
            aName: sectionOpts.find((s) => s.id === aId)?.name ?? aId,
            bName: sectionOpts.find((s) => s.id === bId)?.name ?? bId,
        }));
        context.sectionOpts = sectionOpts;

        // ── Legions Tab Data ─────────────────────────────────────────────
        const allLegions = game.actors.filter((a) => globalThis.MytrosActorData.isLegion(a));
        context.allLegions = allLegions
            .map((a) => {
                const stats = a.getFlag("battle-of-mytros", "stats") || {};
                const commanderId = a.getFlag("battle-of-mytros", "commanderId");
                return {
                    id: a.id,
                    name: a.name,
                    faction: a.getFlag("battle-of-mytros", "faction") || "allied",
                    vitality: stats.vitality ?? 4,
                    morale: stats.morale ?? 4,
                    wit: stats.wit ?? 4,
                    injuries: stats.injuries ?? 0,
                    commanderId: commanderId,
                    commanderName: commanderId ? game.actors.get(commanderId)?.name ?? "—" : "—",
                    isRouted: a.getFlag("battle-of-mytros", "isRouted") ?? false,
                    isDestroyed: a.getFlag("battle-of-mytros", "isDestroyed") ?? false,
                };
            })
            .sort((a, b) => {
                // Allied first, then sydon; within faction sort by name
                if (a.faction !== b.faction) return a.faction === "allied" ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

        // ── Commanders Tab Data ──────────────────────────────────────────
        const allCommanders = game.actors.filter((a) => globalThis.MytrosActorData.isCommander(a));
        context.allCommanders = allCommanders
            .map((a) => {
                const tags = a.items.map((i) => ({ id: i.id, name: i.name }));
                // Find which legion this commander is assigned to
                const assignedLegion = allLegions.find((l) => l.getFlag("battle-of-mytros", "commanderId") === a.id);
                return {
                    id: a.id,
                    name: a.name,
                    tags: tags,
                    faction: assignedLegion
                        ? assignedLegion.faction
                        : a.getFlag("battle-of-mytros", "faction") || "allied",
                    assignedLegionName: assignedLegion?.name ?? "—",
                };
            })
            .sort((a, b) => {
                if (a.faction !== b.faction) return a.faction === "allied" ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

        context.knownTags = KNOWN_TAGS;

        return context;
    }
}
