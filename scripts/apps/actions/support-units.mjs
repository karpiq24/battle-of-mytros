/**
 * Support unit (fast response) management action handlers.
 */

export async function createFastResponse(_event, _target) {
    if (!game.user.isGM) return;

    const title = game.i18n.localize("MYTROS.CreateSupportTitle");
    const result = await foundry.applications.api.DialogV2.prompt({
        window: { title, icon: "fas fa-users" },
        content: `
            <form>
                <div class="form-group">
                    <label>${game.i18n.localize("MYTROS.CreateSupportHint")}</label>
                    <input type="text" name="name" autofocus>
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize("MYTROS.ColFaction")}</label>
                    <select name="faction">
                        <option value="allied">${game.i18n.localize("MYTROS.ControlAllied")}</option>
                        <option value="sydon">${game.i18n.localize("MYTROS.ControlSydon")}</option>
                    </select>
                </div>
            </form>
        `,
        ok: {
            label: game.i18n.localize("MYTROS.Confirm") || "OK",
            icon: "fas fa-check",
            callback: (_event, button) => ({
                name: button.form.elements.name.value.trim(),
                faction: button.form.elements.faction.value,
            }),
        },
        rejectClose: false,
    });
    if (!result?.name) return;
    const { name, faction } = result;

    let actor = game.actors.getName(name);
    if (actor) {
        await globalThis.MytrosActorData.initFastResponse(actor, faction);
        ui.notifications.info(`Existing actor "${name}" designated as a Support Unit.`);
    } else {
        await globalThis.MytrosActorData.createFastResponseActor(name, faction);
        ui.notifications.info(`Support Unit "${name}" created.`);
    }
    this.render();
}

export async function removeFastResponse(_event, target) {
    if (!game.user.isGM) return;
    const actorId = target.dataset.actorId;
    const actor = game.actors.get(actorId);
    if (!actor) return;
    await actor.unsetFlag("battle-of-mytros", "isFastResponse");
    ui.notifications.info(`"${actor.name}" removed from Support Units.`);
    this.render();
}

export async function updateFastResponseFaction(_event, target) {
    if (!game.user.isGM) return;
    const actorId = target.dataset.actorId;
    const faction = target.value;
    const actor = game.actors.get(actorId);
    if (!actor) return;
    await actor.setFlag("battle-of-mytros", "faction", faction);
    this.render();
}
