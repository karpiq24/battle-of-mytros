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
    await game.settings.set("battle-of-mytros", settingName, value);
    this.render();
}

export function changeTab(event, target) {
    this.tab = target.dataset.tab;
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
