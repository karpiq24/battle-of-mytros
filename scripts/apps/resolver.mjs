const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BattleResolverApp extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(region, options={}) {
        super(options);
        this.region = region;
        this.state = {
            phase: "setup", // setup → maneuver → maneuver_choice → charge → clash → tiebreaker
                            // → aftermath_recovery → aftermath_hope → aftermath_salvage
                            // → aftermath_salvage_allied_choice → aftermath_salvage_sydon_choice
                            // → aftermath_commander → done → complete
            allied: null,
            sydon: null,
            log: []
        };
        this.initFactions();
    }

    initFactions() {
        const legions = globalThis.MytrosRegionManager.getLegionsInSection(this.region);
        this.state.allied = legions.find(l =>
            l.actor.getFlag("battle-of-mytros", "faction") === "allied" &&
            !l.actor.getFlag("battle-of-mytros", "isRouted") &&
            !l.actor.getFlag("battle-of-mytros", "isDestroyed")
        )?.actor;
        this.state.sydon = legions.find(l =>
            l.actor.getFlag("battle-of-mytros", "faction") === "sydon" &&
            !l.actor.getFlag("battle-of-mytros", "isDestroyed")
        )?.actor;
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
            runClash: BattleResolverApp.runClash,
            runTiebreaker: BattleResolverApp.runTiebreaker,
            runRecovery: BattleResolverApp.runRecovery,
            runHope: BattleResolverApp.runHope,
            runSalvage: BattleResolverApp.runSalvage,
            selectSalvageBenefit: BattleResolverApp.selectSalvageBenefit,
            runCommanderCasualty: BattleResolverApp.runCommanderCasualty,
            commitAftermath: BattleResolverApp.commitAftermath,
            runDivineBloodReroll: BattleResolverApp.runDivineBloodReroll,
            selectDivineBloodSalvageBenefit: BattleResolverApp.selectDivineBloodSalvageBenefit,
            proceedToCommander: BattleResolverApp.proceedToCommander
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

    // ── Helpers ───────────────────────────────────────────────────────────────

    hasTag(legion, tagName) {
        if (!legion) return false;
        const commanderId = legion.getFlag("battle-of-mytros", "commanderId");
        const commander = commanderId ? game.actors.get(commanderId) : null;
        if (!commander) return false;
        return commander.items.some(i => i.name.toLowerCase() === tagName.toLowerCase());
    }

    getCommander(legion) {
        if (!legion) return null;
        const commanderId = legion.getFlag("battle-of-mytros", "commanderId");
        return commanderId ? game.actors.get(commanderId) : null;
    }

    getSupportBonuses(faction, phase) {
        const supportUnits = globalThis.MytrosRegionManager.getSupportUnitsInSection(this.region)
            .filter(t => t.actor.getFlag("battle-of-mytros", "faction") === faction);

        let dice = [];
        let advantage = false;

        for (const t of supportUnits) {
            const mode = t.getFlag("battle-of-mytros", "deploymentMode");
            if (mode === "reinforce") dice.push("1d4");
            if (mode === "shock_assault" && ["maneuver", "charge", "clash"].includes(phase)) dice.push("1d6");
            if (mode === `targeted_strike_${phase}`) {
                dice.push("1d8");
                advantage = true;
            }
        }
        return { dice, advantage };
    }

    getSupportBonusesAftermath(faction) {
        const supportUnits = globalThis.MytrosRegionManager.getSupportUnitsInSection(this.region)
            .filter(t => t.actor.getFlag("battle-of-mytros", "faction") === faction);

        let dice = [];
        for (const t of supportUnits) {
            const mode = t.getFlag("battle-of-mytros", "deploymentMode");
            if (mode === "reinforce") dice.push("1d4");
            if (mode === "shield_the_wounded") dice.push("1d8");
        }
        return { dice };
    }

    _computeDivineBloodPending() {
        const pending = { allied: null, sydon: null };
        for (const side of ["allied", "sydon"]) {
            if (!this.hasTag(this.state[side], "divine blood")) continue;
            const rec = this.state.recoveryResult?.[side];
            const hope = this.state.hopeResult?.[side];
            const salv = this.state.salvageResult?.[side];
            const failed = {};
            if (rec && !rec.success) failed.recovery = `${rec.rollTotal} vs DC ${rec.dc}`;
            if (hope && !hope.success) failed.hope = `${hope.rollTotal} vs DC 12`;
            if (salv && salv.benefitCount === 0) failed.salvage = true;
            if (Object.keys(failed).length > 0) pending[side] = failed;
        }
        return pending;
    }

    _computeAdjacencyContext() {
        const adjacentIds = globalThis.MytrosRegionManager.getAdjacentSections(this.region.id);
        if (!adjacentIds.length) return { adjacentWarden: false, adjacentRallier: false };

        const adjacentSections = globalThis.MytrosRegionManager.getActiveSections()
            .filter(r => adjacentIds.includes(r.id));

        let adjacentWarden = false;
        let adjacentRallier = false;

        for (const section of adjacentSections) {
            for (const t of globalThis.MytrosRegionManager.getLegionsInSection(section)) {
                const actor = t.actor;
                if (actor.getFlag("battle-of-mytros", "faction") !== "allied") continue;
                if (actor.getFlag("battle-of-mytros", "isRouted")) continue;
                if (actor.getFlag("battle-of-mytros", "isDestroyed")) continue;
                if (this.hasTag(actor, "warden")) adjacentWarden = true;
                if (this.hasTag(actor, "rallier")) adjacentRallier = true;
            }
        }

        return { adjacentWarden, adjacentRallier };
    }

    _nextPhaseAfterSalvage() {
        const pending = this._computeDivineBloodPending();
        if (pending.allied || pending.sydon) {
            this.state.divineBloodPending = pending;
            this.state.divineBloodSalvageNeedChoice = { allied: 0, sydon: 0 };
            return "aftermath_divine_blood";
        }
        return "aftermath_commander";
    }

    // ── Battle Phases ─────────────────────────────────────────────────────────

    static async runManeuver(_event, _target) {
        const alliedIsFortified = this.region.getFlag("battle-of-mytros", "control") === "allied" && this.region.getFlag("battle-of-mytros", "fortified");
        const sydonIsFortified = this.region.getFlag("battle-of-mytros", "control") === "sydon" && this.region.getFlag("battle-of-mytros", "fortified");

        const alliedMods = globalThis.TagEngine.getRollModifiers(this.state.allied, this.state.sydon, "maneuver", { isFortified: alliedIsFortified, enemyIsFortified: sydonIsFortified });
        const sydonMods = globalThis.TagEngine.getRollModifiers(this.state.sydon, this.state.allied, "maneuver", { isFortified: sydonIsFortified, enemyIsFortified: alliedIsFortified });

        // Apply reconnaissance bonus (23+ result: +1 to all allied Maneuver rolls this round)
        const reconBonus = game.settings.get("battle-of-mytros", "reconBonus") ?? 0;
        if (reconBonus > 0) {
            alliedMods.flatBonus += reconBonus;
            this.state.log.push(`Allied Maneuver: +${reconBonus} from Reconnaissance Intel.`);
        }

        const alliedStats = this.state.allied.getFlag("battle-of-mytros", "stats");
        const sydonStats = this.state.sydon.getFlag("battle-of-mytros", "stats");

        const aVeteran = this.hasTag(this.state.allied, "veteran");
        const sVeteran = this.hasTag(this.state.sydon, "veteran");

        const aSupport = this.getSupportBonuses("allied", "maneuver");
        const sSupport = this.getSupportBonuses("sydon", "maneuver");

        let alliedRoll, sydonRoll;
        let tied = true;
        let attempt = 1;

        while (tied && attempt <= 4) {
            alliedRoll = await globalThis.BattleRoller.executeRoll(alliedStats.wit, alliedMods.flatBonus, alliedMods.advantage || aSupport.advantage, alliedMods.disadvantage, aVeteran, aSupport.dice);
            sydonRoll = await globalThis.BattleRoller.executeRoll(sydonStats.wit, sydonMods.flatBonus, sydonMods.advantage || sSupport.advantage, sydonMods.disadvantage, sVeteran, sSupport.dice);

            this.state.log.push(`Maneuver Attempt ${attempt} — Allied: ${alliedRoll.total}, Sydon: ${sydonRoll.total}`);

            if (alliedRoll.total !== sydonRoll.total) {
                tied = false;
            } else {
                attempt++;
                if (attempt <= 4) this.state.log.push("Maneuver is tied! Rerolling...");
            }
        }

        if (alliedRoll.total > sydonRoll.total) {
            this.state.log.push("Allied side won the Maneuver!");
            this.state.maneuverWinner = "allied";
        } else if (sydonRoll.total > alliedRoll.total) {
            this.state.log.push("Sydon side won the Maneuver!");
            this.state.maneuverWinner = "sydon";
        } else {
            this.state.log.push("Maneuver remains tied after 4 attempts! No benefit.");
            this.state.maneuverWinner = "tie";
        }

        this.state.counter = { allied: 0, sydon: 0 };
        if (this.state.maneuverWinner === "allied") { this.state.counter.allied += 1; this.state.counter.sydon -= 1; }
        if (this.state.maneuverWinner === "sydon") { this.state.counter.sydon += 1; this.state.counter.allied -= 1; }

        // Nat20 bonus / Nat1 penalty (consistent with Charge and Clash)
        if (alliedRoll.isNat20 && alliedRoll.total > sydonRoll.total) this.state.counter.allied += 1;
        if (sydonRoll.isNat20 && sydonRoll.total > alliedRoll.total) this.state.counter.sydon += 1;
        if (alliedRoll.isNat1 && sydonRoll.total > alliedRoll.total) this.state.counter.allied -= 1;
        if (sydonRoll.isNat1 && alliedRoll.total > sydonRoll.total) this.state.counter.sydon -= 1;

        this.state.phase = this.state.maneuverWinner !== "tie" ? "maneuver_choice" : "charge";
        this.render();
    }

    static async selectManeuverBenefit(_event, target) {
        const benefit = target.dataset.benefit;
        this.state.maneuverBenefit = benefit;
        this.state.log.push(`${this.state.maneuverWinner} selected benefit: ${benefit}`);
        this.state.phase = "charge";
        this.render();
    }

    static async runCharge(_event, _target) {
        const alliedIsFortified = this.region.getFlag("battle-of-mytros", "control") === "allied" && this.region.getFlag("battle-of-mytros", "fortified");
        const sydonIsFortified = this.region.getFlag("battle-of-mytros", "control") === "sydon" && this.region.getFlag("battle-of-mytros", "fortified");

        const aContext = {
            isFortified: alliedIsFortified, enemyIsFortified: sydonIsFortified,
            maneuverBenefit: this.state.maneuverWinner === "allied" ? this.state.maneuverBenefit : null,
            enemyManeuverBenefit: this.state.maneuverWinner === "sydon" ? this.state.maneuverBenefit : null,
            movedThree: this.state.allied.getFlag("battle-of-mytros", "movedThree") ?? false
        };
        const sContext = {
            isFortified: sydonIsFortified, enemyIsFortified: alliedIsFortified,
            maneuverBenefit: this.state.maneuverWinner === "sydon" ? this.state.maneuverBenefit : null,
            enemyManeuverBenefit: this.state.maneuverWinner === "allied" ? this.state.maneuverBenefit : null,
            movedThree: this.state.sydon.getFlag("battle-of-mytros", "movedThree") ?? false
        };

        const alliedMods = globalThis.TagEngine.getRollModifiers(this.state.allied, this.state.sydon, "charge", aContext);
        const sydonMods = globalThis.TagEngine.getRollModifiers(this.state.sydon, this.state.allied, "charge", sContext);

        const aStats = this.state.allied.getFlag("battle-of-mytros", "stats");
        const sStats = this.state.sydon.getFlag("battle-of-mytros", "stats");

        const aVeteran = this.hasTag(this.state.allied, "veteran");
        const sVeteran = this.hasTag(this.state.sydon, "veteran");

        const aSupport = this.getSupportBonuses("allied", "charge");
        const sSupport = this.getSupportBonuses("sydon", "charge");

        let aRoll, sRoll;
        let tied = true;
        let attempt = 1;

        const aFlankDice = (this.state.maneuverWinner === "allied" && this.state.maneuverBenefit === "flanking") ? ["1d4"] : [];
        const sFlankDice = (this.state.maneuverWinner === "sydon" && this.state.maneuverBenefit === "flanking") ? ["1d4"] : [];

        while (tied && attempt <= 2) {
            aRoll = await globalThis.BattleRoller.executeRoll(aStats.morale, alliedMods.flatBonus, alliedMods.advantage || aSupport.advantage, alliedMods.disadvantage, aVeteran, aSupport.dice.concat(aFlankDice));
            sRoll = await globalThis.BattleRoller.executeRoll(sStats.morale, sydonMods.flatBonus, sydonMods.advantage || sSupport.advantage, sydonMods.disadvantage, sVeteran, sSupport.dice.concat(sFlankDice));

            this.state.log.push(`Charge Attempt ${attempt} — Allied: ${aRoll.total}, Sydon: ${sRoll.total}`);

            if (aRoll.total !== sRoll.total) {
                tied = false;
            } else {
                attempt++;
                if (attempt <= 2) this.state.log.push("Charge is tied! Rerolling...");
            }
        }

        if (aRoll.total > sRoll.total) {
            this.state.log.push("Allied won Charge! (+1 Clash)");
            this.state.counter.allied += 1;
            this.state.counter.sydon -= 1;
            this.state.chargeWinner = "allied";
        } else if (sRoll.total > aRoll.total) {
            this.state.log.push("Sydon won Charge! (+1 Clash)");
            this.state.counter.sydon += 1;
            this.state.counter.allied -= 1;
            this.state.chargeWinner = "sydon";
        } else {
            this.state.log.push("Charge remains tied after 2 attempts!");
            this.state.chargeWinner = "tie";
        }

        if (aRoll.isNat20 && aRoll.total > sRoll.total) this.state.counter.allied += 1;
        if (sRoll.isNat20 && sRoll.total > aRoll.total) this.state.counter.sydon += 1;
        if (aRoll.isNat1 && sRoll.total > aRoll.total) this.state.counter.allied -= 1;
        if (sRoll.isNat1 && aRoll.total > sRoll.total) this.state.counter.sydon -= 1;

        this.state.phase = "clash";
        this.render();
    }

    static async runClash(_event, _target) {
        const alliedIsFortified = this.region.getFlag("battle-of-mytros", "control") === "allied" && this.region.getFlag("battle-of-mytros", "fortified");
        const sydonIsFortified = this.region.getFlag("battle-of-mytros", "control") === "sydon" && this.region.getFlag("battle-of-mytros", "fortified");

        const adjacency = this._computeAdjacencyContext();
        const aContext = { maneuverBenefit: this.state.maneuverWinner === "allied" ? this.state.maneuverBenefit : null, enemyManeuverBenefit: this.state.maneuverWinner === "sydon" ? this.state.maneuverBenefit : null, isFortified: alliedIsFortified, enemyIsFortified: sydonIsFortified, adjacentWarden: adjacency.adjacentWarden };
        const sContext = { maneuverBenefit: this.state.maneuverWinner === "sydon" ? this.state.maneuverBenefit : null, enemyManeuverBenefit: this.state.maneuverWinner === "allied" ? this.state.maneuverBenefit : null, isFortified: sydonIsFortified, enemyIsFortified: alliedIsFortified };

        const aMods = globalThis.TagEngine.getRollModifiers(this.state.allied, this.state.sydon, "clash", aContext);
        const sMods = globalThis.TagEngine.getRollModifiers(this.state.sydon, this.state.allied, "clash", sContext);

        if (this.state.chargeWinner === "allied") aMods.flatBonus += 1;
        if (this.state.chargeWinner === "sydon") sMods.flatBonus += 1;

        // Apply Maneuver bonus dice if selected (Defensive Footing: +1d2 to Clash)
        if (this.state.maneuverWinner === "allied") {
            if (this.state.maneuverBenefit === "defensive") aMods.flatBonus -= 1; // Remove flat average, use die instead
            if (this.state.maneuverBenefit === "defensive") aMods.bonusDice = (aMods.bonusDice || []).concat("1d2");
        }
        if (this.state.maneuverWinner === "sydon") {
            if (this.state.maneuverBenefit === "defensive") sMods.flatBonus -= 1;
            if (this.state.maneuverBenefit === "defensive") sMods.bonusDice = (sMods.bonusDice || []).concat("1d2");
        }

        const aStats = this.state.allied.getFlag("battle-of-mytros", "stats");
        const sStats = this.state.sydon.getFlag("battle-of-mytros", "stats");

        const aVeteran = this.hasTag(this.state.allied, "veteran");
        const sVeteran = this.hasTag(this.state.sydon, "veteran");

        const aSupport = this.getSupportBonuses("allied", "clash");
        const sSupport = this.getSupportBonuses("sydon", "clash");

        const aRoll = await globalThis.BattleRoller.executeRoll(aStats.vitality, aMods.flatBonus, aMods.advantage || aSupport.advantage, aMods.disadvantage, aVeteran, (aMods.bonusDice || []).concat(aSupport.dice));
        const sRoll = await globalThis.BattleRoller.executeRoll(sStats.vitality, sMods.flatBonus, sMods.advantage || sSupport.advantage, sMods.disadvantage, sVeteran, (sMods.bonusDice || []).concat(sSupport.dice));

        this.state.log.push(`Allied Clash (Vitality ${aStats.vitality}): ${aRoll.total}`);
        this.state.log.push(`Sydon Clash (Vitality ${sStats.vitality}): ${sRoll.total}`);

        if (aRoll.total > sRoll.total) {
            this.state.log.push("Allied won Clash!");
            this.state.counter.allied += 2;
            this.state.counter.sydon -= 1;
        } else if (sRoll.total > aRoll.total) {
            this.state.log.push("Sydon won Clash!");
            this.state.counter.sydon += 2;
            this.state.counter.allied -= 1;
        }

        if (aRoll.isNat20 && aRoll.total > sRoll.total) this.state.counter.allied += 1;
        if (sRoll.isNat20 && sRoll.total > aRoll.total) this.state.counter.sydon += 1;
        if (aRoll.isNat1 && sRoll.total > aRoll.total) this.state.counter.allied -= 1;
        if (sRoll.isNat1 && aRoll.total > sRoll.total) this.state.counter.sydon -= 1;

        this.state.log.push(`FINAL SCORE — Allied: ${this.state.counter.allied} | Sydon: ${this.state.counter.sydon}`);

        if (this.state.counter.allied > this.state.counter.sydon) {
            this.state.log.push(">>> ALLIED LEGION WINS THE BATTLE <<<");
            this.state.overallWinner = "allied";
        } else if (this.state.counter.sydon > this.state.counter.allied) {
            this.state.log.push(">>> SYDON LEGION WINS THE BATTLE <<<");
            this.state.overallWinner = "sydon";
        } else {
            this.state.log.push(">>> BATTLE TIED — Sudden Death Required <<<");
            this.state.phase = "tiebreaker";
            this.render();
            return;
        }

        this.state.phase = "aftermath_recovery";
        this.render();
    }

    static async runTiebreaker(_event, _target) {
        const aStats = this.state.allied.getFlag("battle-of-mytros", "stats");
        const sStats = this.state.sydon.getFlag("battle-of-mytros", "stats");

        const aRoll = await globalThis.BattleRoller.executeRoll(aStats.vitality, 0, false, false, this.hasTag(this.state.allied, "veteran"), []);
        const sRoll = await globalThis.BattleRoller.executeRoll(sStats.vitality, 0, false, false, this.hasTag(this.state.sydon, "veteran"), []);

        this.state.log.push(`Tiebreaker — Allied Vitality: ${aRoll.total} | Sydon Vitality: ${sRoll.total}`);

        if (aRoll.total > sRoll.total) {
            this.state.log.push(">>> ALLIED WINS THE TIEBREAKER <<<");
            this.state.overallWinner = "allied";
            this.state.phase = "aftermath_recovery";
        } else if (sRoll.total > aRoll.total) {
            this.state.log.push(">>> SYDON WINS THE TIEBREAKER <<<");
            this.state.overallWinner = "sydon";
            this.state.phase = "aftermath_recovery";
        } else {
            this.state.log.push("Still tied! Rerolling automatically...");
            return BattleResolverApp.runTiebreaker.call(this);
        }

        this.render();
    }

    // ── Aftermath Phases ──────────────────────────────────────────────────────

    static async runRecovery(_event, _target) {
        const winner = this.state.overallWinner;
        const loser = winner === "allied" ? "sydon" : "allied";
        const results = {};
        const adjacency = this._computeAdjacencyContext();

        for (const side of ["allied", "sydon"]) {
            const legion = this.state[side];
            const isWinner = side === winner;
            const enemySide = side === "allied" ? "sydon" : "allied";
            const stats = legion.getFlag("battle-of-mytros", "stats");
            const currentInjuries = stats.injuries || 0;
            const dc = 12 + currentInjuries;

            const mods = globalThis.TagEngine.getAftermathModifiers(legion, this.state[enemySide], "recovery", { 
                isWinner, 
                adjacentWarden: side === "allied" ? adjacency.adjacentWarden : false 
            });
            const support = this.getSupportBonusesAftermath(side);
            const isVeteran = this.hasTag(legion, "veteran");

            const rollResult = await globalThis.BattleRoller.executeRoll(
                stats.vitality, mods.flatBonus, mods.advantage, mods.disadvantage, isVeteran, support.dice
            );

            const success = !rollResult.isNat1 && rollResult.total >= dc;
            let injuries;
            if (isWinner) {
                injuries = success ? 0 : 1;
                if (success && this.hasTag(legion, "medic")) injuries = -1;
            } else {
                injuries = success ? 1 : 2;
            }

            results[side] = { rollTotal: rollResult.total, dc, success, injuries };
            this.state.log.push(`${side} Recovery (Vit ${stats.vitality}): ${rollResult.total} vs DC ${dc} — ${success ? "SUCCESS" : "FAIL"} → ${injuries >= 0 ? "+" : ""}${injuries} injuries`);
        }

        // Seized Initiative: maneuver winner = overall winner AND chose seized_initiative
        if (this.state.maneuverWinner === winner && this.state.maneuverBenefit === "seized_initiative") {
            const seizedRoll = await new Roll("1d2").evaluate();
            results[loser].injuries += seizedRoll.total;
            this.state.log.push(`Seized Initiative! ${loser} takes +${seizedRoll.total} extra injuries.`);
        }

        // Brutal: winner has Brutal, loser projected ≥4 injuries → +1 more
        const loserStats = this.state[loser].getFlag("battle-of-mytros", "stats");
        const loserProjected = (loserStats.injuries || 0) + results[loser].injuries;
        if (this.hasTag(this.state[winner], "brutal") && loserProjected >= 4) {
            results[loser].injuries += 1;
            this.state.log.push(`Brutal! ${loser} takes +1 additional injury (≥4 injuries total).`);
        }

        this.state.recoveryResult = results;
        this.state.phase = "aftermath_hope";
        this.render();
    }

    static async runHope(_event, _target) {
        const winner = this.state.overallWinner;
        const results = {};
        const adjacency = this._computeAdjacencyContext();

        for (const side of ["allied", "sydon"]) {
            const legion = this.state[side];
            const isWinner = side === winner;
            const enemySide = side === "allied" ? "sydon" : "allied";
            const stats = legion.getFlag("battle-of-mytros", "stats");
            const currentMorale = stats.morale ?? 5;

            const mods = globalThis.TagEngine.getAftermathModifiers(legion, this.state[enemySide], "hope", { isWinner, adjacentRallier: side === "allied" ? adjacency.adjacentRallier : false });
            const support = this.getSupportBonusesAftermath(side);
            const isVeteran = this.hasTag(legion, "veteran");

            const rollResult = await globalThis.BattleRoller.executeRoll(
                currentMorale, mods.flatBonus, mods.advantage, mods.disadvantage, isVeteran, support.dice
            );

            const hopeDC = game.settings.get("battle-of-mytros", "hopeDC") ?? 12;
            const success = rollResult.total >= hopeDC;
            const moraleDelta = isWinner ? (success ? 2 : 1) : (success ? -1 : -2);

            results[side] = { rollTotal: rollResult.total, success, moraleDelta };
            this.state.log.push(`${side} Hope (Morale ${currentMorale}): ${rollResult.total} vs DC ${hopeDC} — ${success ? "SUCCESS" : "FAIL"} → ${moraleDelta >= 0 ? "+" : ""}${moraleDelta} Morale`);
        }

        this.state.hopeResult = results;
        this.state.phase = "aftermath_salvage";
        this.render();
    }

    static async runSalvage(_event, _target) {
        const results = {};

        for (const side of ["allied", "sydon"]) {
            const legion = this.state[side];
            const isWinner = side === this.state.overallWinner;
            const enemySide = side === "allied" ? "sydon" : "allied";
            const stats = legion.getFlag("battle-of-mytros", "stats");

            const mods = globalThis.TagEngine.getAftermathModifiers(legion, this.state[enemySide], "salvage", { isWinner });
            const support = this.getSupportBonusesAftermath(side);
            const isVeteran = this.hasTag(legion, "veteran");

            const rollResult = await globalThis.BattleRoller.executeRoll(
                stats.wit, mods.flatBonus, mods.advantage, mods.disadvantage, isVeteran, support.dice
            );

            const salvageDC = game.settings.get("battle-of-mytros", "salvageDC") ?? 12;
            const success = rollResult.total >= salvageDC;
            const benefitCount = !success ? 0 : (rollResult.isNat20 ? 2 : 1);

            results[side] = { rollTotal: rollResult.total, success, nat20: rollResult.isNat20, benefitCount };
            this.state.log.push(`${side} Salvage (Wit ${stats.wit}): ${rollResult.total} vs DC ${salvageDC} — ${!success ? "FAIL" : rollResult.isNat20 ? "NAT 20! (2 benefits)" : "SUCCESS (1 benefit)"}`);
        }

        this.state.salvageResult = results;
        this.state.salvageBenefits = { allied: [], sydon: [] };

        if (results.allied.benefitCount > 0) {
            this.state.phase = "aftermath_salvage_allied_choice";
        } else if (results.sydon.benefitCount > 0) {
            this.state.phase = "aftermath_salvage_sydon_choice";
        } else {
            this.state.phase = this._nextPhaseAfterSalvage();
        }

        this.render();
    }

    static async selectSalvageBenefit(_event, target) {
        const benefit = target.dataset.benefit;
        const side = this.state.phase === "aftermath_salvage_allied_choice" ? "allied" : "sydon";

        this.state.salvageBenefits[side].push(benefit);
        this.state.log.push(`${side} salvage benefit: ${benefit}`);

        const chosen = this.state.salvageBenefits[side].length;
        const needed = this.state.salvageResult[side].benefitCount;

        if (chosen < needed) {
            this.render();
            return;
        }

        if (side === "allied" && this.state.salvageResult.sydon.benefitCount > 0) {
            this.state.phase = "aftermath_salvage_sydon_choice";
        } else {
            this.state.phase = this._nextPhaseAfterSalvage();
        }

        this.render();
    }

    static async runCommanderCasualty(_event, _target) {
        const winner = this.state.overallWinner;
        const counterDiff = Math.abs(this.state.counter.allied - this.state.counter.sydon);
        const results = {};

        for (const side of ["allied", "sydon"]) {
            const legion = this.state[side];
            const commander = this.getCommander(legion);

            if (!commander) {
                results[side] = { skipped: true, reason: "no commander" };
                this.state.log.push(`${side}: No commander assigned — skipping check.`);
                continue;
            }

            const supportUnits = globalThis.MytrosRegionManager.getSupportUnitsInSection(this.region)
                .filter(t => t.actor.getFlag("battle-of-mytros", "faction") === side);
            const isProtected = supportUnits.some(t => t.getFlag("battle-of-mytros", "deploymentMode") === "protect");

            if (isProtected) {
                results[side] = { skipped: true, reason: "protected", commanderName: commander.name };
                this.state.log.push(`${side} commander (${commander.name}) is protected by a PC — no check.`);
                continue;
            }

            const isWinner = side === winner;
            let baseChance = isWinner ? 6 : (counterDiff >= 3 ? 20 : 12);
            const enemySide = side === "allied" ? "sydon" : "allied";

            if (this.hasTag(this.state[enemySide], "headhunter")) baseChance += 5;
            if (this.hasTag(legion, "divine blood")) baseChance -= 5;

            const currentMorale = legion.getFlag("battle-of-mytros", "stats")?.morale ?? 5;
            const finalTarget = Math.max(1, baseChance - currentMorale);

            const roll1 = await new Roll("1d100").evaluate();
            let finalRoll = roll1.total;

            if (this.hasTag(legion, "unbreakable pact")) {
                const roll2 = await new Roll("1d100").evaluate();
                this.state.log.push(`${side} Unbreakable Pact: rolled ${roll1.total} & ${roll2.total}`);
                finalRoll = Math.min(roll1.total, roll2.total);
            }

            const died = finalRoll <= finalTarget;
            results[side] = { baseChance, finalTarget, finalRoll, died, commanderName: commander.name };
            this.state.log.push(`${side} Commander (${commander.name}): ${finalRoll} vs ${finalTarget}% — ${died ? "FALLS IN BATTLE" : "SURVIVES"}`);
        }

        this.state.commanderResult = results;
        this.state.phase = "done";
        this.render();
    }

    static async commitAftermath(_event, _target) {
        const statsCopy = {};
        for (const side of ["allied", "sydon"]) {
            statsCopy[side] = { ...this.state[side].getFlag("battle-of-mytros", "stats") };
        }

        // Recovery injuries
        for (const side of ["allied", "sydon"]) {
            if (this.state.recoveryResult?.[side]) {
                statsCopy[side].injuries = (statsCopy[side].injuries || 0) + this.state.recoveryResult[side].injuries;
            }
        }

        // Hope morale changes
        for (const side of ["allied", "sydon"]) {
            if (this.state.hopeResult?.[side]) {
                statsCopy[side].morale = (statsCopy[side].morale ?? 5) + this.state.hopeResult[side].moraleDelta;
            }
        }

        // Salvage benefits
        for (const side of ["allied", "sydon"]) {
            const enemySide = side === "allied" ? "sydon" : "allied";
            for (const benefit of (this.state.salvageBenefits?.[side] || [])) {
                if (benefit === "captured_supplies") {
                    statsCopy[side].injuries = Math.max(0, (statsCopy[side].injuries || 0) - 1);
                    this.state.log.push(`${side} Captured Supplies: removed 1 injury.`);
                }
                if (benefit === "enemy_shaken") {
                    statsCopy[enemySide].morale = (statsCopy[enemySide].morale ?? 5) - 1;
                    this.state.log.push(`${side} Enemy Shaken: ${enemySide} loses 1 Morale.`);
                }
                if (benefit === "tactical_insight") {
                    const tacRoll = await new Roll("1d2").evaluate();
                    await this.state[side].setFlag("battle-of-mytros", "tacInsightBonus", tacRoll.total);
                    this.state.log.push(`${side} Tactical Insight: +${tacRoll.total} to Wit rolls next round.`);
                }
                if (benefit === "quick_fortify") {
                    await this.region.setFlag("battle-of-mytros", "fortified", true);
                    await this.region.setFlag("battle-of-mytros", "control", side);
                    this.state.log.push(`${side} Quick Fortify: section is now fortified.`);
                }
            }
        }

        // Commander death: -1 morale, clear commanderId
        for (const side of ["allied", "sydon"]) {
            if (this.state.commanderResult?.[side]?.died) {
                statsCopy[side].morale = (statsCopy[side].morale ?? 5) - 1;
                await this.state[side].setFlag("battle-of-mytros", "commanderId", null);
                this.state.log.push(`${side} commander lost — 1 Morale penalty applied.`);
            }
        }

        // Clamp: Relentless min 2, others min 0, max maxMorale
        const maxMorale = game.settings.get("battle-of-mytros", "maxMorale") ?? 10;
        for (const side of ["allied", "sydon"]) {
            const minMorale = this.hasTag(this.state[side], "relentless") ? 2 : 0;
            statsCopy[side].morale = Math.min(maxMorale, Math.max(minMorale, statsCopy[side].morale ?? 5));
            statsCopy[side].injuries = Math.max(0, statsCopy[side].injuries || 0);
        }

        // Write stats to actors
        for (const side of ["allied", "sydon"]) {
            await this.state[side].setFlag("battle-of-mytros", "stats", statsCopy[side]);
        }

        // Persist rout / destruction flags and build chat card status data
        const statusData = {};
        for (const side of ["allied", "sydon"]) {
            const s = statsCopy[side];
            const baseDestroy = game.settings.get("battle-of-mytros", "destroyThreshold") ?? 6;
            const destroyAt = this.hasTag(this.state[side], "bulwark") ? baseDestroy + 1 : baseDestroy;
            if (s.injuries >= destroyAt) {
                this.state.log.push(`⚠ ${side} LEGION DESTROYED (${s.injuries} injuries)!`);
                await this.state[side].setFlag("battle-of-mytros", "isDestroyed", true);
                await this.state[side].setFlag("battle-of-mytros", "isRouted", false);
                statusData[side] = { text: "LEGION DESTROYED", type: "destroyed" };
            } else if (s.morale <= 0) {
                this.state.log.push(`⚠ ${side} LEGION ROUTED (0 Morale)!`);
                await this.state[side].setFlag("battle-of-mytros", "isRouted", true);
                statusData[side] = { text: "LEGION ROUTED", type: "routed" };
            } else {
                this.state.log.push(`${side} final: Injuries ${s.injuries}, Morale ${s.morale}`);
                await this.state[side].setFlag("battle-of-mytros", "isRouted", false);
                statusData[side] = null;
            }
        }

        // Update section control to the winner; clear fortification if it changes hands
        const currentControl = this.region.getFlag("battle-of-mytros", "control");
        if (currentControl !== this.state.overallWinner) {
            await this.region.setFlag("battle-of-mytros", "control", this.state.overallWinner);
            await this.region.setFlag("battle-of-mytros", "fortified", false);
            this.state.log.push(`${this.state.overallWinner} claims the section. Fortification lost.`);
        } else {
            this.state.log.push(`${this.state.overallWinner} holds the section.`);
        }

        // Mark both legions as having fought this round
        for (const side of ["allied", "sydon"]) {
            await this.state[side].setFlag("battle-of-mytros", "foughtThisRound", true);
        }

        // Roll death toll for this engagement and add to running total
        const alliedWon = this.state.overallWinner === "allied";
        const deathDie = await new Roll(alliedWon ? "1d4" : "1d6").evaluate();
        const deathsThisBattle = deathDie.total * (alliedWon ? 10 : 50);
        const currentToll = game.settings.get("battle-of-mytros", "deathToll");
        await game.settings.set("battle-of-mytros", "deathToll", currentToll + deathsThisBattle);

        // Post chat card
        await this._postChatCard(statsCopy, statusData, deathsThisBattle);

        this.state.phase = "complete";
        this.render();
    }

    async _postChatCard(statsCopy, statusData, deathsThisBattle) {
        const winner = this.state.overallWinner;

        const signedStr = (n) => n >= 0 ? `+${n}` : `${n}`;
        const injClass = (n) => n > 0 ? "text-bad" : n < 0 ? "text-good" : "text-neutral";
        const morClass = (n) => n > 0 ? "text-good" : n < 0 ? "text-bad" : "text-neutral";

        const aRec = this.state.recoveryResult?.allied;
        const sRec = this.state.recoveryResult?.sydon;
        const aHope = this.state.hopeResult?.allied;
        const sHope = this.state.hopeResult?.sydon;
        const aCmdr = this.state.commanderResult?.allied;
        const sCmdr = this.state.commanderResult?.sydon;

        const cardData = {
            sectionName: this.region.name.replace(globalThis.MytrosRegionManager.SECTION_PREFIX, "").trim(),
            alliedName: this.state.allied.name,
            sydonName: this.state.sydon.name,
            winnerLabel: winner === "allied" ? this.state.allied.name : this.state.sydon.name,
            scoreAllied: this.state.counter.allied,
            scoreSydon: this.state.counter.sydon,
            alliedRecoveryText: aRec ? (aRec.success ? (aRec.injuries === 0 ? "No injury" : signedStr(aRec.injuries)) : `${signedStr(aRec.injuries)} (failed)`) : "—",
            alliedRecoveryClass: aRec ? injClass(aRec.injuries) : "",
            sydonRecoveryText: sRec ? (sRec.success ? (sRec.injuries === 0 ? "No injury" : signedStr(sRec.injuries)) : `${signedStr(sRec.injuries)} (failed)`) : "—",
            sydonRecoveryClass: sRec ? injClass(sRec.injuries) : "",
            alliedHopeText: aHope ? `${signedStr(aHope.moraleDelta)} Morale` : "—",
            alliedHopeClass: aHope ? morClass(aHope.moraleDelta) : "",
            sydonHopeText: sHope ? `${signedStr(sHope.moraleDelta)} Morale` : "—",
            sydonHopeClass: sHope ? morClass(sHope.moraleDelta) : "",
            alliedInjuries: statsCopy.allied.injuries,
            alliedMorale: statsCopy.allied.morale,
            sydonInjuries: statsCopy.sydon.injuries,
            sydonMorale: statsCopy.sydon.morale,
            alliedCommanderDied: aCmdr?.died ?? false,
            alliedCommanderName: aCmdr?.commanderName ?? "",
            sydonCommanderDied: sCmdr?.died ?? false,
            sydonCommanderName: sCmdr?.commanderName ?? "",
            alliedStatus: statusData.allied?.text ?? "",
            alliedStatusType: statusData.allied?.type ?? "",
            sydonStatus: statusData.sydon?.text ?? "",
            sydonStatusType: statusData.sydon?.type ?? "",
            deathToll: deathsThisBattle
        };

        const html = await renderTemplate("modules/battle-of-mytros/templates/chat-card.hbs", cardData);
        await ChatMessage.create({ content: html, speaker: { alias: "Battle of Mytros" } });
    }

    static async runDivineBloodReroll(_event, target) {
        const side = target.dataset.side;
        const check = target.dataset.check;
        const enemySide = side === "allied" ? "sydon" : "allied";
        const legion = this.state[side];
        const stats = legion.getFlag("battle-of-mytros", "stats");
        const isWinner = side === this.state.overallWinner;
        const isVeteran = this.hasTag(legion, "veteran");
        const support = this.getSupportBonusesAftermath(side);

        if (check === "recovery") {
            const dc = 12 + (stats.injuries || 0);
            const mods = globalThis.TagEngine.getAftermathModifiers(legion, this.state[enemySide], "recovery", { isWinner });
            const reroll = await globalThis.BattleRoller.executeRoll(stats.vitality, mods.flatBonus, mods.advantage, mods.disadvantage, isVeteran, support.dice);
            const success = !reroll.isNat1 && reroll.total >= dc;
            let injuries = isWinner ? (success ? 0 : 1) : (success ? 1 : 2);
            if (success && this.hasTag(legion, "medic")) injuries = -1;
            const orig = this.state.recoveryResult[side];
            if (injuries < orig.injuries) {
                this.state.recoveryResult[side] = { ...orig, rollTotal: reroll.total, success, injuries };
                this.state.log.push(`Divine Blood (${side}): Recovery re-roll ${reroll.total} — improved to ${injuries >= 0 ? "+" : ""}${injuries} injuries.`);
            } else {
                this.state.log.push(`Divine Blood (${side}): Recovery re-roll ${reroll.total} — original kept (${orig.injuries >= 0 ? "+" : ""}${orig.injuries} injuries).`);
            }
        } else if (check === "hope") {
            const currentMorale = stats.morale ?? 5;
            const mods = globalThis.TagEngine.getAftermathModifiers(legion, this.state[enemySide], "hope", { isWinner });
            const reroll = await globalThis.BattleRoller.executeRoll(currentMorale, mods.flatBonus, mods.advantage, mods.disadvantage, isVeteran, support.dice);
            const success = reroll.total >= 12;
            const moraleDelta = isWinner ? (success ? 2 : 1) : (success ? -1 : -2);
            const orig = this.state.hopeResult[side];
            if (moraleDelta > orig.moraleDelta) {
                this.state.hopeResult[side] = { ...orig, rollTotal: reroll.total, success, moraleDelta };
                this.state.log.push(`Divine Blood (${side}): Hope re-roll ${reroll.total} — improved to ${moraleDelta >= 0 ? "+" : ""}${moraleDelta} Morale.`);
            } else {
                this.state.log.push(`Divine Blood (${side}): Hope re-roll ${reroll.total} — original kept (${orig.moraleDelta >= 0 ? "+" : ""}${orig.moraleDelta} Morale).`);
            }
        } else if (check === "salvage") {
            const mods = globalThis.TagEngine.getAftermathModifiers(legion, this.state[enemySide], "salvage", { isWinner });
            const reroll = await globalThis.BattleRoller.executeRoll(stats.wit, mods.flatBonus, mods.advantage, mods.disadvantage, isVeteran, support.dice);
            const success = reroll.total >= 12;
            const benefitCount = !success ? 0 : (reroll.isNat20 ? 2 : 1);
            const orig = this.state.salvageResult[side];
            if (benefitCount > orig.benefitCount) {
                this.state.salvageResult[side] = { ...orig, rollTotal: reroll.total, success, nat20: reroll.isNat20, benefitCount };
                this.state.salvageBenefits[side] = [];
                this.state.divineBloodSalvageNeedChoice[side] = benefitCount;
                this.state.log.push(`Divine Blood (${side}): Salvage re-roll ${reroll.total} — ${benefitCount} benefit(s) gained.`);
            } else {
                this.state.log.push(`Divine Blood (${side}): Salvage re-roll ${reroll.total} — original kept (no benefits).`);
            }
        }

        this.state.divineBloodPending[side] = null;
        this.render();
    }

    static async selectDivineBloodSalvageBenefit(_event, target) {
        const side = target.dataset.side;
        const benefit = target.dataset.benefit;
        this.state.salvageBenefits[side].push(benefit);
        this.state.log.push(`${side} Divine Blood salvage benefit: ${benefit}`);
        this.state.divineBloodSalvageNeedChoice[side] = Math.max(0, (this.state.divineBloodSalvageNeedChoice[side] || 0) - 1);
        this.render();
    }

    static async proceedToCommander(_event, _target) {
        this.state.phase = "aftermath_commander";
        this.render();
    }
}
