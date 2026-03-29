import { BattleResolverApp } from "./resolver.mjs";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BattleDashboard extends HandlebarsApplicationMixin(ApplicationV2) {
    static OBJECTIVE_MIRACLE_REWARDS = {
        "Temple of the Five": 2,
        "Royal Palace": 2,
        "The Dockyard": 1,
        "Soldier's Gate": 1,
        "The Agora": 1,
        "The Academy": 2,
        "The Gymnasium": 1,
        "The Harp Bridge": 1,
        "The Vineyards of Mytros": 1,
        "Fish Market & Commerce Gate": 1,
    };

    static MAJOR_EVENTS = [
        {
            id: "icarus",
            name: "Icarus Subdued or Calmed",
            reward: 2,
            description: "A dragon fights to protect the city rather than destroy it.",
            specialEffect: null,
        },
        {
            id: "acastus",
            name: "Acastus Redeemed",
            reward: 2,
            description: "Acastus hands over the Rod of Rulership. His captains stand down.",
            specialEffect: "acastus_redeemed",
        },
        {
            id: "colossus",
            name: "The Colossus Awakened",
            reward: 2,
            description: "The great guardian rises. Manually fortify the section it occupies.",
            specialEffect: null,
        },
        {
            id: "hergeron",
            name: "Hergeron Driven from the Temple",
            reward: 2,
            description: "Son of Sydon repelled from the Temple of the Five.",
            specialEffect: null,
        },
        {
            id: "sydon",
            name: "Sydon Defeated",
            reward: 2,
            description: "The Lord of Storms falls. Objective deaths halved for remaining rounds.",
            specialEffect: "sydon_defeated",
        },
        {
            id: "lutheria",
            name: "Lutheria Defeated",
            reward: 2,
            description: "Titan of Death gone. Subtracts 800 from the running Death Toll.",
            specialEffect: "lutheria_defeated",
        },
        {
            id: "kentimane",
            name: "Kentimane Defeated",
            reward: 2,
            description: "The Hundred-Handed One falls. Death Toll stops. The battle is over.",
            specialEffect: "kentimane_defeated",
        },
    ];

    /** All known commander tags used in the TagEngine */
    static KNOWN_TAGS = [
        "Tactician",
        "Fanatic",
        "Zealot",
        "Ironclad",
        "Inspiring",
        "Cunning",
        "Warden",
        "Vanguard",
        "Headhunter",
        "Mage",
        "Engineer",
        "Siege Breaker",
        "Medic",
        "Rallier",
        "Terrorizer",
        "Brutal",
        "Veteran",
        "Bulwark",
        "Divine Blood",
        "Unbreakable Pact",
        "Relentless",
    ];

    static DEFAULT_OPTIONS = {
        id: "mytros-battle-dashboard",
        title: "Battle of Mytros Dashboard",
        tag: "form",
        window: {
            icon: "fas fa-swords",
            resizable: true,
        },
        position: { width: 860, height: 650 },
        actions: {
            changeTab: BattleDashboard.changeTab,
            updateSetting: BattleDashboard.updateSetting,
            toggleSectionFlag: BattleDashboard.toggleSectionFlag,
            setSectionControl: BattleDashboard.setSectionControl,
            importCSV: BattleDashboard.importCSV,
            exportCSV: BattleDashboard.exportCSV,
            openResolver: BattleDashboard.openResolver,
            assignCommander: BattleDashboard.assignCommander,
            setDeploymentMode: BattleDashboard.setDeploymentMode,
            advanceRound: BattleDashboard.advanceRound,
            rollRecon: BattleDashboard.rollRecon,
            spendMiracle: BattleDashboard.spendMiracle,
            triggerMajorEvent: BattleDashboard.triggerMajorEvent,
            disbandRoutedLegions: BattleDashboard.disbandRoutedLegions,
            toggleLegionFlag: BattleDashboard.toggleLegionFlag,
            addAdjacencyPair: BattleDashboard.addAdjacencyPair,
            removeAdjacencyPair: BattleDashboard.removeAdjacencyPair,
            resetCompletedEvents: BattleDashboard.resetCompletedEvents,
            nextPhase: BattleDashboard.nextPhase,
            prevPhase: BattleDashboard.prevPhase,
            // ── Legions Tab ──
            createLegion: BattleDashboard.createLegion,
            updateLegionStat: BattleDashboard.updateLegionStat,
            updateLegionFaction: BattleDashboard.updateLegionFaction,
            deleteLegion: BattleDashboard.deleteLegion,
            toggleLegionDestroyed: BattleDashboard.toggleLegionDestroyed,
            toggleLegionRouted: BattleDashboard.toggleLegionRouted,
            // ── Commanders Tab ──
            createCommander: BattleDashboard.createCommander,
            deleteCommander: BattleDashboard.deleteCommander,
            addCommanderTag: BattleDashboard.addCommanderTag,
            removeCommanderTag: BattleDashboard.removeCommanderTag,
            autoCreateTags: BattleDashboard.autoCreateTags,
        },
    };

    static async toggleLegionFlag(event, target) {
        if (!game.user.isGM) return;
        const legionId = target.dataset.legionId;
        const flag = target.dataset.flag;
        const actor = game.actors.get(legionId);
        if (!actor) return;

        const current = actor.getFlag("battle-of-mytros", flag);
        await actor.setFlag("battle-of-mytros", flag, !current);
    }

    tab = "overview";

    static async rollRecon(_event, _target) {
        if (!game.user.isGM) return;

        const alliedLegions = game.actors.filter(
            (a) =>
                globalThis.MytrosActorData.isLegion(a) &&
                a.getFlag("battle-of-mytros", "faction") === "allied" &&
                !a.getFlag("battle-of-mytros", "isDestroyed")
        );

        const highestWit = alliedLegions.reduce((max, l) => {
            const wit = l.getFlag("battle-of-mytros", "stats")?.wit ?? 0;
            return Math.max(max, wit);
        }, 0);

        const roll = await new Roll("1d20").evaluate();
        const total = roll.total + highestWit;

        let intel, bonus;
        if (total <= 10) {
            intel = "No enemy movements revealed.";
            bonus = 0;
        } else if (total <= 14) {
            intel = "Learn the destination of 2 enemy legions.";
            bonus = 0;
        } else if (total <= 18) {
            intel = "Learn the destinations of up to half the enemy legions (rounded up).";
            bonus = 0;
        } else if (total <= 22) {
            intel = "Learn all enemy legion destinations.";
            bonus = 0;
        } else {
            intel = "Learn all enemy destinations. +1 to all allied Maneuver rolls this round!";
            bonus = 1;
        }

        const resultText = `1d20 (${roll.total}) + Wit ${highestWit} = ${total} — ${intel}`;
        await game.settings.set("battle-of-mytros", "reconResult", resultText);
        await game.settings.set("battle-of-mytros", "reconBonus", bonus);
        ui.notifications.info(`Recon: ${total} — ${intel}`);
        this.render();
    }

    static async spendMiracle(_event, target) {
        if (!game.user.isGM) return;
        const faction = target.dataset.faction;
        const cost = Number(target.dataset.cost);
        const settingKey = faction === "allied" ? "alliedMiracles" : "sydonMiracles";
        const current = game.settings.get("battle-of-mytros", settingKey);
        if (current < cost) {
            ui.notifications.warn(`Not enough ${faction} Miracle Points!`);
            return;
        }
        await game.settings.set("battle-of-mytros", settingKey, current - cost);
        this.render();
    }

    static async triggerMajorEvent(_event, target) {
        if (!game.user.isGM) return;
        const eventId = target.dataset.eventId;
        const event = BattleDashboard.MAJOR_EVENTS.find((e) => e.id === eventId);
        if (!event) return;

        const completed = JSON.parse(game.settings.get("battle-of-mytros", "completedEvents") || "[]");
        if (completed.includes(eventId)) return;
        completed.push(eventId);
        await game.settings.set("battle-of-mytros", "completedEvents", JSON.stringify(completed));

        const current = game.settings.get("battle-of-mytros", "alliedMiracles");
        await game.settings.set("battle-of-mytros", "alliedMiracles", current + event.reward);

        if (event.specialEffect === "acastus_redeemed") {
            const acastus = game.actors.find((a) => a.name.toLowerCase().includes("acastus"));
            if (acastus) {
                await acastus.setFlag("battle-of-mytros", "isCommander", true);
                ui.notifications.info(`Acastus has joined the battle as a Commander!`);
            } else {
                ui.notifications.warn(
                    `Acastus Redeemed: No actor named "Acastus" found. Add him manually as a Commander.`
                );
            }
        } else if (event.specialEffect === "sydon_defeated") {
            await game.settings.set("battle-of-mytros", "sydonObjectiveHalved", true);
        } else if (event.specialEffect === "lutheria_defeated") {
            const toll = game.settings.get("battle-of-mytros", "deathToll");
            await game.settings.set("battle-of-mytros", "deathToll", Math.max(0, toll - 800));
        } else if (event.specialEffect === "kentimane_defeated") {
            await game.settings.set("battle-of-mytros", "deathTollFrozen", true);
        }

        ui.notifications.info(`Major Event: ${event.name}! Allied Miracles +${event.reward}.`);
        this.render();
    }

    static async addAdjacencyPair(_event, target) {
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

    static async removeAdjacencyPair(_event, target) {
        if (!game.user.isGM) return;
        const index = Number(target.dataset.index);
        const pairs = JSON.parse(game.settings.get("battle-of-mytros", "adjacencyPairs") || "[]");
        pairs.splice(index, 1);
        await game.settings.set("battle-of-mytros", "adjacencyPairs", JSON.stringify(pairs));
        this.render();
    }

    static async disbandRoutedLegions(_event, target) {
        if (!game.user.isGM) return;
        const regionId = target.dataset.regionId;
        const region = canvas.scene.regions.get(regionId);
        if (!region) return;

        const legions = globalThis.MytrosRegionManager.getLegionsInSection(region);
        const routedLegions = legions.filter(
            (t) =>
                t.actor.getFlag("battle-of-mytros", "isRouted") && !t.actor.getFlag("battle-of-mytros", "isDestroyed")
        );

        for (const t of routedLegions) {
            await t.actor.setFlag("battle-of-mytros", "isDestroyed", true);
            await t.actor.setFlag("battle-of-mytros", "isRouted", false);
            await t.actor.setFlag("battle-of-mytros", "foughtThisRound", true);
        }

        const names = routedLegions.map((t) => t.actor.name).join(", ");
        const sectionName = region.name.replace(globalThis.MytrosRegionManager.SECTION_PREFIX, "").trim();

        const deathRoll = await new Roll(`${routedLegions.length}d6`).evaluate();
        const deaths = deathRoll.total * 50;
        if (!game.settings.get("battle-of-mytros", "deathTollFrozen")) {
            const current = game.settings.get("battle-of-mytros", "deathToll");
            await game.settings.set("battle-of-mytros", "deathToll", current + deaths);
        }

        await ChatMessage.create({
            content: `<div class="battle-chat-card"><h3>⚠ Routed Legion Overrun</h3><p><strong>${sectionName}</strong></p><p>${names} ${routedLegions.length === 1 ? "was" : "were"} disbanded — overrun while routed.</p><p>Civilian deaths: ${deaths}</p></div>`,
            speaker: { alias: "Battle of Mytros" },
        });

        ui.notifications.warn(`${names} disbanded in ${sectionName}.`);
        this.render();
    }

    static async advanceRound(_event, _target) {
        if (!game.user.isGM) return;
        const battleSceneId = game.settings.get("battle-of-mytros", "battleSceneId");
        if (canvas.scene?.id !== battleSceneId) return;

        const deathTollFrozen = game.settings.get("battle-of-mytros", "deathTollFrozen");
        const sydonObjectiveHalved = game.settings.get("battle-of-mytros", "sydonObjectiveHalved");

        const allLegions = game.actors.filter((a) => globalThis.MytrosActorData.isLegion(a));
        let totalDeaths = 0;

        // Passive recovery for unengaged legions; death toll for unengaged Sydon legions
        for (const legion of allLegions) {
            const fought = legion.getFlag("battle-of-mytros", "foughtThisRound");
            const faction = legion.getFlag("battle-of-mytros", "faction");
            const stats = { ...legion.getFlag("battle-of-mytros", "stats") };
            if (!stats) continue;

            // Skip destroyed legions entirely
            if (legion.getFlag("battle-of-mytros", "isDestroyed")) {
                await legion.setFlag("battle-of-mytros", "foughtThisRound", false);
                continue;
            }

            if (!fought) {
                const wasRouted = (stats.morale ?? 0) <= 0;
                const maxMorale = game.settings.get("battle-of-mytros", "maxMorale") ?? 10;
                stats.morale = Math.min(maxMorale, (stats.morale ?? 0) + 1);
                stats.injuries = Math.max(0, (stats.injuries || 0) - 1);
                await legion.setFlag("battle-of-mytros", "stats", stats);

                // Clear rout flag if morale recovered above 0
                if (wasRouted && stats.morale > 0) {
                    await legion.setFlag("battle-of-mytros", "isRouted", false);
                }

                if (faction === "sydon" && !deathTollFrozen) {
                    const r = await new Roll("1d6").evaluate();
                    totalDeaths += r.total * 50;
                }
            }

            await legion.setFlag("battle-of-mytros", "foughtThisRound", false);

            // Clear tactical insight bonus — it was valid for this round only
            if (legion.getFlag("battle-of-mytros", "tacInsightBonus")) {
                await legion.setFlag("battle-of-mytros", "tacInsightBonus", null);
            }

            // Clear movedThree flag
            if (legion.getFlag("battle-of-mytros", "movedThree")) {
                await legion.setFlag("battle-of-mytros", "movedThree", null);
            }
        }

        // Objective destruction tracking and per-round death toll
        const sections = globalThis.MytrosRegionManager.getActiveSections();
        for (const section of sections) {
            const hasObjective = section.getFlag("battle-of-mytros", "hasObjective");
            const objectiveDestroyed = section.getFlag("battle-of-mytros", "objectiveDestroyed");
            const control = section.getFlag("battle-of-mytros", "control");

            if (hasObjective && !objectiveDestroyed) {
                if (control === "sydon") {
                    if (section.getFlag("battle-of-mytros", "sydonHeldLastRound")) {
                        await section.setFlag("battle-of-mytros", "objectiveDestroyed", true);
                        ui.notifications.warn(`Objective in ${section.name} has been DESTROYED!`);
                        const objName = section.name.replace(globalThis.MytrosRegionManager.SECTION_PREFIX, "").trim();
                        const miracleReward = BattleDashboard.OBJECTIVE_MIRACLE_REWARDS[objName] ?? 0;
                        if (miracleReward > 0) {
                            const currentSydon = game.settings.get("battle-of-mytros", "sydonMiracles");
                            await game.settings.set("battle-of-mytros", "sydonMiracles", currentSydon + miracleReward);
                            ui.notifications.info(
                                `Sydon gains ${miracleReward} Miracle Point(s) for destroying ${objName}!`
                            );
                        }
                    } else {
                        await section.setFlag("battle-of-mytros", "sydonHeldLastRound", true);
                    }
                } else {
                    await section.setFlag("battle-of-mytros", "sydonHeldLastRound", false);
                }
            }

            if (
                (!deathTollFrozen && objectiveDestroyed) ||
                (hasObjective &&
                    !objectiveDestroyed &&
                    control === "sydon" &&
                    section.getFlag("battle-of-mytros", "sydonHeldLastRound"))
            ) {
                if (section.getFlag("battle-of-mytros", "objectiveDestroyed")) {
                    const r = await new Roll("1d4").evaluate();
                    const deaths = r.total * 10;
                    totalDeaths += sydonObjectiveHalved ? Math.floor(deaths / 2) : deaths;
                }
            }
        }

        // Reset PC deployment flags for the new round
        for (const section of sections) {
            const supportTokens = globalThis.MytrosRegionManager.getSupportUnitsInSection(section);
            for (const token of supportTokens) {
                await token.setFlag("battle-of-mytros", "deploymentMode", "none");
            }
        }

        // Commit death toll and advance round
        if (totalDeaths > 0) {
            const current = game.settings.get("battle-of-mytros", "deathToll");
            await game.settings.set("battle-of-mytros", "deathToll", current + totalDeaths);
        }

        const round = game.settings.get("battle-of-mytros", "currentRound");
        await game.settings.set("battle-of-mytros", "currentRound", round + 1);
        await game.settings.set("battle-of-mytros", "currentPhase", 1);

        // Clear recon state for the new round
        await game.settings.set("battle-of-mytros", "reconResult", "");
        await game.settings.set("battle-of-mytros", "reconBonus", 0);

        ui.notifications.info(`Round ${round + 1} begins. ${totalDeaths} civilian deaths this past round.`);
        this.render();
    }

    static async setDeploymentMode(event, target) {
        const tokenId = target.dataset.tokenId;
        const mode = target.value;
        const token = canvas.scene.tokens.get(tokenId);
        if (token) await token.setFlag("battle-of-mytros", "deploymentMode", mode);
    }

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

    static async nextPhase(_event, _target) {
        if (!game.user.isGM) return;
        const phase = game.settings.get("battle-of-mytros", "currentPhase");
        if (phase < 5) {
            await game.settings.set("battle-of-mytros", "currentPhase", phase + 1);
            this.render();
        }
    }

    static async prevPhase(_event, _target) {
        if (!game.user.isGM) return;
        const phase = game.settings.get("battle-of-mytros", "currentPhase");
        if (phase > 1) {
            await game.settings.set("battle-of-mytros", "currentPhase", phase - 1);
            this.render();
        }
    }

    static async importCSV(event, target) {
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

    static async updateSetting(event, target) {
        const settingName = target.dataset.setting;
        let value;
        if (target.type === "number") value = Number(target.value);
        else if (target.type === "checkbox") value = target.checked;
        else value = target.value;
        await game.settings.set("battle-of-mytros", settingName, value);
        this.render();
    }

    static async resetCompletedEvents(_event, _target) {
        if (!game.user.isGM) return;
        await game.settings.set("battle-of-mytros", "completedEvents", "[]");
        ui.notifications.info("Major events reset.");
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

    // ── Legions Tab Actions ──────────────────────────────────────────────────

    static async createLegion(_event, _target) {
        if (!game.user.isGM) return;
        const name = await BattleDashboard._promptInput(
            game.i18n.localize("MYTROS.CreateLegionTitle"),
            game.i18n.localize("MYTROS.CreateLegionHint")
        );
        if (!name) return;
        await globalThis.MytrosActorData.createLegionActor(name, "allied");
        ui.notifications.info(`Legion "${name}" created.`);
        this.render();
    }

    static async updateLegionStat(_event, target) {
        if (!game.user.isGM) return;
        const legionId = target.dataset.legionId;
        const stat = target.dataset.stat;
        const value = Number(target.value);
        const actor = game.actors.get(legionId);
        if (!actor) return;
        const stats = { ...actor.getFlag("battle-of-mytros", "stats") };
        stats[stat] = value;
        await actor.setFlag("battle-of-mytros", "stats", stats);
    }

    static async updateLegionFaction(_event, target) {
        if (!game.user.isGM) return;
        const legionId = target.dataset.legionId;
        const faction = target.value;
        const actor = game.actors.get(legionId);
        if (!actor) return;
        await actor.setFlag("battle-of-mytros", "faction", faction);
        this.render();
    }

    static async deleteLegion(_event, target) {
        if (!game.user.isGM) return;
        const legionId = target.dataset.legionId;
        const actor = game.actors.get(legionId);
        if (!actor) return;
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize("MYTROS.DeleteLegionTitle"),
            content: `<p>${game.i18n.localize("MYTROS.DeleteLegionConfirm")} <strong>${actor.name}</strong>?</p>`,
        });
        if (!confirmed) return;
        await actor.delete();
        ui.notifications.info(`Legion "${actor.name}" deleted.`);
        this.render();
    }

    static async toggleLegionDestroyed(_event, target) {
        if (!game.user.isGM) return;
        const legionId = target.dataset.legionId;
        const actor = game.actors.get(legionId);
        if (!actor) return;
        const current = actor.getFlag("battle-of-mytros", "isDestroyed");
        await actor.setFlag("battle-of-mytros", "isDestroyed", !current);
        this.render();
    }

    static async toggleLegionRouted(_event, target) {
        if (!game.user.isGM) return;
        const legionId = target.dataset.legionId;
        const actor = game.actors.get(legionId);
        if (!actor) return;
        const current = actor.getFlag("battle-of-mytros", "isRouted");
        await actor.setFlag("battle-of-mytros", "isRouted", !current);
        this.render();
    }

    // ── Commanders Tab Actions ───────────────────────────────────────────────

    static async createCommander(_event, _target) {
        if (!game.user.isGM) return;
        const name = await BattleDashboard._promptInput(
            game.i18n.localize("MYTROS.CreateCommanderTitle"),
            game.i18n.localize("MYTROS.CreateCommanderHint")
        );
        if (!name) return;
        await globalThis.MytrosActorData.createCommanderActor(name);
        ui.notifications.info(`Commander "${name}" created.`);
        this.render();
    }

    static async deleteCommander(_event, target) {
        if (!game.user.isGM) return;
        const commanderId = target.dataset.commanderId;
        const actor = game.actors.get(commanderId);
        if (!actor) return;
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize("MYTROS.DeleteCommanderTitle"),
            content: `<p>${game.i18n.localize("MYTROS.DeleteCommanderConfirm")} <strong>${actor.name}</strong>?</p>`,
        });
        if (!confirmed) return;
        await actor.delete();
        ui.notifications.info(`Commander "${actor.name}" deleted.`);
        this.render();
    }

    static async addCommanderTag(_event, target) {
        if (!game.user.isGM) return;
        const commanderId = target.dataset.commanderId;
        const actor = game.actors.get(commanderId);
        if (!actor) return;

        // Show a dialog with known tags to pick from
        const existingTags = actor.items.map((i) => i.name.toLowerCase());
        const available = BattleDashboard.KNOWN_TAGS.filter((t) => !existingTags.includes(t.toLowerCase()));
        if (available.length === 0) {
            ui.notifications.info("All known tags are already on this commander.");
            return;
        }

        const options = available.map((t) => `<option value="${t}">${t}</option>`).join("");
        const content = `
            <form>
                <div class="form-group">
                    <label>${game.i18n.localize("MYTROS.SelectTag")}</label>
                    <select name="tag">${options}</select>
                </div>
            </form>
        `;
        const result = await Dialog.prompt({
            title: game.i18n.localize("MYTROS.AddTagTitle"),
            content,
            callback: (html) => html.find('[name="tag"]').val(),
            rejectClose: false,
        });
        if (!result) return;

        await globalThis.MytrosActorData.ensureTagItems(actor, [result]);
        ui.notifications.info(`Tag "${result}" added to ${actor.name}.`);
        this.render();
    }

    static async removeCommanderTag(_event, target) {
        if (!game.user.isGM) return;
        const commanderId = target.dataset.commanderId;
        const itemId = target.dataset.itemId;
        const actor = game.actors.get(commanderId);
        if (!actor) return;
        const item = actor.items.get(itemId);
        if (!item) return;
        await item.delete();
        this.render();
    }

    static async autoCreateTags(_event, target) {
        if (!game.user.isGM) return;
        const commanderId = target.dataset.commanderId;
        const actor = game.actors.get(commanderId);
        if (!actor) return;

        // Auto-create all known tags that are missing
        const count = await globalThis.MytrosActorData.ensureTagItems(actor, BattleDashboard.KNOWN_TAGS);
        if (count > 0) {
            ui.notifications.info(`Created ${count} missing tag items on ${actor.name}.`);
        } else {
            ui.notifications.info(`All known tags already exist on ${actor.name}.`);
        }
        this.render();
    }

    /**
     * Simple text input prompt via Foundry Dialog.
     */
    static async _promptInput(title, label) {
        return new Promise((resolve) => {
            new Dialog({
                title,
                content: `<form><div class="form-group"><label>${label}</label><input type="text" name="value" autofocus></div></form>`,
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

    static PARTS = {
        form: {
            template: "modules/battle-of-mytros/templates/dashboard.hbs",
        },
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.isGM = game.user.isGM;
        context.round = game.settings.get("battle-of-mytros", "currentRound");
        context.phase = game.settings.get("battle-of-mytros", "currentPhase");

        context.tab = this.tab;
        context.phaseNames = [
            game.i18n.localize("MYTROS.Phase1Name"),
            game.i18n.localize("MYTROS.Phase2Name"),
            game.i18n.localize("MYTROS.Phase3Name"),
            game.i18n.localize("MYTROS.Phase4Name"),
            game.i18n.localize("MYTROS.Phase5Name"),
        ];
        context.phaseName = context.phaseNames[(context.phase ?? 1) - 1];
        context.deathToll = game.settings.get("battle-of-mytros", "deathToll");
        context.alliedMiracles = game.settings.get("battle-of-mytros", "alliedMiracles");
        context.sydonMiracles = game.settings.get("battle-of-mytros", "sydonMiracles");

        context.commanders = game.actors
            .filter((a) => globalThis.MytrosActorData.isCommander(a))
            .map((a) => ({
                id: a.id,
                name: a.name,
            }));

        const battleSceneId = game.settings.get("battle-of-mytros", "battleSceneId");
        context.scenes = game.scenes.map((s) => ({ id: s.id, name: s.name, selected: s.id === battleSceneId }));

        context.reconResult = game.settings.get("battle-of-mytros", "reconResult");
        context.reconBonus = game.settings.get("battle-of-mytros", "reconBonus");
        context.deathTollFrozen = game.settings.get("battle-of-mytros", "deathTollFrozen");
        context.sydonObjectiveHalved = game.settings.get("battle-of-mytros", "sydonObjectiveHalved");
        context.sectionPrefix = game.settings.get("battle-of-mytros", "sectionPrefix") || "Section:";
        context.maxMorale = game.settings.get("battle-of-mytros", "maxMorale") ?? 10;
        context.destroyThreshold = game.settings.get("battle-of-mytros", "destroyThreshold") ?? 6;
        context.hopeDC = game.settings.get("battle-of-mytros", "hopeDC") ?? 12;
        context.salvageDC = game.settings.get("battle-of-mytros", "salvageDC") ?? 12;

        const completedEventIds = JSON.parse(game.settings.get("battle-of-mytros", "completedEvents") || "[]");
        context.majorEvents = BattleDashboard.MAJOR_EVENTS.map((e) => ({
            ...e,
            completed: completedEventIds.includes(e.id),
        }));

        // Grab regions if we are on the battle scene
        context.isBattleScene = canvas.scene?.id === battleSceneId;

        if (context.isBattleScene) {
            const sections = globalThis.MytrosRegionManager.getActiveSections();
            context.sections = sections.map((r) => {
                const legions = globalThis.MytrosRegionManager.getLegionsInSection(r);
                const mappedLegions = legions.map((t) => {
                    const stats = t.actor.getFlag("battle-of-mytros", "stats") || {};
                    return {
                        id: t.actor.id,
                        name: t.name,
                        faction: t.actor.getFlag("battle-of-mytros", "faction"),
                        commanderId: t.actor.getFlag("battle-of-mytros", "commanderId"),
                        commanderName: t.actor.getFlag("battle-of-mytros", "commanderId")
                            ? game.actors.get(t.actor.getFlag("battle-of-mytros", "commanderId"))?.name
                            : "None",
                        injuries: stats.injuries ?? 0,
                        morale: stats.morale ?? "?",
                        vitality: stats.vitality ?? "?",
                        wit: stats.wit ?? "?",
                        isRouted: t.actor.getFlag("battle-of-mytros", "isRouted") ?? false,
                        isDestroyed: t.actor.getFlag("battle-of-mytros", "isDestroyed") ?? false,
                        movedThree: t.actor.getFlag("battle-of-mytros", "movedThree") ?? false,
                    };
                });

                const supportTokens = globalThis.MytrosRegionManager.getSupportUnitsInSection(r);
                const supportUnits = supportTokens.map((t) => ({
                    id: t.id,
                    name: t.name,
                    actorId: t.actor.id,
                    deploymentMode: t.getFlag("battle-of-mytros", "deploymentMode") || "none",
                }));

                const hasActiveAllied = mappedLegions.some(
                    (l) => l.faction === "allied" && !l.isRouted && !l.isDestroyed
                );
                const hasSydon = mappedLegions.some((l) => l.faction === "sydon" && !l.isDestroyed);
                const pendingBattle = hasActiveAllied && hasSydon;
                const hasRoutedAllied = mappedLegions.some(
                    (l) => l.faction === "allied" && l.isRouted && !l.isDestroyed
                );
                const routedContested = hasRoutedAllied && hasSydon && !hasActiveAllied;

                return {
                    id: r.id,
                    name: r.name.replace(globalThis.MytrosRegionManager.SECTION_PREFIX, "").trim(),
                    control: r.getFlag("battle-of-mytros", "control"),
                    fortified: r.getFlag("battle-of-mytros", "fortified"),
                    hasObjective: r.getFlag("battle-of-mytros", "hasObjective"),
                    objectiveDestroyed: r.getFlag("battle-of-mytros", "objectiveDestroyed"),
                    legions: mappedLegions,
                    supportUnits: supportUnits,
                    pendingBattle: pendingBattle,
                    routedContested: routedContested,
                };
            });
        } else {
            context.sections = [];
        }

        // Adjacency configuration (for Setup tab)
        const allSections = globalThis.MytrosRegionManager.getActiveSections();
        const sectionOpts = allSections.map((r) => ({
            id: r.id,
            name: r.name.replace(globalThis.MytrosRegionManager.SECTION_PREFIX, "").trim(),
        }));
        const rawPairs = JSON.parse(game.settings.get("battle-of-mytros", "adjacencyPairs") || "[]");
        context.adjacencyPairs = rawPairs.map(([aId, bId], index) => ({
            index,
            aId,
            bId,
            aName: sectionOpts.find((s) => s.id === aId)?.name ?? aId,
            bName: sectionOpts.find((s) => s.id === bId)?.name ?? bId,
        }));
        context.sectionOpts = sectionOpts;

        // ── Legions Tab Data ─────────────────────────────────────────────
        const allLegions = game.actors.filter((a) => globalThis.MytrosActorData.isLegion(a));
        context.allLegions = allLegions
            .map((a) => {
                const stats = a.getFlag("battle-of-mytros", "stats") || {};
                const commanderId = a.getFlag("battle-of-mytros", "commanderId");
                return {
                    id: a.id,
                    name: a.name,
                    faction: a.getFlag("battle-of-mytros", "faction") || "allied",
                    vitality: stats.vitality ?? 4,
                    morale: stats.morale ?? 4,
                    wit: stats.wit ?? 4,
                    injuries: stats.injuries ?? 0,
                    commanderId: commanderId,
                    commanderName: commanderId ? game.actors.get(commanderId)?.name ?? "—" : "—",
                    isRouted: a.getFlag("battle-of-mytros", "isRouted") ?? false,
                    isDestroyed: a.getFlag("battle-of-mytros", "isDestroyed") ?? false,
                };
            })
            .sort((a, b) => {
                // Allied first, then sydon; within faction sort by name
                if (a.faction !== b.faction) return a.faction === "allied" ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

        // ── Commanders Tab Data ──────────────────────────────────────────
        const allCommanders = game.actors.filter((a) => globalThis.MytrosActorData.isCommander(a));
        context.allCommanders = allCommanders
            .map((a) => {
                const tags = a.items.map((i) => ({ id: i.id, name: i.name }));
                // Find which legion this commander is assigned to
                const assignedLegion = allLegions.find((l) => l.getFlag("battle-of-mytros", "commanderId") === a.id);
                return {
                    id: a.id,
                    name: a.name,
                    tags: tags,
                    assignedLegionName: assignedLegion?.name ?? "—",
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));

        context.knownTags = BattleDashboard.KNOWN_TAGS;

        return context;
    }
}
