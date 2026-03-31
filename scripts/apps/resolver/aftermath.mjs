/**
 * Aftermath phase action handlers: Recovery, Hope, Salvage, Commander, Divine Blood, and Commit.
 */

export async function runRecovery(_event, _target) {
    this.battleState.log.push({ text: "AFTERMATH — RECOVERY", type: "phase-header" });
    const winner = this.battleState.overallWinner;
    const loser = winner === "allied" ? "sydon" : "allied";
    const results = {};
    const adjacency = this._computeAdjacencyContext();
    this.battleState.divineBloodUsed = { allied: false, sydon: false };

    for (const side of ["allied", "sydon"]) {
        const legion = this.battleState[side];
        const isWinner = side === winner;
        const enemySide = side === "allied" ? "sydon" : "allied";
        const stats = legion.getFlag("battle-of-mytros", "stats");
        const currentInjuries = stats.injuries || 0;
        const dc = 12 + currentInjuries;

        const mods = globalThis.TagEngine.getAftermathModifiers(legion, this.battleState[enemySide], "recovery", {
            isWinner,
            adjacentWarden: side === "allied" ? adjacency.adjacentWarden : false,
        });
        const support = this.getSupportBonusesAftermath(side);
        const isVeteran = this.hasTag(legion, "veteran");

        const rollResult = await globalThis.BattleRoller.executeRoll(
            stats.vitality,
            mods.flatBonus,
            mods.advantage,
            mods.disadvantage,
            isVeteran,
            support.dice
        );

        let success = !rollResult.isNat1 && rollResult.total >= dc;
        let injuries;
        if (isWinner) {
            injuries = success ? 0 : 1;
            if (success && this.hasTag(legion, "medic")) injuries = -1;
        } else {
            injuries = success ? 1 : 2;
        }

        const modSummary = this._buildModSummary(
            mods,
            support.dice.map((d) => `Support: +${d}`)
        );
        if (isVeteran) modSummary.push("Veteran: floor 5");
        if (isWinner) modSummary.push("Winner");

        this.battleState.log.push({
            text: `${side} Recovery (Vit ${stats.vitality}): ${rollResult.total} vs DC ${dc} — ${success ? "SUCCESS" : "FAIL"} → ${injuries >= 0 ? "+" : ""}${injuries} injuries`,
            mods: { [side]: modSummary },
        });

        if (!success && this.hasTag(legion, "divine blood") && !this.battleState.divineBloodUsed[side]) {
            this.battleState.divineBloodUsed[side] = true;
            const reroll = await globalThis.BattleRoller.executeRoll(
                stats.vitality, mods.flatBonus, mods.advantage, mods.disadvantage, isVeteran, support.dice
            );
            const rerollSuccess = !reroll.isNat1 && reroll.total >= dc;
            let rerollInjuries = isWinner ? (rerollSuccess ? 0 : 1) : rerollSuccess ? 1 : 2;
            if (rerollSuccess && this.hasTag(legion, "medic")) rerollInjuries = -1;
            const improved = rerollInjuries < injuries;
            if (improved) { success = rerollSuccess; injuries = rerollInjuries; }
            this.battleState.log.push({
                text: `Divine Blood (${side}): Recovery auto-reroll ${reroll.total} → ${improved ? "improved" : "original kept"} (${injuries >= 0 ? "+" : ""}${injuries} injuries).`,
            });
        }

        results[side] = { rollTotal: rollResult.total, dc, success, injuries, modSummary };
    }

    // Seized Initiative: maneuver winner = overall winner AND chose seized_initiative
    if (this.battleState.maneuverWinner === winner && this.battleState.maneuverBenefit === "seized_initiative") {
        const seizedRoll = await new Roll("1d2").evaluate();
        results[loser].injuries += seizedRoll.total;
        this.battleState.log.push({
            text: `Seized Initiative! ${loser} takes +${seizedRoll.total} extra injuries.`,
            type: "neutral",
        });
    }

    // Brutal: winner has Brutal, loser projected ≥4 injuries → +1 more
    const loserStats = this.battleState[loser].getFlag("battle-of-mytros", "stats");
    const loserProjected = (loserStats.injuries || 0) + results[loser].injuries;
    if (this.hasTag(this.battleState[winner], "brutal") && loserProjected >= 4) {
        results[loser].injuries += 1;
        this.battleState.log.push({
            text: `Brutal! ${loser} takes +1 additional injury (≥4 injuries total).`,
            type: "neutral",
        });
    }

    this.battleState.recoveryResult = results;
    this.battleState.phase = "aftermath_hope";
    this.render();
}

