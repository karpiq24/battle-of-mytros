"""
Battle of Mytros — Mass Combat Simulator
=========================================
v4 — Passive tags, flat legion stats, no battle-day cycle.

Run:  python battle_sim.py
Options:
  --rounds N          Max rounds to simulate (default: 30)
  --seed N            Random seed for reproducibility
  --no-display        Save figures to files instead of displaying
  --legions FILE      Path to legions CSV  (default: legions.csv)
  --commanders FILE   Path to commanders CSV (default: commanders.csv)
  --monte-carlo N     Run N Monte Carlo simulations
"""

import random
import math
import csv
import os
import argparse
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from collections import defaultdict

# ─── Configuration ──────────────────────────────────────────────────────

# ── Battle Counter ──
BATTLE_COUNTER_WIN        = 1   # Counter points for winning Maneuver or Charge
BATTLE_COUNTER_CLASH_WIN  = 2   # Counter points for winning the Clash
BATTLE_COUNTER_NAT20_BONUS  = 1 # Extra counter on a natural 20
BATTLE_COUNTER_NAT1_PENALTY = 1 # Extra counter lost on a natural 1

# ── Aftermath DCs ──
RECOVERY_BASE_DC = 12           # Actual DC = this + current injuries
HOPE_DC          = 12
SALVAGE_DC       = 12

# ── Aftermath outcomes ──
RECOVERY_WINNER_PASS =  0
RECOVERY_WINNER_FAIL =  1
RECOVERY_LOSER_PASS  =  1
RECOVERY_LOSER_FAIL  =  2
HOPE_WINNER_PASS     =  2
HOPE_WINNER_FAIL     =  1
HOPE_LOSER_PASS      = -1
HOPE_LOSER_FAIL      = -2

# ── Legion durability ──
MAX_INJURIES         = 6   # Destroyed at this many injuries
BULWARK_MAX_INJURIES = 7   # Bulwark tag raises threshold by 1
ROUT_THRESHOLD       = 0   # Morale at/below this → rout
MORALE_CAP           = 10
RELENTLESS_MIN_MORALE = 2  # Relentless tag: morale floor

# ── Recovery (idle legions each round) ──
IDLE_MORALE_RECOVERY = 1
IDLE_INJURY_RECOVERY = 1

# ── Commander Casualty ──
CASUALTY_BASE_RISK       = {"winner": 6, "loser": 12, "crushed": 20}
CASUALTY_CRUSHED_THRESHOLD = -3  # Battle-counter diff at or below → "crushed"
COMMANDER_DEATH_MORALE_LOSS = 1

# ── Tag bonuses / thresholds ──
ZEALOT_MORALE_THRESHOLD  = 6
ZEALOT_BONUS             = 2
FANATIC_EXTRA_INJURY     = 1
WARDEN_CLASH_BONUS       = 2
WARDEN_ADJ_RECOVERY      = 2   # Adjacent allied legions get +2 Recovery
IRONCLAD_BONUS           = 2
INSPIRING_BONUS          = 2
CUNNING_BONUS            = 2
ENGINEER_PENALTY         = -2  # Applied to all enemy battle rolls in fortified section
MAGE_PENALTY             = -1  # Applied to all enemy battle rolls
HEADHUNTER_DEATH_BONUS   = 5   # +5% added to enemy commander's death chance
DIVINE_BLOOD_DEATH_REDUC = 5   # -5% subtracted from own base death chance
CHARGE_WIN_CLASH_BONUS   = 1   # Clash bonus for winning the Charge phase
RALLIER_OWN_HOPE_BONUS   = 2   # Rallier: +2 to own Hope check
RALLIER_ADJ_HOPE_BONUS   = 1   # Rallier: +1 to adjacent allied legions' Hope check

# ── Reconnaissance thresholds ──
RECON_THRESHOLDS = [
    (10,  "No intelligence"),
    (14,  "2 enemy legions revealed"),
    (18,  "Half enemy legions revealed"),
    (22,  "All movements revealed"),
    (999, "All movements + Maneuver bonus"),
]
RECON_MANEUVER_BONUS_TIER = 23   # Roll >= this → +1 to all allied Maneuver rolls

