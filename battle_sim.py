"""
Battle of Mytros — Mass Combat Simulator
=========================================
A full simulation of the v3 mass combat system with rich visualizations.
Legion and Commander stats are loaded from CSV files for easy editing.

Run:  python battle_sim.py
Options:
  --rounds N          Number of rounds to simulate (default: 8)
  --seed N            Random seed for reproducibility
  --no-display        Save figures to files instead of displaying
  --legions FILE      Path to legions CSV  (default: legions.csv)
  --commanders FILE   Path to commanders CSV (default: commanders.csv)
"""

import random
import math
import csv
import os
import argparse
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum
import matplotlib
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from collections import defaultdict

# ─── Configuration ──────────────────────────────────────────────────────
# All tunable values for the combat system. Edit these to balance your game.
# Each variable maps to a rule in the Battle of Mytros docx.

# ── Battle Counter (determines who wins each engagement) ──
BATTLE_COUNTER_WIN = 1             # Counter points scored for winning Maneuver or Charge
BATTLE_COUNTER_CLASH_WIN = 2       # Counter points scored for winning the Clash phase
BATTLE_COUNTER_NAT20_BONUS = 1     # Extra counter point on a natural 20 (total win = base + 1)
BATTLE_COUNTER_NAT1_PENALTY = 1    # Extra counter point LOST on a natural 1 (total loss = base + 1)

# ── Aftermath DCs ──
RECOVERY_BASE_DC = 12              # Base DC for Recovery check; actual DC = this + current injuries
HOPE_DC = 12                       # DC for the Hope (morale) check
HOPE_MORALE_OFFSET = 5             # Hope modifier = current Morale − this value
SALVAGE_DC = 12                    # DC for the Salvage check (Wit-based)

# ── Aftermath outcomes ──
RECOVERY_WINNER_PASS = 0           # Injuries gained: winner who passes Recovery
RECOVERY_WINNER_FAIL = 1           # Injuries gained: winner who fails Recovery
RECOVERY_LOSER_PASS = 1            # Injuries gained: loser who passes Recovery
RECOVERY_LOSER_FAIL = 2            # Injuries gained: loser who fails Recovery
HOPE_WINNER_PASS = 2               # Morale change: winner who passes Hope
HOPE_WINNER_FAIL = 1               # Morale change: winner who fails Hope
HOPE_LOSER_PASS = -1               # Morale change: loser who passes Hope
HOPE_LOSER_FAIL = -2               # Morale change: loser who fails Hope

# ── Legion durability ──
MAX_INJURIES = 6                   # Injuries at which a legion is destroyed and removed
ROUT_THRESHOLD = 0                 # Morale at or below this → legion routs
MORALE_CAP = 10                    # Maximum morale a legion can reach (base + commander + modifiers)

# ── Time structure ──
ROUNDS_PER_DAY = 8                 # Rounds per battle day; tags reset at the start of each new day

# ── Recovery rules (non-fighting & routed legions) ──
IDLE_MORALE_RECOVERY = 1           # Morale regained per round by any non-fighting legion (including routed)
IDLE_INJURY_RECOVERY = 1           # Injuries healed per round by any non-fighting legion (including routed)
ROUT_ATTACKED_DESTROYS = True      # TABLE RULE (not simulated): routed legion at morale 0 attacked on map = destroyed

# ── Overnight recovery (end of battle day, applied to ALL legions) ──
OVERNIGHT_INJURY_RECOVERY = 1      # Injuries healed overnight (only if injuries ≤ 5); from docx "The Battle Day"
OVERNIGHT_MORALE_RECOVERY = 1      # Extra morale regained overnight by all legions

# ── Commander Casualty ──
# Commander survives if 1d100 rolls strictly above their Death Chance.
# Death Chance = Base Risk - (Commander Vitality + Legion Morale). Min 1%.
CASUALTY_BASE_RISK = {"winner": 6, "loser": 12, "crushed": 18}  # Base % risk of death
CASUALTY_CRUSHED_THRESHOLD = -3    # Battle counter diff at or below this → use "crushed" DC
COMMANDER_DEATH_MORALE_LOSS = 1    # Morale lost by the legion when its commander dies

# ── Tag effects (combat) ──
FANATIC_BONUS = 5                  # Bonus to one battle roll when Fanatic is activated
FANATIC_TRIGGER_INJURIES = 3       # AI uses Fanatic when legion injuries ≥ this
FANATIC_EXTRA_INJURY = 1           # Extra injury taken after battle when Fanatic was active
ZEALOT_MORALE_THRESHOLD = 7        # Zealot tag only works if legion Morale ≥ this
ZEALOT_BONUS = 2                   # Bonus to all battle rolls from Zealot
MOMENTUM_BONUS = 1                 # Charge bonus if the legion won its previous battle
MANEUVER_FLANKING_BONUS = 2        # Charge bonus from Flanking Position maneuver
MANEUVER_DEFENSIVE_BONUS = 2       # Clash bonus from Defensive Footing maneuver
MANEUVER_DISRUPTED_PENALTY = -2    # Enemy Charge penalty from Disrupted Formation maneuver
CHARGE_WIN_CLASH_BONUS = 1         # Clash bonus for winning the Charge phase
SALVAGE_INSIGHT_BONUS = 2          # Wit bonus next round from Tactical Insight salvage

# ── Reconnaissance ──
SCOUT_TAG_RECON_BONUS = 3          # Recon bonus per Scout-tagged commander
RECON_THRESHOLDS = [               # (max_total, description) — checked in order, first match wins
    (10, "No intelligence"),
    (14, "1 enemy legion revealed"),
    (18, "Half enemy legions revealed"),
    (22, "All enemy movements revealed"),
]
# Rolls above the highest threshold return the last entry ("All enemy movements revealed")

MANEUVER_BENEFITS = [
    ("Flanking Position", "+2 to Charge"),
    ("Defensive Footing", "+2 to Clash"),
    ("Disrupted Formation", "-2 to enemy Charge"),
    ("Seized Initiative", "+1 extra injury if win"),
]

SALVAGE_BENEFITS = [
    "Captured Supplies (-1 injury)",
    "Tactical Insight (+2 Wit next round)",
    "Enemy Shaken (-1 enemy Morale)",
    "Quick Fortify",
]


# ─── Enums & Data Classes ──────────────────────────────────────────────

class Faction(Enum):
    ALLIED = "Allied"
    ENEMY = "Enemy"



class BattleResult(Enum):
    WIN = "Win"
    LOSS = "Loss"
    NO_BATTLE = "No Battle"


@dataclass
class Tag:
    name: str
    used: bool = False

    def reset(self):
        self.used = False


@dataclass
class Commander:
    name: str
    vit_bonus: int
    mor_bonus: int
    wit_bonus: int
    tags: list[str] = field(default_factory=list)
    alive: bool = True
    tag_objects: list[Tag] = field(default_factory=list)

    def __post_init__(self):
        self.tag_objects = [Tag(t) for t in self.tags]

    @property
    def total_bonus(self):
        return self.vit_bonus + self.mor_bonus + self.wit_bonus

    def has_tag(self, name: str) -> bool:
        return any(t.name == name and not t.used for t in self.tag_objects)

    def use_tag(self, name: str) -> bool:
        for t in self.tag_objects:
            if t.name == name and not t.used:
                t.used = True
                return True
        return False

    def reset_tags(self):
        for t in self.tag_objects:
            t.reset()


@dataclass
class Legion:
    name: str
    faction: Faction
    vit_base: int
    mor_base: int
    wit_base: int
    commander: Commander
    injuries: int = 0
    morale_mod: int = 0  # cumulative morale changes from Hope checks
    routed: bool = False
    destroyed: bool = False
    section: int = 0
    fortified_section: int = -1
    rounds_held: int = 0
    wit_temp_bonus: int = 0  # from Tactical Insight salvage
    won_last_round: bool = False
    commanders_lost: int = 0  # total commanders killed commanding this legion

    # History tracking
    history_injuries: list = field(default_factory=list)
    history_morale: list = field(default_factory=list)
    history_results: list = field(default_factory=list)
    history_vit: list = field(default_factory=list)
    history_mor: list = field(default_factory=list)
    history_wit: list = field(default_factory=list)

    @property
    def vit_total(self):
        base = self.vit_base + (self.commander.vit_bonus if self.commander.alive else 0)
        return max(0, base)

    @property
    def mor_total(self):
        # Cap applies to the final total (base + commander + battle gains)
        total = self.mor_base + (self.commander.mor_bonus if self.commander.alive else 0) + self.morale_mod
        return min(MORALE_CAP, max(0, total))

    @property
    def wit_total(self):
        base = self.wit_base + (self.commander.wit_bonus if self.commander.alive else 0) + self.wit_temp_bonus
        return max(0, base)

    @property
    def effective(self):
        return not self.destroyed and not self.routed

    def record_state(self, result: BattleResult):
        self.history_injuries.append(self.injuries)
        self.history_morale.append(self.mor_total)
        self.history_results.append(result)
        self.history_vit.append(self.vit_total)
        self.history_mor.append(self.mor_total)
        self.history_wit.append(self.wit_total)


# ─── Dice Rolling ───────────────────────────────────────────────────────

def d20():
    return random.randint(1, 20)


def contested_roll(bonus_a: int, bonus_b: int, adv_a=False, adv_b=False, disadv_a=False, disadv_b=False):
    """Roll contested d20s with modifiers. Returns (roll_a, roll_b, total_a, total_b, nat20_a, nat20_b, nat1_a, nat1_b)."""
    def roll(advantage=False, disadvantage=False):
        r1 = d20()
        if advantage and not disadvantage:
            r2 = d20()
            return max(r1, r2)
        elif disadvantage and not advantage:
            r2 = d20()
            return min(r1, r2)
        return r1

    ra = roll(adv_a, disadv_a)
    rb = roll(adv_b, disadv_b)
    return ra, rb, ra + bonus_a, rb + bonus_b, ra == 20, rb == 20, ra == 1, rb == 1


def determine_phase_winner(total_a, total_b, nat20_a, nat20_b, nat1_a, nat1_b):
    """Returns 'a', 'b', or 'tie'."""
    if nat20_a and not nat20_b:
        return 'a'
    if nat20_b and not nat20_a:
        return 'b'
    if nat1_a and not nat1_b:
        return 'b'
    if nat1_b and not nat1_a:
        return 'a'
    if total_a > total_b:
        return 'a'
    elif total_b > total_a:
        return 'b'
    return 'tie'


# ─── Battle Mechanics ───────────────────────────────────────────────────

@dataclass
class PhaseResult:
    phase_name: str
    roll_a: int
    roll_b: int
    total_a: int
    total_b: int
    nat20_a: bool
    nat20_b: bool
    nat1_a: bool
    nat1_b: bool
    winner: str  # 'a', 'b', 'tie'
    counter_a_delta: int = 0
    counter_b_delta: int = 0


@dataclass
class BattleLog:
    legion_a: str
    legion_b: str
    phases: list[PhaseResult] = field(default_factory=list)
    counter_a: int = 0
    counter_b: int = 0
    winner: str = ""
    maneuver_benefit: str = ""
    aftermath_a: dict = field(default_factory=dict)
    aftermath_b: dict = field(default_factory=dict)


def apply_tag_bonuses(legion: Legion, phase: str, is_attacker: bool):
    """Calculate extra bonuses from tags and conditions. Returns (bonus, advantage, notes)."""
    bonus = 0
    advantage = False
    notes = []

    # Momentum: bonus to Charge if won last round
    if phase == "charge" and legion.won_last_round:
        bonus += MOMENTUM_BONUS
        notes.append(f"Momentum +{MOMENTUM_BONUS}")

    # Zealot: bonus to all if Morale >= threshold
    if legion.commander.alive and legion.commander.has_tag("Zealot") and legion.mor_total >= ZEALOT_MORALE_THRESHOLD:
        bonus += ZEALOT_BONUS
        notes.append(f"Zealot +{ZEALOT_BONUS}")

    # Scout: +1 to own Maneuver roll
    if phase == "maneuver" and legion.commander.alive and getattr(legion, '_scout_active', False):
        bonus += 1
        notes.append("Scout +1")

    # Vanguard: +2 to Charge roll
    if phase == "charge" and legion.commander.alive and getattr(legion, '_vanguard_active', False):
        bonus += 2
        notes.append("Vanguard +2")

    # Engineer: +2 to all rolls when defending fortified section
    if legion.commander.alive and getattr(legion, '_engineer_active', False):
        bonus += 2
        notes.append("Engineer +2")

    # Warden: +2 to own Clash roll
    if phase == "clash" and legion.commander.alive and getattr(legion, '_warden_active', False):
        bonus += 2
        notes.append("Warden +2")

    return bonus, advantage, notes


