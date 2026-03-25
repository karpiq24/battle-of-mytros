export class TagEngine {
    /**
     * Calculates modifiers for a specific battle phase.
     * @param {Actor} legion The legion actor rolling.
     * @param {Actor} enemyLegion The opposing legion actor.
     * @param {string} phase "maneuver", "charge", or "clash"
     * @param {object} context Additional context { isFortified: boolean, enemyIsFortified: boolean, maneuverBenefit: string, enemyManeuverBenefit: string }
     * @returns {object} { advantage: boolean, disadvantage: boolean, flatBonus: number }
     */
    static getRollModifiers(legion, enemyLegion, phase, context = {}) {
        let mods = { advantage: false, disadvantage: false, flatBonus: 0 };
        
        // Fetch Commander Items
        const commanderId = legion.getFlag("battle-of-mytros", "commanderId");
        const commander = commanderId ? game.actors.get(commanderId) : null;
        const tags = commander ? commander.items.map(i => i.name.toLowerCase()) : [];

        const enemyCommanderId = enemyLegion.getFlag("battle-of-mytros", "commanderId");
        const enemyCommander = enemyCommanderId ? game.actors.get(enemyCommanderId) : null;
        const enemyTags = enemyCommander ? enemyCommander.items.map(i => i.name.toLowerCase()) : [];

        const stats = legion.getFlag("battle-of-mytros", "stats");

        // --- Check Allied Tags ---
        if (phase === "maneuver" && tags.includes("tactician")) mods.advantage = true;
        if (tags.includes("fanatic") && (phase === "charge" || phase === "clash")) mods.advantage = true;
        if (tags.includes("zealot") && stats.morale >= 6) mods.flatBonus += 2;
        if (phase === "clash" && tags.includes("ironclad")) mods.flatBonus += 2;
        if (phase === "charge" && tags.includes("inspiring")) mods.flatBonus += 2;
        if (phase === "maneuver" && tags.includes("cunning")) mods.flatBonus += 2;
        if (phase === "clash" && tags.includes("warden")) mods.flatBonus += 2;
        if (phase === "charge" && tags.includes("vanguard")) mods.advantage = true; // Assuming Vanguard moved 3 spaces for simplicity during combat phase

        // --- Check Enemy Tags (Debuffs) ---
        if (phase === "clash" && enemyTags.includes("headhunter")) mods.disadvantage = true;
        if (enemyTags.includes("mage")) mods.flatBonus -= 1;
        
        // Engineer logic: Enemy suffers -2 if fighting this legion in a fortified section
        const siegeBreaker = tags.includes("siege breaker");
        if (enemyTags.includes("engineer") && context.enemyIsFortified && !siegeBreaker) {
            mods.flatBonus -= 2;
        }

        // --- Section Fortification ---
        if (context.isFortified && !enemyTags.includes("siege breaker")) {
            mods.flatBonus += 1;
        }

        // --- Maneuver Benefits ---
        if (phase === "charge" && context.maneuverBenefit === "flanking") mods.flatBonus += 2; // +1d4 averages to +2
        if (phase === "clash" && context.maneuverBenefit === "defensive") mods.flatBonus += 1; // +1d2 averages to +1
        if (context.enemyManeuverBenefit === "disrupted" && (phase === "charge" || phase === "clash")) mods.flatBonus -= 1;

        return mods;
    }
}