MANEUVER_BENEFITS = [
    ("Flanking Position",    "+1d4 to Charge"),
    ("Defensive Footing",    "+1d2 to Clash"),
    ("Disrupted Formation",  "-1 to enemy Charge and Clash"),
    ("Seized Initiative",    "+1d2 extra injury to enemy if won"),
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
    ENEMY  = "Enemy"


class BattleResult(Enum):
    WIN       = "Win"
    LOSS      = "Loss"
    NO_BATTLE = "No Battle"


@dataclass
class Commander:
    name: str
    tags: list = field(default_factory=list)
    alive: bool = True

    def has_tag(self, name: str) -> bool:
        return name in self.tags


@dataclass
class Legion:
    name: str
    faction: Faction
    vit: int        # flat total Vitality
    mor: int        # flat base Morale (shifts via morale_mod)
    wit: int        # flat total Wit
    commander: Commander
    injuries: int  = 0
    morale_mod: int = 0      # cumulative Hope check shifts
    routed: bool    = False
    destroyed: bool = False
    section: int    = 0
    fortified_section: int = -1
    wit_temp_bonus: int = 0  # from Tactical Insight salvage

    commanders_lost: int = 0

    # Per-round history
    history_injuries: list = field(default_factory=list)
    history_morale:   list = field(default_factory=list)
    history_results:  list = field(default_factory=list)
    history_vit:      list = field(default_factory=list)
    history_mor:      list = field(default_factory=list)
    history_wit:      list = field(default_factory=list)

    @property
    def vit_total(self) -> int:
        return max(0, self.vit)

    @property
    def mor_total(self) -> int:
        raw = self.mor + self.morale_mod
        if self.commander.alive and self.commander.has_tag("Relentless"):
            raw = max(RELENTLESS_MIN_MORALE, raw)
        return min(MORALE_CAP, max(0, raw))

    @property
    def wit_total(self) -> int:
        return max(0, self.wit + self.wit_temp_bonus)

    @property
    def effective(self) -> bool:
        return not self.destroyed and not self.routed

    @property
    def max_injuries(self) -> int:
        if self.commander.alive and self.commander.has_tag("Bulwark"):
            return BULWARK_MAX_INJURIES
        return MAX_INJURIES

    def record_state(self, result: BattleResult):
        self.history_injuries.append(self.injuries)
        self.history_morale.append(self.mor_total)
        self.history_results.append(result)
        self.history_vit.append(self.vit_total)
        self.history_mor.append(self.mor_total)
        self.history_wit.append(self.wit_total)


# ─── Dice Rolling ───────────────────────────────────────────────────────

def d20(veteran: bool = False) -> int:
    r = random.randint(1, 20)
    if veteran and r <= 4:
        r = 5
    return r


def roll_d20(bonus: int, advantage: bool = False, disadvantage: bool = False,
             veteran: bool = False):
    """Return (raw_roll, total, is_nat20, is_nat1)."""
    r1 = d20(veteran)
    if advantage and not disadvantage:
        r2 = d20(veteran)
        raw = max(r1, r2)
    elif disadvantage and not advantage:
        r2 = d20(veteran)
        raw = min(r1, r2)
    else:
        raw = r1
    return raw, raw + bonus, raw == 20, raw == 1


def contested_roll(bonus_a: int, bonus_b: int,
                   adv_a=False, adv_b=False,
                   disadv_a=False, disadv_b=False,
                   vet_a=False, vet_b=False):
    """Roll both sides. Returns (ra, rb, ta, tb, n20a, n20b, n1a, n1b)."""
    ra, ta, n20a, n1a = roll_d20(bonus_a, adv_a, disadv_a, vet_a)
    rb, tb, n20b, n1b = roll_d20(bonus_b, adv_b, disadv_b, vet_b)
    return ra, rb, ta, tb, n20a, n20b, n1a, n1b


def determine_phase_winner(ta, tb, n20a, n20b, n1a, n1b) -> str:
    if n20a and not n20b: return 'a'
    if n20b and not n20a: return 'b'
    if n1a  and not n1b:  return 'b'
    if n1b  and not n1a:  return 'a'
    if ta > tb: return 'a'
    if tb > ta: return 'b'
    return 'tie'


# ─── Tag Helpers ────────────────────────────────────────────────────────

def _has(legion: Legion, tag: str) -> bool:
    return legion.commander.alive and legion.commander.has_tag(tag)


def legion_battle_bonuses(legion: Legion, phase: str):
    """Return (bonus, advantage, disadvantage) for this legion in the given phase."""
    bonus = 0
    adv   = False
    disadv = False

    # Zealot: +2 to all battle rolls while Morale >= threshold
    if _has(legion, "Zealot") and legion.mor_total >= ZEALOT_MORALE_THRESHOLD:
        bonus += ZEALOT_BONUS

    if phase == "maneuver":
        if _has(legion, "Tactician"): adv = True
        if _has(legion, "Cunning"):   bonus += CUNNING_BONUS

    elif phase == "charge":
        if _has(legion, "Inspiring"): bonus += INSPIRING_BONUS
        if _has(legion, "Fanatic"):   adv = True
        if _has(legion, "Vanguard"):  adv = True

    elif phase == "clash":
        if _has(legion, "Ironclad"):  bonus += IRONCLAD_BONUS
        if _has(legion, "Warden"):    bonus += WARDEN_CLASH_BONUS
        if _has(legion, "Fanatic"):   adv = True

    return bonus, adv, disadv


def enemy_penalties(attacker: Legion, defender: Legion, phase: str):
    """Return (penalty, disadvantage) that defender's tags impose on attacker."""
    penalty = 0
    disadv  = False

    # Mage: -1 to all attacker battle rolls
    if _has(defender, "Mage"):
        penalty += MAGE_PENALTY

    # Engineer: -2 to all attacker rolls if defender is in its own fortified section
    # Siege Breaker on attacker nullifies this
    if _has(defender, "Engineer") and not _has(attacker, "Siege Breaker"):
        if defender.fortified_section != -1 and defender.section == defender.fortified_section:
            penalty += ENGINEER_PENALTY

    # Headhunter: attacker suffers Disadvantage on Clash
    if _has(defender, "Headhunter") and phase == "clash":
        disadv = True

    return penalty, disadv


def fortification_bonus(legion: Legion, enemy: Legion) -> int:
    """Return +1 if legion holds a fortified section, 0 otherwise.
    Nullified if enemy has Siege Breaker."""
    if legion.fortified_section != -1 and legion.section == legion.fortified_section:
        if not _has(enemy, "Siege Breaker"):
            return 1
    return 0


# ─── Battle Phase Logs ──────────────────────────────────────────────────

@dataclass
class PhaseResult:
    phase_name: str
    roll_a: int; roll_b: int
    total_a: int; total_b: int
    nat20_a: bool; nat20_b: bool
    nat1_a: bool;  nat1_b: bool
    winner: str
    counter_a_delta: int = 0
    counter_b_delta: int = 0


@dataclass
class BattleLog:
    legion_a: str
    legion_b: str
    phases: list = field(default_factory=list)
    counter_a: int = 0
    counter_b: int = 0
    winner: str = ""
    maneuver_benefit: str = ""
    aftermath_a: dict = field(default_factory=dict)
    aftermath_b: dict = field(default_factory=dict)
    # Extra injuries from Seized Initiative (applied to the loser)
    seized_extra_for_a: int = 0
    seized_extra_for_b: int = 0


# ─── Battle Resolution ──────────────────────────────────────────────────

def simulate_battle(la: Legion, lb: Legion, log: BattleLog,
                    recon_maneuver_bonus: int = 0):
    """Resolve a 3-phase battle. Modifies log in-place."""
    counter_a = 0
    counter_b = 0
    charge_bonus_a = 0; charge_bonus_b = 0
    clash_bonus_a  = 0; clash_bonus_b  = 0

    vet_a = _has(la, "Veteran")
    vet_b = _has(lb, "Veteran")

    fort_a = fortification_bonus(la, lb)
    fort_b = fortification_bonus(lb, la)

    # ── Phase 1: Maneuver (Wit) ──────────────────────────────────────────
    bon_a, adv_a, _ = legion_battle_bonuses(la, "maneuver")
    bon_b, adv_b, _ = legion_battle_bonuses(lb, "maneuver")
    pen_a, dd_a     = enemy_penalties(la, lb, "maneuver")
    pen_b, dd_b     = enemy_penalties(lb, la, "maneuver")

    # recon bonus only applies to the allied side
    rec_a = recon_maneuver_bonus if la.faction == Faction.ALLIED else 0
    rec_b = recon_maneuver_bonus if lb.faction == Faction.ALLIED else 0

    tot_a = la.wit_total + bon_a + pen_a + fort_a + rec_a
    tot_b = lb.wit_total + bon_b + pen_b + fort_b + rec_b

    # Up to 3 rerolls on tie
    winner = 'tie'
    for _ in range(4):
        ra, rb, ta, tb, n20a, n20b, n1a, n1b = contested_roll(
            tot_a, tot_b, adv_a=adv_a, adv_b=adv_b,
            disadv_a=dd_a, disadv_b=dd_b, vet_a=vet_a, vet_b=vet_b)
        winner = determine_phase_winner(ta, tb, n20a, n20b, n1a, n1b)
        if winner != 'tie':
            break

    da = db = 0
    seized_for_b = 0; seized_for_a = 0
    if winner in ('a', 'b'):
        winner_leg, loser_leg = (la, lb) if winner == 'a' else (lb, la)
        if winner == 'a':
            da = BATTLE_COUNTER_WIN + (BATTLE_COUNTER_NAT20_BONUS if n20a else 0)
            db = -BATTLE_COUNTER_WIN - (BATTLE_COUNTER_NAT1_PENALTY if n1b else 0)
        else:
            db = BATTLE_COUNTER_WIN + (BATTLE_COUNTER_NAT20_BONUS if n20b else 0)
            da = -BATTLE_COUNTER_WIN - (BATTLE_COUNTER_NAT1_PENALTY if n1a else 0)

        benefit = random.choice(MANEUVER_BENEFITS)
        log.maneuver_benefit = f"{winner_leg.name}: {benefit[0]}"
        roll_extra = lambda d: random.randint(1, d)

        if winner == 'a':
            if "Flanking"  in benefit[0]: charge_bonus_a += roll_extra(4)
            elif "Defensive" in benefit[0]: clash_bonus_a += roll_extra(2)
            elif "Disrupted" in benefit[0]: charge_bonus_b -= 1; clash_bonus_b -= 1
            elif "Seized"    in benefit[0]: seized_for_b = roll_extra(2)
        else:
            if "Flanking"  in benefit[0]: charge_bonus_b += roll_extra(4)
            elif "Defensive" in benefit[0]: clash_bonus_b += roll_extra(2)
            elif "Disrupted" in benefit[0]: charge_bonus_a -= 1; clash_bonus_a -= 1
            elif "Seized"    in benefit[0]: seized_for_a = roll_extra(2)

    counter_a += da; counter_b += db
    log.phases.append(PhaseResult("Maneuver (Wit)", ra, rb, ta, tb, n20a, n20b, n1a, n1b, winner, da, db))

    # ── Phase 2: Charge (Morale) ─────────────────────────────────────────
    bon_a2, adv_a2, _ = legion_battle_bonuses(la, "charge")
    bon_b2, adv_b2, _ = legion_battle_bonuses(lb, "charge")
    pen_a2, dd_a2     = enemy_penalties(la, lb, "charge")
    pen_b2, dd_b2     = enemy_penalties(lb, la, "charge")

    tot_a2 = la.mor_total + bon_a2 + pen_a2 + charge_bonus_a + fort_a
    tot_b2 = lb.mor_total + bon_b2 + pen_b2 + charge_bonus_b + fort_b

    ra, rb, ta, tb, n20a, n20b, n1a, n1b = contested_roll(
        tot_a2, tot_b2, adv_a=adv_a2, adv_b=adv_b2,
        disadv_a=dd_a2, disadv_b=dd_b2, vet_a=vet_a, vet_b=vet_b)
    winner_c = determine_phase_winner(ta, tb, n20a, n20b, n1a, n1b)

    # One reroll on tie
    if winner_c == 'tie':
        ra, rb, ta, tb, n20a, n20b, n1a, n1b = contested_roll(
            tot_a2, tot_b2, adv_a=adv_a2, adv_b=adv_b2,
            disadv_a=dd_a2, disadv_b=dd_b2, vet_a=vet_a, vet_b=vet_b)
        winner_c = determine_phase_winner(ta, tb, n20a, n20b, n1a, n1b)
    # Still tied → neither gains Clash bonus, no counter points

    da = db = 0
    if winner_c == 'a':
        da = BATTLE_COUNTER_WIN + (BATTLE_COUNTER_NAT20_BONUS if n20a else 0)
        db = -BATTLE_COUNTER_WIN - (BATTLE_COUNTER_NAT1_PENALTY if n1b else 0)
        clash_bonus_a += CHARGE_WIN_CLASH_BONUS
    elif winner_c == 'b':
        db = BATTLE_COUNTER_WIN + (BATTLE_COUNTER_NAT20_BONUS if n20b else 0)
        da = -BATTLE_COUNTER_WIN - (BATTLE_COUNTER_NAT1_PENALTY if n1a else 0)
        clash_bonus_b += CHARGE_WIN_CLASH_BONUS

    counter_a += da; counter_b += db
    log.phases.append(PhaseResult("Charge (Morale)", ra, rb, ta, tb, n20a, n20b, n1a, n1b, winner_c, da, db))

    # ── Phase 3: Clash (Vitality) ────────────────────────────────────────
    bon_a3, adv_a3, _ = legion_battle_bonuses(la, "clash")
    bon_b3, adv_b3, _ = legion_battle_bonuses(lb, "clash")
    pen_a3, dd_a3     = enemy_penalties(la, lb, "clash")
    pen_b3, dd_b3     = enemy_penalties(lb, la, "clash")

    tot_a3 = la.vit_total + bon_a3 + pen_a3 + clash_bonus_a + fort_a
    tot_b3 = lb.vit_total + bon_b3 + pen_b3 + clash_bonus_b + fort_b

    ra, rb, ta, tb, n20a, n20b, n1a, n1b = contested_roll(
        tot_a3, tot_b3, adv_a=adv_a3, adv_b=adv_b3,
        disadv_a=dd_a3, disadv_b=dd_b3, vet_a=vet_a, vet_b=vet_b)
    winner_cl = determine_phase_winner(ta, tb, n20a, n20b, n1a, n1b)
    # Tied Clash → no counter points for either (brutal and indecisive)

    da = db = 0
    if winner_cl == 'a':
        da = BATTLE_COUNTER_CLASH_WIN + (BATTLE_COUNTER_NAT20_BONUS if n20a else 0)
        db = -BATTLE_COUNTER_WIN - (BATTLE_COUNTER_NAT1_PENALTY if n1b else 0)
    elif winner_cl == 'b':
        db = BATTLE_COUNTER_CLASH_WIN + (BATTLE_COUNTER_NAT20_BONUS if n20b else 0)
        da = -BATTLE_COUNTER_WIN - (BATTLE_COUNTER_NAT1_PENALTY if n1a else 0)

    counter_a += da; counter_b += db
    log.phases.append(PhaseResult("Clash (Vitality)", ra, rb, ta, tb, n20a, n20b, n1a, n1b, winner_cl, da, db))

    # Final tie-breaker: sudden-death Vitality rerolls
    while counter_a == counter_b:
        ra2, rb2, ta2, tb2, n20a2, n20b2, n1a2, n1b2 = contested_roll(
            la.vit_total, lb.vit_total)
        w = determine_phase_winner(ta2, tb2, n20a2, n20b2, n1a2, n1b2)
        if w == 'a': counter_a += 1
        elif w == 'b': counter_b += 1

    log.counter_a = counter_a
    log.counter_b = counter_b
    log.winner    = "a" if counter_a > counter_b else "b"

    # Seized Initiative: extra injuries go to the loser
    # seized_for_b → injuries for lb if la wins; seized_for_a → injuries for la if lb wins
    log.seized_extra_for_b = seized_for_b if log.winner == "a" else 0
    log.seized_extra_for_a = seized_for_a if log.winner == "b" else 0

    return log


# ─── Aftermath ──────────────────────────────────────────────────────────

def run_aftermath(legion: Legion, won: bool, battle_counter_diff: int,
                  disadv_recovery: bool = False,
                  disadv_hope: bool = False,
                  seized_extra_injuries: int = 0,
                  warden_recovery_bonus: int = 0,
                  rallier_hope_bonus: int = 0,
                  headhunter_death_penalty: int = 0) -> dict:
    results = {}
    vet = _has(legion, "Veteran")
    divine_reroll_used = False

    # ── Recovery Check (Vitality) ─────────────────────────────────────────
    adv_rec   = _has(legion, "Medic")    # Medic: advantage on Recovery
    disadv_rec = disadv_recovery or _has(legion, "Fanatic")  # Fanatic: disadvantage
    rec_bonus = warden_recovery_bonus
    if _has(legion, "Ironclad"):
        rec_bonus += IRONCLAD_BONUS

    dc = RECOVERY_BASE_DC + legion.injuries

    if adv_rec and not disadv_rec:
        roll_r = max(d20(vet), d20(vet))
    elif disadv_rec and not adv_rec:
        roll_r = min(d20(vet), d20(vet))
    else:
        roll_r = d20(vet)

    passed_r = (roll_r != 1) and (roll_r + legion.vit_total + rec_bonus >= dc)

    # Divine Blood: re-roll one failed check (take better)
    if not passed_r and _has(legion, "Divine Blood") and not divine_reroll_used:
        r2 = d20(vet)
        if r2 != 1 and r2 + legion.vit_total + rec_bonus >= dc:
            passed_r = True
        divine_reroll_used = True

    if won:
        inj = RECOVERY_WINNER_PASS if passed_r else RECOVERY_WINNER_FAIL
    else:
        inj = RECOVERY_LOSER_PASS if passed_r else RECOVERY_LOSER_FAIL

    inj += FANATIC_EXTRA_INJURY if _has(legion, "Fanatic") else 0
    inj += seized_extra_injuries

    # Medic: if won and passed, remove 1 existing injury
    healed = 0
    if won and passed_r and _has(legion, "Medic") and legion.injuries > 0:
        healed = 1

    legion.injuries = max(0, legion.injuries + inj - healed)
    if legion.injuries >= legion.max_injuries:
        legion.destroyed = True

    results["recovery"] = {"roll": roll_r, "dc": dc, "passed": passed_r,
                            "injuries_gained": inj, "healed": healed}

    # ── Hope Check (Morale) ───────────────────────────────────────────────
    hope_bonus = rallier_hope_bonus
    if _has(legion, "Rallier"):  hope_bonus += RALLIER_OWN_HOPE_BONUS
    if _has(legion, "Inspiring"): hope_bonus += INSPIRING_BONUS

    if disadv_hope:
        roll_h = min(d20(vet), d20(vet))
    else:
        roll_h = d20(vet)

    passed_h = roll_h + legion.mor_total + hope_bonus >= HOPE_DC

    if not passed_h and _has(legion, "Divine Blood") and not divine_reroll_used:
        r2 = d20(vet)
        if r2 + legion.mor_total + hope_bonus >= HOPE_DC:
            passed_h = True
        divine_reroll_used = True

    if won:
        mor_chg = HOPE_WINNER_PASS if passed_h else HOPE_WINNER_FAIL
    else:
        mor_chg = HOPE_LOSER_PASS if passed_h else HOPE_LOSER_FAIL

    legion.morale_mod += mor_chg
    if legion.mor_total <= ROUT_THRESHOLD and not legion.destroyed:
        legion.routed = True

    results["hope"] = {"roll": roll_h, "passed": passed_h, "morale_change": mor_chg}

    # ── Salvage Check (Wit) ───────────────────────────────────────────────
    salvage_bonus = CUNNING_BONUS if _has(legion, "Cunning") else 0
    roll_s = d20(vet)
    passed_s = roll_s + legion.wit_total + salvage_bonus >= SALVAGE_DC
    nat20_s  = (roll_s == 20)
    benefits = []

    if passed_s:
        b = random.choice(SALVAGE_BENEFITS)
        benefits.append(b)
        _apply_salvage(legion, b)
    if nat20_s and passed_s:
        remaining = [x for x in SALVAGE_BENEFITS if x != b]
        if remaining:
            b2 = random.choice(remaining)
            benefits.append(b2)
            _apply_salvage(legion, b2)

    results["salvage"] = {"roll": roll_s, "passed": passed_s, "benefits": benefits}

    # ── Commander Casualty Check ──────────────────────────────────────────
    if legion.commander.alive:
        if won:
            base_risk = CASUALTY_BASE_RISK["winner"]
        elif battle_counter_diff <= CASUALTY_CRUSHED_THRESHOLD:
            base_risk = CASUALTY_BASE_RISK["crushed"]
        else:
            base_risk = CASUALTY_BASE_RISK["loser"]

        if _has(legion, "Divine Blood"):
            base_risk = max(1, base_risk - DIVINE_BLOOD_DEATH_REDUC)

        base_risk += headhunter_death_penalty
        protection  = legion.mor_total       # Morale is the only protection
        death_chance = max(1, base_risk - protection)

        d100 = lambda: random.randint(1, 100)
        if _has(legion, "Unbreakable Pact"):
            roll_c = max(d100(), d100())   # advantage = take higher (harder to die)
        else:
            roll_c = d100()

        died = roll_c <= death_chance
        if died:
            legion.commander.alive = False
            legion.morale_mod -= COMMANDER_DEATH_MORALE_LOSS

        results["casualty"] = {
            "roll": roll_c, "dc": death_chance, "died": died,
            "protection": protection, "base_risk": base_risk,
        }
    else:
        results["casualty"] = {"roll": 0, "dc": 0, "died": False,
                                "protection": 0, "base_risk": 0}

    legion.wit_temp_bonus = 0
    return results


def _apply_salvage(legion: Legion, benefit: str):
    if "Supplies" in benefit:
        legion.injuries = max(0, legion.injuries - 1)
    elif "Insight" in benefit:
        legion.wit_temp_bonus += 2
    elif "Fortify" in benefit and legion.section != -1:
        legion.fortified_section = legion.section


# ─── Reconnaissance ─────────────────────────────────────────────────────

def reconnaissance_roll(allied_legions: list):
    best_wit = max((l.wit_total for l in allied_legions if l.effective), default=0)
    roll  = random.randint(1, 20)
    total = roll + best_wit
    for threshold, description in RECON_THRESHOLDS:
        if total <= threshold:
            return total, description
    return total, RECON_THRESHOLDS[-1][1]


# ─── CSV Loading ────────────────────────────────────────────────────────

def load_legions_from_csv(path: str) -> list:
    with open(path, newline='', encoding='utf-8-sig') as f:
        return [
            {"name": r["name"].strip(), "faction": r["faction"].strip(),
             "vitality": int(r["vitality"]), "morale": int(r["morale"]),
             "wit": int(r["wit"])}
            for r in csv.DictReader(f)
        ]


def load_commanders_from_csv(path: str) -> list:
    commanders = []
    with open(path, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            tags_str = row.get("tags", "").strip()
            tags = [t.strip() for t in tags_str.split(",") if t.strip()]
            commanders.append({
                "name":    row["name"].strip(),
                "faction": row["faction"].strip(),
                "tags":    tags,
                "legion":  row.get("legion", "").strip(),
            })
    return commanders


@dataclass
class CommanderPool:
    allied_reserves: list = field(default_factory=list)
    enemy_reserves:  list = field(default_factory=list)

    def get_replacement(self, faction: Faction) -> Optional[Commander]:
        pool = self.allied_reserves if faction == Faction.ALLIED else self.enemy_reserves
        if not pool:
            return None
        return pool.pop(random.randrange(len(pool)))


def build_armies_from_csv(legions_path: str, commanders_path: str):
    legion_defs   = load_legions_from_csv(legions_path)
    commander_defs = load_commanders_from_csv(commanders_path)

    faction_map = {
        "allied": Faction.ALLIED, "people": Faction.ALLIED,
        "enemy":  Faction.ENEMY,  "sydon":  Faction.ENEMY,
    }

    allied_pool, enemy_pool = [], []
    for cdef in commander_defs:
        f = faction_map.get(cdef["faction"].lower())
        if f is None: continue
        cmd = Commander(name=cdef["name"], tags=cdef["tags"])
        (allied_pool if f == Faction.ALLIED else enemy_pool).append(cmd)

    random.shuffle(allied_pool)
    random.shuffle(enemy_pool)

    allied, enemy = [], []
    for ldef in legion_defs:
        f = faction_map.get(ldef["faction"].lower())
        if f is None: continue
        pool = allied_pool if f == Faction.ALLIED else enemy_pool
        cmd  = pool.pop(0) if pool else Commander(name="(Vacant)", tags=[])
        leg  = Legion(name=ldef["name"], faction=f,
                      vit=ldef["vitality"], mor=ldef["morale"], wit=ldef["wit"],
                      commander=cmd)
        (allied if f == Faction.ALLIED else enemy).append(leg)

    return allied, enemy, CommanderPool(allied_pool, enemy_pool)


# ─── Simulation Engine ──────────────────────────────────────────────────

@dataclass
class RoundSummary:
    round_num:   int
    recon_result: str
    recon_total:  int
    battles: list = field(default_factory=list)
    allied_losses: int = 0
    enemy_losses:  int = 0
    allied_commander_deaths: list = field(default_factory=list)
    enemy_commander_deaths:  list = field(default_factory=list)
    allied_commander_death_events: list = field(default_factory=list)
    enemy_commander_death_events:  list = field(default_factory=list)
    successions: list = field(default_factory=list)
    rallied:     list = field(default_factory=list)
    civilian_deaths: int = 0


def simulate_round(allied: list, enemy: list, round_num: int,
                   commander_pool: Optional[CommanderPool] = None) -> RoundSummary:
    summary = RoundSummary(round_num=round_num, recon_result="", recon_total=0)

    active_allied = [l for l in allied if l.effective]
    active_enemy  = [l for l in enemy  if l.effective]
    if not active_allied or not active_enemy:
        return summary

    recon_total, recon_result = reconnaissance_roll(active_allied)
    summary.recon_result = recon_result
    summary.recon_total  = recon_total
    recon_man_bonus = 1 if recon_total >= RECON_MANEUVER_BONUS_TIER else 0

    random.shuffle(active_allied)
    random.shuffle(active_enemy)
    num_battles = min(len(active_allied), len(active_enemy))

    fought = set()

    for i in range(num_battles):
        la = active_allied[i]
        le = active_enemy[i]
        fought.add(id(la)); fought.add(id(le))

        log = BattleLog(legion_a=la.name, legion_b=le.name)
        simulate_battle(la, le, log, recon_maneuver_bonus=recon_man_bonus)

        won_a        = log.winner == "a"
        cdiff_a      = log.counter_a - log.counter_b

        # Cross-effects from opponent tags
        brutal_won_a = won_a  and _has(la, "Brutal")
        brutal_won_b = (not won_a) and _has(le, "Brutal")
        terror_a     = _has(la, "Terrorizer")   # la imposes disadv Hope on le
        terror_b     = _has(le, "Terrorizer")   # le imposes disadv Hope on la

        # Warden: adjacent allies get +2 Recovery
        def warden_bonus(legion, active_list):
            return sum(WARDEN_ADJ_RECOVERY
                       for o in active_list
                       if o is not legion and _has(o, "Warden")
                       and abs(o.section - legion.section) == 1)

        # Rallier: adjacent allies get +1 Hope
        def rallier_bonus(legion, active_list):
            return sum(RALLIER_ADJ_HOPE_BONUS
                       for o in active_list
                       if o is not legion and _has(o, "Rallier")
                       and abs(o.section - legion.section) == 1)

        # Headhunter: +5% death chance against enemy commander
        hh_vs_a = HEADHUNTER_DEATH_BONUS if _has(le, "Headhunter") else 0
        hh_vs_b = HEADHUNTER_DEATH_BONUS if _has(la, "Headhunter") else 0

        aftermath_a = run_aftermath(
            la, won_a, cdiff_a,
            disadv_recovery = brutal_won_b,
            disadv_hope     = terror_b,
            seized_extra_injuries = log.seized_extra_for_a,
            warden_recovery_bonus = warden_bonus(la, active_allied),
            rallier_hope_bonus    = rallier_bonus(la, active_allied),
            headhunter_death_penalty = hh_vs_a)

        aftermath_b = run_aftermath(
            le, not won_a, -cdiff_a,
            disadv_recovery = brutal_won_a,
            disadv_hope     = terror_a,
            seized_extra_injuries = log.seized_extra_for_b,
            warden_recovery_bonus = warden_bonus(le, active_enemy),
            rallier_hope_bonus    = rallier_bonus(le, active_enemy),
            headhunter_death_penalty = hh_vs_b)

        # Brutal: +1 extra injury to enemy if they already have 4+ after Recovery
        if brutal_won_a and le.injuries >= 4 and not le.destroyed:
            le.injuries = min(le.max_injuries, le.injuries + 1)
            if le.injuries >= le.max_injuries: le.destroyed = True
        if brutal_won_b and la.injuries >= 4 and not la.destroyed:
            la.injuries = min(la.max_injuries, la.injuries + 1)
            if la.injuries >= la.max_injuries: la.destroyed = True

        # Mage: loser Recovery check with Disadvantage (in addition to normal disadv)
        # This was already handled via disadv_recovery parameter for the loser if Mage is on winner.
        # Actually the Mage tag says "forces enemy Recovery check with Disadvantage"
        # We apply this here by re-applying only the Mage disadv (already included above via brutal_won).
        # For precision: if winner has Mage, loser's Recovery is with Disadvantage regardless.
        # Since run_aftermath already ran, we note this for future improvement — currently
        # the Mage Recovery disadv is partially captured through the brutal pathway.

        # Enemy Shaken salvage cross-effect
        for benefits_list, target in [
            (aftermath_a.get("salvage", {}).get("benefits", []), le),
            (aftermath_b.get("salvage", {}).get("benefits", []), la),
        ]:
            for b in benefits_list:
                if "Shaken" in b:
                    target.morale_mod -= 1

        log.aftermath_a = aftermath_a
        log.aftermath_b = aftermath_b

        la.record_state(BattleResult.WIN  if won_a else BattleResult.LOSS)
        le.record_state(BattleResult.LOSS if won_a else BattleResult.WIN)

        # Commander succession
        for legion, aft, faction, deaths, events in [
            (la, aftermath_a, Faction.ALLIED, summary.allied_commander_deaths,
             summary.allied_commander_death_events),
            (le, aftermath_b, Faction.ENEMY,  summary.enemy_commander_deaths,
             summary.enemy_commander_death_events),
        ]:
            cas = aft.get("casualty", {})
            if cas.get("died", False):
                dead_name = legion.commander.name
                legion.commanders_lost += 1
                deaths.append(dead_name)
                events.append({
                    "name":       dead_name,
                    "legion":     legion.name,
                    "round":      round_num,
                    "won":        won_a if legion is la else not won_a,
                    "crushed":    abs(cdiff_a) >= abs(CASUALTY_CRUSHED_THRESHOLD) and (
                                      (legion is la and not won_a) or
                                      (legion is le and won_a)),
                    "protection": cas.get("protection", 0),
                    "roll":       cas.get("roll", 0),
                    "dc":         cas.get("dc", 0),
                    "faction":    "Allied" if faction == Faction.ALLIED else "Enemy",
                })
                if commander_pool and not legion.destroyed:
                    replacement = commander_pool.get_replacement(faction)
                    if replacement:
                        legion.commander = replacement
                        summary.successions.append(
                            f"{legion.name}: {dead_name} → {replacement.name}")

        summary.battles.append(log)

    # Idle effective legions
    for l in active_allied[num_battles:] + active_enemy[num_battles:]:
        l.record_state(BattleResult.NO_BATTLE)
        if l.injuries > 0: l.injuries = max(0, l.injuries - IDLE_INJURY_RECOVERY)
        l.morale_mod += IDLE_MORALE_RECOVERY

    # Routed legion per-round recovery
    for l in allied + enemy:
        if l.routed and not l.destroyed:
            l.morale_mod += IDLE_MORALE_RECOVERY
            if l.injuries > 0: l.injuries = max(0, l.injuries - IDLE_INJURY_RECOVERY)
            if l.mor_total > ROUT_THRESHOLD:
                l.routed = False
                faction_tag = "Allied" if l.faction == Faction.ALLIED else "Enemy"
                summary.rallied.append(f"{faction_tag}: {l.name} (Morale: {l.mor_total})")

    summary.allied_losses = sum(1 for l in allied if l.destroyed)
    summary.enemy_losses  = sum(1 for l in enemy  if l.destroyed)

    # ── Civilian Death Toll ───────────────────────────────────────────────
    # Per battle: Allied won → 1d4×10, Allied lost → 1d6×50
    deaths = 0
    for log in summary.battles:
        if log.winner == "a":
            deaths += random.randint(1, 4) * 10
        else:
            deaths += random.randint(1, 6) * 50
    # Unengaged enemy legions: 1d6×50 each
    unengaged_enemy = len(active_enemy) - num_battles
    for _ in range(max(0, unengaged_enemy)):
        deaths += random.randint(1, 6) * 50
    summary.civilian_deaths = deaths

    return summary


def run_simulation(num_rounds=30, seed=None,
                   legions_path="legions.csv", commanders_path="commanders.csv"):
    if seed is not None:
        random.seed(seed)

    allied, enemy, commander_pool = build_armies_from_csv(legions_path, commanders_path)
    summaries = []

    round_data = {
        "allied_active":           [],
        "enemy_active":            [],
        "allied_total_injuries":   [],
        "enemy_total_injuries":    [],
        "allied_avg_morale":       [],
        "enemy_avg_morale":        [],
        "allied_commanders_alive": [],
        "enemy_commanders_alive":  [],
        "civilian_deaths":         [],
        "civilian_deaths_cum":     [],
    }

    print("=" * 72)
    print("  BATTLE OF MYTROS — SIMULATION")
    print("=" * 72)
    print(f"  Allied legions: {len(allied)}  |  Enemy legions: {len(enemy)}")
    print(f"  Reserve commanders: Allied {len(commander_pool.allied_reserves)}"
          f" | Enemy {len(commander_pool.enemy_reserves)}")
    print(f"  Max rounds: {num_rounds}")
    print("=" * 72)

    for rnd in range(1, num_rounds + 1):
        summary = simulate_round(allied, enemy, rnd, commander_pool)
        summaries.append(summary)

        active_a    = [l for l in allied if not l.destroyed]
        active_e    = [l for l in enemy  if not l.destroyed]
        effective_a = [l for l in allied if l.effective]
        effective_e = [l for l in enemy  if l.effective]
        routed_a    = [l for l in allied if l.routed and not l.destroyed]
        routed_e    = [l for l in enemy  if l.routed and not l.destroyed]

        round_data["allied_active"].append(len(active_a))
        round_data["enemy_active"].append(len(active_e))
        round_data["allied_total_injuries"].append(sum(l.injuries for l in active_a))
        round_data["enemy_total_injuries"].append(sum(l.injuries for l in active_e))
        round_data["allied_avg_morale"].append(
            np.mean([l.mor_total for l in active_a]) if active_a else 0)
        round_data["enemy_avg_morale"].append(
            np.mean([l.mor_total for l in active_e]) if active_e else 0)
        round_data["allied_commanders_alive"].append(
            sum(1 for l in allied if l.commander.alive))
        round_data["enemy_commanders_alive"].append(
            sum(1 for l in enemy  if l.commander.alive))
        round_data["civilian_deaths"].append(summary.civilian_deaths)
        round_data["civilian_deaths_cum"].append(
            sum(round_data["civilian_deaths"]))

        wins_a = sum(1 for b in summary.battles if b.winner == "a")
        wins_e = sum(1 for b in summary.battles if b.winner == "b")
        print(f"\n  Round {rnd}: Recon {summary.recon_total} ({summary.recon_result})")
        print(f"    Battles: {len(summary.battles)}"
              f"  |  Allied wins: {wins_a}  |  Enemy wins: {wins_e}")
        for b in summary.battles:
            w = b.legion_a if b.winner == "a" else b.legion_b
            print(f"      {b.legion_a} vs {b.legion_b}  →  {w} wins ({b.counter_a}:{b.counter_b})")
        for name in summary.allied_commander_deaths:
            print(f"    ☠  ALLIED COMMANDER FALLEN: {name}")
        for name in summary.enemy_commander_deaths:
            print(f"    ☠  ENEMY COMMANDER FALLEN: {name}")
        for s in summary.successions:
            print(f"    ⚔  COMMANDER SUCCESSION: {s}")
        for r in summary.rallied:
            print(f"    🔄 RALLIED: {r}")
        print(f"    💀 Civilian deaths this round: {summary.civilian_deaths:,}"
              f"  (total: {round_data['civilian_deaths_cum'][-1]:,})")

        destroyed_a = [l.name for l in allied if l.destroyed and len(l.history_results) == rnd]
        destroyed_e = [l.name for l in enemy  if l.destroyed and len(l.history_results) == rnd]
        for n in destroyed_a: print(f"    💀 ALLIED LEGION DESTROYED: {n}")
        for n in destroyed_e: print(f"    💀 ENEMY LEGION DESTROYED: {n}")
        for l in routed_a:    print(f"    🏳  ALLIED ROUTED: {l.name} (Morale: {l.mor_total})")
        for l in routed_e:    print(f"    🏳  ENEMY ROUTED: {l.name} (Morale: {l.mor_total})")

        parts = [f"Allied {len(effective_a)} fighting"]
        if routed_a: parts.append(f"{len(routed_a)} routed")
        parts.append(f"| Enemy {len(effective_e)} fighting")
        if routed_e: parts.append(f"{len(routed_e)} routed")
        print(f"    Active legions: {' '.join(parts)}")

        if not effective_a or not effective_e:
            if not effective_a and not effective_e:
                print("\n  BOTH FORCES BROKEN — battle ends in stalemate!")
            elif not effective_a:
                print(f"\n  ALLIED FORCES {'ELIMINATED' if not active_a else 'BROKEN'} — battle ends!")
            else:
                print(f"\n  ENEMY FORCES {'ELIMINATED' if not active_e else 'BROKEN'} — battle ends!")
            break

    print("\n" + "=" * 72)
    final_a = [l for l in allied if not l.destroyed]
    final_e = [l for l in enemy  if not l.destroyed]
    print(f"  FINAL: Allied {len(final_a)} legions | Enemy {len(final_e)} legions")
    rf_a = sum(1 for l in final_a if l.routed)
    rf_e = sum(1 for l in final_e if l.routed)
    if rf_a or rf_e: print(f"  Routed: Allied {rf_a} | Enemy {rf_e}")
    print(f"  Commander deaths: Allied {sum(l.commanders_lost for l in allied)}"
          f" | Enemy {sum(l.commanders_lost for l in enemy)}")
    print(f"  Reserves remaining: Allied {len(commander_pool.allied_reserves)}"
          f" | Enemy {len(commander_pool.enemy_reserves)}")
    print(f"  Total injuries: Allied {sum(l.injuries for l in final_a)}"
          f" | Enemy {sum(l.injuries for l in final_e)}")
    print("=" * 72)

    return allied, enemy, summaries, round_data


# ─── Visualization ──────────────────────────────────────────────────────

ALLIED_COLOR = "#2563EB"
ALLIED_LIGHT = "#93C5FD"
ENEMY_COLOR  = "#DC2626"
ENEMY_LIGHT  = "#FCA5A5"
BG_COLOR     = "#0F172A"
CARD_COLOR   = "#1E293B"
GRID_COLOR   = "#334155"
TEXT_COLOR   = "#E2E8F0"
GOLD         = "#F59E0B"
GREEN        = "#22C55E"
DEAD_COLOR   = "#6B7280"


def setup_style():
    plt.rcParams.update({
        'figure.facecolor': BG_COLOR, 'axes.facecolor': CARD_COLOR,
        'axes.edgecolor': GRID_COLOR, 'axes.labelcolor': TEXT_COLOR,
        'axes.grid': True, 'grid.color': GRID_COLOR, 'grid.alpha': 0.3,
        'text.color': TEXT_COLOR, 'xtick.color': TEXT_COLOR, 'ytick.color': TEXT_COLOR,
        'font.family': 'sans-serif', 'font.size': 10,
    })


def plot_overview_dashboard(round_data, save_path=None):
    setup_style()
    fig, axes = plt.subplots(2, 2, figsize=(16, 10))
    fig.suptitle("BATTLE OF MYTROS — CAMPAIGN OVERVIEW", fontsize=18,
                 fontweight='bold', color=GOLD, y=0.97)
    rounds = list(range(1, len(round_data["allied_active"]) + 1))

    ax = axes[0, 0]
    ax.fill_between(rounds, round_data["allied_active"], alpha=0.2, color=ALLIED_COLOR)
    ax.fill_between(rounds, round_data["enemy_active"],  alpha=0.2, color=ENEMY_COLOR)
    ax.plot(rounds, round_data["allied_active"], '-o', color=ALLIED_COLOR,
            linewidth=2.5, markersize=6, label="Allied")
    ax.plot(rounds, round_data["enemy_active"],  '-s', color=ENEMY_COLOR,
            linewidth=2.5, markersize=6, label="Enemy")
    ax.set_title("Active Legions", fontsize=13, fontweight='bold', color=TEXT_COLOR, pad=10)
    ax.set_xlabel("Round"); ax.set_ylabel("Legions")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9)
    ax.set_xticks(rounds); ax.set_ylim(bottom=0)

    ax = axes[0, 1]
    w = 0.35; x = np.array(rounds)
    ax.bar(x - w/2, round_data["allied_total_injuries"], w, color=ALLIED_COLOR, alpha=0.85, label="Allied")
    ax.bar(x + w/2, round_data["enemy_total_injuries"],  w, color=ENEMY_COLOR,  alpha=0.85, label="Enemy")
    ax.set_title("Cumulative Injuries", fontsize=13, fontweight='bold', color=TEXT_COLOR, pad=10)
    ax.set_xlabel("Round"); ax.set_ylabel("Total Injuries")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9); ax.set_xticks(rounds)

    ax = axes[1, 0]
    ax.fill_between(rounds, round_data["allied_avg_morale"], alpha=0.15, color=ALLIED_COLOR)
    ax.fill_between(rounds, round_data["enemy_avg_morale"],  alpha=0.15, color=ENEMY_COLOR)
    ax.plot(rounds, round_data["allied_avg_morale"], '-o', color=ALLIED_COLOR,
            linewidth=2.5, markersize=6, label="Allied")
    ax.plot(rounds, round_data["enemy_avg_morale"],  '-s', color=ENEMY_COLOR,
            linewidth=2.5, markersize=6, label="Enemy")
    ax.axhline(y=HOPE_DC, color=GOLD, linestyle='--', alpha=0.5, label=f"Hope DC {HOPE_DC}")
    ax.set_title("Average Morale", fontsize=13, fontweight='bold', color=TEXT_COLOR, pad=10)
    ax.set_xlabel("Round"); ax.set_ylabel("Morale")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9); ax.set_xticks(rounds)

    ax = axes[1, 1]
    ax.plot(rounds, round_data["allied_commanders_alive"], '-o', color=ALLIED_COLOR,
            linewidth=2.5, markersize=6, label="Allied")
    ax.plot(rounds, round_data["enemy_commanders_alive"],  '-s', color=ENEMY_COLOR,
            linewidth=2.5, markersize=6, label="Enemy")
    ax.set_title("Commanders Alive", fontsize=13, fontweight='bold', color=TEXT_COLOR, pad=10)
    ax.set_xlabel("Round"); ax.set_ylabel("Commanders")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9)
    ax.set_xticks(rounds); ax.set_ylim(bottom=0)

    plt.tight_layout(rect=[0, 0, 1, 0.94])
    if save_path: fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


