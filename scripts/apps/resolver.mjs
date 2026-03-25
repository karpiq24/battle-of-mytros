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
            selectManeuverBenefit: BattleResolverApp.selectManeuverBenefit,
            runCharge: BattleResolverApp.runCharge,
            runClash: BattleResolverApp.runClash
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

    static async runClash(event, target) {
        const alliedIsFortified = this.region.getFlag("battle-of-mytros", "control") === "allied" && this.region.getFlag("battle-of-mytros", "fortified");
        const sydonIsFortified = this.region.getFlag("battle-of-mytros", "control") === "sydon" && this.region.getFlag("battle-of-mytros", "fortified");

        const aContext = { maneuverBenefit: this.state.maneuverWinner === "allied" ? this.state.maneuverBenefit : null, enemyManeuverBenefit: this.state.maneuverWinner === "sydon" ? this.state.maneuverBenefit : null, isFortified: alliedIsFortified, enemyIsFortified: sydonIsFortified };
        const sContext = { maneuverBenefit: this.state.maneuverWinner === "sydon" ? this.state.maneuverBenefit : null, enemyManeuverBenefit: this.state.maneuverWinner === "allied" ? this.state.maneuverBenefit : null, isFortified: sydonIsFortified, enemyIsFortified: alliedIsFortified };

        const aMods = globalThis.TagEngine.getRollModifiers(this.state.allied, this.state.sydon, "clash", aContext);
        const sMods = globalThis.TagEngine.getRollModifiers(this.state.sydon, this.state.allied, "clash", sContext);

        if (this.state.chargeWinner === "allied") aMods.flatBonus += 1;
        if (this.state.chargeWinner === "sydon") sMods.flatBonus += 1;

        const aStats = this.state.allied.getFlag("battle-of-mytros", "stats");
        const sStats = this.state.sydon.getFlag("battle-of-mytros", "stats");

        const aRoll = await globalThis.BattleRoller.executeRoll(aStats.vitality, aMods.flatBonus, aMods.advantage, aMods.disadvantage);
        const sRoll = await globalThis.BattleRoller.executeRoll(sStats.vitality, sMods.flatBonus, sMods.advantage, sMods.disadvantage);

        this.state.log.push(`Allied Clash (Vitality): ${aRoll.total}`);
        this.state.log.push(`Sydon Clash (Vitality): ${sRoll.total}`);

        if (aRoll.total > sRoll.total) {
            this.state.log.push("Allied won Clash!");
            this.state.counter.allied += 2;
        } else if (sRoll.total > aRoll.total) {
            this.state.log.push("Sydon won Clash!");
            this.state.counter.sydon += 2;
        }

        // Apply Nat20 / Nat1 rules
        if (aRoll.isNat20 && aRoll.total > sRoll.total) this.state.counter.allied += 1;
        if (sRoll.isNat20 && sRoll.total > aRoll.total) this.state.counter.sydon += 1;
        if (aRoll.isNat1 && sRoll.total > aRoll.total) this.state.counter.allied -= 1;
        if (sRoll.isNat1 && aRoll.total > sRoll.total) this.state.counter.sydon -= 1;

        this.state.log.push(`FINAL SCORE - Allied: ${this.state.counter.allied} | Sydon: ${this.state.counter.sydon}`);

        if (this.state.counter.allied > this.state.counter.sydon) {
            this.state.log.push(">>> ALLIED LEGION WINS THE BATTLE <<<");
            this.state.overallWinner = "allied";
        } else if (this.state.counter.sydon > this.state.counter.allied) {
            this.state.log.push(">>> SYDON LEGION WINS THE BATTLE <<<");
            this.state.overallWinner = "sydon";
        } else {
            this.state.log.push(">>> BATTLE TIED! Sudden Death Required. <<<");
            this.state.phase = "tiebreaker";
            this.render();
            return;
        }

        this.state.phase = "aftermath";
        this.render();
    }

    static async runCharge(event, target) {
        const alliedIsFortified = this.region.getFlag("battle-of-mytros", "control") === "allied" && this.region.getFlag("battle-of-mytros", "fortified");
        const sydonIsFortified = this.region.getFlag("battle-of-mytros", "control") === "sydon" && this.region.getFlag("battle-of-mytros", "fortified");

        const aContext = { 
            isFortified: alliedIsFortified, enemyIsFortified: sydonIsFortified, 
            maneuverBenefit: this.state.maneuverWinner === "allied" ? this.state.maneuverBenefit : null,
            enemyManeuverBenefit: this.state.maneuverWinner === "sydon" ? this.state.maneuverBenefit : null
        };
        const sContext = { 
            isFortified: sydonIsFortified, enemyIsFortified: alliedIsFortified, 
            maneuverBenefit: this.state.maneuverWinner === "sydon" ? this.state.maneuverBenefit : null,
            enemyManeuverBenefit: this.state.maneuverWinner === "allied" ? this.state.maneuverBenefit : null
        };

        const alliedMods = globalThis.TagEngine.getRollModifiers(this.state.allied, this.state.sydon, "charge", aContext);
        const sydonMods = globalThis.TagEngine.getRollModifiers(this.state.sydon, this.state.allied, "charge", sContext);

        const aStats = this.state.allied.getFlag("battle-of-mytros", "stats");
        const sStats = this.state.sydon.getFlag("battle-of-mytros", "stats");

        const aRoll = await globalThis.BattleRoller.executeRoll(aStats.morale, alliedMods.flatBonus, alliedMods.advantage, alliedMods.disadvantage);
        const sRoll = await globalThis.BattleRoller.executeRoll(sStats.morale, sydonMods.flatBonus, sydonMods.advantage, sydonMods.disadvantage);

        this.state.log.push(`Allied Charge (Morale): ${aRoll.total}`);
        this.state.log.push(`Sydon Charge (Morale): ${sRoll.total}`);

        if (aRoll.total > sRoll.total) {
            this.state.log.push("Allied won Charge! (+1 Clash)");
            this.state.counter.allied += 1;
            this.state.chargeWinner = "allied";
        } else if (sRoll.total > aRoll.total) {
            this.state.log.push("Sydon won Charge! (+1 Clash)");
            this.state.counter.sydon += 1;
            this.state.chargeWinner = "sydon";
        } else {
            this.state.log.push("Charge Tied!");
            this.state.chargeWinner = "tie";
        }

        // Apply Nat20 / Nat1 rules
        if (aRoll.isNat20 && aRoll.total > sRoll.total) this.state.counter.allied += 1;
        if (sRoll.isNat20 && sRoll.total > aRoll.total) this.state.counter.sydon += 1;
        if (aRoll.isNat1 && sRoll.total > aRoll.total) this.state.counter.allied -= 1;
        if (sRoll.isNat1 && aRoll.total > sRoll.total) this.state.counter.sydon -= 1;

        this.state.phase = "clash";
        this.render();
    }

    static async runManeuver(event, target) {
        // Build Context
        const alliedIsFortified = this.region.getFlag("battle-of-mytros", "control") === "allied" && this.region.getFlag("battle-of-mytros", "fortified");
        const sydonIsFortified = this.region.getFlag("battle-of-mytros", "control") === "sydon" && this.region.getFlag("battle-of-mytros", "fortified");

        const alliedMods = globalThis.TagEngine.getRollModifiers(this.state.allied, this.state.sydon, "maneuver", { isFortified: alliedIsFortified, enemyIsFortified: sydonIsFortified });
        const sydonMods = globalThis.TagEngine.getRollModifiers(this.state.sydon, this.state.allied, "maneuver", { isFortified: sydonIsFortified, enemyIsFortified: alliedIsFortified });

        const alliedStats = this.state.allied.getFlag("battle-of-mytros", "stats");
        const sydonStats = this.state.sydon.getFlag("battle-of-mytros", "stats");

        const alliedRoll = await globalThis.BattleRoller.executeRoll(alliedStats.wit, alliedMods.flatBonus, alliedMods.advantage, alliedMods.disadvantage);
        const sydonRoll = await globalThis.BattleRoller.executeRoll(sydonStats.wit, sydonMods.flatBonus, sydonMods.advantage, sydonMods.disadvantage);

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