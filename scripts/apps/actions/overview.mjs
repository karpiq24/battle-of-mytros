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
    const type = target.dataset.type; // "healing" or "morale" or undefined for rests
    const cost = Number(target.dataset.cost);
    const settingKey = faction === "allied" ? "alliedMiracles" : "sydonMiracles";
    const current = game.settings.get("battle-of-mytros", settingKey);

    if (current < cost) {
        ui.notifications.warn(`Not enough ${faction} Miracle Points!`);
        return;
    }

    if (type === "healing" || type === "morale") {
        const selectId = faction === "allied" ? "allied-miracle-legion" : "sydon-miracle-legion";
        const select = document.getElementById(selectId);
        const legionId = select?.value;
        if (!legionId) {
            ui.notifications.warn("No legion selected!");
            return;
        }

        const legion = game.actors.get(legionId);
        if (!legion) {
            ui.notifications.error("Selected legion not found!");
            return;
        }

        const stats = { ...(legion.getFlag("battle-of-mytros", "stats") || {}) };
        if (type === "healing") {
            if ((stats.injuries ?? 0) <= 0) {
                ui.notifications.warn(`${legion.name} has no injuries to heal.`);
                return;
            }
            stats.injuries = Math.max(0, (stats.injuries ?? 0) - 1);
            ui.notifications.info(`Divine Healing: ${legion.name} healed 1 injury.`);
        } else if (type === "morale") {
            const maxMorale = game.settings.get("battle-of-mytros", "maxMorale") ?? 10;
            if ((stats.morale ?? 0) >= maxMorale) {
                ui.notifications.warn(`${legion.name} is already at maximum morale.`);
                return;
            }
            stats.morale = Math.min(maxMorale, (stats.morale ?? 0) + 1);
            ui.notifications.info(`Divine Inspiration: ${legion.name} gained 1 morale.`);
        }

        await legion.setFlag("battle-of-mytros", "stats", stats);
    }

    await game.settings.set("battle-of-mytros", settingKey, current - cost);
    this.render();
}

export async function triggerMajorEvent(_event, target) {
    if (!game.user.isGM) return;
    const eventId = target.dataset.eventId;
    const eventsDef = JSON.parse(game.settings.get("battle-of-mytros", "majorEvents") || "[]");
    const event = eventsDef.find((e) => e.id === eventId);
    if (!event) return;

    const completed = JSON.parse(game.settings.get("battle-of-mytros", "completedEvents") || "[]");
    if (completed.includes(eventId)) return;
    completed.push(eventId);
    await game.settings.set("battle-of-mytros", "completedEvents", JSON.stringify(completed));

    const current = game.settings.get("battle-of-mytros", "alliedMiracles");
    await game.settings.set("battle-of-mytros", "alliedMiracles", current + event.reward);

    ui.notifications.info(`Major Event: ${event.name}! Allied Miracles +${event.reward}.`);
    this.render();
}

