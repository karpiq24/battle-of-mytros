export class BattleRoller {
    /**
     * Executes a battle roll.
     * @param {number} stat The base stat (Wit, Morale, Vitality)
     * @param {number} flatBonus Any flat bonuses (+1d4 becomes average or resolved prior, for now assume integer)
     * @param {boolean} advantage
     * @param {boolean} disadvantage
     * @param {boolean} isVeteran If true, natural rolls of 1-4 are treated as 5
     * @param {string[]} bonusDice Array of dice formulas (e.g. ["1d4", "1d6"])
     * @returns {object} { roll: Roll, total: number, isNat20: boolean, isNat1: boolean }
     */
    static async executeRoll(
        stat,
        flatBonus = 0,
        advantage = false,
        disadvantage = false,
        isVeteran = false,
        bonusDice = []
    ) {
        let formula = "1d20";
        if (advantage && !disadvantage) formula = "2d20kh";
        if (disadvantage && !advantage) formula = "2d20kl";

        formula += ` + ${stat}`;
        if (flatBonus !== 0) {
            formula += ` + ${flatBonus}`;
        }

        if (bonusDice.length) {
            formula += ` + ${bonusDice.join(" + ")}`;
        }

        const roll = await new Roll(formula).evaluate();

        // Find the d20 term
        const d20Term = roll.terms.find((t) => t.faces === 20);
        let d20Result = d20Term ? d20Term.results.find((r) => r.active)?.result || d20Term.total : 0;

        const isNat20 = d20Result === 20;
        const isNat1 = d20Result === 1;

        // Apply Veteran Tag Logic (Floor of 5)
        let finalTotal = roll.total;
        if (isVeteran && d20Result <= 4) {
            const difference = 5 - d20Result;
            finalTotal += difference;
            d20Result = 5;
        }

        return {
            roll: roll,
            total: finalTotal,
            isNat20: isNat20,
            isNat1: isNat1,
        };
    }
}
