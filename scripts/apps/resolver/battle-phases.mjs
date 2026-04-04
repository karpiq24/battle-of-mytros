/**
 * Battle phase action handlers: Maneuver, Charge, Clash, and Tiebreaker.
 * Each function is a static action method bound to the BattleResolverApp instance via `this`.
 */

export async function runManeuver(_event, _target) {
    this.battleState.log.push({ text: "MANEUVER PHASE", type: "phase-header" });
    const alliedIsFortified =
        this.region.getFlag("battle-of-mytros", "control") === "allied" &&
        this.region.getFlag("battle-of-mytros", "fortified");
    const sydonIsFortified =
        this.region.getFlag("battle-of-mytros", "control") === "sydon" &&
        this.region.getFlag("battle-of-mytros", "fortified");

    const alliedMods = globalThis.TagEngine.getRollModifiers(
        this.battleState.allied,
        this.battleState.sydon,
        "maneuver",
        {
            isFortified: alliedIsFortified,
            enemyIsFortified: sydonIsFortified,
        }
    );
    const sydonMods = globalThis.TagEngine.getRollModifiers(
        this.battleState.sydon,
        this.battleState.allied,
        "maneuver",
        {
            isFortified: sydonIsFortified,
            enemyIsFortified: alliedIsFortified,
        }
    );

    // Apply reconnaissance bonus (23+ result: +1 to all allied Maneuver rolls this round)
    const reconBonus = game.settings.get("battle-of-mytros", "reconBonus") ?? 0;
    if (reconBonus > 0) {
        alliedMods.flatBonus += reconBonus;
        alliedMods.descriptions.push(`Recon Intel: +${reconBonus}`);
    }

    const alliedStats = this.battleState.allied.getFlag("battle-of-mytros", "stats");
    const sydonStats = this.battleState.sydon.getFlag("battle-of-mytros", "stats");

    const aVeteran = this.hasTag(this.battleState.allied, "veteran");
    const sVeteran = this.hasTag(this.battleState.sydon, "veteran");

    const aSupport = this.getSupportBonuses("allied", "maneuver");
    const sSupport = this.getSupportBonuses("sydon", "maneuver");

    const aModSummary = this._buildModSummary(
        alliedMods,
        aSupport.dice.map((d) => `Support: +${d}`)
    );
    const sModSummary = this._buildModSummary(
        sydonMods,
        sSupport.dice.map((d) => `Support: +${d}`)
    );
    if (aVeteran) aModSummary.push("Veteran: floor 5");
    if (sVeteran) sModSummary.push("Veteran: floor 5");
    if (aSupport.advantage) aModSummary.push("Support: Advantage");
    if (sSupport.advantage) sModSummary.push("Support: Advantage");

    const alliedRoll = await globalThis.BattleRoller.executeRoll(
        alliedStats.wit,
        alliedMods.flatBonus,
        alliedMods.advantage || aSupport.advantage,
        alliedMods.disadvantage,
        aVeteran,
        aSupport.dice
    );
    const sydonRoll = await globalThis.BattleRoller.executeRoll(
        sydonStats.wit,
        sydonMods.flatBonus,
        sydonMods.advantage || sSupport.advantage,
        sydonMods.disadvantage,
        sVeteran,
        sSupport.dice
    );

    const diff = alliedRoll.total - sydonRoll.total;
    this.battleState.counter = { allied: alliedRoll.total, sydon: sydonRoll.total };
    this.battleState.log.push({
        text: `Maneuver — Allied: ${alliedRoll.total} (Wit ${alliedStats.wit}), Sydon: ${sydonRoll.total} (Wit ${sydonStats.wit}) → differential: ${diff >= 0 ? "+" : ""}${diff}`,
        mods: { allied: aModSummary, sydon: sModSummary },
    });

    if (diff > 0) {
        this.battleState.log.push({ text: "Allied side won the Maneuver!", type: "allied-win" });
        this.battleState.maneuverWinner = "allied";
    } else if (diff < 0) {
        this.battleState.log.push({ text: "Sydon side won the Maneuver!", type: "sydon-win" });
        this.battleState.maneuverWinner = "sydon";
    } else {
        this.battleState.log.push({ text: "Maneuver tied — no benefit granted.", type: "neutral" });
        this.battleState.maneuverWinner = "tie";
    }

    this.battleState.battleScore = diff;

    this.battleState.phase = this.battleState.maneuverWinner !== "tie" ? "maneuver_choice" : "charge";
    this.render();
}