def simulate_battle(legion_a: Legion, legion_b: Legion, log: BattleLog):
    """Simulate a full 3-phase battle between two legions."""
    counter_a = 0
    counter_b = 0
    charge_bonus_a = 0
    charge_bonus_b = 0
    clash_bonus_a = 0
    clash_bonus_b = 0
    seized_init_a = False
    seized_init_b = False

    # --- AI tag usage decisions (simple heuristic) ---
    for legion in [legion_a, legion_b]:
        if legion.commander.alive:
            # Fanatic: desperate push when injured
            if legion.commander.has_tag("Fanatic") and legion.injuries >= FANATIC_TRIGGER_INJURIES:
                legion.commander.use_tag("Fanatic")
                legion._fanatic_active = True
            else:
                legion._fanatic_active = False

            # Tactician: advantage on Maneuver
            if legion.commander.has_tag("Tactician"):
                legion.commander.use_tag("Tactician")
                legion._tactician_active = True
            else:
                legion._tactician_active = False

            # Mage: impose disadvantage on enemy Maneuver
            if legion.commander.has_tag("Mage"):
                legion.commander.use_tag("Mage")
                legion._mage_target = "maneuver"
            else:
                legion._mage_target = None

            # Scout: +1 to own Maneuver (always use)
            legion._scout_active = legion.commander.has_tag("Scout")
            if legion._scout_active:
                legion.commander.use_tag("Scout")

            # Vanguard: +2 to Charge (always use)
            legion._vanguard_active = legion.commander.has_tag("Vanguard")
            if legion._vanguard_active:
                legion.commander.use_tag("Vanguard")

            # Warden: +2 to own Clash (always use)
            legion._warden_active = legion.commander.has_tag("Warden")
            if legion._warden_active:
                legion.commander.use_tag("Warden")

            # Engineer: +2 to all rolls when defending fortified section
            if legion.commander.has_tag("Engineer") and legion.fortified_section != -1 and legion.section == legion.fortified_section:
                legion._engineer_active = True
                legion.commander.use_tag("Engineer")
            else:
                legion._engineer_active = False

            # Headhunter: nullify enemy commander's Vit bonus in Clash
            legion._headhunter_active = legion.commander.has_tag("Headhunter")
            if legion._headhunter_active:
                legion.commander.use_tag("Headhunter")

            # Divine Blood: first phase win scores +2 instead of +1 (tracked during phases)
            legion._divine_blood_bonus_remaining = 1 if legion.commander.has_tag("Divine Blood") else 0
            if legion._divine_blood_bonus_remaining:
                legion.commander.use_tag("Divine Blood")

            # Brutal / Terrorizer: mark active — effects applied in aftermath
            legion._brutal_active = legion.commander.has_tag("Brutal")
            legion._terrorizer_active = legion.commander.has_tag("Terrorizer")
        else:
            legion._fanatic_active = False
            legion._tactician_active = False
            legion._mage_target = None
            legion._scout_active = False
            legion._vanguard_active = False
            legion._warden_active = False
            legion._headhunter_active = False
            legion._divine_blood_bonus_remaining = 0
            legion._brutal_active = False
            legion._terrorizer_active = False
            legion._engineer_active = False

    # === PHASE 1: MANEUVER (Wit) ===
    adv_a = getattr(legion_a, '_tactician_active', False)
    adv_b = getattr(legion_b, '_tactician_active', False)
    disadv_a = getattr(legion_b, '_mage_target', None) == "maneuver"
    disadv_b = getattr(legion_a, '_mage_target', None) == "maneuver"

    extra_a, _, _ = apply_tag_bonuses(legion_a, "maneuver", True)
    extra_b, _, _ = apply_tag_bonuses(legion_b, "maneuver", False)

    rerolls = 0
    winner = 'tie'
    while rerolls <= 3:
        ra, rb, ta, tb, n20a, n20b, n1a, n1b = contested_roll(
            legion_a.wit_total + extra_a, legion_b.wit_total + extra_b,
            adv_a=adv_a, adv_b=adv_b, disadv_a=disadv_a, disadv_b=disadv_b
        )
        winner = determine_phase_winner(ta, tb, n20a, n20b, n1a, n1b)
        if winner != 'tie':
            break
        rerolls += 1

    da, db = 0, 0
    if winner == 'a':
        da = BATTLE_COUNTER_WIN + (BATTLE_COUNTER_NAT20_BONUS if n20a else 0)
        db = -BATTLE_COUNTER_WIN - (BATTLE_COUNTER_NAT1_PENALTY if n1b else 0)
        # Divine Blood: first win scores +2 instead of +1
        if legion_a._divine_blood_bonus_remaining:
            da += 1
            legion_a._divine_blood_bonus_remaining = 0
        benefit = random.choice(MANEUVER_BENEFITS)
        log.maneuver_benefit = f"{legion_a.name}: {benefit[0]}"
        if "Flanking" in benefit[0]:
            charge_bonus_a += MANEUVER_FLANKING_BONUS
        elif "Defensive" in benefit[0]:
            clash_bonus_a += MANEUVER_DEFENSIVE_BONUS
        elif "Disrupted" in benefit[0]:
            charge_bonus_b += MANEUVER_DISRUPTED_PENALTY
        elif "Seized" in benefit[0]:
            seized_init_a = True
    elif winner == 'b':
        db = BATTLE_COUNTER_WIN + (BATTLE_COUNTER_NAT20_BONUS if n20b else 0)
        da = -BATTLE_COUNTER_WIN - (BATTLE_COUNTER_NAT1_PENALTY if n1a else 0)
        if legion_b._divine_blood_bonus_remaining:
            db += 1
            legion_b._divine_blood_bonus_remaining = 0
        benefit = random.choice(MANEUVER_BENEFITS)
        log.maneuver_benefit = f"{legion_b.name}: {benefit[0]}"
        if "Flanking" in benefit[0]:
            charge_bonus_b += MANEUVER_FLANKING_BONUS
        elif "Defensive" in benefit[0]:
            clash_bonus_b += MANEUVER_DEFENSIVE_BONUS
        elif "Disrupted" in benefit[0]:
            charge_bonus_a += MANEUVER_DISRUPTED_PENALTY
        elif "Seized" in benefit[0]:
            seized_init_b = True

    counter_a += da
    counter_b += db
    log.phases.append(PhaseResult("Maneuver (Wit)", ra, rb, ta, tb, n20a, n20b, n1a, n1b, winner, da, db))

    # === PHASE 2: CHARGE (Morale) ===
    extra_a2, _, _ = apply_tag_bonuses(legion_a, "charge", True)
    extra_b2, _, _ = apply_tag_bonuses(legion_b, "charge", False)

    ra, rb, ta, tb, n20a, n20b, n1a, n1b = contested_roll(
        legion_a.mor_total + charge_bonus_a + extra_a2,
        legion_b.mor_total + charge_bonus_b + extra_b2
    )
    winner = determine_phase_winner(ta, tb, n20a, n20b, n1a, n1b)
    da, db = 0, 0
    if winner == 'a':
        da = BATTLE_COUNTER_WIN + (BATTLE_COUNTER_NAT20_BONUS if n20a else 0)
        db = -BATTLE_COUNTER_WIN - (BATTLE_COUNTER_NAT1_PENALTY if n1b else 0)
        if legion_a._divine_blood_bonus_remaining:
            da += 1
            legion_a._divine_blood_bonus_remaining = 0
        clash_bonus_a += CHARGE_WIN_CLASH_BONUS
    elif winner == 'b':
        db = BATTLE_COUNTER_WIN + (BATTLE_COUNTER_NAT20_BONUS if n20b else 0)
        da = -BATTLE_COUNTER_WIN - (BATTLE_COUNTER_NAT1_PENALTY if n1a else 0)
        if legion_b._divine_blood_bonus_remaining:
            db += 1
            legion_b._divine_blood_bonus_remaining = 0
        clash_bonus_b += CHARGE_WIN_CLASH_BONUS
    counter_a += da
    counter_b += db
    log.phases.append(PhaseResult("Charge (Morale)", ra, rb, ta, tb, n20a, n20b, n1a, n1b, winner, da, db))

    # === PHASE 3: CLASH (Vitality) ===
    fanatic_bonus_a = FANATIC_BONUS if getattr(legion_a, '_fanatic_active', False) else 0
    fanatic_bonus_b = FANATIC_BONUS if getattr(legion_b, '_fanatic_active', False) else 0
    # Headhunter: nullify enemy commander's Vit bonus
    headhunter_vit_b = (legion_b.commander.vit_bonus if legion_b.commander.alive else 0) if legion_a._headhunter_active else 0
    headhunter_vit_a = (legion_a.commander.vit_bonus if legion_a.commander.alive else 0) if legion_b._headhunter_active else 0

    ra, rb, ta, tb, n20a, n20b, n1a, n1b = contested_roll(
        legion_a.vit_total + clash_bonus_a + fanatic_bonus_a - headhunter_vit_a,
        legion_b.vit_total + clash_bonus_b + fanatic_bonus_b - headhunter_vit_b
    )
    winner = determine_phase_winner(ta, tb, n20a, n20b, n1a, n1b)
    da, db = 0, 0
    if winner == 'a':
        da = BATTLE_COUNTER_CLASH_WIN + (BATTLE_COUNTER_NAT20_BONUS if n20a else 0)
        db = -BATTLE_COUNTER_WIN - (BATTLE_COUNTER_NAT1_PENALTY if n1b else 0)
        if legion_a._divine_blood_bonus_remaining:
            da += 1
            legion_a._divine_blood_bonus_remaining = 0
    elif winner == 'b':
        db = BATTLE_COUNTER_CLASH_WIN + (BATTLE_COUNTER_NAT20_BONUS if n20b else 0)
        da = -BATTLE_COUNTER_WIN - (BATTLE_COUNTER_NAT1_PENALTY if n1a else 0)
        if legion_b._divine_blood_bonus_remaining:
            db += 1
            legion_b._divine_blood_bonus_remaining = 0
    counter_a += da
    counter_b += db
    log.phases.append(PhaseResult("Clash (Vitality)", ra, rb, ta, tb, n20a, n20b, n1a, n1b, winner, da, db))

    # Tie-breaker
    if counter_a == counter_b:
        while counter_a == counter_b:
            ra2, rb2, ta2, tb2, n20a2, n20b2, n1a2, n1b2 = contested_roll(legion_a.vit_total, legion_b.vit_total)
            w = determine_phase_winner(ta2, tb2, n20a2, n20b2, n1a2, n1b2)
            if w == 'a':
                counter_a += 1
            elif w == 'b':
                counter_b += 1

    log.counter_a = counter_a
    log.counter_b = counter_b
    log.winner = "a" if counter_a > counter_b else "b"

    return log


# ─── Aftermath ──────────────────────────────────────────────────────────

def run_aftermath(legion: Legion, won: bool, battle_counter_diff: int,
                  disadv_recovery: bool = False, disadv_hope: bool = False,
                  terrorizer_penalty: bool = False, brutal_extra_injury: bool = False,
                  warden_recovery_bonus: int = 0):
    """Run all aftermath checks for a legion. Returns a dict of results."""
    results = {}

    # --- Recovery Check (Vitality) ---
    roll = max(d20(), d20()) if disadv_recovery else d20()
    # Veteran: treat d20 as 10 when it helps pass Recovery
    if legion.commander.alive and legion.commander.has_tag("Veteran"):
        if roll + legion.vit_total + warden_recovery_bonus < RECOVERY_BASE_DC + legion.injuries and 10 + legion.vit_total + warden_recovery_bonus >= RECOVERY_BASE_DC + legion.injuries:
            roll = 10
            legion.commander.use_tag("Veteran")
    dc = RECOVERY_BASE_DC + legion.injuries
    passed = (roll != 1) and (roll + legion.vit_total + warden_recovery_bonus >= dc)
    if won:
        injuries_gained = RECOVERY_WINNER_PASS if passed else RECOVERY_WINNER_FAIL
    else:
        injuries_gained = RECOVERY_LOSER_PASS if passed else RECOVERY_LOSER_FAIL

    # Fanatic injury (always, regardless of recovery result)
    if getattr(legion, '_fanatic_active', False):
        injuries_gained += FANATIC_EXTRA_INJURY

    # Medic: prevent 2 injuries from a failed Recovery
    if not passed and legion.commander.alive and legion.commander.has_tag("Medic"):
        injuries_gained = max(0, injuries_gained - 2)
        legion.commander.use_tag("Medic")

    # Brutal: +1 additional injury if enemy has 4+ injuries (applied by caller via brutal_extra_injury)
    if brutal_extra_injury:
        injuries_gained += 1

    legion.injuries = min(MAX_INJURIES, legion.injuries + injuries_gained)
    if legion.injuries >= MAX_INJURIES:
        legion.destroyed = True

    results["recovery"] = {"roll": roll, "dc": dc, "passed": passed, "injuries_gained": injuries_gained}

    # --- Hope Check (Morale) ---
    hope_mod = legion.mor_total - HOPE_MORALE_OFFSET
    roll = min(d20(), d20()) if disadv_hope else d20()
    passed = roll + hope_mod >= HOPE_DC

    # Rallier: auto-succeed Hope; also restore Morale if routing
    rallier_alive = legion.commander.alive and legion.commander.has_tag("Rallier")
    if rallier_alive and (not passed or legion.routed):
        passed = True
        legion.commander.use_tag("Rallier")
        if legion.routed:
            # Restore morale so mor_total reaches at least 1
            static = legion.mor_base + (legion.commander.mor_bonus if legion.commander.alive else 0)
            if static + legion.morale_mod < 1:
                legion.morale_mod = 1 - static
            legion.routed = False

    if won:
        morale_change = HOPE_WINNER_PASS if passed else HOPE_WINNER_FAIL
    else:
        morale_change = HOPE_LOSER_PASS if passed else HOPE_LOSER_FAIL
        # Terrorizer: extra -1 morale if enemy lost and failed Hope
        if terrorizer_penalty and not passed:
            morale_change -= 1

    legion.morale_mod += morale_change
    if legion.mor_total <= ROUT_THRESHOLD and not legion.destroyed:
        legion.routed = True

    results["hope"] = {"roll": roll, "mod": hope_mod, "passed": passed, "morale_change": morale_change}

    # --- Salvage Check (Wit) ---
    roll = d20()
    passed = roll + legion.wit_total >= SALVAGE_DC
    nat20 = roll == 20
    benefits = []
    if passed:
        b = random.choice(SALVAGE_BENEFITS)
        benefits.append(b)
        if "Supplies" in b:
            legion.injuries = max(0, legion.injuries - 1)
        elif "Insight" in b:
            legion.wit_temp_bonus += SALVAGE_INSIGHT_BONUS
        elif "Shaken" in b:
            pass  # applied to enemy externally
        elif "Fortify" in b:
            if legion.section != -1:
                legion.fortified_section = legion.section
    if nat20 and passed:
        remaining = [x for x in SALVAGE_BENEFITS if x != b]
        if remaining:
            b2 = random.choice(remaining)
            benefits.append(b2)
            if "Supplies" in b2:
                legion.injuries = max(0, legion.injuries - 1)
            elif "Insight" in b2:
                legion.wit_temp_bonus += SALVAGE_INSIGHT_BONUS
            elif "Shaken" in b2:
                pass  # applied to enemy externally
            elif "Fortify" in b2:
                if legion.section != -1:
                    legion.fortified_section = legion.section

    results["salvage"] = {"roll": roll, "passed": passed, "benefits": benefits}

    # --- Commander Casualty Check (Percentile-based survival) ---
    if legion.commander.alive:
        has_team_b = any(t.name == "Team B" for t in legion.commander.tag_objects)
        d100 = lambda: random.randint(1, 100)
        roll = max(d100(), d100()) if has_team_b else d100()

        if won:
            base_risk = CASUALTY_BASE_RISK["winner"]
        elif battle_counter_diff <= CASUALTY_CRUSHED_THRESHOLD:
            base_risk = CASUALTY_BASE_RISK["crushed"]
        else:
            base_risk = CASUALTY_BASE_RISK["loser"]

        protection = legion.commander.vit_bonus + legion.mor_total
        death_chance = max(1, base_risk - protection)

        survived = roll > death_chance
        died = not survived
        if died:
            legion.commander.alive = False
            legion.morale_mod -= COMMANDER_DEATH_MORALE_LOSS

        results["casualty"] = {"roll": roll, "effective": roll, "dc": death_chance + 1, "died": died, "vit": protection}
    else:
        results["casualty"] = {"roll": 0, "effective": 0, "dc": 0, "died": False}

    # Reset temp bonuses
    legion.wit_temp_bonus = 0

    return results


