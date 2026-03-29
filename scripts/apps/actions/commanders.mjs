import { KNOWN_TAGS } from "../constants.mjs";
import { promptInput } from "./data-io.mjs";

/**
 * Commander management action handlers.
 */

export async function createCommander(_event, _target) {
    if (!game.user.isGM) return;
    const name = await promptInput(
        game.i18n.localize("MYTROS.CreateCommanderTitle"),
        game.i18n.localize("MYTROS.CreateCommanderHint")
    );
    if (!name) return;

    let actor = game.actors.getName(name);
    if (actor) {
        await globalThis.MytrosActorData.initCommander(actor);
        ui.notifications.info(`Existing actor "${name}" designated as a Commander.`);
    } else {
        await globalThis.MytrosActorData.createCommanderActor(name);
        ui.notifications.info(`Commander "${name}" created.`);
    }
    this.render();
}

export async function deleteCommander(_event, target) {
    if (!game.user.isGM) return;
    const commanderId = target.dataset.commanderId;
    const actor = game.actors.get(commanderId);
    if (!actor) return;
    const confirmed = await Dialog.confirm({
        title: game.i18n.localize("MYTROS.DeleteCommanderTitle"),
        content: `<p>${game.i18n.localize("MYTROS.DeleteCommanderConfirm")} <strong>${actor.name}</strong>?</p>`,
    });
    if (!confirmed) return;
    await actor.delete();
    ui.notifications.info(`Commander "${actor.name}" deleted.`);
    this.render();
}

export async function addCommanderTag(_event, target) {
    if (!game.user.isGM) return;
    const commanderId = target.dataset.commanderId;
    const actor = game.actors.get(commanderId);
    if (!actor) return;

    // Show a dialog with known tags to pick from
    const existingTags = actor.items.map((i) => i.name.toLowerCase());
    const available = KNOWN_TAGS.filter((t) => !existingTags.includes(t.toLowerCase()));
    if (available.length === 0) {
        ui.notifications.info("All known tags are already on this commander.");
        return;
    }

    const options = available.map((t) => `<option value="${t}">${t}</option>`).join("");
    const content = `
        <form>
            <div class="form-group">
                <label>${game.i18n.localize("MYTROS.SelectTag")}</label>
                <select name="tag">${options}</select>
            </div>
        </form>
    `;
    const result = await Dialog.prompt({
        title: game.i18n.localize("MYTROS.AddTagTitle"),
        content,
        callback: (html) => html.find('[name="tag"]').val(),
        rejectClose: false,
    });
    if (!result) return;

    await globalThis.MytrosActorData.ensureTagItems(actor, [result]);
    ui.notifications.info(`Tag "${result}" added to ${actor.name}.`);
    this.render();
}

export async function removeCommanderTag(_event, target) {
    if (!game.user.isGM) return;
    const commanderId = target.dataset.commanderId;
    const itemId = target.dataset.itemId;
    const actor = game.actors.get(commanderId);
    if (!actor) return;
    const item = actor.items.get(itemId);
    if (!item) return;
    await item.delete();
    this.render();
}
