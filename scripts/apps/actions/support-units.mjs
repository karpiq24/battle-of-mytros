import { promptInput } from "./data-io.mjs";

/**
 * Support unit (fast response) management action handlers.
 */

export async function createFastResponse(_event, _target) {
    if (!game.user.isGM) return;
    const name = await promptInput(
        game.i18n.localize("MYTROS.CreateSupportTitle"),
        game.i18n.localize("MYTROS.CreateSupportHint")
    );
    if (!name) return;

    const factionOptions = `
        <option value="allied">${game.i18n.localize("MYTROS.ControlAllied")}</option>
        <option value="sydon">${game.i18n.localize("MYTROS.ControlSydon")}</option>
    `;
    const faction = await Dialog.prompt({
        title: game.i18n.localize("MYTROS.CreateSupportTitle"),
        content: `
            <form>
                <div class="form-group">
                    <label>${game.i18n.localize("MYTROS.ColFaction")}</label>
                    <select name="faction">${factionOptions}</select>
                </div>
            </form>
        `,
        callback: (html) => html.find('[name="faction"]').val(),
        rejectClose: false,
    });
    if (!faction) return;

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
