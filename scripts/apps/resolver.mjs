import * as helpers from "./resolver/helpers.mjs";
import * as battlePhases from "./resolver/battle-phases.mjs";
import * as aftermath from "./resolver/aftermath.mjs";
import { _postChatCard } from "./resolver/chat-card.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BattleResolverApp extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(region, options = {}) {
        super(options);
        this.region = region;
        this.battleState = {
            phase: "setup", // setup → maneuver → maneuver_choice → charge → clash → tiebreaker
            // → aftermath_recovery → aftermath_hope → aftermath_salvage
            // → aftermath_salvage_allied_choice → aftermath_salvage_sydon_choice
            // → aftermath_commander → done → complete
            allied: null,
            sydon: null,
            log: [],
        };
        this.initFactions();
    }

    initFactions() {
        const legions = globalThis.MytrosRegionManager.getLegionsInSection(this.region);
        this.battleState.allied = legions.find(
            (l) =>
                l.actor.getFlag("battle-of-mytros", "faction") === "allied" &&
                !l.actor.getFlag("battle-of-mytros", "isRouted") &&
                !l.actor.getFlag("battle-of-mytros", "isDestroyed")
        )?.actor;
        this.battleState.sydon = legions.find(
            (l) =>
                l.actor.getFlag("battle-of-mytros", "faction") === "sydon" &&
                !l.actor.getFlag("battle-of-mytros", "isDestroyed")
        )?.actor;
    }

    static DEFAULT_OPTIONS = {
        id: "mytros-battle-resolver",
        tag: "form",
        window: { title: "Battle Resolver", resizable: true },
        position: { width: 600, height: 700 },
        actions: {
            // Battle Phases
            runManeuver: battlePhases.runManeuver,
            selectManeuverBenefit: battlePhases.selectManeuverBenefit,
            runCharge: battlePhases.runCharge,
            runClash: battlePhases.runClash,
            runTiebreaker: battlePhases.runTiebreaker,
            // Aftermath
            runRecovery: aftermath.runRecovery,
            runHope: aftermath.runHope,
            runSalvage: aftermath.runSalvage,
            selectSalvageBenefit: aftermath.selectSalvageBenefit,
            runCommanderCasualty: aftermath.runCommanderCasualty,
            commitAftermath: aftermath.commitAftermath,
        },
    };

    static PARTS = {
        form: { template: "modules/battle-of-mytros/templates/resolver.hbs" },
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.regionName = this.region.name.replace(globalThis.MytrosRegionManager.SECTION_PREFIX, "").trim();
        context.state = this.battleState;
        context.alliedName = this.battleState.allied?.name || "None";
        context.sydonName = this.battleState.sydon?.name || "None";
        const score = this.battleState.battleScore;
        context.battleScoreDisplay = score === undefined || score === null ? "—" : `${score >= 0 ? "+" : ""}${score}`;
        context.battleScoreClass =
            score === undefined || score === null
                ? ""
                : score > 0
                  ? "score-allied"
                  : score < 0
                    ? "score-sydon"
                    : "score-tie";
        return context;
    }

    _onRender(context, options) {
        super._onRender?.(context, options);
        // Auto-scroll the GM's own log
        const log = this.element.querySelector(".battle-log");
        if (log) log.scrollTop = log.scrollHeight;
        // Broadcast to players
        this._emitLogUpdate();
    }

    _emitLogUpdate() {
        game.socket.emit("module.battle-of-mytros", {
            type: "battleLogUpdate",
            log: this.battleState.log,
            regionName: this.region.name.replace(globalThis.MytrosRegionManager.SECTION_PREFIX, "").trim(),
            alliedName: this.battleState.allied?.name ?? "None",
            sydonName: this.battleState.sydon?.name ?? "None",
            phase: this.battleState.phase,
            battleScore: this.battleState.battleScore,
        });
    }

    async close(options = {}) {
        game.socket.emit("module.battle-of-mytros", { type: "battleLogClear" });
        return super.close(options);
    }
}

// ── Mix in helper methods onto the prototype ──────────────────────────────
Object.assign(BattleResolverApp.prototype, {
    _buildModSummary: helpers._buildModSummary,
    hasTag: helpers.hasTag,
    getCommander: helpers.getCommander,
    getSupportBonuses: helpers.getSupportBonuses,
    getSupportBonusesAftermath: helpers.getSupportBonusesAftermath,
    _computeAdjacencyContext: helpers._computeAdjacencyContext,
    _nextPhaseAfterSalvage: helpers._nextPhaseAfterSalvage,
    _postChatCard: _postChatCard,
});
