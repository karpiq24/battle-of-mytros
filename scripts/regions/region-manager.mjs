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

    // Initialize module flags on a region if they don't exist
    static async initSectionFlags(region) {
        if (region.getFlag(this.MODULE_ID, "initialized")) return;
        
        await region.setFlag(this.MODULE_ID, "initialized", true);
        await region.setFlag(this.MODULE_ID, "control", "neutral"); // allied, sydon, neutral
        await region.setFlag(this.MODULE_ID, "fortified", false);
        await region.setFlag(this.MODULE_ID, "hasObjective", false);
    }
}
