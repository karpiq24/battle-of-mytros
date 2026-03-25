import { BattleResolverApp } from "./resolver.mjs";
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
            setSectionControl: BattleDashboard.setSectionControl,
            importCSV: BattleDashboard.importCSV,
            exportCSV: BattleDashboard.exportCSV,
            openResolver: BattleDashboard.openResolver,
            assignCommander: BattleDashboard.assignCommander
        }
    };

    tab = "overview";

    static async exportCSV(event, target) {
        const type = target.dataset.type;
        if (type === "legion") await globalThis.MytrosCSVParser.exportLegions();
        else if (type === "commander") await globalThis.MytrosCSVParser.exportCommanders();
    }

    static async openResolver(event, target) {
        const regionId = target.dataset.regionId;
        const region = canvas.scene.regions.get(regionId);
        if (region) {
            new BattleResolverApp(region).render({ force: true });
        }
    }

    static async assignCommander(event, target) {
        const legionId = target.dataset.legionId;
        const commanderId = target.value || null;
        const legion = game.actors.get(legionId);
        if (!legion) return;
        await legion.setFlag("battle-of-mytros", "commanderId", commanderId);
    }

    static changeTab(event, target) {
        this.tab = target.dataset.tab;
        this.render();
    }

    static async importCSV(event, target) {
        const type = target.dataset.type; // 'legion' or 'commander'
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                await globalThis.MytrosCSVParser.processCSV(ev.target.result, type);
            };
            reader.readAsText(file);
        };
        input.click();
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

        context.commanders = game.actors.filter(a => globalThis.MytrosActorData.isCommander(a)).map(a => ({
            id: a.id,
            name: a.name
        }));

        // Grab regions if we are on the battle scene
        const battleSceneId = game.settings.get("battle-of-mytros", "battleSceneId");
        context.isBattleScene = canvas.scene?.id === battleSceneId;

        if (context.isBattleScene) {
            const sections = globalThis.MytrosRegionManager.getActiveSections();
            context.sections = sections.map(r => {
                const legions = globalThis.MytrosRegionManager.getLegionsInSection(r);
                const mappedLegions = legions.map(t => ({
                    id: t.actor.id,
                    name: t.name,
                    faction: t.actor.getFlag("battle-of-mytros", "faction"),
                    commanderId: t.actor.getFlag("battle-of-mytros", "commanderId"),
                    commanderName: t.actor.getFlag("battle-of-mytros", "commanderId") ? 
                        game.actors.get(t.actor.getFlag("battle-of-mytros", "commanderId"))?.name : "None"
                }));
                
                const hasAllied = mappedLegions.some(l => l.faction === "allied");
                const hasSydon = mappedLegions.some(l => l.faction === "sydon");
                const pendingBattle = hasAllied && hasSydon;

                return {
                    id: r.id,
                    name: r.name.replace(globalThis.MytrosRegionManager.SECTION_PREFIX, "").trim(),
                    control: r.getFlag("battle-of-mytros", "control"),
                    fortified: r.getFlag("battle-of-mytros", "fortified"),
                    hasObjective: r.getFlag("battle-of-mytros", "hasObjective"),
                    legions: mappedLegions,
                    pendingBattle: pendingBattle
                };
            });
        } else {
            context.sections = [];
        }

        return context;
    }
}
