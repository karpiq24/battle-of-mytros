export class MytrosActorData {
    static MODULE_ID = "battle-of-mytros";

    static isLegion(actor) {
        return actor.getFlag(this.MODULE_ID, "isLegion") === true;
    }

    static isCommander(actor) {
        return actor.getFlag(this.MODULE_ID, "isCommander") === true;
    }

    static async initLegion(actor, faction = "allied") {
        await actor.setFlag(this.MODULE_ID, "isLegion", true);
        await actor.setFlag(this.MODULE_ID, "stats", {
            vitality: 10,
            morale: 10,
            wit: 10,
            injuries: 0
        });
        await actor.setFlag(this.MODULE_ID, "faction", faction); // "allied" or "sydon"
        await actor.setFlag(this.MODULE_ID, "commanderId", null);
    }

    static async initCommander(actor) {
        await actor.setFlag(this.MODULE_ID, "isCommander", true);
        // Tags will be standard items with a specific flag
    }
}