# ─── Reconnaissance ─────────────────────────────────────────────────────

def reconnaissance_roll(allied_legions: list[Legion]):
    best_wit = max((l.wit_total for l in allied_legions if l.effective), default=0)
    scout_bonus = sum(1 for l in allied_legions if l.commander.alive and l.commander.has_tag("Scout") and l.effective)
    roll = d20()
    total = roll + best_wit + scout_bonus * SCOUT_TAG_RECON_BONUS
    for threshold, description in RECON_THRESHOLDS:
        if total <= threshold:
            return total, description
    return total, RECON_THRESHOLDS[-1][1]


# ─── Army Builder (CSV-based) ──────────────────────────────────────────

def load_legions_from_csv(path: str) -> list[dict]:
    """Load legion definitions from a CSV file."""
    legions = []
    with open(path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            legions.append({
                'name': row['name'].strip(),
                'faction': row['faction'].strip(),
                'vitality': int(row['vitality']),
                'morale': int(row['morale']),
                'wit': int(row['wit']),
            })
    return legions


def load_commanders_from_csv(path: str) -> list[dict]:
    """Load commander definitions from a CSV file."""
    commanders = []
    with open(path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            tags_str = row.get('tags', '').strip()
            tags = [t.strip() for t in tags_str.split(',') if t.strip()] if tags_str else []
            commanders.append({
                'name': row['name'].strip(),
                'faction': row['faction'].strip(),
                'vitality': int(row['vitality']),
                'morale': int(row['morale']),
                'wit': int(row['wit']),
                'tags': tags,
                'legion': row.get('legion', '').strip(),
            })
    return commanders


@dataclass
class CommanderPool:
    """Manages reserve commanders for succession when a commander falls."""
    allied_reserves: list[Commander] = field(default_factory=list)
    enemy_reserves: list[Commander] = field(default_factory=list)

    def get_replacement(self, faction: Faction) -> Optional[Commander]:
        """Get a random available replacement commander for the faction."""
        pool = self.allied_reserves if faction == Faction.ALLIED else self.enemy_reserves
        if not pool:
            return None
        # Pick completely randomly from reserves
        idx = random.randint(0, len(pool) - 1)
        return pool.pop(idx)


def build_armies_from_csv(legions_path: str, commanders_path: str):
    """Build allied and enemy armies from CSV files. Returns (allied, enemy, commander_pool)."""
    legion_defs = load_legions_from_csv(legions_path)
    commander_defs = load_commanders_from_csv(commanders_path)

    # Map faction strings to Faction enum
    faction_map = {
        'allied': Faction.ALLIED, 'people': Faction.ALLIED,
        'enemy': Faction.ENEMY, 'sydon': Faction.ENEMY,
    }

    # Build commander objects
    assigned_commanders = {}  # legion_name -> Commander
    allied_reserves = []
    enemy_reserves = []

    for cdef in commander_defs:
        faction_key = cdef['faction'].lower()
        faction = faction_map.get(faction_key)
        if faction is None:
            continue

        cmd = Commander(
            name=cdef['name'],
            vit_bonus=cdef['vitality'],
            mor_bonus=cdef['morale'],
            wit_bonus=cdef['wit'],
            tags=cdef['tags'],
        )

        if faction == Faction.ALLIED:
            allied_reserves.append(cmd)
        else:
            enemy_reserves.append(cmd)

    # Randomize pools
    random.shuffle(allied_reserves)
    random.shuffle(enemy_reserves)

    # Build legion objects using randomized commander assignment
    allied = []
    enemy = []

    for ldef in legion_defs:
        faction_key = ldef['faction'].lower()
        faction = faction_map.get(faction_key)
        if faction is None:
            continue

        pool = allied_reserves if faction == Faction.ALLIED else enemy_reserves
        if pool:
            commander = pool.pop(0)
        else:
            commander = Commander(name="(Vacant)", vit_bonus=0, mor_bonus=0, wit_bonus=0, tags=[])

        legion = Legion(
            name=ldef['name'],
            faction=faction,
            vit_base=ldef['vitality'],
            mor_base=ldef['morale'],
            wit_base=ldef['wit'],
            commander=commander,
        )

        if faction == Faction.ALLIED:
            allied.append(legion)
        else:
            enemy.append(legion)

    pool = CommanderPool(allied_reserves=allied_reserves, enemy_reserves=enemy_reserves)
    return allied, enemy, pool


# ─── Simulation Engine ──────────────────────────────────────────────────

@dataclass
class RoundSummary:
    round_num: int
    recon_result: str
    recon_total: int
    battles: list[BattleLog] = field(default_factory=list)
    allied_losses: int = 0
    enemy_losses: int = 0
    allied_commander_deaths: list[str] = field(default_factory=list)
    enemy_commander_deaths: list[str] = field(default_factory=list)
    allied_commander_death_events: list[dict] = field(default_factory=list)
    enemy_commander_death_events: list[dict] = field(default_factory=list)
    successions: list[str] = field(default_factory=list)  # "LegionName: OldCmdr → NewCmdr"
    rallied: list[str] = field(default_factory=list)      # legions that recovered from rout


def simulate_round(allied: list[Legion], enemy: list[Legion], round_num: int,
                   commander_pool: Optional[CommanderPool] = None) -> RoundSummary:
    """Simulate one round of combat."""
    summary = RoundSummary(round_num=round_num, recon_result="", recon_total=0)

    # ── Tag reset at the start of each battle day ──
    if (round_num - 1) % ROUNDS_PER_DAY == 0:
        for l in allied + enemy:
            if l.commander.alive:
                l.commander.reset_tags()

    # ── Overnight recovery at start of new day (applied to all non-destroyed) ──
    if (round_num - 1) % ROUNDS_PER_DAY == 0 and round_num > 1:
        for l in allied + enemy:
            if not l.destroyed:
                if l.injuries > 0 and l.injuries <= 5 and OVERNIGHT_INJURY_RECOVERY > 0:
                    l.injuries = max(0, l.injuries - OVERNIGHT_INJURY_RECOVERY)
                if OVERNIGHT_MORALE_RECOVERY > 0:
                    l.morale_mod += OVERNIGHT_MORALE_RECOVERY
                if l.routed and l.mor_total > ROUT_THRESHOLD:
                    l.routed = False
                    faction_tag = "Allied" if l.faction == Faction.ALLIED else "Enemy"
                    summary.rallied.append(f"{faction_tag}: {l.name} (Morale: {l.mor_total}, overnight)")

    # Reconnaissance
    active_allied = [l for l in allied if l.effective]
    active_enemy = [l for l in enemy if l.effective]

    if not active_allied or not active_enemy:
        return summary

    recon_total, recon_result = reconnaissance_roll(active_allied)
    summary.recon_result = recon_result
    summary.recon_total = recon_total

    # Simple pairing: pair legions 1-to-1 in order, extras skip
    random.shuffle(active_allied)
    random.shuffle(active_enemy)
    num_battles = min(len(active_allied), len(active_enemy))

    fought_this_round = set()

    for i in range(num_battles):
        la = active_allied[i]
        le = active_enemy[i]
        fought_this_round.add(id(la))
        fought_this_round.add(id(le))

        log = BattleLog(legion_a=la.name, legion_b=le.name)
        simulate_battle(la, le, log)

        won_a = log.winner == "a"
        counter_diff_a = log.counter_a - log.counter_b

        # Aftermath — compute cross-effects from Brutal and Terrorizer
        brutal_a_won = won_a and getattr(la, '_brutal_active', False)
        brutal_b_won = (not won_a) and getattr(le, '_brutal_active', False)
        if brutal_a_won: la.commander.use_tag("Brutal") if la.commander.alive and la.commander.has_tag("Brutal") else None
        if brutal_b_won: le.commander.use_tag("Brutal") if le.commander.alive and le.commander.has_tag("Brutal") else None
        terrorizer_a = getattr(la, '_terrorizer_active', False)
        terrorizer_b = getattr(le, '_terrorizer_active', False)
        if terrorizer_a: la.commander.use_tag("Terrorizer") if la.commander.alive and la.commander.has_tag("Terrorizer") else None
        if terrorizer_b: le.commander.use_tag("Terrorizer") if le.commander.alive and le.commander.has_tag("Terrorizer") else None

        # Warden adjacent recovery bonus
        warden_recovery_bonus_a = sum(2 for other in active_allied if other != la and getattr(other, '_warden_active', False) and abs(other.section - la.section) == 1)
        warden_recovery_bonus_b = sum(2 for other in active_enemy if other != le and getattr(other, '_warden_active', False) and abs(other.section - le.section) == 1)

        aftermath_a = run_aftermath(la, won_a, counter_diff_a,
                                    disadv_recovery=brutal_b_won,
                                    disadv_hope=terrorizer_b,
                                    terrorizer_penalty=terrorizer_b and not won_a,
                                    brutal_extra_injury=brutal_b_won and la.injuries >= 4,
                                    warden_recovery_bonus=warden_recovery_bonus_a)
        aftermath_b = run_aftermath(le, not won_a, -counter_diff_a,
                                    disadv_recovery=brutal_a_won,
                                    disadv_hope=terrorizer_a,
                                    terrorizer_penalty=terrorizer_a and won_a,
                                    brutal_extra_injury=brutal_a_won and le.injuries >= 4,
                                    warden_recovery_bonus=warden_recovery_bonus_b)

        # ── Apply "Enemy Shaken" salvage cross-effect ──
        for benefits, target in [(aftermath_a.get("salvage", {}).get("benefits", []), le),
                                  (aftermath_b.get("salvage", {}).get("benefits", []), la)]:
            for b in benefits:
                if "Shaken" in b:
                    target.morale_mod -= 1

        log.aftermath_a = aftermath_a
        log.aftermath_b = aftermath_b

        # Track results
        la.won_last_round = won_a
        le.won_last_round = not won_a
        la.record_state(BattleResult.WIN if won_a else BattleResult.LOSS)
        le.record_state(BattleResult.LOSS if won_a else BattleResult.WIN)

        # Check casualties and handle commander succession
        if aftermath_a.get("casualty", {}).get("died", False):
            dead_name = la.commander.name
            la.commanders_lost += 1
            summary.allied_commander_deaths.append(dead_name)
            cas = aftermath_a.get("casualty", {})
            summary.allied_commander_death_events.append({
                "name": dead_name,
                "legion": la.name,
                "round": round_num,
                "won": won_a,
                "crushed": not won_a and counter_diff_a <= CASUALTY_CRUSHED_THRESHOLD,
                "protection": cas.get("vit", 0),
                "roll": cas.get("roll", 0),
                "dc": cas.get("dc", 0),
                "faction": "Allied"
            })
            if commander_pool and not la.destroyed:
                replacement = commander_pool.get_replacement(Faction.ALLIED)
                if replacement:
                    la.commander = replacement
                    summary.successions.append(f"{la.name}: {dead_name} → {replacement.name}")

        if aftermath_b.get("casualty", {}).get("died", False):
            dead_name = le.commander.name
            le.commanders_lost += 1
            summary.enemy_commander_deaths.append(dead_name)
            cas = aftermath_b.get("casualty", {})
            summary.enemy_commander_death_events.append({
                "name": dead_name,
                "legion": le.name,
                "round": round_num,
                "won": not won_a,
                "crushed": won_a and -counter_diff_a <= CASUALTY_CRUSHED_THRESHOLD,
                "protection": cas.get("vit", 0),
                "roll": cas.get("roll", 0),
                "dc": cas.get("dc", 0),
                "faction": "Enemy"
            })
            if commander_pool and not le.destroyed:
                replacement = commander_pool.get_replacement(Faction.ENEMY)
                if replacement:
                    le.commander = replacement
                    summary.successions.append(f"{le.name}: {dead_name} → {replacement.name}")

        summary.battles.append(log)

    # ── Idle effective legions: heal injury + regain morale ──
    for la in active_allied[num_battles:]:
        la.record_state(BattleResult.NO_BATTLE)
        if la.injuries > 0 and IDLE_INJURY_RECOVERY > 0:
            la.injuries = max(0, la.injuries - IDLE_INJURY_RECOVERY)
        if IDLE_MORALE_RECOVERY > 0:
            la.morale_mod += IDLE_MORALE_RECOVERY
    for le in active_enemy[num_battles:]:
        le.record_state(BattleResult.NO_BATTLE)
        if le.injuries > 0 and IDLE_INJURY_RECOVERY > 0:
            le.injuries = max(0, le.injuries - IDLE_INJURY_RECOVERY)
        if IDLE_MORALE_RECOVERY > 0:
            le.morale_mod += IDLE_MORALE_RECOVERY

    # ── Routed legion recovery: regain morale + heal (no commander needed) ──
    for l in allied + enemy:
        if l.routed and not l.destroyed:
            if IDLE_MORALE_RECOVERY > 0:
                l.morale_mod += IDLE_MORALE_RECOVERY
            if l.injuries > 0 and IDLE_INJURY_RECOVERY > 0:
                l.injuries = max(0, l.injuries - IDLE_INJURY_RECOVERY)
            # Un-rout if morale recovered above threshold
            if l.mor_total > ROUT_THRESHOLD:
                l.routed = False
                faction_tag = "Allied" if l.faction == Faction.ALLIED else "Enemy"
                summary.rallied.append(f"{faction_tag}: {l.name} (Morale: {l.mor_total})")

    summary.allied_losses = sum(1 for l in allied if l.destroyed)
    summary.enemy_losses = sum(1 for l in enemy if l.destroyed)

    return summary




def run_simulation(num_rounds=ROUNDS_PER_DAY, seed=None,
                   legions_path="legions.csv", commanders_path="commanders.csv"):
    if seed is not None:
        random.seed(seed)

    allied, enemy, commander_pool = build_armies_from_csv(legions_path, commanders_path)
    summaries = []

    # Track global stats per round
    round_data = {
        "allied_active": [],
        "enemy_active": [],
        "allied_total_injuries": [],
        "enemy_total_injuries": [],
        "allied_avg_morale": [],
        "enemy_avg_morale": [],
        "allied_commanders_alive": [],
        "enemy_commanders_alive": [],
    }

    print("=" * 72)
    print("  BATTLE OF MYTROS — SIMULATION")
    print("=" * 72)
    print(f"  Allied legions: {len(allied)}  |  Enemy legions: {len(enemy)}")
    print(f"  Allied reserve commanders: {len(commander_pool.allied_reserves)}  |"
          f"  Enemy reserve commanders: {len(commander_pool.enemy_reserves)}")
    print(f"  Rounds: {num_rounds}")
    print("=" * 72)

    for rnd in range(1, num_rounds + 1):
        summary = simulate_round(allied, enemy, rnd, commander_pool)
        summaries.append(summary)

        active_a = [l for l in allied if not l.destroyed]
        active_e = [l for l in enemy if not l.destroyed]
        effective_a = [l for l in allied if l.effective]
        effective_e = [l for l in enemy if l.effective]
        routed_a = [l for l in allied if l.routed and not l.destroyed]
        routed_e = [l for l in enemy if l.routed and not l.destroyed]

        round_data["allied_active"].append(len(active_a))
        round_data["enemy_active"].append(len(active_e))
        round_data["allied_total_injuries"].append(sum(l.injuries for l in active_a))
        round_data["enemy_total_injuries"].append(sum(l.injuries for l in active_e))
        round_data["allied_avg_morale"].append(np.mean([l.mor_total for l in active_a]) if active_a else 0)
        round_data["enemy_avg_morale"].append(np.mean([l.mor_total for l in active_e]) if active_e else 0)
        round_data["allied_commanders_alive"].append(sum(1 for l in allied if l.commander.alive))
        round_data["enemy_commanders_alive"].append(sum(1 for l in enemy if l.commander.alive))

        # Print round summary
        wins_a = sum(1 for b in summary.battles if b.winner == "a")
        wins_e = sum(1 for b in summary.battles if b.winner == "b")
        day_label = ""
        if (rnd - 1) % ROUNDS_PER_DAY == 0:
            day_num = (rnd - 1) // ROUNDS_PER_DAY + 1
            day_label = f"  [Day {day_num} — tags reset]"
        print(f"\n  Round {rnd}: Recon {summary.recon_total} ({summary.recon_result}){day_label}")
        print(f"    Battles: {len(summary.battles)}  |  Allied wins: {wins_a}  |  Enemy wins: {wins_e}")
        for b in summary.battles:
            w = b.legion_a if b.winner == "a" else b.legion_b
            print(f"      {b.legion_a} vs {b.legion_b}  →  {w} wins ({b.counter_a}:{b.counter_b})")
        if summary.allied_commander_deaths:
            for name in summary.allied_commander_deaths:
                print(f"    ☠  ALLIED COMMANDER FALLEN: {name}")
        if summary.enemy_commander_deaths:
            for name in summary.enemy_commander_deaths:
                print(f"    ☠  ENEMY COMMANDER FALLEN: {name}")
        if summary.successions:
            for s in summary.successions:
                print(f"    ⚔  COMMANDER SUCCESSION: {s}")
        if summary.rallied:
            for r in summary.rallied:
                print(f"    🔄 RALLIED: {r}")
        destroyed_a = [l.name for l in allied if l.destroyed and l.history_results and l.history_results[-1] != BattleResult.NO_BATTLE and len(l.history_results) == rnd]
        destroyed_e = [l.name for l in enemy if l.destroyed and len(l.history_results) == rnd]
        for name in destroyed_a:
            print(f"    💀 ALLIED LEGION DESTROYED: {name}")
        for name in destroyed_e:
            print(f"    💀 ENEMY LEGION DESTROYED: {name}")
        if routed_a:
            for l in routed_a:
                print(f"    🏳  ALLIED LEGION ROUTED: {l.name} (Morale: {l.mor_total})")
        if routed_e:
            for l in routed_e:
                print(f"    🏳  ENEMY LEGION ROUTED: {l.name} (Morale: {l.mor_total})")

        status_parts = [f"Allied {len(effective_a)} fighting"]
        if routed_a:
            status_parts.append(f"{len(routed_a)} routed")
        status_parts.append(f"| Enemy {len(effective_e)} fighting")
        if routed_e:
            status_parts.append(f"{len(routed_e)} routed")
        print(f"    Active legions: {' '.join(status_parts)}")

        if not effective_a or not effective_e:
            if not effective_a and not effective_e:
                print(f"\n  BOTH FORCES BROKEN — battle ends in stalemate!")
            elif not effective_a:
                print(f"\n  ALLIED FORCES {'ELIMINATED' if not active_a else 'BROKEN'} — battle ends!")
            else:
                print(f"\n  ENEMY FORCES {'ELIMINATED' if not active_e else 'BROKEN'} — battle ends!")
            break

    print("\n" + "=" * 72)
    final_a = [l for l in allied if not l.destroyed]
    final_e = [l for l in enemy if not l.destroyed]
    print(f"  FINAL: Allied {len(final_a)} legions | Enemy {len(final_e)} legions")
    routed_final_a = sum(1 for l in final_a if l.routed)
    routed_final_e = sum(1 for l in final_e if l.routed)
    if routed_final_a or routed_final_e:
        print(f"  Routed: Allied {routed_final_a} | Enemy {routed_final_e}")
    cmdr_dead_a = sum(l.commanders_lost for l in allied)
    cmdr_dead_e = sum(l.commanders_lost for l in enemy)
    print(f"  Commander deaths: Allied {cmdr_dead_a} | Enemy {cmdr_dead_e}")
    print(f"  Reserve commanders remaining: Allied {len(commander_pool.allied_reserves)} | Enemy {len(commander_pool.enemy_reserves)}")
    total_inj_a = sum(l.injuries for l in final_a)
    total_inj_e = sum(l.injuries for l in final_e)
    print(f"  Total injuries: Allied {total_inj_a} | Enemy {total_inj_e}")
    print("=" * 72)

    return allied, enemy, summaries, round_data


# ─── Visualization ──────────────────────────────────────────────────────

# Color palette
ALLIED_COLOR = "#2563EB"
ALLIED_LIGHT = "#93C5FD"
ENEMY_COLOR = "#DC2626"
ENEMY_LIGHT = "#FCA5A5"
BG_COLOR = "#0F172A"
CARD_COLOR = "#1E293B"
GRID_COLOR = "#334155"
TEXT_COLOR = "#E2E8F0"
GOLD = "#F59E0B"
GREEN = "#22C55E"
DEAD_COLOR = "#6B7280"


def setup_style():
    plt.rcParams.update({
        'figure.facecolor': BG_COLOR,
        'axes.facecolor': CARD_COLOR,
        'axes.edgecolor': GRID_COLOR,
        'axes.labelcolor': TEXT_COLOR,
        'axes.grid': True,
        'grid.color': GRID_COLOR,
        'grid.alpha': 0.3,
        'text.color': TEXT_COLOR,
        'xtick.color': TEXT_COLOR,
        'ytick.color': TEXT_COLOR,
        'font.family': 'sans-serif',
        'font.size': 10,
    })


def plot_overview_dashboard(round_data, num_rounds, save_path=None):
    """Main dashboard: 4-panel overview."""
    setup_style()
    fig, axes = plt.subplots(2, 2, figsize=(16, 10))
    fig.suptitle("BATTLE OF MYTROS — CAMPAIGN OVERVIEW", fontsize=18, fontweight='bold',
                 color=GOLD, y=0.97)
    rounds = list(range(1, len(round_data["allied_active"]) + 1))

    # Panel 1: Active Legions
    ax = axes[0, 0]
    ax.fill_between(rounds, round_data["allied_active"], alpha=0.2, color=ALLIED_COLOR)
    ax.fill_between(rounds, round_data["enemy_active"], alpha=0.2, color=ENEMY_COLOR)
    ax.plot(rounds, round_data["allied_active"], '-o', color=ALLIED_COLOR, linewidth=2.5, markersize=6, label="Allied")
    ax.plot(rounds, round_data["enemy_active"], '-s', color=ENEMY_COLOR, linewidth=2.5, markersize=6, label="Enemy")
    ax.set_title("Active Legions", fontsize=13, fontweight='bold', color=TEXT_COLOR, pad=10)
    ax.set_xlabel("Round")
    ax.set_ylabel("Legions")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9)
    ax.set_xticks(rounds)
    ax.set_ylim(bottom=0)

    # Panel 2: Total Injuries
    ax = axes[0, 1]
    w = 0.35
    x = np.array(rounds)
    ax.bar(x - w/2, round_data["allied_total_injuries"], w, color=ALLIED_COLOR, alpha=0.85, label="Allied")
    ax.bar(x + w/2, round_data["enemy_total_injuries"], w, color=ENEMY_COLOR, alpha=0.85, label="Enemy")
    ax.set_title("Cumulative Injuries", fontsize=13, fontweight='bold', color=TEXT_COLOR, pad=10)
    ax.set_xlabel("Round")
    ax.set_ylabel("Total Injuries")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9)
    ax.set_xticks(rounds)

    # Panel 3: Average Morale
    ax = axes[1, 0]
    ax.fill_between(rounds, round_data["allied_avg_morale"], alpha=0.15, color=ALLIED_COLOR)
    ax.fill_between(rounds, round_data["enemy_avg_morale"], alpha=0.15, color=ENEMY_COLOR)
    ax.plot(rounds, round_data["allied_avg_morale"], '-o', color=ALLIED_COLOR, linewidth=2.5, markersize=6, label="Allied")
    ax.plot(rounds, round_data["enemy_avg_morale"], '-s', color=ENEMY_COLOR, linewidth=2.5, markersize=6, label="Enemy")
    ax.axhline(y=5, color=GOLD, linestyle='--', alpha=0.5, label="Hope DC baseline")
    ax.set_title("Average Morale", fontsize=13, fontweight='bold', color=TEXT_COLOR, pad=10)
    ax.set_xlabel("Round")
    ax.set_ylabel("Morale")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9)
    ax.set_xticks(rounds)

    # Panel 4: Commanders Alive
    ax = axes[1, 1]
    ax.plot(rounds, round_data["allied_commanders_alive"], '-o', color=ALLIED_COLOR, linewidth=2.5, markersize=6, label="Allied")
    ax.plot(rounds, round_data["enemy_commanders_alive"], '-s', color=ENEMY_COLOR, linewidth=2.5, markersize=6, label="Enemy")
    ax.set_title("Commanders Alive", fontsize=13, fontweight='bold', color=TEXT_COLOR, pad=10)
    ax.set_xlabel("Round")
    ax.set_ylabel("Commanders")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9)
    ax.set_xticks(rounds)
    ax.set_ylim(bottom=0)

    plt.tight_layout(rect=[0, 0, 1, 0.94])
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


