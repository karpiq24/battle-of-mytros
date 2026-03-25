const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BattleDashboard extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "mytros-battle-dashboard",
        title: "Battle of Mytros Dashboard",
        tag: "form",
        window: {
            icon: "fas fa-swords",
            resizable: true
        },
        position: {
            width: 800,
            height: 600
        }
    };

    static PARTS = {
        form: {
            template: "modules/battle-of-mytros/templates/dashboard.hbs"
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.isGM = game.user.isGM;
        context.round = game.settings.get("battle-of-mytros", "currentRound");
        context.phase = game.settings.get("battle-of-mytros", "currentPhase");
        
        // Grab regions if we are on the battle scene
        const battleSceneId = game.settings.get("battle-of-mytros", "battleSceneId");
        context.isBattleScene = canvas.scene?.id === battleSceneId;

        if (context.isBattleScene) {
            const sections = globalThis.MytrosRegionManager.getActiveSections();
            context.sections = sections.map(r => {
                const legions = globalThis.MytrosRegionManager.getLegionsInSection(r);
                return {
                    id: r.id,
                    name: r.name.replace(globalThis.MytrosRegionManager.SECTION_PREFIX, "").trim(),
                    control: r.getFlag("battle-of-mytros", "control"),
                    fortified: r.getFlag("battle-of-mytros", "fortified"),
                    hasObjective: r.getFlag("battle-of-mytros", "hasObjective"),
                    legions: legions.map(t => ({
                        name: t.name,
                        faction: t.actor.getFlag("battle-of-mytros", "faction")
                    }))
                };
            });
        } else {
            context.sections = [];
        }

        return context;
    }
}
