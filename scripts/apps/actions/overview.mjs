import { MAJOR_EVENTS, OBJECTIVE_MIRACLE_REWARDS } from "../constants.mjs";

/**
 * Overview tab action handlers.
 * Each function is a static action method bound to the BattleDashboard instance via `this`.
 */

export async function rollRecon(_event, _target) {
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

export async function spendMiracle(_event, target) {
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

export async function triggerMajorEvent(_event, target) {
    if (!game.user.isGM) return;
    const eventId = target.dataset.eventId;
    const event = MAJOR_EVENTS.find((e) => e.id === eventId);
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
            ui.notifications.warn(`Acastus Redeemed: No actor named "Acastus" found. Add him manually as a Commander.`);
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

export async function disbandRoutedLegions(_event, target) {
    if (!game.user.isGM) return;
    const regionId = target.dataset.regionId;
    const region = canvas.scene.regions.get(regionId);
    if (!region) return;

    const legions = globalThis.MytrosRegionManager.getLegionsInSection(region);
    const routedLegions = legions.filter(
        (t) => t.actor.getFlag("battle-of-mytros", "isRouted") && !t.actor.getFlag("battle-of-mytros", "isDestroyed")
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

export async function advanceRound(_event, _target) {
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
                    const miracleReward = OBJECTIVE_MIRACLE_REWARDS[objName] ?? 0;
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

export async function setDeploymentMode(event, target) {
    const tokenId = target.dataset.tokenId;
    const mode = target.value;
    const token = canvas.scene.tokens.get(tokenId);
    if (token) await token.setFlag("battle-of-mytros", "deploymentMode", mode);
}

export async function openResolver(event, target) {
    // Import lazily to avoid circular dependency
    const { BattleResolverApp } = await import("../resolver.mjs");
    const regionId = target.dataset.regionId;
    const region = canvas.scene.regions.get(regionId);
    if (region) {
        new BattleResolverApp(region).render({ force: true });
    }
}

export async function resetCompletedEvents(_event, _target) {
    if (!game.user.isGM) return;
    await game.settings.set("battle-of-mytros", "completedEvents", "[]");
    ui.notifications.info("Major events reset.");
    this.render();
}

export async function nextPhase(_event, _target) {
    if (!game.user.isGM) return;
    const phase = game.settings.get("battle-of-mytros", "currentPhase");
    if (phase < 5) {
        await game.settings.set("battle-of-mytros", "currentPhase", phase + 1);
        this.render();
    }
}

export async function prevPhase(_event, _target) {
    if (!game.user.isGM) return;
    const phase = game.settings.get("battle-of-mytros", "currentPhase");
    if (phase > 1) {
        await game.settings.set("battle-of-mytros", "currentPhase", phase - 1);
        this.render();
    }
}
