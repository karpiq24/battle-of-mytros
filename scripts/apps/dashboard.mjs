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
        position: { width: 800, height: 600 },
        actions: {
            changeTab: BattleDashboard.changeTab,
            updateSetting: BattleDashboard.updateSetting,
            toggleSectionFlag: BattleDashboard.toggleSectionFlag,
            setSectionControl: BattleDashboard.setSectionControl
        }
    };

    tab = "overview";

    static changeTab(event, target) {
        this.tab = target.dataset.tab;
        this.render();
    }

    static async updateSetting(event, target) {
        const settingName = target.dataset.setting;
        const isNumeric = target.type === "number";
        let value = isNumeric ? Number(target.value) : target.value;
        await game.settings.set("battle-of-mytros", settingName, value);
        this.render();
    }

    static async toggleSectionFlag(event, target) {
        const regionId = target.dataset.regionId;
        const flagName = target.dataset.flag;
        const region = canvas.scene.regions.get(regionId);
        if (!region) return;

        const current = region.getFlag("battle-of-mytros", flagName);
        await region.setFlag("battle-of-mytros", flagName, !current);
    }

    static async setSectionControl(event, target) {
        const regionId = target.dataset.regionId;
        const control = target.value;
        const region = canvas.scene.regions.get(regionId);
        if (!region) return;

        await region.setFlag("battle-of-mytros", "control", control);
    }

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
        
        context.tab = this.tab;
        context.deathToll = game.settings.get("battle-of-mytros", "deathToll");
        context.alliedMiracles = game.settings.get("battle-of-mytros", "alliedMiracles");
        context.sydonMiracles = game.settings.get("battle-of-mytros", "sydonMiracles");

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