def plot_legion_detail(allied, enemy, save_path=None):
    """Per-legion injury and morale heatmaps."""
    setup_style()

    all_legions = allied + enemy
    active = [l for l in all_legions if l.history_injuries]
    if not active:
        return None

    max_rounds = max(len(l.history_injuries) for l in active)

    fig, axes = plt.subplots(1, 2, figsize=(18, max(6, len(active) * 0.45 + 1.5)))
    fig.suptitle("LEGION STATUS — INJURIES & MORALE PER ROUND", fontsize=16, fontweight='bold',
                 color=GOLD, y=0.98)

    # Sort: allied first, then enemy, each by name
    allied_sorted = sorted([l for l in allied if l.history_injuries], key=lambda l: l.name)
    enemy_sorted = sorted([l for l in enemy if l.history_injuries], key=lambda l: l.name)
    ordered = allied_sorted + enemy_sorted
    names = []
    for l in ordered:
        prefix = "[A]" if l.faction == Faction.ALLIED else "[E]"
        suffix = ""
        if l.destroyed:
            suffix = " [DESTROYED]"
        elif not l.commander.alive:
            suffix = " [Cmdr Dead]"
        names.append(f"{prefix} {l.name}{suffix}")

    # Injury heatmap
    ax = axes[0]
    injury_data = np.zeros((len(ordered), max_rounds))
    for i, l in enumerate(ordered):
        for j, inj in enumerate(l.history_injuries):
            injury_data[i, j] = inj

    im = ax.imshow(injury_data, cmap='YlOrRd', aspect='auto', vmin=0, vmax=6,
                   interpolation='nearest')
    ax.set_title("Injuries per Round", fontsize=12, fontweight='bold', pad=10)
    ax.set_xticks(range(max_rounds))
    ax.set_xticklabels(range(1, max_rounds + 1))
    ax.set_xlabel("Round")
    ax.set_yticks(range(len(ordered)))
    ax.set_yticklabels(names, fontsize=8)

    for i in range(len(ordered)):
        for j in range(min(len(ordered[i].history_injuries), max_rounds)):
            val = int(injury_data[i, j])
            color = 'white' if val >= 3 else 'black'
            ax.text(j, i, str(val), ha='center', va='center', fontsize=8,
                    fontweight='bold', color=color)

    # Separator line between allied and enemy
    if allied_sorted and enemy_sorted:
        sep = len(allied_sorted) - 0.5
        ax.axhline(y=sep, color=GOLD, linewidth=2, linestyle='--')

    plt.colorbar(im, ax=ax, label="Injuries", shrink=0.8)

    # Morale heatmap
    ax = axes[1]
    morale_data = np.zeros((len(ordered), max_rounds))
    for i, l in enumerate(ordered):
        for j, mor in enumerate(l.history_morale):
            morale_data[i, j] = mor

    max_mor = max(morale_data.max(), 10)
    im2 = ax.imshow(morale_data, cmap='RdYlGn', aspect='auto', vmin=0, vmax=max_mor,
                    interpolation='nearest')
    ax.set_title("Morale per Round", fontsize=12, fontweight='bold', pad=10)
    ax.set_xticks(range(max_rounds))
    ax.set_xticklabels(range(1, max_rounds + 1))
    ax.set_xlabel("Round")
    ax.set_yticks(range(len(ordered)))
    ax.set_yticklabels(names, fontsize=8)

    for i in range(len(ordered)):
        for j in range(min(len(ordered[i].history_morale), max_rounds)):
            val = int(morale_data[i, j])
            color = 'white' if val <= 2 else 'black'
            ax.text(j, i, str(val), ha='center', va='center', fontsize=8,
                    fontweight='bold', color=color)

    if allied_sorted and enemy_sorted:
        ax.axhline(y=sep, color=GOLD, linewidth=2, linestyle='--')

    plt.colorbar(im2, ax=ax, label="Morale", shrink=0.8)

    plt.tight_layout(rect=[0, 0, 1, 0.95])
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