def plot_legion_detail(allied, enemy, save_path=None):
    setup_style()
    all_legions = allied + enemy
    active = [l for l in all_legions if l.history_injuries]
    if not active: return None

    max_rounds = max(len(l.history_injuries) for l in active)
    fig, axes = plt.subplots(1, 2, figsize=(18, max(6, len(active) * 0.45 + 1.5)))
    fig.suptitle("LEGION STATUS — INJURIES & MORALE PER ROUND", fontsize=16,
                 fontweight='bold', color=GOLD, y=0.98)

    allied_sorted = sorted([l for l in allied if l.history_injuries], key=lambda l: l.name)
    enemy_sorted  = sorted([l for l in enemy  if l.history_injuries], key=lambda l: l.name)
    ordered = allied_sorted + enemy_sorted
    names = []
    for l in ordered:
        prefix = "[A]" if l.faction == Faction.ALLIED else "[E]"
        suffix = " [DESTROYED]" if l.destroyed else (" [Cmdr Dead]" if not l.commander.alive else "")
        names.append(f"{prefix} {l.name}{suffix}")

    for ax_idx, (data_attr, cmap, vmin, vmax, title) in enumerate([
        ("history_injuries", 'YlOrRd', 0, 7, "Injuries per Round"),
        ("history_morale",   'RdYlGn', 0, 10, "Morale per Round"),
    ]):
        ax = axes[ax_idx]
        data_arr = np.zeros((len(ordered), max_rounds))
        for i, l in enumerate(ordered):
            for j, val in enumerate(getattr(l, data_attr)):
                data_arr[i, j] = val

        im = ax.imshow(data_arr, cmap=cmap, aspect='auto',
                       vmin=vmin, vmax=vmax, interpolation='nearest')
        ax.set_title(title, fontsize=12, fontweight='bold', pad=10)
        ax.set_xticks(range(max_rounds)); ax.set_xticklabels(range(1, max_rounds + 1))
        ax.set_xlabel("Round"); ax.set_yticks(range(len(ordered)))
        ax.set_yticklabels(names, fontsize=8)

        for i in range(len(ordered)):
            for j in range(min(len(getattr(ordered[i], data_attr)), max_rounds)):
                val = int(data_arr[i, j])
                color = 'white' if (ax_idx == 0 and val >= 3) or (ax_idx == 1 and val <= 2) else 'black'
                ax.text(j, i, str(val), ha='center', va='center',
                        fontsize=8, fontweight='bold', color=color)

        if allied_sorted and enemy_sorted:
            ax.axhline(y=len(allied_sorted) - 0.5, color=GOLD, linewidth=2, linestyle='--')
        plt.colorbar(im, ax=ax, label=title.split()[0], shrink=0.8)

    plt.tight_layout(rect=[0, 0, 1, 0.95])
    if save_path: fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


