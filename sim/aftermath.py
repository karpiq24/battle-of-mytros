import random

from .config import (
    CASUALTY_BASE_RISK,
    CASUALTY_CRUSHED_THRESHOLD,
    COMMANDER_DEATH_MORALE_LOSS,
    CUNNING_BONUS,
    DIVINE_BLOOD_DEATH_REDUC,
    HOPE_DC,
    HOPE_LOSER_FAIL,
    HOPE_LOSER_PASS,
    HOPE_WINNER_FAIL,
    HOPE_WINNER_PASS,
    INSPIRING_BONUS,
    IRONCLAD_BONUS,
    MORALE_DIMINISHING_THRESHOLD,
    RALLIER_OWN_HOPE_BONUS,
    RECOVERY_BASE_DC,
    RECOVERY_LOSER_FAIL,
    RECOVERY_LOSER_PASS,
    RECOVERY_WINNER_FAIL,
    RECOVERY_WINNER_PASS,
    ROUT_THRESHOLD,
    SALVAGE_BENEFITS,
    SALVAGE_DC,
)
from .dice import d20
from .models import Legion, MiraclePool, PCDeployment
from .tags import _has

# ─── Aftermath ──────────────────────────────────────────────────────────


def run_aftermath(
    legion: Legion,
    won: bool,
    battle_counter_diff: int,
    disadv_recovery: bool = False,
    disadv_hope: bool = False,
    seized_extra_injuries: int = 0,
    warden_recovery_bonus: int = 0,
    rallier_hope_bonus: int = 0,
    headhunter_death_penalty: int = 0,
    fort_bonus: int = 0,
    pc_deployments: list[PCDeployment] = None,
    pool: MiraclePool = None,
    defensive_footing: bool = False,
) -> dict:
    results = {}
    vet = _has(legion, "Veteran")
    divine_reroll_used = False

    def roll_pc_aft(aft_name):
        bonus = 0
        if not pc_deployments:
            return 0
        for p in pc_deployments:
            if p.type == "Reinforce":
                bonus += random.randint(1, 4)
            elif p.type == "Shield the Wounded" and aft_name in ("recovery", "hope", "salvage"):
                bonus += random.randint(1, 8)
        return bonus

    # ── Recovery Check (Vitality) ─────────────────────────────────────────
    adv_rec = _has(legion, "Medic")  # Medic: advantage on Recovery
    disadv_rec = disadv_recovery or _has(legion, "Fanatic")  # Fanatic: disadvantage
    rec_bonus = warden_recovery_bonus + fort_bonus + roll_pc_aft("recovery")
    if defensive_footing:
        rec_bonus += 2
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

    inj += seized_extra_injuries

    # Medic: if won and passed, remove 1 existing injury
    healed = 0
    if won and passed_r and _has(legion, "Medic") and legion.injuries > 0:
        healed = 1

    legion.injuries = max(0, legion.injuries + inj - healed)
    if legion.injuries >= legion.max_injuries:
        legion.destroyed = True

    results["recovery"] = {
        "roll": roll_r,
        "dc": dc,
        "passed": passed_r,
        "injuries_gained": inj,
        "healed": healed,
    }

    # ── Hope Check (Morale) ───────────────────────────────────────────────
    hope_bonus = rallier_hope_bonus + fort_bonus + roll_pc_aft("hope")
    if _has(legion, "Rallier"):
        hope_bonus += RALLIER_OWN_HOPE_BONUS
    if _has(legion, "Inspiring"):
        hope_bonus += INSPIRING_BONUS

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

    # Diminishing returns: Morale gains reduced by 1 (min 0) when at/above threshold
    if mor_chg > 0 and legion.mor_total >= MORALE_DIMINISHING_THRESHOLD:
        mor_chg = max(0, mor_chg - 1)

    legion.morale_mod += mor_chg
    if legion.mor_total <= ROUT_THRESHOLD and not legion.destroyed:
        legion.routed = True

    results["hope"] = {"roll": roll_h, "passed": passed_h, "morale_change": mor_chg}

    # ── Salvage Check (Wit) ───────────────────────────────────────────────
    salvage_bonus = fort_bonus + roll_pc_aft("salvage")
    if _has(legion, "Cunning"):
        salvage_bonus += CUNNING_BONUS

    roll_s = d20(vet)

    passed_s = roll_s + legion.wit_total + salvage_bonus >= SALVAGE_DC

    if not passed_s and _has(legion, "Divine Blood") and not divine_reroll_used:
        r2 = d20(vet)
        if r2 + legion.wit_total + salvage_bonus >= SALVAGE_DC:
            passed_s = True
        divine_reroll_used = True

    nat20_s = roll_s == 20
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
    is_protected = False
    if pc_deployments:
        for p in pc_deployments:
            if p.type == "Protect":
                is_protected = True

    if legion.commander.alive and not is_protected:
        if won:
            base_risk = CASUALTY_BASE_RISK["winner"]
        elif battle_counter_diff <= CASUALTY_CRUSHED_THRESHOLD:
            base_risk = CASUALTY_BASE_RISK["crushed"]
        else:
            base_risk = CASUALTY_BASE_RISK["loser"]

        if _has(legion, "Divine Blood"):
            base_risk = max(1, base_risk - DIVINE_BLOOD_DEATH_REDUC)

        base_risk += headhunter_death_penalty
        protection = legion.mor_total  # Morale is the only protection
        death_chance = max(1, base_risk - protection)

        def d100():
            return random.randint(1, 100)

        if _has(legion, "Unbreakable Pact"):
            roll_c = max(d100(), d100())  # advantage = take higher (harder to die)
        else:
            roll_c = d100()

        died = roll_c <= death_chance
        if died:
            legion.commander.alive = False
            legion.morale_mod -= COMMANDER_DEATH_MORALE_LOSS

        results["casualty"] = {
            "roll": roll_c,
            "dc": death_chance,
            "died": died,
            "protection": protection,
            "base_risk": base_risk,
        }
    else:
        results["casualty"] = {
            "roll": 0,
            "dc": 0,
            "died": False,
            "protection": 0,
            "base_risk": 0,
            "protected": is_protected,
        }

    legion.wit_temp_bonus = 0
    return results


def _apply_salvage(legion: Legion, benefit: str):
    if "Supplies" in benefit:
        legion.injuries = max(0, legion.injuries - 1)
    elif "Insight" in benefit:
        legion.wit_temp_bonus += 2