export async function runHope(_event, _target) {
    this.battleState.log.push({ text: "AFTERMATH — HOPE", type: "phase-header" });
    const winner = this.battleState.overallWinner;
    const results = {};
    const adjacency = this._computeAdjacencyContext();

    for (const side of ["allied", "sydon"]) {
        const legion = this.battleState[side];
        const isWinner = side === winner;
        const enemySide = side === "allied" ? "sydon" : "allied";
        const stats = legion.getFlag("battle-of-mytros", "stats");
        const currentMorale = stats.morale ?? 5;

        const mods = globalThis.TagEngine.getAftermathModifiers(legion, this.battleState[enemySide], "hope", {
            isWinner,
            adjacentRallier: side === "allied" ? adjacency.adjacentRallier : false,
        });
        const support = this.getSupportBonusesAftermath(side);
        const isVeteran = this.hasTag(legion, "veteran");

        const rollResult = await globalThis.BattleRoller.executeRoll(
            currentMorale,
            mods.flatBonus,
            mods.advantage,
            mods.disadvantage,
            isVeteran,
            support.dice
        );

        const hopeDC = game.settings.get("battle-of-mytros", "hopeDC") ?? 12;
        let success = rollResult.total >= hopeDC;
        let moraleDelta = isWinner ? (success ? 2 : 1) : success ? -1 : -2;

        const modSummary = this._buildModSummary(
            mods,
            support.dice.map((d) => `Support: +${d}`)
        );
        if (isVeteran) modSummary.push("Veteran: floor 5");
        if (isWinner) modSummary.push("Winner");

        this.battleState.log.push({
            text: `${side} Hope (Morale ${currentMorale}): ${rollResult.total} vs DC ${hopeDC} — ${success ? "SUCCESS" : "FAIL"} → ${moraleDelta >= 0 ? "+" : ""}${moraleDelta} Morale`,
            mods: { [side]: modSummary },
        });

        if (!success && this.hasTag(legion, "divine blood") && !this.battleState.divineBloodUsed[side]) {
            this.battleState.divineBloodUsed[side] = true;
            const reroll = await globalThis.BattleRoller.executeRoll(
                currentMorale, mods.flatBonus, mods.advantage, mods.disadvantage, isVeteran, support.dice
            );
            const rerollSuccess = reroll.total >= hopeDC;
            const rerollDelta = isWinner ? (rerollSuccess ? 2 : 1) : rerollSuccess ? -1 : -2;
            if (rerollDelta > moraleDelta) { success = rerollSuccess; moraleDelta = rerollDelta; }
            this.battleState.log.push({
                text: `Divine Blood (${side}): Hope auto-reroll ${reroll.total} → ${moraleDelta >= 0 ? "+" : ""}${moraleDelta} Morale.`,
            });
        }

        results[side] = { rollTotal: rollResult.total, success, moraleDelta, modSummary };
    }

    this.battleState.hopeResult = results;
    this.battleState.phase = "aftermath_salvage";
    this.render();
}

