/**
 * Shared helper methods for the BattleResolverApp.
 * These are mixed into the resolver instance's prototype.
 */

export function _buildModSummary(mods, extras = []) {
    const parts = [...(mods.descriptions || [])];
    if (extras.length) parts.push(...extras);
    return parts;
}

export function hasTag(legion, tagName) {
    if (!legion) return false;
    const commanderId = legion.getFlag("battle-of-mytros", "commanderId");
    const commander = commanderId ? game.actors.get(commanderId) : null;
    if (!commander) return false;
    return commander.items.some((i) => i.name.toLowerCase() === tagName.toLowerCase());
}

export function getCommander(legion) {
    if (!legion) return null;
    const commanderId = legion.getFlag("battle-of-mytros", "commanderId");
    return commanderId ? game.actors.get(commanderId) : null;
}

export function getSupportBonuses(faction, phase) {
    const supportUnits = globalThis.MytrosRegionManager.getSupportUnitsInSection(this.region).filter(
        (t) => t.actor.getFlag("battle-of-mytros", "faction") === faction
    );

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

export function getSupportBonusesAftermath(faction) {
    const supportUnits = globalThis.MytrosRegionManager.getSupportUnitsInSection(this.region).filter(
        (t) => t.actor.getFlag("battle-of-mytros", "faction") === faction
    );

    let dice = [];
    for (const t of supportUnits) {
        const mode = t.getFlag("battle-of-mytros", "deploymentMode");
        if (mode === "reinforce") dice.push("1d4");
        if (mode === "shield_the_wounded") dice.push("1d8");
    }
    return { dice };
}

export function _computeDivineBloodPending() {
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

export function _computeAdjacencyContext() {
    const adjacentIds = globalThis.MytrosRegionManager.getAdjacentSections(this.region.id);
    if (!adjacentIds.length) return { adjacentWarden: false, adjacentRallier: false };

    const adjacentSections = globalThis.MytrosRegionManager.getActiveSections().filter((r) =>
        adjacentIds.includes(r.id)
    );

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

export function _nextPhaseAfterSalvage() {
    const pending = this._computeDivineBloodPending();
    if (pending.allied || pending.sydon) {
        this.state.divineBloodPending = pending;
        this.state.divineBloodSalvageNeedChoice = { allied: 0, sydon: 0 };
        return "aftermath_divine_blood";
    }
    return "aftermath_commander";
}
