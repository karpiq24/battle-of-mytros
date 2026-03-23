/**
 * All constants and DCs from the Battle of Mytros v3 mass combat system.
 */

export const BOM = {
  moduleId: "battle-of-mytros",

  // Battle Counter
  counterWin: 1,         // Maneuver and Charge winner
  counterClashWin: 2,    // Clash winner scores two counter points
  counterNat20Bonus: 1,  // Extra point on nat 20 (total = base + 1)
  counterNat1Penalty: 1, // Extra point lost on nat 1 (total = base + 1)

  // Aftermath DCs
  recoveryBaseDC: 12,
  hopeDC: 12,
  hopeMoraleOffset: 5,
  salvageDC: 12,

  // Aftermath outcomes
  recovery: {
    winnerPass: 0,
    winnerFail: 1,
    loserPass: 1,
    loserFail: 2
  },
  hope: {
    winnerPass: 2,
    winnerFail: 1,
    loserPass: -1,
    loserFail: -2
  },

  // Legion durability
  maxInjuries: 6,
  routThreshold: 0,
  moraleCap: 10,

  // Time
  roundsPerDay: 8,

  // Idle / routed recovery
  idleMoraleRecovery: 1,
  idleInjuryRecovery: 1,

  // Overnight
  overnightInjuryRecovery: 1,
  overnightMoraleRecovery: 1,
  overnightInjuryMax: 5,

  // Commander Casualty
  // Percentile risk minus (Commander Vitality + Legion Morale) = Death Chance. Roll 1d100.
  casualtyBaseRisk: { winner: 6, loser: 12, crushed: 20 },
  casualtyCrushedThreshold: -3,
  commanderDeathMoraleLoss: 1,

  // Situational battle bonuses
  momentumBonus: 1,

  // Maneuver benefits
  maneuverFlankingBonus: 2,
  maneuverDefensiveBonus: 2,
  maneuverDisruptedPenalty: -2,
  chargeWinClashBonus: 1,
  salvageInsightBonus: 2,

  // Recon — rolls above the highest threshold return the last result
  reconThresholds: [
    { max: 10, result: "BOM.recon.nothing" },
    { max: 14, result: "BOM.recon.oneLegion" },
    { max: 18, result: "BOM.recon.halfLegions" },
    { max: 22, result: "BOM.recon.allMovements" }
  ],

  // Maneuver benefit options
  maneuverBenefits: [
    { id: "flanking", label: "BOM.maneuver.flanking", desc: "BOM.maneuver.flankingDesc" },
    { id: "defensive", label: "BOM.maneuver.defensive", desc: "BOM.maneuver.defensiveDesc" },
    { id: "disrupted", label: "BOM.maneuver.disrupted", desc: "BOM.maneuver.disruptedDesc" },
    { id: "seized", label: "BOM.maneuver.seized", desc: "BOM.maneuver.seizedDesc" }
  ],

  // Salvage benefit options
  salvageBenefits: [
    { id: "supplies", label: "BOM.salvage.supplies", desc: "BOM.salvage.suppliesDesc" },
    { id: "insight", label: "BOM.salvage.insight", desc: "BOM.salvage.insightDesc" },
    { id: "shaken", label: "BOM.salvage.shaken", desc: "BOM.salvage.shakenDesc" },
    { id: "fortify", label: "BOM.salvage.fortify", desc: "BOM.salvage.fortifyDesc" }
  ],

  // PC deployment actions
  pcActions: [
    { id: "reinforce", label: "BOM.pc.reinforce" },
    { id: "shockAssault", label: "BOM.pc.shockAssault" },
    { id: "targetedStrike", label: "BOM.pc.targetedStrike" },
    { id: "shieldWounded", label: "BOM.pc.shieldWounded" },
    { id: "rest", label: "BOM.pc.rest" }
  ],

  // Fortification
  fortificationBonus: 1,

  // PC deployment bonuses
  pcReinforceBonus: 2,
  pcShockAssaultBonus: 3,
  pcTargetedStrikeBonus: 4,
  pcShieldWoundedBonus: 3,

  // Commander tags
  allTags: [
    "Tactician", "Mage", "Fanatic", "Zealot", "Medic",
    "Rallier", "Vanguard", "Brutal", "Scout", "Veteran",
    "Terrorizer", "Warden", "Divine Blood", "Engineer", "Headhunter", "Team B"
  ],

  // Phases of a round
  phases: [
    "reconnaissance", "planning", "reveal", "battle", "aftermath", "objectives"
  ],

};