export async function runSalvage(_event, _target) {
    this.battleState.log.push({ text: "AFTERMATH — SALVAGE", type: "phase-header" });
    const results = {};

    for (const side of ["allied", "sydon"]) {
        const legion = this.battleState[side];
        const isWinner = side === this.battleState.overallWinner;
        const enemySide = side === "allied" ? "sydon" : "allied";
        const stats = legion.getFlag("battle-of-mytros", "stats");

        const mods = globalThis.TagEngine.getAftermathModifiers(legion, this.battleState[enemySide], "salvage", {
            isWinner,
        });
        const support = this.getSupportBonusesAftermath(side);
        const isVeteran = this.hasTag(legion, "veteran");

        const rollResult = await globalThis.BattleRoller.executeRoll(
            stats.wit,
            mods.flatBonus,
            mods.advantage,
            mods.disadvantage,
            isVeteran,
            support.dice
        );

        const salvageDC = game.settings.get("battle-of-mytros", "salvageDC") ?? 12;
        let success = rollResult.total >= salvageDC;
        let benefitCount = !success ? 0 : rollResult.isNat20 ? 2 : 1;

        const modSummary = this._buildModSummary(
            mods,
            support.dice.map((d) => `Support: +${d}`)
        );
        if (isVeteran) modSummary.push("Veteran: floor 5");

        this.battleState.log.push({
            text: `${side} Salvage (Wit ${stats.wit}): ${rollResult.total} vs DC ${salvageDC} — ${!success ? "FAIL" : rollResult.isNat20 ? "NAT 20! (2 benefits)" : "SUCCESS (1 benefit)"}`,
            mods: { [side]: modSummary },
        });

        if (!success && this.hasTag(legion, "divine blood") && !this.battleState.divineBloodUsed[side]) {
            this.battleState.divineBloodUsed[side] = true;
            const reroll = await globalThis.BattleRoller.executeRoll(
                stats.wit, mods.flatBonus, mods.advantage, mods.disadvantage, isVeteran, support.dice
            );
            const rerollSuccess = reroll.total >= salvageDC;
            const rerollBenefits = !rerollSuccess ? 0 : reroll.isNat20 ? 2 : 1;
            if (rerollBenefits > benefitCount) { success = rerollSuccess; benefitCount = rerollBenefits; }
            this.battleState.log.push({
                text: `Divine Blood (${side}): Salvage auto-reroll ${reroll.total} → ${benefitCount} benefit(s).`,
            });
        }

        results[side] = {
            rollTotal: rollResult.total,
            success,
            nat20: rollResult.isNat20,
            benefitCount,
            modSummary,
        };
    }

    this.battleState.salvageResult = results;
    this.battleState.salvageBenefits = { allied: [], sydon: [] };

    if (results.allied.benefitCount > 0) {
        this.battleState.phase = "aftermath_salvage_allied_choice";
    } else if (results.sydon.benefitCount > 0) {
        this.battleState.phase = "aftermath_salvage_sydon_choice";
    } else {
        this.battleState.phase = this._nextPhaseAfterSalvage();
    }

    this.render();
}

export async function selectSalvageBenefit(_event, target) {
    const benefit = target.dataset.benefit;
    const side = this.battleState.phase === "aftermath_salvage_allied_choice" ? "allied" : "sydon";

    this.battleState.salvageBenefits[side].push(benefit);
    this.battleState.log.push({ text: `${side} salvage benefit: ${benefit}` });

    const chosen = this.battleState.salvageBenefits[side].length;
    const needed = this.battleState.salvageResult[side].benefitCount;

    if (chosen < needed) {
        this.render();
        return;
    }

    if (side === "allied" && this.battleState.salvageResult.sydon.benefitCount > 0) {
        this.battleState.phase = "aftermath_salvage_sydon_choice";
    } else {
        this.battleState.phase = this._nextPhaseAfterSalvage();
    }

    this.render();
}

