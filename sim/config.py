# ─── Configuration ──────────────────────────────────────────────────────

# ── Aftermath DCs ──
RECOVERY_BASE_DC = 12  # Actual DC = this + current injuries
HOPE_DC = 12
SALVAGE_DC = 12

# ── Aftermath outcomes ──
RECOVERY_WINNER_PASS = 0
RECOVERY_WINNER_FAIL = 1
RECOVERY_LOSER_PASS = 1
RECOVERY_LOSER_FAIL = 2
HOPE_WINNER_PASS = 2
HOPE_WINNER_FAIL = 1
HOPE_LOSER_PASS = -1
HOPE_LOSER_FAIL = -2

# ── Legion durability ──
MAX_INJURIES = 6  # Destroyed at this many injuries
BULWARK_MAX_INJURIES = 7  # Bulwark tag raises threshold by 1
ROUT_THRESHOLD = 0  # Morale at/below this → rout
MORALE_CAP = 10
RELENTLESS_MIN_MORALE = 2  # Relentless tag: morale floor

# ── Recovery (idle legions each round) ──
IDLE_MORALE_RECOVERY = 1
IDLE_INJURY_RECOVERY = 1

# ── Commander Casualty ──
CASUALTY_BASE_RISK = {"winner": 6, "loser": 12, "crushed": 20}
CASUALTY_CRUSHED_THRESHOLD = -15  # Battle Score diff at or below → "crushed" (lost by 15+)
COMMANDER_DEATH_MORALE_LOSS = 1

# ── Tag bonuses / thresholds ──
ZEALOT_MORALE_THRESHOLD = 7  # Was 6; must reach 7+ Morale before bonus activates
ZEALOT_BONUS = 2
WARDEN_CLASH_BONUS = 2
WARDEN_ADJ_RECOVERY = 2  # Adjacent allied legions get +2 Recovery
IRONCLAD_BONUS = 2
INSPIRING_BONUS = 2
CUNNING_BONUS = 2
ENGINEER_PENALTY = -2  # Applied to all enemy battle rolls in fortified section
MAGE_PENALTY = -1  # Applied to all enemy battle rolls
HEADHUNTER_DEATH_BONUS = 5  # +5% added to enemy commander's death chance
DIVINE_BLOOD_DEATH_REDUC = 5  # -5% subtracted from own base death chance
CHARGE_WIN_CLASH_BONUS = 1  # Clash bonus for winning the Charge phase
FANATIC_BONUS = 2  # Flat bonus to Charge and Clash (was advantage on both)
MORALE_DIMINISHING_THRESHOLD = 7  # Morale gains reduced by 1 when at or above this
RALLIER_OWN_HOPE_BONUS = 2  # Rallier: +2 to own Hope check
RALLIER_ADJ_HOPE_BONUS = 1  # Rallier: +1 to adjacent allied legions' Hope check

# ── Reconnaissance thresholds ──
RECON_THRESHOLDS = [
    (10, "No intelligence"),
    (14, "2 enemy legions revealed"),
    (18, "Half enemy legions revealed"),
    (22, "All movements revealed"),
    (999, "All movements + Maneuver bonus"),
]
RECON_MANEUVER_BONUS_TIER = 23  # Roll >= this → +1 to all allied Maneuver rolls

MANEUVER_BENEFITS = [
    ("Flanking Position", "+1d4 to Charge"),
    ("Defensive Footing", "+1d2 to Clash"),
    ("Disrupted Formation", "-1 to enemy Charge and Clash"),
    ("Seized Initiative", "+1d2 extra injury to enemy if won"),
]

SALVAGE_BENEFITS = [
    "Captured Supplies (-1 injury)",
    "Tactical Insight (+2 Wit next round)",
    "Enemy Shaken (-1 enemy Morale)",
    "Quick Fortify",
]

STRATEGIC_OBJECTIVES = {
    "Temple of the Five": {"miracles": 2, "section": 1},
    "Royal Palace": {"miracles": 2, "section": 2},
    "The Dockyard": {"miracles": 1, "section": 3},
    "Soldier's Gate": {"miracles": 1, "section": 4},
    "The Agora": {"miracles": 1, "section": 5},
    "The Academy": {"miracles": 2, "section": 6},
    "The Gymnasium": {"miracles": 1, "section": 7},
    "The Harp Bridge": {"miracles": 1, "section": 8},
    "The Vineyards": {"miracles": 1, "section": 9},
    "Fish Market": {"miracles": 1, "section": 10},
}
