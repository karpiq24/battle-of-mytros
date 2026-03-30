import { STRATEGIC_OBJECTIVES, MAJOR_EVENTS } from "../constants.mjs";

/**
 * Data import/export, settings, tab navigation, and shared UI helpers.
 */

export async function importCSV(event, target) {
    const type = target.dataset.type; // 'legion' or 'commander'
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            await globalThis.MytrosCSVParser.processCSV(ev.target.result, type);
            this.render();
        };
        reader.readAsText(file);
    };
    input.click();
}

export async function exportCSV(event, target) {
    const type = target.dataset.type;
    if (type === "legion") await globalThis.MytrosCSVParser.exportLegions();
    else if (type === "commander") await globalThis.MytrosCSVParser.exportCommanders();
}

export async function updateSetting(event, target) {
    const settingName = target.dataset.setting;
    let value;
    if (target.type === "number") value = Number(target.value);
    else if (target.type === "checkbox") value = target.checked;
    else value = target.value;

    // Save focus state so _onRender can restore it after the hook-triggered re-render
    this._focusedSetting = settingName;
    this._focusedSelectionStart = target.selectionStart;
    this._focusedSelectionEnd = target.selectionEnd;

    this._pendingOps++;
    try {
        await game.settings.set("battle-of-mytros", settingName, value);
    } finally {
        this._pendingOps = Math.max(0, this._pendingOps - 1);
        if (this._pendingOps === 0) this.render();
    }
}

export function changeTab(event, target) {
    this.tab = target.dataset.tab;
    if (this._pendingOps > 0) return;
    this.render();
}

/**
 * Simple text input prompt via Foundry Dialog.
 */
export async function promptInput(title, label) {
    const content = `<div class="form-group"><label>${label}</label><input type="text" name="value" autofocus></div>`;

    if (foundry.applications?.api?.DialogV2) {
        return foundry.applications.api.DialogV2.prompt({
            window: { title },
            content: `<form>${content}</form>`,
            ok: {
                label: "OK",
                icon: "fas fa-check",
                callback: (event, button) => button.form.elements.value.value.trim() || null,
            },
            rejectClose: false,
        });
    }

    return new Promise((resolve) => {
        new Dialog({
            title,
            content: `<form>${content}</form>`,
            buttons: {
                ok: {
                    label: "OK",
                    icon: '<i class="fas fa-check"></i>',
                    callback: (html) => resolve(html.find('[name="value"]').val()?.trim() || null),
                },
                cancel: {
                    label: "Cancel",
                    icon: '<i class="fas fa-times"></i>',
                    callback: () => resolve(null),
                },
            },
            default: "ok",
        }).render(true);
    });
}

/**
 * Prompt for a name + reward and return {id, name, reward} or null.
 */
async function promptNameReward(title) {
    const content = `<form>
        <div class="form-group"><label>${game.i18n.localize("MYTROS.ConfigName")}</label><input type="text" name="name" autofocus></div>
        <div class="form-group"><label>${game.i18n.localize("MYTROS.ConfigReward")}</label><input type="number" name="reward" value="2" min="0"></div>
    </form>`;

    if (foundry.applications?.api?.DialogV2) {
        return foundry.applications.api.DialogV2.prompt({
            window: { title },
            content,
            ok: {
                label: "OK",
                icon: "fas fa-check",
                callback: (event, button) => {
                    const name = button.form.elements.name.value.trim();
                    const reward = Number(button.form.elements.reward.value) || 0;
                    if (!name) return null;
                    return { id: name.toLowerCase().replace(/\s+/g, "_"), name, reward };
                },
            },
            rejectClose: false,
        });
    }

    return new Promise((resolve) => {
        new Dialog({
            title,
            content,
            buttons: {
                ok: {
                    label: "OK",
                    icon: '<i class="fas fa-check"></i>',
                    callback: (html) => {
                        const name = html.find('[name="name"]').val()?.trim();
                        const reward = Number(html.find('[name="reward"]').val()) || 0;
                        if (!name) return resolve(null);
                        resolve({ id: name.toLowerCase().replace(/\s+/g, "_"), name, reward });
                    },
                },
                cancel: {
                    label: "Cancel",
                    icon: '<i class="fas fa-times"></i>',
                    callback: () => resolve(null),
                },
            },
            default: "ok",
        }).render(true);
    });
}

// ── Strategic Objectives CRUD ────────────────────────────────────────────