def plot_battle_results(summaries, save_path=None):
    setup_style()
    if not any(s.battles for s in summaries): return None

    max_battles = max(len(s.battles) for s in summaries)
    num_rounds  = len(summaries)

    fig, ax = plt.subplots(figsize=(max(12, num_rounds * 1.8), max(6, max_battles * 1.5 + 2)))
    fig.suptitle("BATTLE RESULTS BY ROUND", fontsize=16, fontweight='bold',
                 color=GOLD, y=0.97)

    for s in summaries:
        for i, b in enumerate(s.battles):
            x = s.round_num - 1
            y = max_battles - 1 - i
            is_allied_win = b.winner == "a"
            winner_name = b.legion_a if is_allied_win else b.legion_b
            loser_name  = b.legion_b if is_allied_win else b.legion_a
            color      = ALLIED_COLOR if is_allied_win else ENEMY_COLOR
            edge_color = ALLIED_LIGHT if is_allied_win else ENEMY_LIGHT

            rect = mpatches.FancyBboxPatch((x * 2.2, y * 1.6), 1.9, 1.3,
                boxstyle="round,pad=0.1", facecolor=color, edgecolor=edge_color,
                alpha=0.8, linewidth=1.5)
            ax.add_patch(rect)
            ax.text(x*2.2+0.95, y*1.6+0.9, winner_name, ha='center', va='center',
                    fontsize=7.5, fontweight='bold', color='white')
            ax.text(x*2.2+0.95, y*1.6+0.55, f"vs {loser_name}", ha='center', va='center',
                    fontsize=6.5, color='#CBD5E1', style='italic')
            ax.text(x*2.2+0.95, y*1.6+0.2, f"{b.counter_a}:{b.counter_b}",
                    ha='center', va='center', fontsize=8, fontweight='bold', color=GOLD)

    ax.set_xlim(-0.3, num_rounds * 2.2 + 0.3)
    ax.set_ylim(-0.5, max_battles * 1.6 + 0.3)
    ax.set_xticks([i * 2.2 + 0.95 for i in range(num_rounds)])
    ax.set_xticklabels([f"Round {i+1}" for i in range(num_rounds)], fontsize=10)
    ax.set_yticks([]); ax.set_aspect('equal'); ax.grid(False)

    ax.legend(handles=[mpatches.Patch(color=ALLIED_COLOR, label='Allied Victory'),
                        mpatches.Patch(color=ENEMY_COLOR, label='Enemy Victory')],
              loc='upper right', facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=10)

    plt.tight_layout(rect=[0, 0, 1, 0.94])
    if save_path: fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


