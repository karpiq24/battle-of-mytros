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
            runManeuver: BattleResolverApp.runManeuver,
            selectManeuverBenefit: BattleResolverApp.selectManeuverBenefit
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
        const alliedStats = this.state.allied.getFlag("battle-of-mytros", "stats");
        const sydonStats = this.state.sydon.getFlag("battle-of-mytros", "stats");

        const alliedRoll = await globalThis.BattleRoller.executeRoll(alliedStats.wit);
        const sydonRoll = await globalThis.BattleRoller.executeRoll(sydonStats.wit);

        this.state.log.push(`Allied Maneuver (Wit): ${alliedRoll.total}`);
        this.state.log.push(`Sydon Maneuver (Wit): ${sydonRoll.total}`);

        if (alliedRoll.total > sydonRoll.total) {
            this.state.log.push("Allied side won the Maneuver!");
            this.state.maneuverWinner = "allied";
        } else if (sydonRoll.total > alliedRoll.total) {
            this.state.log.push("Sydon side won the Maneuver!");
            this.state.maneuverWinner = "sydon";
        } else {
            this.state.log.push("Maneuver is tied! No benefit.");
            this.state.maneuverWinner = "tie";
        }

        // Store points (1 point for winning)
        this.state.counter = { allied: 0, sydon: 0 };
        if (this.state.maneuverWinner === "allied") this.state.counter.allied += 1;
        if (this.state.maneuverWinner === "sydon") this.state.counter.sydon += 1;

        if (this.state.maneuverWinner !== "tie") {
            this.state.phase = "maneuver_choice";
        } else {
            this.state.phase = "charge";
        }
        
        this.render();
    }

    static async selectManeuverBenefit(event, target) {
        const benefit = target.dataset.benefit;
        this.state.maneuverBenefit = benefit;
        this.state.log.push(`${this.state.maneuverWinner} selected benefit: ${benefit}`);
        this.state.phase = "charge";
        this.render();
    }
}