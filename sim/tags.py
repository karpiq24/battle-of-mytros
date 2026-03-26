from .config import (
    ZEALOT_MORALE_THRESHOLD, ZEALOT_BONUS, CUNNING_BONUS, INSPIRING_BONUS,
    IRONCLAD_BONUS, WARDEN_CLASH_BONUS, MAGE_PENALTY, ENGINEER_PENALTY,
    HEADHUNTER_DEATH_BONUS,
)
from .models import Legion


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