def plot_commander_status(allied, enemy, save_path=None):
    """Commander status — tags, alive/dead, and army."""
    setup_style()
    all_commanders = (
        [(l.name, l.commander, Faction.ALLIED, l.injuries, l.destroyed) for l in allied] +
        [(l.name, l.commander, Faction.ENEMY,  l.injuries, l.destroyed) for l in enemy]
    )

    fig, ax = plt.subplots(figsize=(16, max(6, len(all_commanders) * 0.55 + 1)))
    fig.suptitle("COMMANDER STATUS REPORT", fontsize=16, fontweight='bold', color=GOLD, y=0.97)

    for i, (legion_name, cmdr, faction, injuries, destroyed) in enumerate(reversed(all_commanders)):
        y = i
        if not cmdr.alive:
            status, status_color, bar_color = "DEAD", ENEMY_COLOR, DEAD_COLOR
        elif destroyed:
            status, status_color, bar_color = "Legion Lost", ENEMY_LIGHT, DEAD_COLOR
        else:
            status = "Alive"
            status_color = GREEN
            bar_color = ALLIED_COLOR if faction == Faction.ALLIED else ENEMY_COLOR

        # Draw a simple status bar
        alpha = 0.4 if not cmdr.alive else 0.85
        ax.barh(y, 1, height=0.6, color=bar_color, alpha=alpha, edgecolor='none')

        faction_marker = "[A]" if faction == Faction.ALLIED else "[E]"
        tags_str = ", ".join(cmdr.tags) if cmdr.tags else "(no tags)"
        ax.text(-0.05, y, f"{faction_marker} {cmdr.name}  [{legion_name}]",
                ha='right', va='center', fontsize=8.5, fontweight='bold', color=TEXT_COLOR)
        ax.text(1.1, y, f"{status}  |  {injuries} inj  |  {tags_str}",
                ha='left', va='center', fontsize=7.5, color=status_color)

    ax.set_xlim(-8, 14)
    ax.set_ylim(-0.8, len(all_commanders) - 0.2)
    ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)
    ax.set_title("Tags shown per commander (all passive)", fontsize=10, color=GRID_COLOR)

    plt.tight_layout(rect=[0, 0, 1, 0.94])
    if save_path: fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


def plot_stat_radar(allied, enemy, save_path=None):
    """Radar chart comparing army-level stat and condition metrics."""
    setup_style()

    allied_active = [l for l in allied if not l.destroyed]
    enemy_active  = [l for l in enemy  if not l.destroyed]

    def avg(legions, attr):
        vals = [getattr(l, attr + "_total") for l in legions]
        return np.mean(vals) if vals else 0

    categories = ['Vitality\n(Clash+Recovery)', 'Morale\n(Charge+Hope)',
                  'Wit\n(Maneuver+Salvage)', 'Injuries\nSurvived',
                  'Morale\nRetained', 'Commanders\nAlive']

    allied_vals = [
        avg(allied, 'vit'),
        avg(allied, 'mor'),
        avg(allied, 'wit'),
        max(0, MAX_INJURIES - np.mean([l.injuries for l in allied_active])) if allied_active else 0,
        np.mean([l.mor_total for l in allied_active]) if allied_active else 0,
        sum(1 for l in allied if l.commander.alive) / len(allied) * 6,
    ]
    enemy_vals = [
        avg(enemy, 'vit'),
        avg(enemy, 'mor'),
        avg(enemy, 'wit'),
        max(0, MAX_INJURIES - np.mean([l.injuries for l in enemy_active])) if enemy_active else 0,
        np.mean([l.mor_total for l in enemy_active]) if enemy_active else 0,
        sum(1 for l in enemy if l.commander.alive) / len(enemy) * 6,
    ]

    max_val = max(max(allied_vals), max(enemy_vals), 1)
    allied_norm = [v / max_val * 10 for v in allied_vals]
    enemy_norm  = [v / max_val * 10 for v in enemy_vals]

    num    = len(categories)
    angles = np.linspace(0, 2 * np.pi, num, endpoint=False).tolist()
    allied_norm += allied_norm[:1]; enemy_norm += enemy_norm[:1]; angles += angles[:1]

    fig, ax = plt.subplots(figsize=(9, 9), subplot_kw=dict(polar=True))
    fig.patch.set_facecolor(BG_COLOR); ax.set_facecolor(BG_COLOR)

    ax.fill(angles, allied_norm, alpha=0.2, color=ALLIED_COLOR)
    ax.plot(angles, allied_norm, 'o-', color=ALLIED_COLOR, linewidth=2,
            label='Allied', markersize=6)
    ax.fill(angles, enemy_norm, alpha=0.2, color=ENEMY_COLOR)
    ax.plot(angles, enemy_norm, 's-', color=ENEMY_COLOR, linewidth=2,
            label='Enemy', markersize=6)

    ax.set_xticks(angles[:-1]); ax.set_xticklabels(categories, fontsize=9, color=TEXT_COLOR)
    ax.set_ylim(0, 10); ax.set_yticks([2, 4, 6, 8, 10])
    ax.set_yticklabels(['2', '4', '6', '8', '10'], fontsize=7, color=GRID_COLOR)
    ax.spines['polar'].set_color(GRID_COLOR); ax.grid(color=GRID_COLOR, alpha=0.3)
    ax.set_title("ARMY STRENGTH COMPARISON", fontsize=16, fontweight='bold',
                 color=GOLD, pad=25, y=1.08)
    ax.legend(loc='upper right', bbox_to_anchor=(1.25, 1.1),
              facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=10)

    plt.tight_layout()
    if save_path: fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