export async function runCommanderCasualty(_event, _target) {
    this.battleState.log.push({ text: "COMMANDER CASUALTY CHECK", type: "phase-header" });
    const winner = this.battleState.overallWinner;
    const counterDiff = Math.abs(this.battleState.counter.allied - this.battleState.counter.sydon);
    const results = {};

    for (const side of ["allied", "sydon"]) {
        const legion = this.battleState[side];
        const commander = this.getCommander(legion);

        if (!commander) {
            results[side] = { skipped: true, reason: "no commander" };
            this.battleState.log.push({ text: `${side}: No commander assigned — skipping check.` });
            continue;
        }

        const supportUnits = globalThis.MytrosRegionManager.getSupportUnitsInSection(this.region).filter(
            (t) => t.actor.getFlag("battle-of-mytros", "faction") === side
        );
        const isProtected = supportUnits.some((t) => t.getFlag("battle-of-mytros", "deploymentMode") === "protect");

        if (isProtected) {
            results[side] = { skipped: true, reason: "protected", commanderName: commander.name };
            this.battleState.log.push({
                text: `${side} commander (${commander.name}) is protected by a PC — no check.`,
            });
            continue;
        }

        const isWinner = side === winner;
        const cmdrWin = game.settings.get("battle-of-mytros", "cmdrCasualtyWin") ?? 6;
        const cmdrLose = game.settings.get("battle-of-mytros", "cmdrCasualtyLose") ?? 12;
        const cmdrCrush = game.settings.get("battle-of-mytros", "cmdrCasualtyCrush") ?? 20;
        let baseChance = isWinner ? cmdrWin : counterDiff >= 3 ? cmdrCrush : cmdrLose;
        const enemySide = side === "allied" ? "sydon" : "allied";

        if (this.hasTag(this.battleState[enemySide], "headhunter")) baseChance += 5;
        if (this.hasTag(legion, "divine blood")) baseChance -= 5;

        const currentMorale = legion.getFlag("battle-of-mytros", "stats")?.morale ?? 5;
        const finalTarget = Math.max(1, baseChance - currentMorale);

        const roll1 = await new Roll("1d100").evaluate();
        let finalRoll = roll1.total;

        if (this.hasTag(legion, "unbreakable pact")) {
            const roll2 = await new Roll("1d100").evaluate();
            this.battleState.log.push({ text: `${side} Unbreakable Pact: rolled ${roll1.total} & ${roll2.total}` });
            finalRoll = Math.min(roll1.total, roll2.total);
        }

        const died = finalRoll <= finalTarget;
        const cmdrMods = [];
        if (this.hasTag(this.battleState[enemySide], "headhunter")) cmdrMods.push("Headhunter (enemy): +5%");
        if (this.hasTag(legion, "divine blood")) cmdrMods.push("Divine Blood: −5%");
        if (this.hasTag(legion, "unbreakable pact")) cmdrMods.push("Unbreakable Pact: best of 2");

        results[side] = { baseChance, finalTarget, finalRoll, died, commanderName: commander.name };
        this.battleState.log.push({
            text: `${side} Commander (${commander.name}): ${finalRoll} vs ${finalTarget}% — ${died ? "FALLS IN BATTLE" : "SURVIVES"}`,
            mods: cmdrMods.length ? { [side]: cmdrMods } : undefined,
        });
    }

    this.battleState.commanderResult = results;
    this.battleState.phase = "done";
    this.render();
}