export async function selectManeuverBenefit(_event, target) {
    const benefit = target.dataset.benefit;
    this.battleState.maneuverBenefit = benefit;
    this.battleState.log.push({ text: `${this.battleState.maneuverWinner} selected benefit: ${benefit}` });
    this.battleState.phase = "charge";
    this.render();
}

export async function runCharge(_event, _target) {
    this.battleState.log.push({ text: "CHARGE PHASE", type: "phase-header" });
    const alliedIsFortified =
        this.region.getFlag("battle-of-mytros", "control") === "allied" &&
        this.region.getFlag("battle-of-mytros", "fortified");
    const sydonIsFortified =
        this.region.getFlag("battle-of-mytros", "control") === "sydon" &&
        this.region.getFlag("battle-of-mytros", "fortified");

    const aContext = {
        isFortified: alliedIsFortified,
        enemyIsFortified: sydonIsFortified,
        maneuverBenefit: this.battleState.maneuverWinner === "allied" ? this.battleState.maneuverBenefit : null,
        enemyManeuverBenefit: this.battleState.maneuverWinner === "sydon" ? this.battleState.maneuverBenefit : null,
        movedThree: this.battleState.allied.getFlag("battle-of-mytros", "movedThree") ?? false,
    };
    const sContext = {
        isFortified: sydonIsFortified,
        enemyIsFortified: alliedIsFortified,
        maneuverBenefit: this.battleState.maneuverWinner === "sydon" ? this.battleState.maneuverBenefit : null,
        enemyManeuverBenefit: this.battleState.maneuverWinner === "allied" ? this.battleState.maneuverBenefit : null,
        movedThree: this.battleState.sydon.getFlag("battle-of-mytros", "movedThree") ?? false,
    };

    const alliedMods = globalThis.TagEngine.getRollModifiers(
        this.battleState.allied,
        this.battleState.sydon,
        "charge",
        aContext
    );
    const sydonMods = globalThis.TagEngine.getRollModifiers(
        this.battleState.sydon,
        this.battleState.allied,
        "charge",
        sContext
    );

    const aStats = this.battleState.allied.getFlag("battle-of-mytros", "stats");
    const sStats = this.battleState.sydon.getFlag("battle-of-mytros", "stats");

    const aVeteran = this.hasTag(this.battleState.allied, "veteran");
    const sVeteran = this.hasTag(this.battleState.sydon, "veteran");

    const aSupport = this.getSupportBonuses("allied", "charge");
    const sSupport = this.getSupportBonuses("sydon", "charge");

    const aFlankDice =
        this.battleState.maneuverWinner === "allied" && this.battleState.maneuverBenefit === "flanking" ? ["1d4"] : [];
    const sFlankDice =
        this.battleState.maneuverWinner === "sydon" && this.battleState.maneuverBenefit === "flanking" ? ["1d4"] : [];

    const aModSummary = this._buildModSummary(
        alliedMods,
        aSupport.dice.map((d) => `Support: +${d}`)
    );
    const sModSummary = this._buildModSummary(
        sydonMods,
        sSupport.dice.map((d) => `Support: +${d}`)
    );
    if (aVeteran) aModSummary.push("Veteran: floor 5");
    if (sVeteran) sModSummary.push("Veteran: floor 5");
    if (aSupport.advantage) aModSummary.push("Support: Advantage");
    if (sSupport.advantage) sModSummary.push("Support: Advantage");
    if (aFlankDice.length) aModSummary.push("Flanking: +1d4");
    if (sFlankDice.length) sModSummary.push("Flanking: +1d4");

    const aRoll = await globalThis.BattleRoller.executeRoll(
        aStats.morale,
        alliedMods.flatBonus,
        alliedMods.advantage || aSupport.advantage,
        alliedMods.disadvantage,
        aVeteran,
        aSupport.dice.concat(aFlankDice)
    );
    const sRoll = await globalThis.BattleRoller.executeRoll(
        sStats.morale,
        sydonMods.flatBonus,
        sydonMods.advantage || sSupport.advantage,
        sydonMods.disadvantage,
        sVeteran,
        sSupport.dice.concat(sFlankDice)
    );

    const diff = aRoll.total - sRoll.total;
    this.battleState.battleScore += diff;
    this.battleState.counter.allied += aRoll.total;
    this.battleState.counter.sydon += sRoll.total;

    this.battleState.log.push({
        text: `Charge — Allied: ${aRoll.total} (Morale ${aStats.morale}), Sydon: ${sRoll.total} (Morale ${sStats.morale}) → differential: ${diff >= 0 ? "+" : ""}${diff} | Battle Score: ${this.battleState.battleScore >= 0 ? "+" : ""}${this.battleState.battleScore}`,
        mods: { allied: aModSummary, sydon: sModSummary },
    });

    if (diff > 0) {
        this.battleState.log.push({ text: "Allied won Charge! (+1 Clash)", type: "allied-win" });
        this.battleState.chargeWinner = "allied";
    } else if (diff < 0) {
        this.battleState.log.push({ text: "Sydon won Charge! (+1 Clash)", type: "sydon-win" });
        this.battleState.chargeWinner = "sydon";
    } else {
        this.battleState.log.push({ text: "Charge tied — no cascade bonus.", type: "neutral" });
        this.battleState.chargeWinner = "tie";
    }

    this.battleState.phase = "clash";
    this.render();
}

