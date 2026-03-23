import { BOM } from "../config.mjs";

/**
 * Perform a contested d20 roll between two sides using Foundry's Roll API.
 * Both rolls are sent to chat with flavor text.
 *
 * @param {object} opts
 * @param {string} opts.nameA - Name of side A (allied legion)
 * @param {string} opts.nameB - Name of side B (enemy legion)
 * @param {number} opts.bonusA - Total modifier for side A
 * @param {number} opts.bonusB - Total modifier for side B
 * @param {boolean} [opts.advantageA=false] - Side A rolls with advantage
 * @param {boolean} [opts.advantageB=false] - Side B rolls with advantage
 * @param {boolean} [opts.disadvantageA=false] - Side A rolls with disadvantage
 * @param {boolean} [opts.disadvantageB=false] - Side B rolls with disadvantage
 * @param {string} [opts.flavor=""] - Flavor text for the roll (e.g. "Maneuver")
 * @param {number} [opts.miracleA=0] - Miracle points added to side A
 * @param {number} [opts.miracleB=0] - Miracle points added to side B
 * @returns {Promise<ContestedRollResult>}
 */
/**
 * @typedef {object} ModBreakdown
 * @property {string} label - Display label for this modifier
 * @property {number} value - Modifier value (positive or negative)
 */

export async function contestedRoll({
  nameA, nameB,
  bonusA, bonusB,
  advantageA = false, advantageB = false,
  disadvantageA = false, disadvantageB = false,
  flavor = "",
  miracleA = 0, miracleB = 0,
  /** @type {ModBreakdown[]} */ breakdownA = [],
  /** @type {ModBreakdown[]} */ breakdownB = []
}) {
  // Build dice expressions
  const diceA = _buildDice(advantageA, disadvantageA);
  const diceB = _buildDice(advantageB, disadvantageB);

  const totalBonusA = bonusA + miracleA;
  const totalBonusB = bonusB + miracleB;

  // Build full breakdowns for display
  const fullBreakdownA = [
    ...breakdownA,
    ...(miracleA ? [{ label: "Miracle", value: miracleA }] : [])
  ];
  const fullBreakdownB = [
    ...breakdownB,
    ...(miracleB ? [{ label: "Miracle", value: miracleB }] : [])
  ];

  const rollA = new Roll(`${diceA} + @bonus`, { bonus: totalBonusA });
  const rollB = new Roll(`${diceB} + @bonus`, { bonus: totalBonusB });

  await rollA.evaluate();
  await rollB.evaluate();

  // Determine the natural d20 result (first die)
  const natA = rollA.dice[0].total;
  const natB = rollB.dice[0].total;
  const nat20A = natA === 20;
  const nat20B = natB === 20;
  const nat1A = natA === 1;
  const nat1B = natB === 1;

  // Build breakdown strings for flavor text
  const modStrA = fullBreakdownA.length
    ? fullBreakdownA.map(m => `${m.value >= 0 ? "+" : ""}${m.value} ${m.label}`).join(" | ")
    : `+${totalBonusA}`;
  const modStrB = fullBreakdownB.length
    ? fullBreakdownB.map(m => `${m.value >= 0 ? "+" : ""}${m.value} ${m.label}`).join(" | ")
    : `+${totalBonusB}`;
  const advStrA = advantageA ? " (Advantage)" : disadvantageA ? " (Disadvantage)" : "";
  const advStrB = advantageB ? " (Advantage)" : disadvantageB ? " (Disadvantage)" : "";

  // Send to chat
  await rollA.toMessage({
    speaker: { alias: nameA },
    flavor: `<strong>${flavor} — ${nameA}</strong>${advStrA}<br><em>${modStrA}</em>`
  });
  await rollB.toMessage({
    speaker: { alias: nameB },
    flavor: `<strong>${flavor} — ${nameB}</strong>${advStrB}<br><em>${modStrB}</em>`
  });

  // Determine winner
  const totalA = rollA.total;
  const totalB = rollB.total;
  const winner = _determineWinner(totalA, totalB, nat20A, nat20B, nat1A, nat1B);

  // Calculate counter deltas
  let counterA = 0;
  let counterB = 0;
  if (winner === "a") {
    counterA += BOM.counterWin;
    counterB -= BOM.counterWin;
    if (nat20A) counterA += BOM.counterNat20Bonus;
    if (nat1B) counterB -= BOM.counterNat1Penalty;
  } else if (winner === "b") {
    counterB += BOM.counterWin;
    counterA -= BOM.counterWin;
    if (nat20B) counterB += BOM.counterNat20Bonus;
    if (nat1A) counterA -= BOM.counterNat1Penalty;
  }

  return {
    rollA: natA,
    rollB: natB,
    bonusA: totalBonusA,
    bonusB: totalBonusB,
    totalA,
    totalB,
    nat20A,
    nat20B,
    nat1A,
    nat1B,
    winner, // "a", "b", or "tie"
    counterA,
    counterB,
    breakdownA: fullBreakdownA,
    breakdownB: fullBreakdownB
  };
}

/**
 * Build the d20 dice string accounting for advantage/disadvantage.
 */
function _buildDice(advantage, disadvantage) {
  if (advantage && !disadvantage) return "2d20kh";
  if (disadvantage && !advantage) return "2d20kl";
  return "1d20";
}

/**
 * Determine the winner of a contested roll.
 * Nat 20 auto-wins over non-nat-20. Nat 1 auto-loses against non-nat-1.
 */
function _determineWinner(totalA, totalB, nat20A, nat20B, nat1A, nat1B) {
  if (nat20A && !nat20B) return "a";
  if (nat20B && !nat20A) return "b";
  if (nat1A && !nat1B) return "b";
  if (nat1B && !nat1A) return "a";
  if (totalA > totalB) return "a";
  if (totalB > totalA) return "b";
  return "tie";
}

/**
 * @typedef {object} ContestedRollResult
 * @property {number} rollA - Natural d20 result for A
 * @property {number} rollB - Natural d20 result for B
 * @property {number} bonusA - Total bonus for A
 * @property {number} bonusB - Total bonus for B
 * @property {number} totalA - Total result for A
 * @property {number} totalB - Total result for B
 * @property {boolean} nat20A
 * @property {boolean} nat20B
 * @property {boolean} nat1A
 * @property {boolean} nat1B
 * @property {string} winner - "a", "b", or "tie"
 * @property {number} counterA - Counter points gained by A
 * @property {number} counterB - Counter points gained by B
 */