def plot_battle_results(summaries, save_path=None):
    """Battle results grid: who won each pairing each round."""
    setup_style()

    all_battles = []
    for s in summaries:
        for b in s.battles:
            all_battles.append((s.round_num, b))

    if not all_battles:
        return None

    max_battles_per_round = max(len(s.battles) for s in summaries)
    num_rounds = len(summaries)

    fig, ax = plt.subplots(figsize=(max(12, num_rounds * 1.8), max(6, max_battles_per_round * 1.5 + 2)))
    fig.suptitle("BATTLE RESULTS BY ROUND", fontsize=16, fontweight='bold', color=GOLD, y=0.97)

    for s in summaries:
        rnd = s.round_num
        for i, b in enumerate(s.battles):
            x = rnd - 1
            y = max_battles_per_round - 1 - i
            winner_name = b.legion_a if b.winner == "a" else b.legion_b
            loser_name = b.legion_b if b.winner == "a" else b.legion_a
            is_allied_win = b.winner == "a"
            color = ALLIED_COLOR if is_allied_win else ENEMY_COLOR
            edge_color = ALLIED_LIGHT if is_allied_win else ENEMY_LIGHT

            rect = mpatches.FancyBboxPatch(
                (x * 2.2, y * 1.6), 1.9, 1.3,
                boxstyle="round,pad=0.1",
                facecolor=color, edgecolor=edge_color, alpha=0.8, linewidth=1.5
            )
            ax.add_patch(rect)

            counter_str = f"{b.counter_a}:{b.counter_b}"
            ax.text(x * 2.2 + 0.95, y * 1.6 + 0.9, winner_name, ha='center', va='center',
                    fontsize=7.5, fontweight='bold', color='white')
            ax.text(x * 2.2 + 0.95, y * 1.6 + 0.55, f"vs {loser_name}", ha='center', va='center',
                    fontsize=6.5, color='#CBD5E1', style='italic')
            ax.text(x * 2.2 + 0.95, y * 1.6 + 0.2, counter_str, ha='center', va='center',
                    fontsize=8, fontweight='bold', color=GOLD)

    ax.set_xlim(-0.3, num_rounds * 2.2 + 0.3)
    ax.set_ylim(-0.5, max_battles_per_round * 1.6 + 0.3)
    ax.set_xticks([i * 2.2 + 0.95 for i in range(num_rounds)])
    ax.set_xticklabels([f"Round {i+1}" for i in range(num_rounds)], fontsize=10)
    ax.set_yticks([])
    ax.set_aspect('equal')
    ax.grid(False)

    allied_patch = mpatches.Patch(color=ALLIED_COLOR, label='Allied Victory')
    enemy_patch = mpatches.Patch(color=ENEMY_COLOR, label='Enemy Victory')
    ax.legend(handles=[allied_patch, enemy_patch], loc='upper right',
              facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=10)

    plt.tight_layout(rect=[0, 0, 1, 0.94])
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


def plot_commander_survival(allied, enemy, save_path=None):
    """Commander status summary — who lived, who died, their stats."""
    setup_style()

    all_commanders = []
    for l in allied:
        all_commanders.append((l.name, l.commander, Faction.ALLIED, l.injuries, l.destroyed))
    for l in enemy:
        all_commanders.append((l.name, l.commander, Faction.ENEMY, l.injuries, l.destroyed))

    fig, ax = plt.subplots(figsize=(14, max(6, len(all_commanders) * 0.5 + 1)))
    fig.suptitle("COMMANDER STATUS REPORT", fontsize=16, fontweight='bold', color=GOLD, y=0.97)

    for i, (legion, cmdr, faction, injuries, destroyed) in enumerate(reversed(all_commanders)):
        y = i
        total = cmdr.vit_bonus + cmdr.mor_bonus + cmdr.wit_bonus

        if not cmdr.alive:
            bar_color = DEAD_COLOR
            status = "DEAD"
            status_color = ENEMY_COLOR
        elif destroyed:
            bar_color = DEAD_COLOR
            status = "Legion Lost"
            status_color = ENEMY_LIGHT
        else:
            bar_color = ALLIED_COLOR if faction == Faction.ALLIED else ENEMY_COLOR
            status = "Alive"
            status_color = GREEN

        # Stat bars
        segments = [cmdr.vit_bonus, cmdr.mor_bonus, cmdr.wit_bonus]
        colors_seg = ["#EF4444", "#3B82F6", "#A855F7"]
        labels_seg = ["VIT", "MOR", "WIT"]
        left = 0
        for s, c in zip(segments, colors_seg):
            alpha = 0.4 if not cmdr.alive else 0.85
            ax.barh(y, s, left=left, height=0.6, color=c, alpha=alpha, edgecolor='none')
            if s > 0:
                ax.text(left + s/2, y, f"{s}", ha='center', va='center', fontsize=7,
                        fontweight='bold', color='white')
            left += s

        # Labels
        faction_marker = "[A]" if faction == Faction.ALLIED else "[E]"
        ax.text(-0.5, y, f"{faction_marker} {cmdr.name}", ha='right', va='center',
                fontsize=8.5, fontweight='bold', color=TEXT_COLOR)
        ax.text(left + 0.5, y, f"{status}  |  {injuries} inj  |  Tags: {', '.join(cmdr.tags)}",
                ha='left', va='center', fontsize=7.5, color=status_color)

    # Legend
    from matplotlib.lines import Line2D
    legend_elements = [
        mpatches.Patch(facecolor="#EF4444", label="Vitality"),
        mpatches.Patch(facecolor="#3B82F6", label="Morale"),
        mpatches.Patch(facecolor="#A855F7", label="Wit"),
    ]
    ax.legend(handles=legend_elements, loc='lower right', facecolor=CARD_COLOR,
              edgecolor=GRID_COLOR, fontsize=9)

    ax.set_xlim(-8, 18)
    ax.set_ylim(-0.8, len(all_commanders) - 0.2)
    ax.set_xlabel("Commander Bonus Points")
    ax.set_yticks([])
    ax.grid(axis='x', alpha=0.2)

    plt.tight_layout(rect=[0, 0, 1, 0.94])
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


def plot_stat_usage_radar(allied, enemy, save_path=None):
    """Radar chart showing how each stat contributed to outcomes."""
    setup_style()

    # Compute win rates per phase for each side
    phase_names = ["Maneuver\n(Wit)", "Charge\n(Morale)", "Clash\n(Vitality)"]
    allied_wins = [0, 0, 0]
    enemy_wins = [0, 0, 0]
    total_battles = [0, 0, 0]

    for l in allied:
        for i, result in enumerate(l.history_results):
            pass  # We need battle logs, let's collect from different source

    # We'll use a different approach - aggregate from legion histories
    # Instead use stat totals as a proxy for "investment"
    def avg_stat(legions, stat):
        vals = [getattr(l, f"{stat}_total") for l in legions if not l.destroyed]
        return np.mean(vals) if vals else 0

    categories = ['Vitality\n(Clash +\nRecovery)', 'Morale\n(Charge +\nHope)', 'Wit\n(Maneuver +\nSalvage)',
                  'Injuries\nSurvived', 'Morale\nRetained', 'Commanders\nAlive']

    allied_active = [l for l in allied if not l.destroyed]
    enemy_active = [l for l in enemy if not l.destroyed]

    allied_vals = [
        avg_stat(allied, 'vit'),
        avg_stat(allied, 'mor'),
        avg_stat(allied, 'wit'),
        max(0, 6 - np.mean([l.injuries for l in allied_active])) if allied_active else 0,
        np.mean([l.mor_total for l in allied_active]) if allied_active else 0,
        sum(1 for l in allied if l.commander.alive) / len(allied) * 6,
    ]
    enemy_vals = [
        avg_stat(enemy, 'vit'),
        avg_stat(enemy, 'mor'),
        avg_stat(enemy, 'wit'),
        max(0, 6 - np.mean([l.injuries for l in enemy_active])) if enemy_active else 0,
        np.mean([l.mor_total for l in enemy_active]) if enemy_active else 0,
        sum(1 for l in enemy if l.commander.alive) / len(enemy) * 6,
    ]

    # Normalize to 0-10 scale
    max_val = max(max(allied_vals), max(enemy_vals), 1)
    allied_norm = [v / max_val * 10 for v in allied_vals]
    enemy_norm = [v / max_val * 10 for v in enemy_vals]

    num = len(categories)
    angles = np.linspace(0, 2 * np.pi, num, endpoint=False).tolist()
    allied_norm += allied_norm[:1]
    enemy_norm += enemy_norm[:1]
    angles += angles[:1]

    fig, ax = plt.subplots(figsize=(9, 9), subplot_kw=dict(polar=True))
    fig.patch.set_facecolor(BG_COLOR)
    ax.set_facecolor(BG_COLOR)

    ax.fill(angles, allied_norm, alpha=0.2, color=ALLIED_COLOR)
    ax.plot(angles, allied_norm, 'o-', color=ALLIED_COLOR, linewidth=2, label='Allied', markersize=6)
    ax.fill(angles, enemy_norm, alpha=0.2, color=ENEMY_COLOR)
    ax.plot(angles, enemy_norm, 's-', color=ENEMY_COLOR, linewidth=2, label='Enemy', markersize=6)

    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(categories, fontsize=9, color=TEXT_COLOR)
    ax.set_ylim(0, 10)
    ax.set_yticks([2, 4, 6, 8, 10])
    ax.set_yticklabels(['2', '4', '6', '8', '10'], fontsize=7, color=GRID_COLOR)
    ax.spines['polar'].set_color(GRID_COLOR)
    ax.grid(color=GRID_COLOR, alpha=0.3)
    ax.tick_params(colors=TEXT_COLOR)

    ax.set_title("ARMY STRENGTH COMPARISON", fontsize=16, fontweight='bold', color=GOLD,
                 pad=25, y=1.08)
    ax.legend(loc='upper right', bbox_to_anchor=(1.25, 1.1), facecolor=CARD_COLOR,
              edgecolor=GRID_COLOR, fontsize=10)

    plt.tight_layout()
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


