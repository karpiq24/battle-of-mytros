import { MAJOR_EVENTS, KNOWN_TAGS, STRATEGIC_OBJECTIVES, TAG_DESCRIPTIONS } from "./constants.mjs";
// STRATEGIC_OBJECTIVES and MAJOR_EVENTS kept as static defaults for reset functionality
import * as overviewActions from "./actions/overview.mjs";
import * as sectionActions from "./actions/sections.mjs";
import * as legionActions from "./actions/legions.mjs";
import * as commanderActions from "./actions/commanders.mjs";
import * as dataIoActions from "./actions/data-io.mjs";
import * as supportUnitActions from "./actions/support-units.mjs";

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
            // Support Units
            createFastResponse: supportUnitActions.createFastResponse,
            removeFastResponse: supportUnitActions.removeFastResponse,
            updateFastResponseFaction: supportUnitActions.updateFastResponseFaction,
            // Config CRUD
            addObjective: dataIoActions.addObjective,
            removeObjective: dataIoActions.removeObjective,
            addMajorEvent: dataIoActions.addMajorEvent,
            removeMajorEvent: dataIoActions.removeMajorEvent,
            resetObjectivesAndEvents: dataIoActions.resetObjectivesAndEvents,
            resetBattle: dataIoActions.resetBattle,
        },
    };

    tab = "overview";
    _pendingOps = 0;

    constructor(options = {}) {
        super(options);
        this.debouncedRender = foundry.utils.debounce(() => this.render({ force: true }), 150);
    }

    static PARTS = {
        form: {
            template: "modules/battle-of-mytros/templates/dashboard.hbs",
        },
    };

    _captureFocus() {
        const active = document.activeElement;
        if (!active || !this.element?.contains(active)) return null;
        const attrs = [...active.attributes]
            .filter((a) => a.name.startsWith("data-") && a.name !== "data-action")
            .map((a) => `[${a.name}="${CSS.escape(a.value)}"]`)
            .join("");
        if (!attrs) return null;
        return {
            selector: attrs,
            selectionStart: active.selectionStart ?? null,
            selectionEnd: active.selectionEnd ?? null,
        };
    }

    render(options = {}) {
        this._savedFocus = this._captureFocus();
        return super.render(options);
    }

    _onRender(context, options) {
        super._onRender?.(context, options);
        if (this._savedFocus) {
            const el = this.element.querySelector(this._savedFocus.selector);
            if (el) {
                el.focus();
                if (this._savedFocus.selectionStart != null && el.setSelectionRange) {
                    try {
                        el.setSelectionRange(this._savedFocus.selectionStart, this._savedFocus.selectionEnd);
                    } catch {
                        // setSelectionRange throws on some input types (checkbox, select)
                    }
                }
            }
            this._savedFocus = null;
        }
    }

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
                faction: a.getFlag("battle-of-mytros", "faction") || "allied",
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
        const majorEventsDef = JSON.parse(game.settings.get("battle-of-mytros", "majorEvents") || "[]");
        context.majorEvents = majorEventsDef.map((e) => ({
            ...e,
            completed: completedEventIds.includes(e.id),
        }));
        context.majorEventsDef = majorEventsDef;

        const completedObjectives = JSON.parse(game.settings.get("battle-of-mytros", "destroyedObjectives") || "[]");
        const objectivesDef = JSON.parse(game.settings.get("battle-of-mytros", "strategicObjectives") || "[]");
        context.strategicObjectives = objectivesDef.map((o) => ({
            ...o,
            destroyed: completedObjectives.includes(o.id),
        }));
        context.objectivesDef = objectivesDef;

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
                    let commanderTags = [];
                    if (commanderId) {
                        const actorCmdr = game.actors.get(commanderId);
                        if (actorCmdr) {
                            commanderName = actorCmdr.name;
                            hasVanguard = actorCmdr.items.some((i) => i.name.toLowerCase() === "vanguard");
                            commanderTags = actorCmdr.items.map((i) => ({
                                name: i.name,
                                description: game.i18n.localize(TAG_DESCRIPTIONS[i.name] ?? ""),
                            }));
                        }
                    }

                    return {
                        id: t.actor.id,
                        name: t.name,
                        faction: t.actor.getFlag("battle-of-mytros", "faction"),
                        commanderId: commanderId,
                        commanderName: commanderName,
                        commanderTags: commanderTags,
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
                    faction: t.actor.getFlag("battle-of-mytros", "faction") || "allied",
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

        context.activeAlliedLegions = context.allLegions.filter((l) => l.faction === "allied" && !l.isDestroyed);
        context.activeSydonLegions = context.allLegions.filter((l) => l.faction === "sydon" && !l.isDestroyed);

        // ── Commanders Tab Data ──────────────────────────────────────────
        const allCommanders = game.actors.filter((a) => globalThis.MytrosActorData.isCommander(a));
        context.allCommanders = allCommanders
            .map((a) => {
                const tags = a.items.map((i) => ({
                    id: i.id,
                    name: i.name,
                    description: game.i18n.localize(TAG_DESCRIPTIONS[i.name] ?? ""),
                }));
                // Use the context.allLegions objects we just built
                const assignedLegion = context.allLegions.find((l) => l.commanderId === a.id);
                const rawFaction = a.getFlag("battle-of-mytros", "faction") || "allied";
                return {
                    id: a.id,
                    name: a.name,
                    tags: tags,
                    faction: (assignedLegion ? assignedLegion.faction : rawFaction).toLowerCase(),
                    assignedLegionName: assignedLegion?.name ?? "—",
                };
            })
            .sort((a, b) => {
                if (a.faction !== b.faction) return a.faction === "allied" ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

        context.knownTags = KNOWN_TAGS;

        // ── Support Units Tab Data ───────────────────────────────────────
        context.allFastResponseActors = game.actors
            .filter((a) => globalThis.MytrosActorData.isFastResponse(a))
            .map((a) => ({
                id: a.id,
                name: a.name,
                faction: a.getFlag("battle-of-mytros", "faction") || "allied",
                isAutoIncluded: a.hasPlayerOwner === true && a.getFlag("battle-of-mytros", "isFastResponse") !== true,
            }))
            .sort((a, b) => {
                if (a.faction !== b.faction) return a.faction === "allied" ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

        return context;
    }
}