export async function addObjective(_event, _target) {
    if (!game.user.isGM) return;
    const result = await promptNameReward(game.i18n.localize("MYTROS.AddObjectiveTitle"));
    if (!result) return;
    const objectives = JSON.parse(game.settings.get("battle-of-mytros", "strategicObjectives") || "[]");
    objectives.push(result);
    await game.settings.set("battle-of-mytros", "strategicObjectives", JSON.stringify(objectives));
    this.render();
}

export async function removeObjective(_event, target) {
    if (!game.user.isGM) return;
    const index = Number(target.dataset.index);
    const objectives = JSON.parse(game.settings.get("battle-of-mytros", "strategicObjectives") || "[]");
    objectives.splice(index, 1);
    await game.settings.set("battle-of-mytros", "strategicObjectives", JSON.stringify(objectives));
    this.render();
}

// ── Major Events CRUD ────────────────────────────────────────────────────

export async function addMajorEvent(_event, _target) {
    if (!game.user.isGM) return;
    const result = await promptNameReward(game.i18n.localize("MYTROS.AddEventTitle"));
    if (!result) return;
    const events = JSON.parse(game.settings.get("battle-of-mytros", "majorEvents") || "[]");
    events.push(result);
    await game.settings.set("battle-of-mytros", "majorEvents", JSON.stringify(events));
    this.render();
}

export async function removeMajorEvent(_event, target) {
    if (!game.user.isGM) return;
    const index = Number(target.dataset.index);
    const events = JSON.parse(game.settings.get("battle-of-mytros", "majorEvents") || "[]");
    events.splice(index, 1);
    await game.settings.set("battle-of-mytros", "majorEvents", JSON.stringify(events));
    this.render();
}

export async function resetObjectivesAndEvents(_event, _target) {
    if (!game.user.isGM) return;
    await game.settings.set("battle-of-mytros", "strategicObjectives", JSON.stringify(STRATEGIC_OBJECTIVES));
    await game.settings.set("battle-of-mytros", "majorEvents", JSON.stringify(MAJOR_EVENTS));
    ui.notifications.info("Objectives and events reset to defaults.");
    this.render();
}

// ── Reset Battle ─────────────────────────────────────────────────────────

export async function resetBattle(_event, _target) {
    if (!game.user.isGM) return;

    const confirmed = await Dialog.confirm({
        title: game.i18n.localize("MYTROS.ResetBattle"),
        content: `<p>${game.i18n.localize("MYTROS.ResetBattleConfirm")}</p>`,
    });
    if (!confirmed) return;

    const alliedPool = game.settings.get("battle-of-mytros", "alliedMiraclePool") ?? 8;
    const sydonPool = game.settings.get("battle-of-mytros", "sydonMiraclePool") ?? 10;

    // Reset all battle state settings
    await game.settings.set("battle-of-mytros", "currentRound", 1);
    await game.settings.set("battle-of-mytros", "currentPhase", 1);
    await game.settings.set("battle-of-mytros", "deathToll", 0);
    await game.settings.set("battle-of-mytros", "alliedMiracles", alliedPool);
    await game.settings.set("battle-of-mytros", "sydonMiracles", sydonPool);
    await game.settings.set("battle-of-mytros", "reconResult", "");
    await game.settings.set("battle-of-mytros", "reconBonus", 0);
    await game.settings.set("battle-of-mytros", "completedEvents", "[]");
    await game.settings.set("battle-of-mytros", "destroyedObjectives", "[]");
    await game.settings.set("battle-of-mytros", "deathTollFrozen", false);
    await game.settings.set("battle-of-mytros", "sydonObjectiveHalved", false);

    // Reset all legion actors
    const allLegions = game.actors.filter((a) => globalThis.MytrosActorData.isLegion(a));
    for (const legion of allLegions) {
        await legion.setFlag("battle-of-mytros", "stats", { vitality: 4, morale: 4, wit: 4, injuries: 0 });
        await legion.setFlag("battle-of-mytros", "isRouted", false);
        await legion.setFlag("battle-of-mytros", "isDestroyed", false);
        await legion.setFlag("battle-of-mytros", "foughtThisRound", false);
        await legion.setFlag("battle-of-mytros", "tacInsightBonus", null);
        await legion.setFlag("battle-of-mytros", "movedThree", null);
    }

    // Reset all battle scene regions
    const battleSceneId = game.settings.get("battle-of-mytros", "battleSceneId");
    if (canvas.scene?.id === battleSceneId) {
        const sections = globalThis.MytrosRegionManager.getActiveSections();
        for (const region of sections) {
            await region.setFlag("battle-of-mytros", "control", "neutral");
            await region.setFlag("battle-of-mytros", "fortified", false);
        }
    }

    ui.notifications.info("Battle state fully reset.");
    this.render();
}
