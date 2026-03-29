export class TagEngine {
    /**
     * Calculates modifiers for a specific battle phase.
     * @param {Actor} legion The legion actor rolling.
     * @param {Actor} enemyLegion The opposing legion actor.
     * @param {string} phase "maneuver", "charge", or "clash"
     * @param {object} context Additional context { isFortified: boolean, enemyIsFortified: boolean, maneuverBenefit: string, enemyManeuverBenefit: string }
     * @returns {object} { advantage: boolean, disadvantage: boolean, flatBonus: number, descriptions: string[] }
     */
    static getRollModifiers(legion, enemyLegion, phase, context = {}) {
        let mods = { advantage: false, disadvantage: false, flatBonus: 0, descriptions: [] };

        // Tactical Insight: +1d2 (pre-rolled) to Wit rolls for one round
        if (phase === "maneuver" || phase === "salvage") {
            const tacBonus = legion.getFlag("battle-of-mytros", "tacInsightBonus");
            if (tacBonus) {
                mods.flatBonus += tacBonus;
                mods.descriptions.push(`Tactical Insight: +${tacBonus}`);
            }
        }

        // Fetch Commander Items
        const commanderId = legion.getFlag("battle-of-mytros", "commanderId");
        const commander = commanderId ? game.actors.get(commanderId) : null;
        const tags = commander ? commander.items.map((i) => i.name.toLowerCase()) : [];

        const enemyCommanderId = enemyLegion.getFlag("battle-of-mytros", "commanderId");
        const enemyCommander = enemyCommanderId ? game.actors.get(enemyCommanderId) : null;
        const enemyTags = enemyCommander ? enemyCommander.items.map((i) => i.name.toLowerCase()) : [];

        const stats = legion.getFlag("battle-of-mytros", "stats");

        // --- Check Allied Tags ---
        if (phase === "maneuver" && tags.includes("tactician")) {
            mods.advantage = true;
            mods.descriptions.push("Tactician: Advantage");
        }
        if (tags.includes("fanatic") && (phase === "charge" || phase === "clash")) {
            mods.advantage = true;
            mods.descriptions.push("Fanatic: Advantage");
        }
        if (tags.includes("zealot") && stats.morale >= 6) {
            mods.flatBonus += 2;
            mods.descriptions.push("Zealot (Morale ≥6): +2");
        }
        if (phase === "clash" && tags.includes("ironclad")) {
            mods.flatBonus += 2;
            mods.descriptions.push("Ironclad: +2");
        }
        if (phase === "charge" && tags.includes("inspiring")) {
            mods.flatBonus += 2;
            mods.descriptions.push("Inspiring: +2");
        }
        if (phase === "maneuver" && tags.includes("cunning")) {
            mods.flatBonus += 2;
            mods.descriptions.push("Cunning: +2");
        }
        if (phase === "clash" && tags.includes("warden")) {
            mods.flatBonus += 2;
            mods.descriptions.push("Warden: +2");
        }
        if (phase === "charge" && tags.includes("vanguard") && context.movedThree) {
            mods.advantage = true;
            mods.descriptions.push("Vanguard (3 sections): Advantage");
        }

        // --- Check Enemy Tags (Debuffs) ---
        if (phase === "clash" && enemyTags.includes("headhunter")) {
            mods.disadvantage = true;
            mods.descriptions.push("Headhunter (enemy): Disadvantage");
        }
        if (enemyTags.includes("mage")) {
            mods.flatBonus -= 1;
            mods.descriptions.push("Mage (enemy): −1");
        }

        // Engineer logic: Enemy suffers -2 if fighting this legion in a fortified section
        const siegeBreaker = tags.includes("siege breaker");
        if (enemyTags.includes("engineer") && context.enemyIsFortified && !siegeBreaker) {
            mods.flatBonus -= 2;
            mods.descriptions.push("Engineer (enemy fortified): −2");
        }

        // --- Section Fortification ---
        if (context.isFortified && !enemyTags.includes("siege breaker")) {
            mods.flatBonus += 1;
            mods.descriptions.push("Fortified: +1");
        }

        // --- Maneuver Benefits ---
        if (phase === "clash" && context.maneuverBenefit === "defensive") {
            mods.flatBonus += 1;
            mods.descriptions.push("Defensive Footing: +1");
        }
        if (context.enemyManeuverBenefit === "disrupted" && (phase === "charge" || phase === "clash")) {
            mods.flatBonus -= 1;
            mods.descriptions.push("Disrupted (enemy): −1");
        }

        return mods;
    }

    /**
     * Calculates modifiers for an aftermath check.
     * @param {Actor} legion The legion actor rolling.
     * @param {Actor} enemyLegion The opposing legion actor.
     * @param {string} phase "recovery", "hope", or "salvage"
     * @param {object} context { isWinner: boolean, adjacentWarden: boolean, adjacentRallier: boolean }
     * @returns {object} { advantage: boolean, disadvantage: boolean, flatBonus: number, descriptions: string[] }
     */
    static getAftermathModifiers(legion, enemyLegion, phase, context = {}) {
        let mods = { advantage: false, disadvantage: false, flatBonus: 0, descriptions: [] };

        const commanderId = legion.getFlag("battle-of-mytros", "commanderId");
        const commander = commanderId ? game.actors.get(commanderId) : null;
        const tags = commander ? commander.items.map((i) => i.name.toLowerCase()) : [];

        const enemyCommanderId = enemyLegion.getFlag("battle-of-mytros", "commanderId");
        const enemyCommander = enemyCommanderId ? game.actors.get(enemyCommanderId) : null;
        const enemyTags = enemyCommander ? enemyCommander.items.map((i) => i.name.toLowerCase()) : [];

        if (phase === "recovery") {
            if (tags.includes("medic")) {
                mods.advantage = true;
                mods.descriptions.push("Medic: Advantage");
            }
            if (tags.includes("fanatic")) {
                mods.disadvantage = true;
                mods.descriptions.push("Fanatic: Disadvantage");
            }
            if (tags.includes("ironclad")) {
                mods.flatBonus += 2;
                mods.descriptions.push("Ironclad: +2");
            }
            if (context.adjacentWarden) {
                mods.flatBonus += 2;
                mods.descriptions.push("Warden (adjacent): +2");
            }
            // Mage: enemy's magical attacks force this legion to recover with disadvantage
            if (enemyTags.includes("mage")) {
                mods.disadvantage = true;
                mods.descriptions.push("Mage (enemy): Disadvantage");
            }
            // Brutal: only the winner's tag causes the loser's disadvantage
            if (!context.isWinner && enemyTags.includes("brutal")) {
                mods.disadvantage = true;
                mods.descriptions.push("Brutal (enemy): Disadvantage");
            }
        }

        if (phase === "hope") {
            if (tags.includes("rallier")) {
                mods.flatBonus += 2;
                mods.descriptions.push("Rallier: +2");
            }
            if (context.adjacentRallier) {
                mods.flatBonus += 1;
                mods.descriptions.push("Rallier (adjacent): +1");
            }
            if (tags.includes("inspiring")) {
                mods.flatBonus += 2;
                mods.descriptions.push("Inspiring: +2");
            }
            if (enemyTags.includes("terrorizer")) {
                mods.disadvantage = true;
                mods.descriptions.push("Terrorizer (enemy): Disadvantage");
            }
        }

        if (phase === "salvage") {
            if (tags.includes("cunning")) {
                mods.flatBonus += 2;
                mods.descriptions.push("Cunning: +2");
            }
            const tacBonus = legion.getFlag("battle-of-mytros", "tacInsightBonus");
            if (tacBonus) {
                mods.flatBonus += tacBonus;
                mods.descriptions.push(`Tactical Insight: +${tacBonus}`);
            }
        }

        return mods;
    }
}