def plot_monte_carlo(num_sims=200, num_rounds=100, save_path=None,
                     legions_path="legions.csv", commanders_path="commanders.csv"):
    """Run many simulations until one side breaks. Track rounds to completion."""
    setup_style()

    results = {"allied_surviving": [], "enemy_surviving": [],
               "allied_cmdr_deaths": [], "enemy_cmdr_deaths": [],
               "winner": [], "rounds_to_end": []}
    cmdr_death_rounds = defaultdict(list)  # commander_name -> [round_of_death, ...]
    all_death_events = []

    MAX_ROUNDS = num_rounds  # safety cap

    print(f"\n  Running {num_sims} Monte Carlo simulations (up to {MAX_ROUNDS} rounds each)...")
    for i in range(num_sims):
        random.seed(i * 7919 + 42)
        allied, enemy, pool = build_armies_from_csv(legions_path, commanders_path)
        final_round = MAX_ROUNDS
        for rnd in range(1, MAX_ROUNDS + 1):
            rnd_summary = simulate_round(allied, enemy, rnd, pool)
            for dead_name in rnd_summary.allied_commander_deaths + rnd_summary.enemy_commander_deaths:
                cmdr_death_rounds[dead_name].append(rnd)
            all_death_events.extend(rnd_summary.allied_commander_death_events)
            all_death_events.extend(rnd_summary.enemy_commander_death_events)
            eff_a = [l for l in allied if l.effective]
            eff_e = [l for l in enemy if l.effective]
            if not eff_a or not eff_e:
                final_round = rnd
                break

        surv_a = sum(1 for l in allied if not l.destroyed)
        surv_e = sum(1 for l in enemy if not l.destroyed)
        eff_a_count = sum(1 for l in allied if l.effective)
        eff_e_count = sum(1 for l in enemy if l.effective)
        results["allied_surviving"].append(surv_a)
        results["enemy_surviving"].append(surv_e)
        results["allied_cmdr_deaths"].append(sum(l.commanders_lost for l in allied))
        results["enemy_cmdr_deaths"].append(sum(l.commanders_lost for l in enemy))
        results["rounds_to_end"].append(final_round)

        # Winner = side with effective legions; if neither, compare surviving
        if eff_a_count > 0 and eff_e_count == 0:
            results["winner"].append("Allied")
        elif eff_e_count > 0 and eff_a_count == 0:
            results["winner"].append("Enemy")
        elif surv_a > surv_e:
            results["winner"].append("Allied")
        elif surv_e > surv_a:
            results["winner"].append("Enemy")
        else:
            results["winner"].append("Draw")

    allied_wins = results["winner"].count("Allied")
    enemy_wins = results["winner"].count("Enemy")
    draws = results["winner"].count("Draw")
    avg_rounds = np.mean(results["rounds_to_end"])
    med_rounds = np.median(results["rounds_to_end"])
    print(f"  Results: Allied wins {allied_wins}/{num_sims} ({allied_wins/num_sims*100:.1f}%) | "
          f"Enemy wins {enemy_wins}/{num_sims} ({enemy_wins/num_sims*100:.1f}%) | "
          f"Draws {draws}/{num_sims} ({draws/num_sims*100:.1f}%)")
    print(f"  Rounds to end: avg {avg_rounds:.1f} | median {med_rounds:.0f} | "
          f"min {min(results['rounds_to_end'])} | max {max(results['rounds_to_end'])}")
    # Convert rounds to days for DM reference
    avg_days = avg_rounds / ROUNDS_PER_DAY
    print(f"  Equivalent battle days: avg {avg_days:.1f} | "
          f"({ROUNDS_PER_DAY} rounds per day)")

    fig = plt.figure(figsize=(20, 14))
    gs = fig.add_gridspec(2, 3, height_ratios=[1, 1.8], hspace=0.45, wspace=0.35)
    axes = np.array([[fig.add_subplot(gs[r, c]) for c in range(3)] for r in range(2)])
    fig.suptitle(f"MONTE CARLO ANALYSIS — {num_sims} SIMULATIONS", fontsize=18,
                 fontweight='bold', color=GOLD, y=0.97)

    # Panel 1: Win distribution
    ax = axes[0, 0]
    labels = ['Allied\nVictory', 'Enemy\nVictory', 'Draw']
    counts = [allied_wins, enemy_wins, draws]
    colors = [ALLIED_COLOR, ENEMY_COLOR, GOLD]
    bars = ax.bar(labels, counts, color=colors, alpha=0.85, edgecolor='white', linewidth=0.5)
    for bar, count in zip(bars, counts):
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1,
                f"{count}\n({count/num_sims*100:.1f}%)", ha='center', fontsize=10,
                fontweight='bold', color=TEXT_COLOR)
    ax.set_title("Overall Outcomes", fontsize=13, fontweight='bold', pad=10)
    ax.set_ylabel("Simulations")

    # Panel 2: Surviving legions distribution
    ax = axes[0, 1]
    bins = range(0, max(max(results["allied_surviving"]), max(results["enemy_surviving"])) + 2)
    ax.hist(results["allied_surviving"], bins=bins, alpha=0.6, color=ALLIED_COLOR,
            label="Allied", edgecolor='white', linewidth=0.5)
    ax.hist(results["enemy_surviving"], bins=bins, alpha=0.6, color=ENEMY_COLOR,
            label="Enemy", edgecolor='white', linewidth=0.5)
    ax.axvline(np.mean(results["allied_surviving"]), color=ALLIED_LIGHT, linestyle='--', linewidth=2,
               label=f"Allied avg: {np.mean(results['allied_surviving']):.1f}")
    ax.axvline(np.mean(results["enemy_surviving"]), color=ENEMY_LIGHT, linestyle='--', linewidth=2,
               label=f"Enemy avg: {np.mean(results['enemy_surviving']):.1f}")
    ax.set_title("Surviving Legions Distribution", fontsize=13, fontweight='bold', pad=10)
    ax.set_xlabel("Legions Surviving")
    ax.set_ylabel("Frequency")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=8)

    # Panel 3: Rounds to end distribution
    ax = axes[0, 2]
    max_rnd = max(results["rounds_to_end"])
    bins_r = range(0, max_rnd + 2)
    # Color by winner
    allied_rounds = [r for r, w in zip(results["rounds_to_end"], results["winner"]) if w == "Allied"]
    enemy_rounds = [r for r, w in zip(results["rounds_to_end"], results["winner"]) if w == "Enemy"]
    draw_rounds = [r for r, w in zip(results["rounds_to_end"], results["winner"]) if w == "Draw"]
    ax.hist(allied_rounds, bins=bins_r, alpha=0.6, color=ALLIED_COLOR, label="Allied wins", edgecolor='white', linewidth=0.5)
    ax.hist(enemy_rounds, bins=bins_r, alpha=0.6, color=ENEMY_COLOR, label="Enemy wins", edgecolor='white', linewidth=0.5)
    if draw_rounds:
        ax.hist(draw_rounds, bins=bins_r, alpha=0.6, color=GOLD, label="Draws", edgecolor='white', linewidth=0.5)
    ax.axvline(avg_rounds, color='white', linestyle='--', linewidth=2, label=f"Avg: {avg_rounds:.1f}")
    # Add day markers
    for day in range(1, max_rnd // ROUNDS_PER_DAY + 2):
        day_rnd = day * ROUNDS_PER_DAY
        if day_rnd <= max_rnd + 1:
            ax.axvline(day_rnd, color=GRID_COLOR, linestyle=':', linewidth=1, alpha=0.5)
            ax.text(day_rnd, ax.get_ylim()[1] if ax.get_ylim()[1] > 0 else 10,
                    f"Day {day}", ha='center', va='bottom', fontsize=7, color=GRID_COLOR)
    ax.set_title("Rounds to Completion", fontsize=13, fontweight='bold', pad=10)
    ax.set_xlabel("Rounds")
    ax.set_ylabel("Frequency")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=8)

    # Panel 4: Commander Mortality Rates (Bar Chart)
    ax = axes[1, 0]
    # Build per-commander data: only show commanders who died in at least 2% of sims
    min_death_rate = 0.02
    cmdr_entries = []
    for name, rounds in cmdr_death_rounds.items():
        death_rate = len(rounds) / num_sims
        if death_rate >= min_death_rate:
            cmdr_entries.append((name, death_rate))

    # Sort by death rate ascending so the highest is at the top of the horizontal bar chart
    cmdr_entries.sort(key=lambda x: x[1])
    # Cap at top 25
    cmdr_entries = cmdr_entries[-25:]

    if cmdr_entries:
        # Determine faction for coloring
        _allied_cmdr_names = set()
        _enemy_cmdr_names = set()
        try:
            import csv as _csv
            with open(commanders_path, newline='') as _f:
                for row in _csv.DictReader(_f):
                    if row['faction'].lower() in ('allied', 'people'):
                        _allied_cmdr_names.add(row['name'])
                    else:
                        _enemy_cmdr_names.add(row['name'])
        except Exception:
            pass

        names = [e[0] for e in cmdr_entries]
        rates = [e[1] * 100 for e in cmdr_entries]  # convert to percentage
        y_pos = np.arange(len(names))

        colors = [ALLIED_COLOR if name in _allied_cmdr_names else ENEMY_COLOR for name in names]
        bars = ax.barh(y_pos, rates, color=colors, alpha=0.85, edgecolor='white', linewidth=0.5)

        # Add percentage labels to the end of each bar
        for bar, rate in zip(bars, rates):
            ax.text(bar.get_width() + 1, bar.get_y() + bar.get_height()/2,
                    f"{rate:.1f}%", va='center', fontsize=8, color=TEXT_COLOR, fontweight='bold')

        ax.set_yticks(y_pos)
        ax.set_yticklabels(names, fontsize=8)
        
        # Color y-tick labels by faction
        for lbl, name in zip(ax.get_yticklabels(), names):
            lbl.set_color(ALLIED_LIGHT if name in _allied_cmdr_names else ENEMY_LIGHT)

        ax.set_xlabel("Mortality Rate (%)")
        ax.set_title("Commander Mortality Rate\n(% of simulations where they died)",
                     fontsize=11, fontweight='bold', pad=10)
        ax.set_xlim(0, max(rates) + 15)  # give room for labels

        allied_patch = mpatches.Patch(color=ALLIED_COLOR, alpha=0.85, label="Allied")
        enemy_patch = mpatches.Patch(color=ENEMY_COLOR, alpha=0.85, label="Enemy")
        ax.legend(handles=[allied_patch, enemy_patch], facecolor=CARD_COLOR,
                  edgecolor=GRID_COLOR, fontsize=8, loc='lower right')
    else:
        ax.text(0.5, 0.5, "No commanders died\nin ≥2% of simulations",
                ha='center', va='center', transform=ax.transAxes,
                fontsize=12, color=TEXT_COLOR)
        ax.set_title("Commander Mortality Rate", fontsize=13, fontweight='bold', pad=10)

    # Panel 5: Box plot comparison
    ax = axes[1, 1]
    data = [results["allied_surviving"], results["enemy_surviving"],
            results["allied_cmdr_deaths"], results["enemy_cmdr_deaths"]]
    bp = ax.boxplot(data, patch_artist=True, tick_labels=["Allied\nSurviving", "Enemy\nSurviving",
                    "Allied\nCmdr Deaths", "Enemy\nCmdr Deaths"],
                    medianprops=dict(color=GOLD, linewidth=2))
    box_colors = [ALLIED_COLOR, ENEMY_COLOR, ALLIED_COLOR, ENEMY_COLOR]
    for patch, color in zip(bp['boxes'], box_colors):
        patch.set_facecolor(color)
        patch.set_alpha(0.6)
    for whisker in bp['whiskers']:
        whisker.set_color(TEXT_COLOR)
    for cap in bp['caps']:
        cap.set_color(TEXT_COLOR)
    for flier in bp['fliers']:
        flier.set_markeredgecolor(TEXT_COLOR)
    ax.set_title("Statistical Spread", fontsize=13, fontweight='bold', pad=10)
    ax.set_ylabel("Count")

    # Panel 6: Rounds-to-end box plot by winner
    ax = axes[1, 2]
    data_by_winner = []
    labels_bw = []
    colors_bw = []
    
    # recreate all the needed data since it wasn't captured if we deleted earlier
    allied_rounds = [r for r, w in zip(results["rounds_to_end"], results["winner"]) if w == "Allied"]
    enemy_rounds = [r for r, w in zip(results["rounds_to_end"], results["winner"]) if w == "Enemy"]
    draw_rounds = [r for r, w in zip(results["rounds_to_end"], results["winner"]) if w == "Draw"]

    if allied_rounds:
        data_by_winner.append(allied_rounds)
        labels_bw.append(f"Allied\nVictory\n(n={len(allied_rounds)})")
        colors_bw.append(ALLIED_COLOR)
    if enemy_rounds:
        data_by_winner.append(enemy_rounds)
        labels_bw.append(f"Enemy\nVictory\n(n={len(enemy_rounds)})")
        colors_bw.append(ENEMY_COLOR)
    if draw_rounds:
        data_by_winner.append(draw_rounds)
        labels_bw.append(f"Draw\n(n={len(draw_rounds)})")
        colors_bw.append(GOLD)
    if data_by_winner:
        bp2 = ax.boxplot(data_by_winner, patch_artist=True, tick_labels=labels_bw,
                         medianprops=dict(color='white', linewidth=2))
        for patch, color in zip(bp2['boxes'], colors_bw):
            patch.set_facecolor(color)
            patch.set_alpha(0.6)
        for whisker in bp2['whiskers']:
            whisker.set_color(TEXT_COLOR)
        for cap in bp2['caps']:
            cap.set_color(TEXT_COLOR)
        for flier in bp2['fliers']:
            flier.set_markeredgecolor(TEXT_COLOR)
    ax.set_title("Battle Duration by Outcome", fontsize=13, fontweight='bold', pad=10)
    ax.set_ylabel("Rounds")

    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig, all_death_events


