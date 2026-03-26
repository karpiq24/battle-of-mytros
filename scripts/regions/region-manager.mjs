import { MytrosActorData } from "../models/actor-data.mjs";

export class MytrosRegionManager {
    static MODULE_ID = "battle-of-mytros";
    static SECTION_PREFIX = "Section:";

    // Get all valid sections in the current scene
    static getActiveSections() {
        if (!canvas.ready || !canvas.scene) return [];
        const battleSceneId = game.settings.get(this.MODULE_ID, "battleSceneId");
        if (canvas.scene.id !== battleSceneId) return [];

        return canvas.scene.regions.filter(r => r.name.startsWith(this.SECTION_PREFIX));
    }

    static getLegionsInSection(region) {
        if (!region.tokens) return [];
        return Array.from(region.tokens).filter(token => {
            return token.actor && MytrosActorData.isLegion(token.actor);
        });
    }

    static getSupportUnitsInSection(region) {
        if (!region.tokens) return [];
        return Array.from(region.tokens).filter(t => {
            return t.actor && globalThis.MytrosActorData.isFastResponse(t.actor);
        });
    }

    static getAdjacentSections(regionId) {
        const pairs = JSON.parse(game.settings.get(this.MODULE_ID, "adjacencyPairs") || "[]");
        return pairs.flatMap(([a, b]) => a === regionId ? [b] : b === regionId ? [a] : []);
    }

    // Initialize module flags on a region if they don't exist
    static async initSectionFlags(region) {
        if (region.getFlag(this.MODULE_ID, "initialized")) return;
        
        await region.setFlag(this.MODULE_ID, "initialized", true);
        await region.setFlag(this.MODULE_ID, "control", "neutral"); // allied, sydon, neutral
        await region.setFlag(this.MODULE_ID, "fortified", false);
        await region.setFlag(this.MODULE_ID, "hasObjective", false);
    }
}
