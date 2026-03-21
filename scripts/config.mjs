/**
 * All constants and DCs from the Battle of Mytros v3 mass combat system.
 */

export const BOM = {
  moduleId: "battle-of-mytros",

  // Battle Counter
  counterWin: 1,
  counterNat20Bonus: 2,
  counterNat1Penalty: 2,

  // Aftermath DCs
  recoveryBaseDC: 10,
  hopeDC: 10,
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
  moraleCap: 12,

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
  casualtyDC: { winner: 3, loser: 5, crushed: 7 },
  casualtyCrushedThreshold: -3,
  casualtyTagBonus: { Steadfast: 2, Veteran: 2, Duelist: 4 },
  casualtyInjuredPenalty: -2,
  casualtyInjuredAt: 5,
  commanderDeathMoraleLoss: 1,

  // Tag effects
  fanaticBonus: 4,
  fanaticExtraInjury: 1,
  zealotMoraleThreshold: 7,
  zealotBonus: 1,
  momentumBonus: 1,
  tacticianManeuverBonus: 2,
  mageManeuverBonus: 2,

  // Maneuver benefits
  maneuverFlankingBonus: 2,
  maneuverDefensiveBonus: 2,
  maneuverDisruptedPenalty: -2,
  chargeWinClashBonus: 1,
  salvageInsightBonus: 2,

  // Recon
  scoutTagReconBonus: 3,
  reconThresholds: [
    { max: 10, result: "BOM.recon.nothing" },
    { max: 14, result: "BOM.recon.oneLegion" },
    { max: 18, result: "BOM.recon.halfLegions" },
    { max: 22, result: "BOM.recon.allMovements" }
  ],
  reconFullIntel: "BOM.recon.fullIntel",

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
    { id: "leadCharge", label: "BOM.pc.leadCharge" },
    { id: "holdLine", label: "BOM.pc.holdLine" },
    { id: "sabotage", label: "BOM.pc.sabotage" },
    { id: "rest", label: "BOM.pc.rest" }
  ],

  // PC deployment bonuses
  pcReinforceBonus: 2,

  // Commander tags
  allTags: [
    "Tactician", "Mage", "Fanatic", "Zealot", "Steadfast", "Medic",
    "Rallier", "Vanguard", "Brutal", "Scout", "Duelist", "Veteran",
    "Terrorizer", "Warden", "Divine Blood", "Engineer", "Headhunter"
  ],

  // Phases of a round
  phases: [
    "reconnaissance", "planning", "reveal", "battle", "aftermath", "objectives"
  ],

  // Vanguard
  vanguardChargeBonus: 2,

  // Terrorizer
  terrorizerMoralePenalty: -2,

  // Warden
  wardenClashBonus: 2,

  // Brutal
  brutalExtraInjury: 1,

  // Fortification
  fortificationBonus: 1
};