def plot_cmdr_deaths_analysis(all_death_events, num_sims, save_path=None):
    """Detailed breakdown of commander deaths across all Monte Carlo simulations."""
    setup_style()
    if not all_death_events:
        print("No commander deaths to plot.")
        return None

    fig, axes = plt.subplots(2, 2, figsize=(16, 12))
    fig.suptitle(f"COMMANDER DEATHS ANALYSIS — {num_sims} SIMULATIONS", fontsize=18,
                 fontweight='bold', color=GOLD, y=0.97)

    allied_events = [e for e in all_death_events if e.get("faction") == "Allied"]
    enemy_events = [e for e in all_death_events if e.get("faction") == "Enemy"]

    # Panel 1: Causes of Death
    ax = axes[0, 0]
    labels = ["Died while Winning\n(Base Risk 15%)", "Died while Losing\n(Base Risk 25%)", "Died when Crushed\n(Base Risk 35%)"]
    
    counts_a = [
        sum(1 for e in allied_events if e["won"]) / num_sims,
        sum(1 for e in allied_events if not e["won"] and not e["crushed"]) / num_sims,
        sum(1 for e in allied_events if e["crushed"]) / num_sims,
    ]
    counts_e = [
        sum(1 for e in enemy_events if e["won"]) / num_sims,
        sum(1 for e in enemy_events if not e["won"] and not e["crushed"]) / num_sims,
        sum(1 for e in enemy_events if e["crushed"]) / num_sims,
    ]
    
    x = np.arange(len(labels))
    width = 0.35
    bars_a = ax.bar(x - width/2, counts_a, width, label='Allied', color=ALLIED_COLOR, alpha=0.85)
    bars_e = ax.bar(x + width/2, counts_e, width, label='Enemy', color=ENEMY_COLOR, alpha=0.85)
    
    for bars in [bars_a, bars_e]:
        for b in bars:
            val = b.get_height()
            if val > 0:
                ax.text(b.get_x() + b.get_width()/2, val + (max(counts_a + counts_e) * 0.02),
                        f"{val:.2f}", ha='center', va='bottom', fontsize=10, color=TEXT_COLOR)
                    
    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=11)
    ax.set_title("When Do Commanders Die?", fontsize=13, fontweight='bold', pad=10)
    ax.set_ylabel("Avg Deaths per Campaign")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=10)

    # Panel 2: Deaths by Round
    ax = axes[0, 1]
    max_round = max((e["round"] for e in all_death_events), default=16)
    rounds = np.arange(1, max_round + 1)
    counts_a_r = [sum(1 for e in allied_events if e["round"] == r) / num_sims for r in rounds]
    counts_e_r = [sum(1 for e in enemy_events if e["round"] == r) / num_sims for r in rounds]
    
    ax.plot(rounds, counts_a_r, 'o-', color=ALLIED_COLOR, linewidth=2, label="Allied")
    ax.plot(rounds, counts_e_r, 's-', color=ENEMY_COLOR, linewidth=2, label="Enemy")
    ax.fill_between(rounds, counts_a_r, alpha=0.2, color=ALLIED_COLOR)
    ax.fill_between(rounds, counts_e_r, alpha=0.2, color=ENEMY_COLOR)
    
    ax.set_title("Deaths By Round (Pacing)", fontsize=13, fontweight='bold', pad=10)
    ax.set_xlabel("Round")
    ax.set_ylabel("Avg Deaths per Campaign")
    ax.set_xticks(rounds)
    for day in range(1, max_round // ROUNDS_PER_DAY + 2):
        day_rnd = day * ROUNDS_PER_DAY
        if day_rnd <= max_round:
            ax.axvline(day_rnd, color=GRID_COLOR, linestyle=':', linewidth=1.5, alpha=0.6)
            ax.text(day_rnd, ax.get_ylim()[1]*0.9, f"End Day {day}", ha='center', fontsize=9, color=GRID_COLOR)
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=10)

    # Panel 3: Deaths by Protection Level
    ax = axes[1, 0]
    max_prot = max((e["protection"] for e in all_death_events), default=10)
    prot_levels = np.arange(0, max_prot + 1)
    
    counts_a_p = [sum(1 for e in allied_events if e["protection"] == p) / num_sims for p in prot_levels]
    counts_e_p = [sum(1 for e in enemy_events if e["protection"] == p) / num_sims for p in prot_levels]
    ax.bar(prot_levels - width/2, counts_a_p, width, label='Allied', color=ALLIED_COLOR, alpha=0.85)
    ax.bar(prot_levels + width/2, counts_e_p, width, label='Enemy', color=ENEMY_COLOR, alpha=0.85)
    
    ax.set_title("Vulnerability (Total Protection at Time of Death)", fontsize=13, fontweight='bold', pad=10)
    ax.set_xlabel("Protection = (Commander Vitality + Legion Morale)")
    ax.set_ylabel("Avg Deaths per Campaign")
    ax.set_xticks(prot_levels)
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=10)

    # Panel 4: Fatal d100 Rolls
    ax = axes[1, 1]
    rolls_a = [e["roll"] for e in allied_events]
    rolls_e = [e["roll"] for e in enemy_events]
    weights_a = [1.0 / num_sims] * len(rolls_a) if rolls_a else []
    weights_e = [1.0 / num_sims] * len(rolls_e) if rolls_e else []

    max_dc = max((e["dc"] for e in all_death_events), default=35)
    bins = np.arange(1, min(100, max_dc + 5), 2)
    
    if rolls_a or rolls_e:
        hist_data = []
        hist_weights = []
        hist_colors = []
        hist_labels = []
        if rolls_a:
            hist_data.append(rolls_a)
            hist_weights.append(weights_a)
            hist_colors.append(ALLIED_COLOR)
            hist_labels.append("Allied")
        if rolls_e:
            hist_data.append(rolls_e)
            hist_weights.append(weights_e)
            hist_colors.append(ENEMY_COLOR)
            hist_labels.append("Enemy")
            
        ax.hist(hist_data, bins=bins, weights=hist_weights, stacked=True, color=hist_colors, alpha=0.85, label=hist_labels)
    
    nat_1s = sum(1 for e in all_death_events if e["roll"] == 1) / num_sims
    ax.set_title(f"Fatal d100 Rolls (Nat 1 auto-deaths: {nat_1s:.2f} avg/campaign)", fontsize=13, fontweight='bold', pad=10)
    ax.set_xlabel("d100 Roll Result")
    ax.set_ylabel("Avg Deaths per Campaign")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=10)
    
    plt.tight_layout(rect=[0, 0, 1, 0.95])
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


# ─── New Visualizations ─────────────────────────────────────────────────