export async function runClash(_event, _target) {
    this.battleState.log.push({ text: "CLASH PHASE", type: "phase-header" });
    const alliedIsFortified =
        this.region.getFlag("battle-of-mytros", "control") === "allied" &&
        this.region.getFlag("battle-of-mytros", "fortified");
    const sydonIsFortified =
        this.region.getFlag("battle-of-mytros", "control") === "sydon" &&
        this.region.getFlag("battle-of-mytros", "fortified");

    const adjacency = this._computeAdjacencyContext();
    const aContext = {
        maneuverBenefit: this.battleState.maneuverWinner === "allied" ? this.battleState.maneuverBenefit : null,
        enemyManeuverBenefit: this.battleState.maneuverWinner === "sydon" ? this.battleState.maneuverBenefit : null,
        isFortified: alliedIsFortified,
        enemyIsFortified: sydonIsFortified,
        adjacentWarden: adjacency.adjacentWarden,
    };
    const sContext = {
        maneuverBenefit: this.battleState.maneuverWinner === "sydon" ? this.battleState.maneuverBenefit : null,
        enemyManeuverBenefit: this.battleState.maneuverWinner === "allied" ? this.battleState.maneuverBenefit : null,
        isFortified: sydonIsFortified,
        enemyIsFortified: alliedIsFortified,
    };

    const aMods = globalThis.TagEngine.getRollModifiers(
        this.battleState.allied,
        this.battleState.sydon,
        "clash",
        aContext
    );
    const sMods = globalThis.TagEngine.getRollModifiers(
        this.battleState.sydon,
        this.battleState.allied,
        "clash",
        sContext
    );

    if (this.battleState.chargeWinner === "allied") {
        aMods.flatBonus += 1;
        aMods.descriptions.push("Charge Victor: +1");
    }
    if (this.battleState.chargeWinner === "sydon") {
        sMods.flatBonus += 1;
        sMods.descriptions.push("Charge Victor: +1");
    }

    // Apply Maneuver bonus dice if selected (Defensive Footing: +1d2 to Clash)
    if (this.battleState.maneuverWinner === "allied") {
        if (this.battleState.maneuverBenefit === "defensive") aMods.flatBonus -= 1; // Remove flat average, use die instead
        if (this.battleState.maneuverBenefit === "defensive") aMods.bonusDice = (aMods.bonusDice || []).concat("1d2");
    }
    if (this.battleState.maneuverWinner === "sydon") {
        if (this.battleState.maneuverBenefit === "defensive") sMods.flatBonus -= 1;
        if (this.battleState.maneuverBenefit === "defensive") sMods.bonusDice = (sMods.bonusDice || []).concat("1d2");
    }

    const aStats = this.battleState.allied.getFlag("battle-of-mytros", "stats");
    const sStats = this.battleState.sydon.getFlag("battle-of-mytros", "stats");

    const aVeteran = this.hasTag(this.battleState.allied, "veteran");
    const sVeteran = this.hasTag(this.battleState.sydon, "veteran");

    const aSupport = this.getSupportBonuses("allied", "clash");
    const sSupport = this.getSupportBonuses("sydon", "clash");

    const aModSummary = this._buildModSummary(aMods, [
        ...(aMods.bonusDice || []).map((d) => `Def. Footing: +${d}`),
        ...aSupport.dice.map((d) => `Support: +${d}`),
    ]);
    const sModSummary = this._buildModSummary(sMods, [
        ...(sMods.bonusDice || []).map((d) => `Def. Footing: +${d}`),
        ...sSupport.dice.map((d) => `Support: +${d}`),
    ]);
    if (aVeteran) aModSummary.push("Veteran: floor 5");
    if (sVeteran) sModSummary.push("Veteran: floor 5");
    if (aSupport.advantage) aModSummary.push("Support: Advantage");
    if (sSupport.advantage) sModSummary.push("Support: Advantage");

    const aRoll = await globalThis.BattleRoller.executeRoll(
        aStats.vitality,
        aMods.flatBonus,
        aMods.advantage || aSupport.advantage,
        aMods.disadvantage,
        aVeteran,
        (aMods.bonusDice || []).concat(aSupport.dice)
    );
    const sRoll = await globalThis.BattleRoller.executeRoll(
        sStats.vitality,
        sMods.flatBonus,
        sMods.advantage || sSupport.advantage,
        sMods.disadvantage,
        sVeteran,
        (sMods.bonusDice || []).concat(sSupport.dice)
    );

    const diff = aRoll.total - sRoll.total;
    this.battleState.battleScore += diff;
    this.battleState.counter.allied += aRoll.total;
    this.battleState.counter.sydon += sRoll.total;

    this.battleState.log.push({
        text: `Clash — Allied: ${aRoll.total} (Vit ${aStats.vitality}), Sydon: ${sRoll.total} (Vit ${sStats.vitality}) → differential: ${diff >= 0 ? "+" : ""}${diff}`,
        mods: { allied: aModSummary, sydon: sModSummary },
    });

    const score = this.battleState.battleScore;
    this.battleState.log.push({
        text: `BATTLE SCORE: ${score >= 0 ? "+" : ""}${score}`,
        type: "score",
    });

    if (score > 0) {
        this.battleState.log.push({ text: "▶ ALLIED LEGION WINS THE BATTLE", type: "allied-win" });
        this.battleState.overallWinner = "allied";
    } else if (score < 0) {
        this.battleState.log.push({ text: "▶ SYDON LEGION WINS THE BATTLE", type: "sydon-win" });
        this.battleState.overallWinner = "sydon";
    } else {
        this.battleState.log.push({ text: "BATTLE TIED — Sudden Death Required", type: "neutral" });
        this.battleState.phase = "tiebreaker";
        this.render();
        return;
    }

    this.battleState.phase = "aftermath_recovery";
    this.render();
}