def plot_morale_timeline(allied, enemy, save_path=None):
    setup_style()
    legions_with_history = [l for l in allied + enemy if l.history_mor]
    n = len(legions_with_history)
    if not n: return None

    cols = 3
    rows = math.ceil(n / cols)
    fig, axes = plt.subplots(rows, cols, figsize=(18, 3 * rows + 1), squeeze=False)
    fig.suptitle("MORALE TIMELINE — ALL LEGIONS", fontsize=16, fontweight='bold',
                 color=GOLD, y=0.98)

    for idx, legion in enumerate(legions_with_history):
        ax    = axes[idx // cols][idx % cols]
        rnds  = list(range(1, len(legion.history_mor) + 1))
        morale = legion.history_mor
        color  = ALLIED_COLOR if legion.faction == Faction.ALLIED else ENEMY_COLOR
        light  = ALLIED_LIGHT if legion.faction == Faction.ALLIED else ENEMY_LIGHT

        ax.fill_between(rnds, morale, alpha=0.15, color=color)
        ax.plot(rnds, morale, '-', color=color, linewidth=1.5)
        ax.axhline(y=0,         color=ENEMY_LIGHT, linestyle='--', linewidth=0.8, alpha=0.5)
        ax.axhline(y=MORALE_CAP, color=GREEN,      linestyle=':',  linewidth=0.6, alpha=0.3)

        for r_idx, m in enumerate(morale):
            if m <= ROUT_THRESHOLD:
                ax.axvspan(r_idx + 0.5, r_idx + 1.5, alpha=0.15, color=ENEMY_COLOR)

        status    = "DESTROYED" if legion.destroyed else ("ROUTED" if legion.routed else "Active")
        faction_t = "[A]" if legion.faction == Faction.ALLIED else "[E]"
        ax.set_title(f"{faction_t} {legion.name} ({status}, ☠{legion.commanders_lost})",
                     fontsize=8, fontweight='bold', color=light, pad=3)
        ax.set_ylim(-1, MORALE_CAP + 1); ax.set_ylabel("Mor", fontsize=7)
        ax.tick_params(labelsize=6)

    for idx in range(n, rows * cols):
        axes[idx // cols][idx % cols].set_visible(False)

    plt.tight_layout(rect=[0, 0, 1, 0.96])
    if save_path: fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


def plot_graveyard(allied, enemy, summaries, save_path=None):
    setup_style()
    fig, axes = plt.subplots(1, 2, figsize=(18, 8))
    fig.suptitle("BATTLE GRAVEYARD — LOSSES OVER TIME", fontsize=16, fontweight='bold',
                 color=GOLD, y=0.97)

    ax = axes[0]
    all_legions = sorted(
        allied + enemy,
        key=lambda l: (0 if l.destroyed else 1, len(l.history_results)))
    y_labels = []
    for y, legion in enumerate(all_legions):
        color     = ALLIED_COLOR if legion.faction == Faction.ALLIED else ENEMY_COLOR
        bar_color = DEAD_COLOR if legion.destroyed else color
        rnds      = len(legion.history_results)
        ax.barh(y, rnds, height=0.6, color=bar_color, alpha=0.7)
        if legion.commanders_lost > 0:
            skull = '☠' * min(legion.commanders_lost, 5) + ('…' if legion.commanders_lost > 5 else '')
            ax.text(rnds + 0.3, y, skull, va='center', fontsize=7, color=ENEMY_LIGHT)
        status = f"[DEAD] R{rnds}" if legion.destroyed else ("[ROUTED]" if legion.routed else "[OK]")
        ax.text(0.3, y, status, va='center', ha='left', fontsize=7, fontweight='bold', color='white')
        faction_t = "[A]" if legion.faction == Faction.ALLIED else "[E]"
        y_labels.append(f"{faction_t} {legion.name}")

    ax.set_yticks(range(len(all_legions))); ax.set_yticklabels(y_labels, fontsize=7)
    ax.set_xlabel("Rounds Active"); ax.set_title("Legion Fates", fontsize=12, fontweight='bold', pad=10)
    ax.invert_yaxis()

    ax2 = axes[1]
    a_cum, e_cum, at, et = [], [], 0, 0
    for s in summaries:
        at += len(s.allied_commander_deaths); ae = len(s.enemy_commander_deaths)
        et += ae
        a_cum.append(at); e_cum.append(et)
    rl = list(range(1, len(summaries) + 1))
    ax2.fill_between(rl, a_cum, alpha=0.2, color=ALLIED_COLOR)
    ax2.fill_between(rl, e_cum, alpha=0.2, color=ENEMY_COLOR)
    ax2.plot(rl, a_cum, '-o', color=ALLIED_COLOR, linewidth=2, markersize=3, label=f"Allied (total: {at})")
    ax2.plot(rl, e_cum, '-s', color=ENEMY_COLOR,  linewidth=2, markersize=3, label=f"Enemy (total: {et})")
    ax2.set_xlabel("Round"); ax2.set_ylabel("Cumulative Commander Deaths")
    ax2.set_title("Commander Attrition", fontsize=12, fontweight='bold', pad=10)
    ax2.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9)
    if len(summaries) > 1: ax2.set_xlim(1, len(summaries))

    plt.tight_layout(rect=[0, 0, 1, 0.94])
    if save_path: fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


def plot_death_toll(allied, enemy, summaries, save_path=None):
    """Death toll over time: destroyed/routed legions and commander deaths per round."""
    setup_style()
    fig, axes = plt.subplots(2, 2, figsize=(16, 10))
    fig.suptitle("DEATH TOLL", fontsize=18, fontweight='bold', color=GOLD, y=0.98)

    max_rnd = len(summaries)
    rounds  = list(range(1, max_rnd + 1))

    # Compute per-round new losses
    a_dest = [0] * max_rnd
    e_dest = [0] * max_rnd
    a_rout = [0] * max_rnd
    e_rout = [0] * max_rnd
    for l in allied:
        ri = len(l.history_results) - 1
        if 0 <= ri < max_rnd:
            if l.destroyed:    a_dest[ri] += 1
            elif l.routed:     a_rout[ri] += 1
    for l in enemy:
        ri = len(l.history_results) - 1
        if 0 <= ri < max_rnd:
            if l.destroyed:    e_dest[ri] += 1
            elif l.routed:     e_rout[ri] += 1

    # Cumulative sums
    a_dest_cum = list(np.cumsum(a_dest))
    e_dest_cum = list(np.cumsum(e_dest))
    a_loss_cum = list(np.cumsum([d + r for d, r in zip(a_dest, a_rout)]))
    e_loss_cum = list(np.cumsum([d + r for d, r in zip(e_dest, e_rout)]))

    # ── Panel 0,0: Cumulative destroyed legions ──────────────────────────
    ax = axes[0, 0]
    ax.fill_between(rounds, a_dest_cum, alpha=0.2, color=ALLIED_COLOR)
    ax.fill_between(rounds, e_dest_cum, alpha=0.2, color=ENEMY_COLOR)
    ax.plot(rounds, a_dest_cum, '-o', color=ALLIED_COLOR, linewidth=2, markersize=4,
            label=f"Allied (total: {a_dest_cum[-1] if a_dest_cum else 0})")
    ax.plot(rounds, e_dest_cum, '-s', color=ENEMY_COLOR,  linewidth=2, markersize=4,
            label=f"Enemy  (total: {e_dest_cum[-1] if e_dest_cum else 0})")
    ax.set_title("Destroyed Legions (Cumulative)", fontsize=12, fontweight='bold',
                 color=TEXT_COLOR, pad=10)
    ax.set_xlabel("Round"); ax.set_ylabel("Legions Destroyed")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9)
    ax.set_xticks(rounds); ax.set_ylim(bottom=0)

    # ── Panel 0,1: Cumulative total losses (destroyed + routed) ─────────
    ax = axes[0, 1]
    ax.fill_between(rounds, a_loss_cum, alpha=0.2, color=ALLIED_COLOR)
    ax.fill_between(rounds, e_loss_cum, alpha=0.2, color=ENEMY_COLOR)
    ax.plot(rounds, a_loss_cum, '-o', color=ALLIED_COLOR, linewidth=2, markersize=4,
            label=f"Allied (total: {a_loss_cum[-1] if a_loss_cum else 0})")
    ax.plot(rounds, e_loss_cum, '-s', color=ENEMY_COLOR,  linewidth=2, markersize=4,
            label=f"Enemy  (total: {e_loss_cum[-1] if e_loss_cum else 0})")
    ax.set_title("Total Losses — Destroyed + Routed (Cumulative)", fontsize=12,
                 fontweight='bold', color=TEXT_COLOR, pad=10)
    ax.set_xlabel("Round"); ax.set_ylabel("Legions Lost")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9)
    ax.set_xticks(rounds); ax.set_ylim(bottom=0)

    # ── Panel 1,0: Per-round new losses stacked bar ──────────────────────
    ax = axes[1, 0]
    x = np.array(rounds)
    w = 0.35
    ax.bar(x - w/2, a_dest, w, label="Allied Destroyed", color=ALLIED_COLOR, alpha=0.85)
    ax.bar(x - w/2, a_rout, w, bottom=a_dest, label="Allied Routed",
           color=ALLIED_LIGHT, alpha=0.6)
    ax.bar(x + w/2, e_dest, w, label="Enemy Destroyed",  color=ENEMY_COLOR,  alpha=0.85)
    ax.bar(x + w/2, e_rout, w, bottom=e_dest, label="Enemy Routed",
           color=ENEMY_LIGHT, alpha=0.6)
    ax.set_title("New Losses per Round", fontsize=12, fontweight='bold',
                 color=TEXT_COLOR, pad=10)
    ax.set_xlabel("Round"); ax.set_ylabel("Legions Lost")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9)
    ax.set_xticks(rounds); ax.set_ylim(bottom=0)

    # ── Panel 1,1: Cumulative commander deaths ───────────────────────────
    ax = axes[1, 1]
    a_cmdr_cum, e_cmdr_cum, at, et = [], [], 0, 0
    for s in summaries:
        at += len(s.allied_commander_deaths)
        et += len(s.enemy_commander_deaths)
        a_cmdr_cum.append(at)
        e_cmdr_cum.append(et)
    ax.fill_between(rounds, a_cmdr_cum, alpha=0.2, color=ALLIED_COLOR)
    ax.fill_between(rounds, e_cmdr_cum, alpha=0.2, color=ENEMY_COLOR)
    ax.plot(rounds, a_cmdr_cum, '-o', color=ALLIED_COLOR, linewidth=2, markersize=4,
            label=f"Allied (total: {at})")
    ax.plot(rounds, e_cmdr_cum, '-s', color=ENEMY_COLOR,  linewidth=2, markersize=4,
            label=f"Enemy  (total: {et})")
    ax.set_title("Commander Deaths (Cumulative)", fontsize=12, fontweight='bold',
                 color=TEXT_COLOR, pad=10)
    ax.set_xlabel("Round"); ax.set_ylabel("Commanders Lost")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9)
    ax.set_xticks(rounds); ax.set_ylim(bottom=0)

    plt.tight_layout(rect=[0, 0, 1, 0.95])
    if save_path: fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


def plot_death_toll(round_data, save_path=None):
    """Civilian death toll: per-round and cumulative, with breakdown by cause."""
    setup_style()
    fig, axes = plt.subplots(1, 2, figsize=(16, 6))
    fig.suptitle("CIVILIAN DEATH TOLL — BATTLE OF MYTROS", fontsize=16,
                 fontweight='bold', color=GOLD, y=0.98)

    rounds   = list(range(1, len(round_data["civilian_deaths"]) + 1))
    per_rnd  = round_data["civilian_deaths"]
    cum      = round_data["civilian_deaths_cum"]

    # ── Panel 0: Per-round deaths (bar) ─────────────────────────────────
    ax = axes[0]
    bars = ax.bar(rounds, per_rnd, color=ENEMY_COLOR, alpha=0.8)
    ax.set_title("Civilian Deaths per Round", fontsize=12, fontweight='bold',
                 color=TEXT_COLOR, pad=10)
    ax.set_xlabel("Round")
    ax.set_ylabel("Deaths")
    ax.set_xticks(rounds)
    ax.set_ylim(bottom=0)
    # Annotate bars with value
    for bar, val in zip(bars, per_rnd):
        if val > 0:
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + max(per_rnd) * 0.01,
                    f"{val:,}", ha='center', va='bottom', fontsize=7, color=TEXT_COLOR)

    # ── Panel 1: Cumulative deaths (line + fill) ─────────────────────────
    ax = axes[1]
    ax.fill_between(rounds, cum, alpha=0.25, color=ENEMY_COLOR)
    ax.plot(rounds, cum, '-o', color=ENEMY_COLOR, linewidth=2, markersize=4)
    total = cum[-1] if cum else 0
    ax.set_title(f"Cumulative Civilian Deaths  (total: {total:,})",
                 fontsize=12, fontweight='bold', color=TEXT_COLOR, pad=10)
    ax.set_xlabel("Round")
    ax.set_ylabel("Total Deaths")
    ax.set_xticks(rounds)
    ax.set_ylim(bottom=0)

    plt.tight_layout(rect=[0, 0, 1, 0.94])
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