export async function triggerObjectiveDestroyed(_event, target) {
    if (!game.user.isGM) return;
    const objId = target.dataset.objId;
    const objectivesDef = JSON.parse(game.settings.get("battle-of-mytros", "strategicObjectives") || "[]");
    const obj = objectivesDef.find((o) => o.id === objId);
    if (!obj) return;

    const destroyed = JSON.parse(game.settings.get("battle-of-mytros", "destroyedObjectives") || "[]");
    if (destroyed.includes(objId)) return;

    destroyed.push(objId);
    await game.settings.set("battle-of-mytros", "destroyedObjectives", JSON.stringify(destroyed));

    const currentSydon = game.settings.get("battle-of-mytros", "sydonMiracles");
    await game.settings.set("battle-of-mytros", "sydonMiracles", currentSydon + obj.reward);

    ui.notifications.warn(`Objective Destroyed: ${obj.name}! Sydon Miracles +${obj.reward}.`);
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
    const deathMultSydon = game.settings.get("battle-of-mytros", "deathMultSydon") ?? 25;
    const deaths = deathRoll.total * deathMultSydon;
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
    let sydonPillageDeaths = 0;
    let sydonPillageLegions = 0;
    let objectiveDeaths = 0;

    const activeSections = globalThis.MytrosRegionManager.getActiveSections();
    const activeLegionIds = new Set();
    for (const section of activeSections) {
        const sectLegions = globalThis.MytrosRegionManager.getLegionsInSection(section);
        for (const t of sectLegions) {
            activeLegionIds.add(t.actor.id);
        }
    }

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

            if (faction === "sydon" && !deathTollFrozen && activeLegionIds.has(legion.id)) {
                const r = await new Roll("1d6").evaluate();
                const pillMult = game.settings.get("battle-of-mytros", "deathMultSydon") ?? 25;
                const deaths = r.total * pillMult;
                totalDeaths += deaths;
                sydonPillageDeaths += deaths;
                sydonPillageLegions++;
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

    // Process Rally deployments — each rally PC rolls 1d4 and restores Morale to a chosen allied legion
    const alliedLegionsForRally = game.actors.filter(
        (a) =>
            globalThis.MytrosActorData.isLegion(a) &&
            a.getFlag("battle-of-mytros", "faction") === "allied" &&
            !a.getFlag("battle-of-mytros", "isDestroyed")
    );
    for (const section of activeSections) {
        const supportTokens = globalThis.MytrosRegionManager.getSupportUnitsInSection(section);
        for (const token of supportTokens) {
            if (token.getFlag("battle-of-mytros", "deploymentMode") !== "rally") continue;

            const rallyRoll = await new Roll("1d4").evaluate();
            const legionOptions = alliedLegionsForRally
                .map((l) => {
                    const morale = l.getFlag("battle-of-mytros", "stats")?.morale ?? "?";
                    return `<option value="${l.id}">${l.name} (Morale ${morale})</option>`;
                })
                .join("");

            let targetId;
            if (foundry.applications?.api?.DialogV2) {
                targetId = await foundry.applications.api.DialogV2.prompt({
                    window: { title: `${token.name} — Rally (rolled ${rallyRoll.total})` },
                    content: `<form><div class="form-group"><label>Target legion</label><select name="target">${legionOptions}</select></div></form>`,
                    ok: { label: "Apply", callback: (_e, btn) => btn.form.elements.target.value },
                    rejectClose: false,
                });
            } else {
                targetId = await new Promise((resolve) => {
                    new Dialog({
                        title: `${token.name} — Rally (rolled ${rallyRoll.total})`,
                        content: `<form><div class="form-group"><label>Target legion</label><select name="target">${legionOptions}</select></div></form>`,
                        buttons: {
                            ok: { label: "Apply", callback: (html) => resolve(html.find('[name="target"]').val()) },
                        },
                        default: "ok",
                        close: () => resolve(null),
                    }).render(true);
                });
            }

            if (targetId) {
                const target = game.actors.get(targetId);
                const rallyStats = { ...target.getFlag("battle-of-mytros", "stats") };
                const maxMorale = game.settings.get("battle-of-mytros", "maxMorale") ?? 10;
                rallyStats.morale = Math.min(maxMorale, (rallyStats.morale ?? 5) + rallyRoll.total);
                await target.setFlag("battle-of-mytros", "stats", rallyStats);
                ui.notifications.info(`${token.name} rallied ${target.name}: +${rallyRoll.total} Morale.`);
            }
        }
    }

    // Objective destruction tracking and per-round death toll
    const destroyedObjectives = JSON.parse(game.settings.get("battle-of-mytros", "destroyedObjectives") || "[]");
    for (const objId of destroyedObjectives) {
        if (!deathTollFrozen) {
            const r = await new Roll("1d4").evaluate();
            const objMult = game.settings.get("battle-of-mytros", "deathMultObjective") ?? 5;
            let deaths = r.total * objMult;
            deaths = sydonObjectiveHalved ? Math.floor(deaths / 2) : deaths;
            totalDeaths += deaths;
            objectiveDeaths += deaths;
        }
    }

    // Reset PC deployment flags for the new round
    for (const section of activeSections) {
        const supportTokens = globalThis.MytrosRegionManager.getSupportUnitsInSection(section);
        for (const token of supportTokens) {
            await token.setFlag("battle-of-mytros", "deploymentMode", "none");
        }
    }

    // Commit death toll and advance round
    if (totalDeaths > 0) {
        const currentToll = Number(game.settings.get("battle-of-mytros", "deathToll")) || 0;
        await game.settings.set("battle-of-mytros", "deathToll", currentToll + totalDeaths);

        let chatHtml = `<div class="mytros-battle-card"><div class="card-header"><i class="fas fa-skull"></i> Civilian Casualties Overview</div>`;
        chatHtml += `<div class="card-result"><p>The war takes its toll across the city...</p></div>`;
        chatHtml += `<table class="card-table"><thead><tr><th>Source</th><th>Deaths</th></tr></thead><tbody>`;
        if (sydonPillageLegions > 0) {
            chatHtml += `<tr><td>${sydonPillageLegions} Unengaged Sydon Legion(s) Pillaging</td><td class="text-bad" style="color:var(--mytros-danger);font-weight:bold;">+${sydonPillageDeaths}</td></tr>`;
        }
        if (objectiveDeaths > 0) {
            chatHtml += `<tr><td>Destroyed Strategic Objectives under Sydon Control</td><td class="text-bad" style="color:var(--mytros-danger);font-weight:bold;">+${objectiveDeaths}</td></tr>`;
        }
        chatHtml += `</tbody><tfoot><tr><th>Total Added</th><th class="text-bad" style="color:var(--mytros-danger);font-weight:bold;">+${totalDeaths}</th></tr></tfoot></table></div>`;

        await ChatMessage.create({
            content: chatHtml,
            speaker: { alias: "Battle of Mytros" },
        });
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
