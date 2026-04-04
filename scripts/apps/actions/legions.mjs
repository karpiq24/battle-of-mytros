import { promptInput } from "./data-io.mjs";

/**
 * Legion management action handlers.
 */

export async function toggleLegionFlag(event, target) {
    if (!game.user.isGM) return;
    const legionId = target.dataset.legionId;
    const flag = target.dataset.flag;
    const actor = game.actors.get(legionId);
    if (!actor) return;

    const current = actor.getFlag("battle-of-mytros", flag);
    await actor.setFlag("battle-of-mytros", flag, !current);
}

export async function createLegion(_event, _target) {
    if (!game.user.isGM) return;
    const name = await promptInput(
        game.i18n.localize("MYTROS.CreateLegionTitle"),
        game.i18n.localize("MYTROS.CreateLegionHint")
    );
    if (!name) return;

    let actor = game.actors.getName(name);
    if (actor) {
        await globalThis.MytrosActorData.initLegion(actor, "allied");
        ui.notifications.info(`Existing actor "${name}" converted to Allied Legion.`);
    } else {
        await globalThis.MytrosActorData.createLegionActor(name, "allied");
        ui.notifications.info(`Legion "${name}" created.`);
    }
    this.render();
}

export async function updateLegionStat(_event, target) {
    if (!game.user.isGM) return;
    const legionId = target.dataset.legionId;
    const stat = target.dataset.stat;
    const value = Number(target.value);
    const actor = game.actors.get(legionId);
    if (!actor) return;
    const stats = { ...actor.getFlag("battle-of-mytros", "stats") };
    stats[stat] = value;
    this._pendingOps++;
    try {
        await actor.setFlag("battle-of-mytros", "stats", stats);
    } finally {
        this._pendingOps = Math.max(0, this._pendingOps - 1);
        if (this._pendingOps === 0) this.render();
    }
}

export async function updateLegionFaction(_event, target) {
    if (!game.user.isGM) return;
    const legionId = target.dataset.legionId;
    const faction = target.value;
    const actor = game.actors.get(legionId);
    if (!actor) return;
    if ((actor.getFlag("battle-of-mytros", "faction") || "allied") === faction) return;
    await actor.setFlag("battle-of-mytros", "faction", faction);
    this.render();
}

export async function deleteLegion(_event, target) {
    if (!game.user.isGM) return;
    const legionId = target.dataset.legionId;
    const actor = game.actors.get(legionId);
    if (!actor) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("MYTROS.DeleteLegionTitle") },
        content: `<p>${game.i18n.localize("MYTROS.DeleteLegionConfirm")} <strong>${actor.name}</strong>?</p>`,
        rejectClose: false,
    });
    if (!confirmed) return;
    await actor.delete();
    ui.notifications.info(`Legion "${actor.name}" deleted.`);
    this.render();
}

export async function toggleLegionDestroyed(_event, target) {
    if (!game.user.isGM) return;
    const legionId = target.dataset.legionId;
    const actor = game.actors.get(legionId);
    if (!actor) return;
    const current = actor.getFlag("battle-of-mytros", "isDestroyed");
    await actor.setFlag("battle-of-mytros", "isDestroyed", !current);
    this.render();
}

export async function toggleLegionRouted(_event, target) {
    if (!game.user.isGM) return;
    const legionId = target.dataset.legionId;
    const actor = game.actors.get(legionId);
    if (!actor) return;
    const current = actor.getFlag("battle-of-mytros", "isRouted");
    await actor.setFlag("battle-of-mytros", "isRouted", !current);
    this.render();
}

export async function assignCommander(event, target) {
    const legionId = target.dataset.legionId;
    const commanderId = target.value || null;
    const legion = game.actors.get(legionId);
    if (!legion) return;
    if ((legion.getFlag("battle-of-mytros", "commanderId") ?? null) === commanderId) return;
    await legion.setFlag("battle-of-mytros", "commanderId", commanderId);
}