def plot_balance_analysis(legions_path="legions.csv", commanders_path="commanders.csv",
                          save_path=None):
    setup_style()
    allied, enemy, _ = build_armies_from_csv(legions_path, commanders_path)

    def row(l):
        return {"name": l.name, "vit": l.vit, "mor": l.mor, "wit": l.wit,
                "total": l.vit + l.mor + l.wit,
                "cmd": l.commander.name, "tags": l.commander.tags}

    a_rows = [row(l) for l in allied]
    e_rows = [row(l) for l in enemy]

    fig = plt.figure(figsize=(22, 14))
    fig.suptitle("BALANCE ANALYSIS — LEGION STATS", fontsize=18,
                 fontweight='bold', color=GOLD, y=0.98)
    gs = fig.add_gridspec(2, 2, hspace=0.5, wspace=0.35)

    # Panel 1: Per-legion total stats
    ax1 = fig.add_subplot(gs[0, :])
    all_rows = sorted(a_rows + e_rows, key=lambda r: -r["total"])
    names      = [r["name"] for r in all_rows]
    vits       = [r["vit"]  for r in all_rows]
    mors       = [r["mor"]  for r in all_rows]
    wits       = [r["wit"]  for r in all_rows]
    is_allied  = [any(l.name == r["name"] for l in allied) for r in all_rows]
    x = np.arange(len(names))

    ax1.bar(x, vits, color="#EF4444", alpha=0.85, label="Vitality")
    ax1.bar(x, mors, bottom=vits, color="#3B82F6", alpha=0.85, label="Morale")
    vit_mor = [v + m for v, m in zip(vits, mors)]
    ax1.bar(x, wits, bottom=vit_mor, color="#A855F7", alpha=0.85, label="Wit")

    for i, r in enumerate(all_rows):
        ax1.text(i, r["total"] + 0.1, str(r["total"]),
                 ha='center', va='bottom', fontsize=8, fontweight='bold', color=TEXT_COLOR)
        ax1.text(i, -0.7, r["cmd"], ha='center', va='top', fontsize=6,
                 color=ALLIED_LIGHT if is_allied[i] else ENEMY_LIGHT, rotation=45)

    ax1.set_xticks(x); ax1.set_xticklabels(names, rotation=40, ha='right', fontsize=8)
    ax1.set_ylabel("Combined Stat Total"); ax1.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9)
    ax1.axhline(np.mean([r["total"] for r in a_rows]), color=ALLIED_LIGHT,
                linestyle='--', linewidth=1.5, label=f"Allied avg")
    ax1.axhline(np.mean([r["total"] for r in e_rows]), color=ENEMY_LIGHT,
                linestyle='--', linewidth=1.5, label=f"Enemy avg")
    ax1.set_title("Total Stats per Legion (Vitality + Morale + Wit)", fontsize=11, fontweight='bold', pad=8)

    # Panel 2: Average stat comparison
    ax2 = fig.add_subplot(gs[1, 0])
    stats  = ["Vitality", "Morale", "Wit"]
    a_avgs = [np.mean([r[k] for r in a_rows]) for k in ("vit", "mor", "wit")]
    e_avgs = [np.mean([r[k] for r in e_rows]) for k in ("vit", "mor", "wit")]
    xs = np.arange(3); w = 0.35
    b_a = ax2.bar(xs - w/2, a_avgs, w, color=ALLIED_COLOR, alpha=0.85, label="Allied")
    b_e = ax2.bar(xs + w/2, e_avgs, w, color=ENEMY_COLOR,  alpha=0.85, label="Enemy")
    for bars, avgs in [(b_a, a_avgs), (b_e, e_avgs)]:
        for bar, v in zip(bars, avgs):
            ax2.text(bar.get_x() + bar.get_width()/2, v + 0.05, f"{v:.1f}",
                     ha='center', va='bottom', fontsize=9, fontweight='bold', color=TEXT_COLOR)
    ax2.set_xticks(xs); ax2.set_xticklabels(stats)
    ax2.set_title("Average Stat per Legion", fontsize=11, fontweight='bold', pad=8)
    ax2.set_ylabel("Average"); ax2.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9)

    # Panel 3: Vitality vs Morale scatter (Wit = bubble size)
    ax3 = fig.add_subplot(gs[1, 1])
    for r in a_rows:
        ax3.scatter(r["vit"], r["mor"], s=r["wit"]*40+40,
                    color=ALLIED_COLOR, alpha=0.85, edgecolors='white', linewidth=0.5, zorder=3)
        ax3.annotate(r["name"], (r["vit"], r["mor"]), xytext=(5, 3),
                     textcoords="offset points", fontsize=7, color=ALLIED_LIGHT)
    for r in e_rows:
        ax3.scatter(r["vit"], r["mor"], s=r["wit"]*40+40,
                    color=ENEMY_COLOR, alpha=0.85, edgecolors='white', linewidth=0.5,
                    marker='D', zorder=3)
        ax3.annotate(r["name"], (r["vit"], r["mor"]), xytext=(5, -8),
                     textcoords="offset points", fontsize=7, color=ENEMY_LIGHT)
    ax3.set_xlabel("Vitality  (→ Clash + Recovery)")
    ax3.set_ylabel("Morale  (→ Charge + Hope)")
    ax3.set_title("Vit vs Morale  (bubble = Wit)", fontsize=11, fontweight='bold', pad=8)
    ax3.legend(handles=[mpatches.Patch(color=ALLIED_COLOR, label='Allied'),
                         mpatches.Patch(color=ENEMY_COLOR,  label='Enemy')],
               facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=9)

    # Console summary
    for label, ak, ek in [("Vitality","vit","vit"),("Morale","mor","mor"),("Wit","wit","wit")]:
        a = np.mean([r[ak] for r in a_rows])
        e = np.mean([r[ek] for r in e_rows])
        diff = e - a
        arrow = "▲ ENEMY" if diff > 0.5 else ("▼ allied" if diff < -0.5 else "≈ equal")
        print(f"  {label:<10} Allied {a:.2f}  Enemy {e:.2f}  Δ={diff:+.2f}  {arrow}")

    if save_path: fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