export async function runTiebreaker(_event, _target) {
    const aStats = this.battleState.allied.getFlag("battle-of-mytros", "stats");
    const sStats = this.battleState.sydon.getFlag("battle-of-mytros", "stats");

    const aRoll = await globalThis.BattleRoller.executeRoll(
        aStats.vitality,
        0,
        false,
        false,
        this.hasTag(this.battleState.allied, "veteran"),
        []
    );
    const sRoll = await globalThis.BattleRoller.executeRoll(
        sStats.vitality,
        0,
        false,
        false,
        this.hasTag(this.battleState.sydon, "veteran"),
        []
    );

    this.battleState.log.push({ text: `Tiebreaker — Allied Vit: ${aRoll.total} | Sydon Vit: ${sRoll.total}` });

    if (aRoll.total > sRoll.total) {
        this.battleState.log.push({ text: "▶ ALLIED WINS THE TIEBREAKER", type: "allied-win" });
        this.battleState.overallWinner = "allied";
        this.battleState.phase = "aftermath_recovery";
    } else if (sRoll.total > aRoll.total) {
        this.battleState.log.push({ text: "▶ SYDON WINS THE TIEBREAKER", type: "sydon-win" });
        this.battleState.overallWinner = "sydon";
        this.battleState.phase = "aftermath_recovery";
    } else {
        this.battleState.log.push({ text: "Still tied! Rerolling automatically..." });
        return runTiebreaker.call(this);
    }

    this.render();
}
