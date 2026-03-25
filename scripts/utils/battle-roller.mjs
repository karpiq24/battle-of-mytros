export class BattleRoller {
    /**
     * Executes a battle roll.
     * @param {number} stat The base stat (Wit, Morale, Vitality)
     * @param {number} flatBonus Any flat bonuses (+1d4 becomes average or resolved prior, for now assume integer)
     * @param {boolean} advantage 
     * @param {boolean} disadvantage 
     * @returns {object} { roll: Roll, total: number, isNat20: boolean, isNat1: boolean }
     */
    static async executeRoll(stat, flatBonus = 0, advantage = false, disadvantage = false) {
        let formula = "1d20";
        if (advantage && !disadvantage) formula = "2d20kh";
        if (disadvantage && !advantage) formula = "2d20kl";
        
        formula += ` + ${stat}`;
        if (flatBonus !== 0) {
            formula += ` + ${flatBonus}`;
        }

        const roll = await new Roll(formula).evaluate();
        
        // Find the d20 term
        const d20Term = roll.terms.find(t => t.faces === 20);
        const d20Result = d20Term ? d20Term.results.find(r => r.active)?.result || d20Term.total : 0;

        return {
            roll: roll,
            total: roll.total,
            isNat20: d20Result === 20,
            isNat1: d20Result === 1
        };
    }
}