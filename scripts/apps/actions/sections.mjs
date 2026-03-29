/**
 * Section and adjacency action handlers.
 */

export async function toggleSectionFlag(event, target) {
    const regionId = target.dataset.regionId;
    const flagName = target.dataset.flag;
    const region = canvas.scene.regions.get(regionId);
    if (!region) return;

    const current = region.getFlag("battle-of-mytros", flagName);
    await region.setFlag("battle-of-mytros", flagName, !current);
}

export async function setSectionControl(event, target) {
    const regionId = target.dataset.regionId;
    const control = target.value;
    const region = canvas.scene.regions.get(regionId);
    if (!region) return;

    await region.setFlag("battle-of-mytros", "control", control);
}

export async function addAdjacencyPair(_event, target) {
    if (!game.user.isGM) return;
    const form = target.closest(".setup-form");
    const aId = form.querySelector("[data-ref='adjA']").value;
    const bId = form.querySelector("[data-ref='adjB']").value;
    if (!aId || !bId || aId === bId) {
        ui.notifications.warn("Select two different sections.");
        return;
    }
    const pairs = JSON.parse(game.settings.get("battle-of-mytros", "adjacencyPairs") || "[]");
    const already = pairs.some(([a, b]) => (a === aId && b === bId) || (a === bId && b === aId));
    if (already) {
        ui.notifications.warn("That pair already exists.");
        return;
    }
    pairs.push([aId, bId]);
    await game.settings.set("battle-of-mytros", "adjacencyPairs", JSON.stringify(pairs));
    this.render();
}

export async function removeAdjacencyPair(_event, target) {
    if (!game.user.isGM) return;
    const index = Number(target.dataset.index);
    const pairs = JSON.parse(game.settings.get("battle-of-mytros", "adjacencyPairs") || "[]");
    pairs.splice(index, 1);
    await game.settings.set("battle-of-mytros", "adjacencyPairs", JSON.stringify(pairs));
    this.render();
}