export async function commitAftermath(_event, _target) {
    const statsCopy = {};
    for (const side of ["allied", "sydon"]) {
        statsCopy[side] = { ...this.battleState[side].getFlag("battle-of-mytros", "stats") };
    }

    // Recovery injuries
    for (const side of ["allied", "sydon"]) {
        if (this.battleState.recoveryResult?.[side]) {
            statsCopy[side].injuries = (statsCopy[side].injuries || 0) + this.battleState.recoveryResult[side].injuries;
        }
    }

    // Hope morale changes
    for (const side of ["allied", "sydon"]) {
        if (this.battleState.hopeResult?.[side]) {
            statsCopy[side].morale = (statsCopy[side].morale ?? 5) + this.battleState.hopeResult[side].moraleDelta;
        }
    }

    // Salvage benefits
    for (const side of ["allied", "sydon"]) {
        const enemySide = side === "allied" ? "sydon" : "allied";
        for (const benefit of this.battleState.salvageBenefits?.[side] || []) {
            if (benefit === "captured_supplies") {
                statsCopy[side].injuries = Math.max(0, (statsCopy[side].injuries || 0) - 1);
                this.battleState.log.push({ text: `${side} Captured Supplies: removed 1 injury.` });
            }
            if (benefit === "enemy_shaken") {
                statsCopy[enemySide].morale = (statsCopy[enemySide].morale ?? 5) - 1;
                this.battleState.log.push({ text: `${side} Enemy Shaken: ${enemySide} loses 1 Morale.` });
            }
            if (benefit === "tactical_insight") {
                const tacRoll = await new Roll("1d2").evaluate();
                await this.battleState[side].setFlag("battle-of-mytros", "tacInsightBonus", tacRoll.total);
                this.battleState.log.push({
                    text: `${side} Tactical Insight: +${tacRoll.total} to Wit rolls next round.`,
                });
            }
            if (benefit === "quick_fortify") {
                await this.region.setFlag("battle-of-mytros", "fortified", true);
                await this.region.setFlag("battle-of-mytros", "control", side);
                this.battleState.log.push({ text: `${side} Quick Fortify: section is now fortified.` });
            }
        }
    }

    // Commander death: -1 morale, clear commanderId
    for (const side of ["allied", "sydon"]) {
        if (this.battleState.commanderResult?.[side]?.died) {
            statsCopy[side].morale = (statsCopy[side].morale ?? 5) - 1;
            await this.battleState[side].setFlag("battle-of-mytros", "commanderId", null);
            this.battleState.log.push({ text: `${side} commander lost — 1 Morale penalty applied.` });
        }
    }

    // Clamp: Relentless min 2, others min 0, max maxMorale
    const maxMorale = game.settings.get("battle-of-mytros", "maxMorale") ?? 10;
    for (const side of ["allied", "sydon"]) {
        const minMorale = this.hasTag(this.battleState[side], "relentless") ? 2 : 0;
        statsCopy[side].morale = Math.min(maxMorale, Math.max(minMorale, statsCopy[side].morale ?? 5));
        statsCopy[side].injuries = Math.max(0, statsCopy[side].injuries || 0);
    }

    // Write stats to actors
    for (const side of ["allied", "sydon"]) {
        await this.battleState[side].setFlag("battle-of-mytros", "stats", statsCopy[side]);
    }

    // Persist rout / destruction flags and build chat card status data
    const statusData = {};
    for (const side of ["allied", "sydon"]) {
        const s = statsCopy[side];
        const baseDestroy = game.settings.get("battle-of-mytros", "destroyThreshold") ?? 6;
        const destroyAt = this.hasTag(this.battleState[side], "bulwark") ? baseDestroy + 1 : baseDestroy;
        if (s.injuries >= destroyAt) {
            this.battleState.log.push({
                text: `⚠ ${side} LEGION DESTROYED (${s.injuries} injuries)!`,
                type: side === "allied" ? "allied-loss" : "sydon-loss",
            });
            await this.battleState[side].setFlag("battle-of-mytros", "isDestroyed", true);
            await this.battleState[side].setFlag("battle-of-mytros", "isRouted", false);
            statusData[side] = { text: "LEGION DESTROYED", type: "destroyed" };
        } else if (s.morale <= 0) {
            this.battleState.log.push({
                text: `⚠ ${side} LEGION ROUTED (0 Morale)!`,
                type: side === "allied" ? "allied-loss" : "sydon-loss",
            });
            await this.battleState[side].setFlag("battle-of-mytros", "isRouted", true);
            statusData[side] = { text: "LEGION ROUTED", type: "routed" };
        } else {
            this.battleState.log.push({ text: `${side} final: Injuries ${s.injuries}, Morale ${s.morale}` });
            await this.battleState[side].setFlag("battle-of-mytros", "isRouted", false);
            statusData[side] = null;
        }
    }

    // Update section control to the winner; clear fortification if it changes hands
    const currentControl = this.region.getFlag("battle-of-mytros", "control");
    if (currentControl !== this.battleState.overallWinner) {
        await this.region.setFlag("battle-of-mytros", "control", this.battleState.overallWinner);
        await this.region.setFlag("battle-of-mytros", "fortified", false);
        this.battleState.log.push({
            text: `${this.battleState.overallWinner} claims the section. Fortification lost.`,
        });
    } else {
        this.battleState.log.push({ text: `${this.battleState.overallWinner} holds the section.` });
    }

    // Mark both legions as having fought this round
    for (const side of ["allied", "sydon"]) {
        await this.battleState[side].setFlag("battle-of-mytros", "foughtThisRound", true);
    }

    // Roll death toll for this engagement and add to running total
    const alliedWon = this.battleState.overallWinner === "allied";
    const deathDie = await new Roll(alliedWon ? "1d4" : "1d6").evaluate();
    const deathMult = alliedWon
        ? game.settings.get("battle-of-mytros", "deathMultAllied") ?? 10
        : game.settings.get("battle-of-mytros", "deathMultSydon") ?? 50;
    const deathsThisBattle = deathDie.total * deathMult;
    const currentToll = game.settings.get("battle-of-mytros", "deathToll");
    await game.settings.set("battle-of-mytros", "deathToll", currentToll + deathsThisBattle);

    // Post chat card
    await this._postChatCard(statsCopy, statusData, deathsThisBattle);

    this.battleState.phase = "complete";
    this.render();
}