def plot_morale_timeline(allied, enemy, save_path=None):
    """Per-legion morale history showing rout/rally oscillations."""
    setup_style()

    all_legions = allied + enemy
    # Only plot legions that actually fought (have history)
    legions_with_history = [l for l in all_legions if l.history_mor]

    n = len(legions_with_history)
    cols = 3
    rows = math.ceil(n / cols)
    fig, axes = plt.subplots(rows, cols, figsize=(18, 3 * rows + 1), squeeze=False)
    fig.suptitle("MORALE TIMELINE — ALL LEGIONS", fontsize=16, fontweight='bold',
                 color=GOLD, y=0.98)

    for idx, legion in enumerate(legions_with_history):
        ax = axes[idx // cols][idx % cols]
        rounds = list(range(1, len(legion.history_mor) + 1))
        morale = legion.history_mor
        color = ALLIED_COLOR if legion.faction == Faction.ALLIED else ENEMY_COLOR
        light = ALLIED_LIGHT if legion.faction == Faction.ALLIED else ENEMY_LIGHT

        ax.fill_between(rounds, morale, alpha=0.15, color=color)
        ax.plot(rounds, morale, '-', color=color, linewidth=1.5)

        # Mark rout threshold
        ax.axhline(y=0, color=ENEMY_LIGHT, linestyle='--', linewidth=0.8, alpha=0.5)
        ax.axhline(y=MORALE_CAP, color=GREEN, linestyle=':', linewidth=0.6, alpha=0.3)

        # Mark battle day boundaries
        for day_rnd in range(ROUNDS_PER_DAY + 1, len(rounds) + 1, ROUNDS_PER_DAY):
            ax.axvline(day_rnd, color=GRID_COLOR, linestyle=':', linewidth=0.5, alpha=0.4)

        # Color rounds where legion was routed
        for r_idx, result in enumerate(legion.history_results):
            if r_idx < len(morale) and morale[r_idx] <= ROUT_THRESHOLD:
                ax.axvspan(r_idx + 0.5, r_idx + 1.5, alpha=0.15, color=ENEMY_COLOR)

        status = "DESTROYED" if legion.destroyed else ("ROUTED" if legion.routed else "Active")
        faction_tag = "[A]" if legion.faction == Faction.ALLIED else "[E]"
        ax.set_title(f"{faction_tag} {legion.name} ({status}, {legion.commanders_lost}☠)",
                     fontsize=8, fontweight='bold', color=light, pad=3)
        ax.set_ylim(-1, MORALE_CAP + 1)
        ax.set_ylabel("Mor", fontsize=7)
        ax.tick_params(labelsize=6)

    # Hide empty subplots
    for idx in range(n, rows * cols):
        axes[idx // cols][idx % cols].set_visible(False)

    plt.tight_layout(rect=[0, 0, 1, 0.96])
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


def plot_graveyard(allied, enemy, summaries, save_path=None):
    """Timeline showing when each legion was destroyed or permanently broken, plus commander deaths."""
    setup_style()

    fig, axes = plt.subplots(1, 2, figsize=(18, 8), gridspec_kw={'width_ratios': [1, 1]})
    fig.suptitle("BATTLE GRAVEYARD — LOSSES OVER TIME", fontsize=16, fontweight='bold',
                 color=GOLD, y=0.97)

    # ── Panel 1: Legion fate timeline ──
    ax = axes[0]
    all_legions = allied + enemy
    # Sort: destroyed first (by round), then routed, then active
    def sort_key(l):
        if l.destroyed:
            return (0, len(l.history_results))
        elif l.routed:
            return (1, len(l.history_results))
        else:
            return (2, 0)

    sorted_legions = sorted(all_legions, key=sort_key)

    y_labels = []
    for y, legion in enumerate(sorted_legions):
        color = ALLIED_COLOR if legion.faction == Faction.ALLIED else ENEMY_COLOR
        light = ALLIED_LIGHT if legion.faction == Faction.ALLIED else ENEMY_LIGHT
        rounds = len(legion.history_results)

        # Draw bar showing active rounds
        bar_color = color if not legion.destroyed else DEAD_COLOR
        ax.barh(y, rounds, height=0.6, color=bar_color, alpha=0.7, edgecolor='none')

        # Mark commander deaths with skulls
        if legion.commanders_lost > 0:
            ax.text(rounds + 0.3, y, f"{'☠' * min(legion.commanders_lost, 5)}{'…' if legion.commanders_lost > 5 else ''}",
                    va='center', fontsize=7, color=ENEMY_LIGHT)

        # Status label
        if legion.destroyed:
            status = f"[DEAD] R{rounds}"
        elif legion.routed:
            status = f"[ROUTED] R{rounds}"
        else:
            status = f"[OK]"

        faction_tag = "[A]" if legion.faction == Faction.ALLIED else "[E]"
        y_labels.append(f"{faction_tag} {legion.name}")

        ax.text(0.5, y, status, va='center', ha='left', fontsize=7,
                fontweight='bold', color='white')

    ax.set_yticks(range(len(sorted_legions)))
    ax.set_yticklabels(y_labels, fontsize=7)
    ax.set_xlabel("Rounds Active")
    ax.set_title("Legion Fates", fontsize=12, fontweight='bold', pad=10)
    ax.invert_yaxis()

    # Day markers
    max_rounds = max(len(l.history_results) for l in all_legions) if all_legions else 0
    for day in range(1, max_rounds // ROUNDS_PER_DAY + 2):
        day_rnd = day * ROUNDS_PER_DAY
        if day_rnd <= max_rounds:
            ax.axvline(day_rnd, color=GOLD, linestyle='--', linewidth=0.8, alpha=0.4)
            ax.text(day_rnd, -0.8, f"Day {day}", ha='center', fontsize=7, color=GOLD, alpha=0.6)

    # ── Panel 2: Cumulative commander deaths ──
    ax2 = axes[1]
    allied_cumulative = []
    enemy_cumulative = []
    a_total, e_total = 0, 0
    for s in summaries:
        a_total += len(s.allied_commander_deaths)
        e_total += len(s.enemy_commander_deaths)
        allied_cumulative.append(a_total)
        enemy_cumulative.append(e_total)

    rounds_list = list(range(1, len(summaries) + 1))
    ax2.fill_between(rounds_list, allied_cumulative, alpha=0.2, color=ALLIED_COLOR)
    ax2.fill_between(rounds_list, enemy_cumulative, alpha=0.2, color=ENEMY_COLOR)
    ax2.plot(rounds_list, allied_cumulative, '-o', color=ALLIED_COLOR, linewidth=2, markersize=3,
             label=f"Allied (total: {a_total})")
    ax2.plot(rounds_list, enemy_cumulative, '-s', color=ENEMY_COLOR, linewidth=2, markersize=3,
             label=f"Enemy (total: {e_total})")

    # Day markers
    for day in range(1, len(summaries) // ROUNDS_PER_DAY + 2):
        day_rnd = day * ROUNDS_PER_DAY
        if day_rnd <= len(summaries):
            ax2.axvline(day_rnd, color=GOLD, linestyle='--', linewidth=0.8, alpha=0.4)
            ax2.text(day_rnd, max(a_total, e_total) * 0.95, f"Day {day}",
                     ha='center', fontsize=7, color=GOLD, alpha=0.6)

    ax2.set_xlabel("Round")
    ax2.set_ylabel("Cumulative Commander Deaths")
    ax2.set_title("Commander Attrition", fontsize=12, fontweight='bold', pad=10)
    ax2.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9)
    ax2.set_xlim(1, len(summaries))

    plt.tight_layout(rect=[0, 0, 1, 0.94])
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


def plot_balance_analysis(legions_path="legions.csv", commanders_path="commanders.csv",
                          save_path=None):
    """Visual breakdown of why one side wins more — compares combined stats per legion."""
    setup_style()

    allied, enemy, _ = build_armies_from_csv(legions_path, commanders_path)

    def legion_row(l):
        vit_cmd = l.commander.vit_bonus if l.commander.alive else 0
        mor_cmd = l.commander.mor_bonus if l.commander.alive else 0
        wit_cmd = l.commander.wit_bonus if l.commander.alive else 0
        return {
            "name": l.name,
            "cmd": l.commander.name,
            "vit_base": l.vit_base, "vit_cmd": vit_cmd, "vit_total": l.vit_base + vit_cmd,
            "mor_base": l.mor_base, "mor_cmd": mor_cmd, "mor_total": min(MORALE_CAP, l.mor_base + mor_cmd),
            "wit_base": l.wit_base, "wit_cmd": wit_cmd, "wit_total": l.wit_base + wit_cmd,
        }

    a_rows = [legion_row(l) for l in allied]
    e_rows = [legion_row(l) for l in enemy]

    fig = plt.figure(figsize=(22, 16))
    fig.suptitle("BALANCE ANALYSIS — WHY DOES ONE SIDE WIN?", fontsize=18,
                 fontweight='bold', color=GOLD, y=0.98)
    gs = fig.add_gridspec(3, 2, hspace=0.55, wspace=0.35,
                          height_ratios=[1.6, 1.0, 1.0])

    # ── Panel 1 (top, full width): Per-legion combined Vitality ──────────
    ax1 = fig.add_subplot(gs[0, :])
    all_rows = sorted(a_rows + e_rows, key=lambda r: -r["vit_total"])
    names = [r["name"] for r in all_rows]
    vit_base = [r["vit_base"] for r in all_rows]
    vit_cmd  = [r["vit_cmd"]  for r in all_rows]
    colors_base = [ALLIED_COLOR if any(l.name == r["name"] for l in allied) else ENEMY_COLOR
                   for r in all_rows]
    colors_cmd  = [ALLIED_LIGHT if any(l.name == r["name"] for l in allied) else ENEMY_LIGHT
                   for r in all_rows]

    x = np.arange(len(names))
    bars_base = ax1.bar(x, vit_base, color=colors_base, alpha=0.85, label="Legion base Vit")
    bars_cmd  = ax1.bar(x, vit_cmd,  bottom=vit_base, color=colors_cmd, alpha=0.85,
                        label="Commander bonus")
    for i, r in enumerate(all_rows):
        ax1.text(i, r["vit_total"] + 0.05, str(r["vit_total"]),
                 ha='center', va='bottom', fontsize=8, fontweight='bold', color=TEXT_COLOR)
        ax1.text(i, -0.55, r["cmd"], ha='center', va='top', fontsize=6.5,
                 color=ALLIED_LIGHT if any(l.name == r["name"] for l in allied) else ENEMY_LIGHT,
                 rotation=45)
    ax1.set_xticks(x)
    ax1.set_xticklabels(names, rotation=40, ha='right', fontsize=8)
    ax1.set_ylabel("Combined Vitality (d20 roll bonus)")
    ax1.set_title("Combined Vitality per Legion — sorted descending  (Vitality drives ALL battle rolls & Recovery checks)",
                  fontsize=11, fontweight='bold', pad=8)
    ax1.axhline(np.mean([r["vit_total"] for r in a_rows]), color=ALLIED_LIGHT,
                linestyle='--', linewidth=1.5,
                label=f"Allied avg {np.mean([r['vit_total'] for r in a_rows]):.1f}")
    ax1.axhline(np.mean([r["vit_total"] for r in e_rows]), color=ENEMY_LIGHT,
                linestyle='--', linewidth=1.5,
                label=f"Enemy avg {np.mean([r['vit_total'] for r in e_rows]):.1f}")
    ax1.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9, ncol=4)

    # ── Panel 2 (mid-left): Faction aggregate stat comparison ────────────
    ax2 = fig.add_subplot(gs[1, 0])
    stats = ["Vitality", "Morale", "Wit"]
    a_avgs = [
        np.mean([r["vit_total"] for r in a_rows]),
        np.mean([r["mor_total"] for r in a_rows]),
        np.mean([r["wit_total"] for r in a_rows]),
    ]
    e_avgs = [
        np.mean([r["vit_total"] for r in e_rows]),
        np.mean([r["mor_total"] for r in e_rows]),
        np.mean([r["wit_total"] for r in e_rows]),
    ]
    xs = np.arange(3)
    w = 0.35
    b_a = ax2.bar(xs - w/2, a_avgs, w, color=ALLIED_COLOR, alpha=0.85, label="Allied")
    b_e = ax2.bar(xs + w/2, e_avgs, w, color=ENEMY_COLOR, alpha=0.85, label="Enemy")
    for bars, avgs in [(b_a, a_avgs), (b_e, e_avgs)]:
        for bar, v in zip(bars, avgs):
            ax2.text(bar.get_x() + bar.get_width()/2, v + 0.05, f"{v:.1f}",
                     ha='center', va='bottom', fontsize=9, fontweight='bold', color=TEXT_COLOR)
    # Annotate differences
    for i, (a, e, s) in enumerate(zip(a_avgs, e_avgs, stats)):
        diff = e - a
        sign = "+" if diff > 0 else ""
        color = ENEMY_LIGHT if diff > 0 else ALLIED_LIGHT
        ax2.text(i, max(a, e) + 0.45, f"Enemy {sign}{diff:.1f}", ha='center',
                 fontsize=8, color=color, fontweight='bold')
    ax2.set_xticks(xs)
    ax2.set_xticklabels(stats)
    ax2.set_title("Average Combined Stat per Legion", fontsize=11, fontweight='bold', pad=8)
    ax2.set_ylabel("Average (legion base + commander)")
    ax2.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9)

    # ── Panel 3 (mid-right): Base vs Commander contribution breakdown ─────
    ax3 = fig.add_subplot(gs[1, 1])
    stat_keys = [("vit_base", "vit_cmd"), ("mor_base", "mor_cmd"), ("wit_base", "wit_cmd")]
    stat_labels = ["Vit", "Mor", "Wit"]
    n_stats = len(stat_keys)
    group_gap = 1.2
    bar_w = 0.28
    for gi, ((bk, ck), sl) in enumerate(zip(stat_keys, stat_labels)):
        base_x = gi * group_gap
        a_base = np.mean([r[bk] for r in a_rows])
        a_cmd  = np.mean([r[ck] for r in a_rows])
        e_base = np.mean([r[bk] for r in e_rows])
        e_cmd  = np.mean([r[ck] for r in e_rows])
        ax3.bar(base_x - bar_w*0.6, a_base, bar_w, color=ALLIED_COLOR, alpha=0.85)
        ax3.bar(base_x - bar_w*0.6, a_cmd,  bar_w, bottom=a_base, color=ALLIED_LIGHT, alpha=0.85)
        ax3.bar(base_x + bar_w*0.6, e_base, bar_w, color=ENEMY_COLOR, alpha=0.85)
        ax3.bar(base_x + bar_w*0.6, e_cmd,  bar_w, bottom=e_base, color=ENEMY_LIGHT, alpha=0.85)
        ax3.text(base_x - bar_w*0.6, a_base + a_cmd + 0.05, f"{a_base+a_cmd:.1f}",
                 ha='center', va='bottom', fontsize=8, color=TEXT_COLOR)
        ax3.text(base_x + bar_w*0.6, e_base + e_cmd + 0.05, f"{e_base+e_cmd:.1f}",
                 ha='center', va='bottom', fontsize=8, color=TEXT_COLOR)
        ax3.text(base_x, -0.4, sl, ha='center', fontsize=10, color=TEXT_COLOR)
    ax3.set_xticks([])
    ax3.set_title("Base vs Commander Contribution\n(Allied left, Enemy right per stat)",
                  fontsize=11, fontweight='bold', pad=8)
    ax3.set_ylabel("Avg per legion")
    base_patch = mpatches.Patch(color='gray', alpha=0.85, label="Legion base")
    cmd_patch  = mpatches.Patch(color='lightgray', alpha=0.85, label="Commander bonus")
    a_patch = mpatches.Patch(color=ALLIED_COLOR, alpha=0.85, label="Allied")
    e_patch = mpatches.Patch(color=ENEMY_COLOR, alpha=0.85, label="Enemy")
    ax3.legend(handles=[a_patch, e_patch, base_patch, cmd_patch],
               facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=8, ncol=2)

    # ── Panel 4 (bottom, full width): Morale vs Vitality scatter ─────────
    ax4 = fig.add_subplot(gs[2, :])
    for r in a_rows:
        ax4.scatter(r["vit_total"], r["mor_total"], s=r["wit_total"]*40 + 40,
                    color=ALLIED_COLOR, alpha=0.85, edgecolors='white', linewidth=0.5, zorder=3)
        ax4.annotate(r["name"], (r["vit_total"], r["mor_total"]),
                     textcoords="offset points", xytext=(5, 3),
                     fontsize=7, color=ALLIED_LIGHT)
    for r in e_rows:
        ax4.scatter(r["vit_total"], r["mor_total"], s=r["wit_total"]*40 + 40,
                    color=ENEMY_COLOR, alpha=0.85, edgecolors='white', linewidth=0.5,
                    marker='D', zorder=3)
        ax4.annotate(r["name"], (r["vit_total"], r["mor_total"]),
                     textcoords="offset points", xytext=(5, -8),
                     fontsize=7, color=ENEMY_LIGHT)
    # Mean crosshairs
    ax4.axvline(np.mean([r["vit_total"] for r in a_rows]), color=ALLIED_LIGHT,
                linestyle='--', linewidth=1, alpha=0.6)
    ax4.axvline(np.mean([r["vit_total"] for r in e_rows]), color=ENEMY_LIGHT,
                linestyle='--', linewidth=1, alpha=0.6)
    ax4.axhline(np.mean([r["mor_total"] for r in a_rows]), color=ALLIED_LIGHT,
                linestyle='--', linewidth=1, alpha=0.6)
    ax4.axhline(np.mean([r["mor_total"] for r in e_rows]), color=ENEMY_LIGHT,
                linestyle='--', linewidth=1, alpha=0.6)
    a_patch2 = mpatches.Patch(color=ALLIED_COLOR, alpha=0.85, label="Allied (circle)")
    e_patch2 = mpatches.Patch(color=ENEMY_COLOR, alpha=0.85, label="Enemy (diamond)")
    ax4.legend(handles=[a_patch2, e_patch2], facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9)
    ax4.set_xlabel("Combined Vitality  (→ better at fighting & surviving)")
    ax4.set_ylabel("Combined Morale  (→ harder to rout)")
    ax4.set_title("Vitality vs Morale per Legion  (bubble size = combined Wit)",
                  fontsize=11, fontweight='bold', pad=8)

    # Print summary to console
    a_vit = np.mean([r["vit_total"] for r in a_rows])
    e_vit = np.mean([r["vit_total"] for r in e_rows])
    a_mor = np.mean([r["mor_total"] for r in a_rows])
    e_mor = np.mean([r["mor_total"] for r in e_rows])
    a_wit = np.mean([r["wit_total"] for r in a_rows])
    e_wit = np.mean([r["wit_total"] for r in e_rows])
    print(f"\n  ── Balance Analysis ──────────────────────────────────────────────")
    print(f"  {'Stat':<10} {'Allied avg':>12} {'Enemy avg':>12} {'Δ (Enemy−Allied)':>18}")
    print(f"  {'-'*54}")
    for label, a, e in [("Vitality", a_vit, e_vit), ("Morale", a_mor, e_mor), ("Wit", a_wit, e_wit)]:
        diff = e - a
        arrow = "▲ ENEMY" if diff > 0.5 else ("▼ allied" if diff < -0.5 else "≈ equal")
        print(f"  {label:<10} {a:>12.2f} {e:>12.2f} {diff:>+12.2f}  {arrow}")
    print(f"  {'-'*54}")
    print(f"  Vitality advantage: Enemy +{e_vit-a_vit:.1f} ({(e_vit/a_vit-1)*100:.0f}% higher)")
    print(f"  Morale advantage:   Allied +{a_mor-e_mor:.1f} ({(a_mor/e_mor-1)*100:.0f}% higher)")
    print(f"  Wit advantage:      Allied +{a_wit-e_wit:.1f} ({(a_wit/e_wit-1)*100:.0f}% higher)")
    print(f"  → Vitality is used for every battle roll & recovery check,")
    print(f"    making it the dominant win driver.")

    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


# ─── Main ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Battle of Mytros — Mass Combat Simulator")
    parser.add_argument("--rounds", type=int, default=8, help="Rounds to simulate (default: 8)")
    parser.add_argument("--seed", type=int, default=None, help="Random seed")
    parser.add_argument("--no-display", action="store_true", help="Save figures instead of displaying")
    parser.add_argument("--monte-carlo", type=int, default=0, help="Run N Monte Carlo simulations")
    parser.add_argument("--legions", type=str, default="legions.csv", help="Path to legions CSV")
    parser.add_argument("--commanders", type=str, default="commanders.csv", help="Path to commanders CSV")
    args = parser.parse_args()

    save = args.no_display
    prefix = "" if save else ""

    # Verify CSV files exist
    for path, label in [(args.legions, "Legions"), (args.commanders, "Commanders")]:
        if not os.path.exists(path):
            print(f"  ERROR: {label} CSV not found: {path}")
            print(f"  Create it or specify --legions / --commanders paths.")
            return

    # Single simulation
    allied, enemy, summaries, round_data = run_simulation(
        args.rounds, args.seed, args.legions, args.commanders)

    fig1 = plot_overview_dashboard(round_data, args.rounds,
                                    save_path=f"{prefix}01_overview.png" if save else None)
    fig2 = plot_legion_detail(allied, enemy,
                              save_path=f"{prefix}02_legion_detail.png" if save else None)
    fig3 = plot_battle_results(summaries,
                               save_path=f"{prefix}03_battle_results.png" if save else None)
    fig4 = plot_commander_survival(allied, enemy,
                                   save_path=f"{prefix}04_commanders.png" if save else None)
    fig5 = plot_stat_usage_radar(allied, enemy,
                                 save_path=f"{prefix}05_radar.png" if save else None)
    fig7 = plot_morale_timeline(allied, enemy,
                                 save_path=f"{prefix}06_morale_timeline.png" if save else None)
    fig8 = plot_graveyard(allied, enemy, summaries,
                           save_path=f"{prefix}07_graveyard.png" if save else None)

    # Monte Carlo
    if args.monte_carlo > 0:
        fig6, all_death_events = plot_monte_carlo(args.monte_carlo, args.rounds,
                                save_path=f"{prefix}99_monte_carlo.png" if save else None,
                                legions_path=args.legions, commanders_path=args.commanders)
        fig10 = plot_cmdr_deaths_analysis(all_death_events, num_sims=args.monte_carlo,
                                     save_path=f"{prefix}97_monte_carlo_deaths.png" if save else None)
        fig9 = plot_balance_analysis(legions_path=args.legions, commanders_path=args.commanders,
                                     save_path=f"{prefix}98_balance.png" if save else None)

    if not save:
        plt.show()
    else:
        print("\n  Figures saved to files.")


if __name__ == "__main__":
    main()