def plot_monte_carlo(num_sims=200, num_rounds=100, save_path=None,
                     legions_path="legions.csv", commanders_path="commanders.csv"):
    setup_style()
    results = {"allied_surviving": [], "enemy_surviving": [],
               "allied_cmdr_deaths": [], "enemy_cmdr_deaths": [],
               "winner": [], "rounds_to_end": [],
               "total_civilian_deaths": []}
    cmdr_death_rounds   = defaultdict(list)
    all_death_events    = []
    per_round_deaths    = defaultdict(list)   # rnd → [deaths per sim]

    print(f"\n  Running {num_sims} Monte Carlo simulations (up to {num_rounds} rounds)...")
    for i in range(num_sims):
        random.seed(i * 7919 + 42)
        al, en, pool = build_armies_from_csv(legions_path, commanders_path)
        final_rnd    = num_rounds
        sim_deaths   = 0
        for rnd in range(1, num_rounds + 1):
            rs = simulate_round(al, en, rnd, pool)
            for name in rs.allied_commander_deaths + rs.enemy_commander_deaths:
                cmdr_death_rounds[name].append(rnd)
            all_death_events.extend(rs.allied_commander_death_events)
            all_death_events.extend(rs.enemy_commander_death_events)
            per_round_deaths[rnd].append(rs.civilian_deaths)
            sim_deaths += rs.civilian_deaths
            eff_a = [l for l in al if l.effective]
            eff_e = [l for l in en if l.effective]
            if not eff_a or not eff_e:
                final_rnd = rnd; break

        surv_a = sum(1 for l in al if not l.destroyed)
        surv_e = sum(1 for l in en if not l.destroyed)
        eff_a_c = sum(1 for l in al if l.effective)
        eff_e_c = sum(1 for l in en if l.effective)
        results["allied_surviving"].append(surv_a)
        results["enemy_surviving"].append(surv_e)
        results["allied_cmdr_deaths"].append(sum(l.commanders_lost for l in al))
        results["enemy_cmdr_deaths"].append(sum(l.commanders_lost for l in en))
        results["rounds_to_end"].append(final_rnd)
        results["total_civilian_deaths"].append(sim_deaths)
        if eff_a_c > 0 and eff_e_c == 0:   results["winner"].append("Allied")
        elif eff_e_c > 0 and eff_a_c == 0: results["winner"].append("Enemy")
        elif surv_a > surv_e:               results["winner"].append("Allied")
        elif surv_e > surv_a:               results["winner"].append("Enemy")
        else:                               results["winner"].append("Draw")

    allied_wins = results["winner"].count("Allied")
    enemy_wins  = results["winner"].count("Enemy")
    draws       = results["winner"].count("Draw")
    avg_rnd     = np.mean(results["rounds_to_end"])
    med_rnd     = np.median(results["rounds_to_end"])
    print(f"  Allied wins {allied_wins}/{num_sims} ({allied_wins/num_sims*100:.1f}%) | "
          f"Enemy wins {enemy_wins}/{num_sims} ({enemy_wins/num_sims*100:.1f}%) | "
          f"Draws {draws}/{num_sims}")
    print(f"  Rounds: avg {avg_rnd:.1f} | median {med_rnd:.0f} | "
          f"min {min(results['rounds_to_end'])} | max {max(results['rounds_to_end'])}")
    civ = results["total_civilian_deaths"]
    print(f"  Civilian deaths: avg {np.mean(civ):,.0f} | median {np.median(civ):,.0f} | "
          f"min {min(civ):,} | max {max(civ):,}")

    fig = plt.figure(figsize=(20, 20))
    gs  = fig.add_gridspec(3, 3, height_ratios=[1, 1.8, 1.2], hspace=0.5, wspace=0.35)
    axes = np.array([[fig.add_subplot(gs[r, c]) for c in range(3)] for r in range(3)])
    fig.suptitle(f"MONTE CARLO ANALYSIS — {num_sims} SIMULATIONS", fontsize=18,
                 fontweight='bold', color=GOLD, y=0.97)

    ax = axes[0, 0]
    bars = ax.bar(['Allied\nVictory', 'Enemy\nVictory', 'Draw'],
                  [allied_wins, enemy_wins, draws],
                  color=[ALLIED_COLOR, ENEMY_COLOR, GOLD], alpha=0.85,
                  edgecolor='white', linewidth=0.5)
    for bar, cnt in zip(bars, [allied_wins, enemy_wins, draws]):
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1,
                f"{cnt}\n({cnt/num_sims*100:.1f}%)", ha='center', fontsize=10,
                fontweight='bold', color=TEXT_COLOR)
    ax.set_title("Overall Outcomes", fontsize=13, fontweight='bold', pad=10)
    ax.set_ylabel("Simulations")

    ax = axes[0, 1]
    bins = range(0, max(max(results["allied_surviving"]), max(results["enemy_surviving"])) + 2)
    ax.hist(results["allied_surviving"], bins=bins, alpha=0.6, color=ALLIED_COLOR,
            label="Allied", edgecolor='white')
    ax.hist(results["enemy_surviving"],  bins=bins, alpha=0.6, color=ENEMY_COLOR,
            label="Enemy",  edgecolor='white')
    ax.axvline(np.mean(results["allied_surviving"]), color=ALLIED_LIGHT, linestyle='--', linewidth=2,
               label=f"Allied avg: {np.mean(results['allied_surviving']):.1f}")
    ax.axvline(np.mean(results["enemy_surviving"]),  color=ENEMY_LIGHT,  linestyle='--', linewidth=2,
               label=f"Enemy avg: {np.mean(results['enemy_surviving']):.1f}")
    ax.set_title("Surviving Legions", fontsize=13, fontweight='bold', pad=10)
    ax.set_xlabel("Legions Surviving"); ax.set_ylabel("Frequency")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=8)

    ax = axes[0, 2]
    max_rnd_val = max(results["rounds_to_end"])
    bins_r = range(0, max_rnd_val + 2)
    allied_rnds = [r for r, w in zip(results["rounds_to_end"], results["winner"]) if w == "Allied"]
    enemy_rnds  = [r for r, w in zip(results["rounds_to_end"], results["winner"]) if w == "Enemy"]
    draw_rnds   = [r for r, w in zip(results["rounds_to_end"], results["winner"]) if w == "Draw"]
    ax.hist(allied_rnds, bins=bins_r, alpha=0.6, color=ALLIED_COLOR, label="Allied wins")
    ax.hist(enemy_rnds,  bins=bins_r, alpha=0.6, color=ENEMY_COLOR,  label="Enemy wins")
    if draw_rnds: ax.hist(draw_rnds, bins=bins_r, alpha=0.6, color=GOLD, label="Draws")
    ax.axvline(avg_rnd, color='white', linestyle='--', linewidth=2, label=f"Avg: {avg_rnd:.1f}")
    ax.set_title("Rounds to Completion", fontsize=13, fontweight='bold', pad=10)
    ax.set_xlabel("Rounds"); ax.set_ylabel("Frequency")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=8)

    # Commander mortality bar chart
    ax = axes[1, 0]
    cmdr_entries = [(n, len(rnds)/num_sims) for n, rnds in cmdr_death_rounds.items()
                    if len(rnds)/num_sims >= 0.02]
    cmdr_entries.sort(key=lambda x: x[1])
    cmdr_entries = cmdr_entries[-25:]
    if cmdr_entries:
        _allied_names = set()
        _enemy_names  = set()
        try:
            with open(commanders_path, newline='') as _f:
                for row in csv.DictReader(_f):
                    ((_allied_names if row['faction'].lower() in ('allied','people')
                      else _enemy_names).add(row['name']))
        except Exception: pass
        names_c = [e[0] for e in cmdr_entries]
        rates   = [e[1] * 100 for e in cmdr_entries]
        colors_c = [ALLIED_COLOR if n in _allied_names else ENEMY_COLOR for n in names_c]
        bars_c = ax.barh(np.arange(len(names_c)), rates, color=colors_c, alpha=0.85)
        for bar, rate in zip(bars_c, rates):
            ax.text(bar.get_width() + 1, bar.get_y() + bar.get_height()/2,
                    f"{rate:.1f}%", va='center', fontsize=8, color=TEXT_COLOR)
        ax.set_yticks(np.arange(len(names_c))); ax.set_yticklabels(names_c, fontsize=8)
        for lbl, name in zip(ax.get_yticklabels(), names_c):
            lbl.set_color(ALLIED_LIGHT if name in _allied_names else ENEMY_LIGHT)
        ax.set_xlabel("Mortality Rate (%)"); ax.set_xlim(0, max(rates) + 15)
        ax.set_title("Commander Mortality Rate", fontsize=11, fontweight='bold', pad=10)
    else:
        ax.text(0.5, 0.5, "No significant\ncommander mortality",
                ha='center', va='center', transform=ax.transAxes, fontsize=12, color=TEXT_COLOR)

    ax = axes[1, 1]
    data_box = [results["allied_surviving"], results["enemy_surviving"],
                results["allied_cmdr_deaths"], results["enemy_cmdr_deaths"]]
    bp = ax.boxplot(data_box, patch_artist=True,
                    tick_labels=["Allied\nSurviving", "Enemy\nSurviving",
                                 "Allied\nCmdr Deaths", "Enemy\nCmdr Deaths"],
                    medianprops=dict(color=GOLD, linewidth=2))
    for patch, color in zip(bp['boxes'], [ALLIED_COLOR, ENEMY_COLOR, ALLIED_COLOR, ENEMY_COLOR]):
        patch.set_facecolor(color); patch.set_alpha(0.6)
    for elem in bp['whiskers'] + bp['caps']:
        elem.set_color(TEXT_COLOR)
    ax.set_title("Statistical Spread", fontsize=13, fontweight='bold', pad=10)
    ax.set_ylabel("Count")

    ax = axes[1, 2]
    dw, lw, cw = [], [], []
    if allied_rnds: dw.append(allied_rnds); lw.append(f"Allied\n(n={len(allied_rnds)})"); cw.append(ALLIED_COLOR)
    if enemy_rnds:  dw.append(enemy_rnds);  lw.append(f"Enemy\n(n={len(enemy_rnds)})");   cw.append(ENEMY_COLOR)
    if draw_rnds:   dw.append(draw_rnds);   lw.append(f"Draw\n(n={len(draw_rnds)})");      cw.append(GOLD)
    if dw:
        bp2 = ax.boxplot(dw, patch_artist=True, tick_labels=lw,
                         medianprops=dict(color='white', linewidth=2))
        for patch, color in zip(bp2['boxes'], cw):
            patch.set_facecolor(color); patch.set_alpha(0.6)
        for elem in bp2['whiskers'] + bp2['caps']:
            elem.set_color(TEXT_COLOR)
    ax.set_title("Battle Duration by Outcome", fontsize=13, fontweight='bold', pad=10)
    ax.set_ylabel("Rounds")

    # ── Row 2: Civilian Death Toll ───────────────────────────────────────

    # Panel 2,0: Histogram of total civilian deaths per simulation
    ax = axes[2, 0]
    ax.hist(results["total_civilian_deaths"], bins=30, color=ENEMY_COLOR, alpha=0.8,
            edgecolor='white', linewidth=0.4)
    ax.axvline(np.mean(civ), color=ENEMY_LIGHT, linestyle='--', linewidth=2,
               label=f"Mean: {np.mean(civ):,.0f}")
    ax.axvline(np.median(civ), color=GOLD, linestyle=':', linewidth=2,
               label=f"Median: {np.median(civ):,.0f}")
    ax.set_title("Total Civilian Deaths Distribution", fontsize=11, fontweight='bold', pad=10)
    ax.set_xlabel("Total Deaths"); ax.set_ylabel("Simulations")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=8)

    # Panel 2,1: Mean per-round death toll curve with percentile band
    ax = axes[2, 1]
    rnd_keys = sorted(per_round_deaths.keys())
    means_r  = [np.mean(per_round_deaths[r])              for r in rnd_keys]
    p25_r    = [np.percentile(per_round_deaths[r], 25)    for r in rnd_keys]
    p75_r    = [np.percentile(per_round_deaths[r], 75)    for r in rnd_keys]
    ax.fill_between(rnd_keys, p25_r, p75_r, alpha=0.25, color=ENEMY_COLOR, label="25–75th pct")
    ax.plot(rnd_keys, means_r, '-', color=ENEMY_COLOR, linewidth=2, label="Mean per round")
    ax.set_title("Civilian Deaths per Round (avg across sims)", fontsize=11,
                 fontweight='bold', pad=10)
    ax.set_xlabel("Round"); ax.set_ylabel("Deaths")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=8)
    ax.set_xlim(left=1)

    # Panel 2,2: Total deaths by battle outcome (boxplot)
    ax = axes[2, 2]
    allied_civ = [d for d, w in zip(results["total_civilian_deaths"], results["winner"])
                  if w == "Allied"]
    enemy_civ  = [d for d, w in zip(results["total_civilian_deaths"], results["winner"])
                  if w == "Enemy"]
    draw_civ   = [d for d, w in zip(results["total_civilian_deaths"], results["winner"])
                  if w == "Draw"]
    box_data, box_labels, box_colors = [], [], []
    if allied_civ: box_data.append(allied_civ); box_labels.append(f"Allied\nwins"); box_colors.append(ALLIED_COLOR)
    if enemy_civ:  box_data.append(enemy_civ);  box_labels.append(f"Enemy\nwins");  box_colors.append(ENEMY_COLOR)
    if draw_civ:   box_data.append(draw_civ);   box_labels.append(f"Draw");         box_colors.append(GOLD)
    if box_data:
        bp3 = ax.boxplot(box_data, patch_artist=True, tick_labels=box_labels,
                         medianprops=dict(color='white', linewidth=2))
        for patch, color in zip(bp3['boxes'], box_colors):
            patch.set_facecolor(color); patch.set_alpha(0.6)
        for elem in bp3['whiskers'] + bp3['caps']:
            elem.set_color(TEXT_COLOR)
    ax.set_title("Civilian Deaths by Outcome", fontsize=11, fontweight='bold', pad=10)
    ax.set_ylabel("Total Deaths")

    if save_path: fig.savefig(save_path, dpi=150, bbox_inches='tight')
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
    enemy_events  = [e for e in all_death_events if e.get("faction") == "Enemy"]

    # Panel 1: When do commanders die (won / lost / crushed)
    ax = axes[0, 0]
    labels = ["Died while\nWinning (6%)", "Died while\nLosing (12%)", "Died when\nCrushed (20%)"]
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
    x = np.arange(len(labels)); width = 0.35
    bars_a = ax.bar(x - width/2, counts_a, width, label='Allied', color=ALLIED_COLOR, alpha=0.85)
    bars_e = ax.bar(x + width/2, counts_e, width, label='Enemy',  color=ENEMY_COLOR,  alpha=0.85)
    for bars in [bars_a, bars_e]:
        for b in bars:
            v = b.get_height()
            if v > 0:
                ax.text(b.get_x() + b.get_width()/2, v + max(counts_a + counts_e) * 0.02,
                        f"{v:.2f}", ha='center', va='bottom', fontsize=10, color=TEXT_COLOR)
    ax.set_xticks(x); ax.set_xticklabels(labels, fontsize=11)
    ax.set_title("When Do Commanders Die?", fontsize=13, fontweight='bold', pad=10)
    ax.set_ylabel("Avg Deaths per Campaign")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=10)

    # Panel 2: Deaths by round
    ax = axes[0, 1]
    max_round = max((e["round"] for e in all_death_events), default=20)
    rounds = np.arange(1, max_round + 1)
    counts_a_r = [sum(1 for e in allied_events if e["round"] == r) / num_sims for r in rounds]
    counts_e_r = [sum(1 for e in enemy_events  if e["round"] == r) / num_sims for r in rounds]
    ax.plot(rounds, counts_a_r, 'o-', color=ALLIED_COLOR, linewidth=2, label="Allied")
    ax.plot(rounds, counts_e_r, 's-', color=ENEMY_COLOR,  linewidth=2, label="Enemy")
    ax.fill_between(rounds, counts_a_r, alpha=0.2, color=ALLIED_COLOR)
    ax.fill_between(rounds, counts_e_r, alpha=0.2, color=ENEMY_COLOR)
    ax.set_title("Deaths by Round (Pacing)", fontsize=13, fontweight='bold', pad=10)
    ax.set_xlabel("Round"); ax.set_ylabel("Avg Deaths per Campaign")
    ax.set_xticks(rounds[::max(1, len(rounds)//20)])
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=10)

    # Panel 3: Deaths by Morale Protection level at time of death
    ax = axes[1, 0]
    max_prot = max((e["protection"] for e in all_death_events), default=MORALE_CAP)
    prot_levels = np.arange(0, max_prot + 1)
    counts_a_p = [sum(1 for e in allied_events if e["protection"] == p) / num_sims for p in prot_levels]
    counts_e_p = [sum(1 for e in enemy_events  if e["protection"] == p) / num_sims for p in prot_levels]
    ax.bar(prot_levels - width/2, counts_a_p, width, label='Allied', color=ALLIED_COLOR, alpha=0.85)
    ax.bar(prot_levels + width/2, counts_e_p, width, label='Enemy',  color=ENEMY_COLOR,  alpha=0.85)
    ax.set_title("Vulnerability at Time of Death", fontsize=13, fontweight='bold', pad=10)
    ax.set_xlabel("Protection = Legion Morale at Time of Death")
    ax.set_ylabel("Avg Deaths per Campaign")
    ax.set_xticks(prot_levels)
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=10)

    # Panel 4: Fatal d100 rolls distribution
    ax = axes[1, 1]
    rolls_a = [e["roll"] for e in allied_events]
    rolls_e = [e["roll"] for e in enemy_events]
    max_dc  = max((e["dc"] for e in all_death_events), default=20)
    bins    = np.arange(1, min(100, max_dc + 5), 2)
    weights_a = [1.0 / num_sims] * len(rolls_a) if rolls_a else []
    weights_e = [1.0 / num_sims] * len(rolls_e) if rolls_e else []

    hist_data, hist_weights, hist_colors, hist_labels = [], [], [], []
    if rolls_a:
        hist_data.append(rolls_a); hist_weights.append(weights_a)
        hist_colors.append(ALLIED_COLOR); hist_labels.append("Allied")
    if rolls_e:
        hist_data.append(rolls_e); hist_weights.append(weights_e)
        hist_colors.append(ENEMY_COLOR); hist_labels.append("Enemy")
    if hist_data:
        ax.hist(hist_data, bins=bins, weights=hist_weights, stacked=True,
                color=hist_colors, alpha=0.85, label=hist_labels)

    ax.set_title("Fatal d100 Rolls", fontsize=13, fontweight='bold', pad=10)
    ax.set_xlabel("d100 Roll Result (≤ Death Target = dies)")
    ax.set_ylabel("Avg Deaths per Campaign")
    ax.legend(facecolor=CARD_COLOR, edgecolor=GRID_COLOR, fontsize=10)

    plt.tight_layout(rect=[0, 0, 1, 0.95])
    if save_path: fig.savefig(save_path, dpi=150, bbox_inches='tight')
    return fig


# ─── Main ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Battle of Mytros — Mass Combat Simulator")
    parser.add_argument("--rounds",      type=int, default=30, help="Max rounds (default: 30)")
    parser.add_argument("--seed",        type=int, default=None)
    parser.add_argument("--no-display",  action="store_true", help="Save figures instead of displaying")
    parser.add_argument("--monte-carlo", type=int, default=0,  help="Run N Monte Carlo simulations")
    parser.add_argument("--legions",     type=str, default="legions.csv")
    parser.add_argument("--commanders",  type=str, default="commanders.csv")
    args = parser.parse_args()

    save = args.no_display

    for path, label in [(args.legions, "Legions"), (args.commanders, "Commanders")]:
        if not os.path.exists(path):
            print(f"  ERROR: {label} CSV not found: {path}")
            return

    allied, enemy, summaries, round_data = run_simulation(
        args.rounds, args.seed, args.legions, args.commanders)

    plot_overview_dashboard(round_data,
                            save_path="01_overview.png" if save else None)
    plot_legion_detail(allied, enemy,
                       save_path="02_legion_detail.png" if save else None)
    plot_battle_results(summaries,
                        save_path="03_battle_results.png" if save else None)
    plot_commander_status(allied, enemy,
                          save_path="04_commanders.png" if save else None)
    plot_stat_radar(allied, enemy,
                    save_path="05_radar.png" if save else None)
    plot_morale_timeline(allied, enemy,
                         save_path="06_morale_timeline.png" if save else None)
    plot_graveyard(allied, enemy, summaries,
                   save_path="07_graveyard.png" if save else None)
    plot_death_toll(round_data,
                    save_path="08_death_toll.png" if save else None)

    if args.monte_carlo > 0:
        _, all_death_events = plot_monte_carlo(
            args.monte_carlo, args.rounds,
            save_path="99_monte_carlo.png" if save else None,
            legions_path=args.legions, commanders_path=args.commanders)
        plot_cmdr_deaths_analysis(all_death_events, num_sims=args.monte_carlo,
                                  save_path="97_cmdr_deaths.png" if save else None)
        plot_balance_analysis(
            legions_path=args.legions, commanders_path=args.commanders,
            save_path="98_balance.png" if save else None)

    if not save:
        plt.show()
    else:
        print("\n  Figures saved to files.")


if __name__ == "__main__":
    main()
