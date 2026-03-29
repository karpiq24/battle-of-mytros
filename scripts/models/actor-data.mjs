export class MytrosActorData {
    static MODULE_ID = "battle-of-mytros";

    static isLegion(actor) {
        return actor.getFlag(this.MODULE_ID, "isLegion") === true;
    }

    static isCommander(actor) {
        return actor.getFlag(this.MODULE_ID, "isCommander") === true;
    }

    static isFastResponse(actor) {
        return actor.hasPlayerOwner === true || actor.getFlag(this.MODULE_ID, "isFastResponse") === true;
    }

    static async initFastResponse(actor) {
        await actor.setFlag(this.MODULE_ID, "isFastResponse", true);
    }

    /**
     * Normalize faction string to canonical "allied" or "sydon".
     */
    static normalizeFaction(raw) {
        if (!raw) return "allied";
        const lower = raw.trim().toLowerCase();
        if (["sydon", "enemy"].includes(lower)) return "sydon";
        return "allied";
    }

    static async initLegion(actor, faction = "allied") {
        const normalizedFaction = this.normalizeFaction(faction);
        await actor.setFlag(this.MODULE_ID, "isLegion", true);
        await actor.setFlag(this.MODULE_ID, "stats", {
            vitality: 4,
            morale: 4,
            wit: 4,
            injuries: 0,
        });
        await actor.setFlag(this.MODULE_ID, "faction", normalizedFaction);
        await actor.setFlag(this.MODULE_ID, "commanderId", null);
    }

    static async initCommander(actor) {
        await actor.setFlag(this.MODULE_ID, "isCommander", true);
    }

    /**
     * Find or create a folder in the Actors sidebar.
     */
    static async getOrCreateFolder(name, parent = null) {
        const existing = game.folders.find(
            (f) => f.type === "Actor" && f.name === name && (parent ? f.folder?.id === parent.id : !f.folder)
        );
        if (existing) return existing;
        return Folder.create({
            name,
            type: "Actor",
            folder: parent?.id ?? null,
        });
    }

    /**
     * Create a new legion actor in the proper folder.
     */
    static async createLegionActor(name, faction = "allied") {
        const rootFolder = await this.getOrCreateFolder("Battle of Mytros");
        const legionFolder = await this.getOrCreateFolder("Legions", rootFolder);
        const actor = await Actor.create({
            name,
            type: "group",
            folder: legionFolder.id,
        });
        await this.initLegion(actor, faction);
        return actor;
    }

    /**
     * Create a new commander actor in the proper folder.
     */
    static async createCommanderActor(name) {
        const rootFolder = await this.getOrCreateFolder("Battle of Mytros");
        const cmdrFolder = await this.getOrCreateFolder("Commanders", rootFolder);
        const actor = await Actor.create({
            name,
            type: "npc",
            folder: cmdrFolder.id,
        });
        await this.initCommander(actor);
        return actor;
    }

    /**
     * Ensure tag Items exist on a commander actor. Creates missing ones.
     */
    static async ensureTagItems(actor, tagNames) {
        const existingTags = actor.items.map((i) => i.name.toLowerCase());
        const toCreate = tagNames.filter((t) => !existingTags.includes(t.toLowerCase()));
        if (toCreate.length === 0) return 0;

        const itemData = toCreate.map((tag) => ({
            name: tag
                .split(" ")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(" "),
            type: "loot",
        }));

        await actor.createEmbeddedDocuments("Item", itemData);
        return toCreate.length;
    }
}
