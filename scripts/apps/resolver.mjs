const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BattleResolverApp extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(region, options={}) {
        super(options);
        this.region = region;
        this.state = {
            phase: "setup", // setup, maneuver, maneuver_choice, charge, clash, aftermath
            allied: null,
            sydon: null,
            log: []
        };
        this.initFactions();
    }

    initFactions() {
        const legions = globalThis.MytrosRegionManager.getLegionsInSection(this.region);
        this.state.allied = legions.find(l => l.actor.getFlag("battle-of-mytros", "faction") === "allied")?.actor;
        this.state.sydon = legions.find(l => l.actor.getFlag("battle-of-mytros", "faction") === "sydon")?.actor;
    }

    static DEFAULT_OPTIONS = {
        id: "mytros-battle-resolver",
        title: "Battle Resolver",
        tag: "form",
        window: { resizable: true },
        position: { width: 600, height: 700 },
        actions: {
            runManeuver: BattleResolverApp.runManeuver
        }
    };

    static PARTS = {
        form: { template: "modules/battle-of-mytros/templates/resolver.hbs" }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.regionName = this.region.name.replace(globalThis.MytrosRegionManager.SECTION_PREFIX, "").trim();
        context.state = this.state;
        context.alliedName = this.state.allied?.name || "None";
        context.sydonName = this.state.sydon?.name || "None";
        return context;
    }

    static async runManeuver(event, target) {
        this.state.log.push("Running Phase 1: Maneuver...");
        this.state.phase = "maneuver_choice";
        this.render();
    }
}