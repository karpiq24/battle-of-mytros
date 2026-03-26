import random

from .config import (
    RECOVERY_BASE_DC, HOPE_DC, SALVAGE_DC,
    RECOVERY_WINNER_PASS, RECOVERY_WINNER_FAIL,
    RECOVERY_LOSER_PASS, RECOVERY_LOSER_FAIL,
    HOPE_WINNER_PASS, HOPE_WINNER_FAIL,
    HOPE_LOSER_PASS, HOPE_LOSER_FAIL,
    ROUT_THRESHOLD, IRONCLAD_BONUS, RALLIER_OWN_HOPE_BONUS, INSPIRING_BONUS,
    CUNNING_BONUS, CASUALTY_BASE_RISK, CASUALTY_CRUSHED_THRESHOLD,
    DIVINE_BLOOD_DEATH_REDUC, COMMANDER_DEATH_MORALE_LOSS,
    SALVAGE_BENEFITS,
)
from .models import Legion, PCDeployment, MiraclePool
from .dice import d20
from .tags import _has


# ─── Aftermath ──────────────────────────────────────────────────────────

def run_aftermath(legion: Legion, won: bool, battle_counter_diff: int,
                  disadv_recovery: bool = False,
                  disadv_hope: bool = False,
                  seized_extra_injuries: int = 0,
                  warden_recovery_bonus: int = 0,
                  rallier_hope_bonus: int = 0,
                  headhunter_death_penalty: int = 0,
                  fort_bonus: int = 0,
                  pc_deployments: list[PCDeployment] = None,
                  pool: MiraclePool = None) -> dict:
    results = {}
    vet = _has(legion, "Veteran")
    divine_reroll_used = False

    def roll_pc_aft(aft_name):
        bonus = 0
        if not pc_deployments: return 0
        for p in pc_deployments:
            if p.type == "Reinforce": bonus += random.randint(1, 4)
            elif p.type == "Shield the Wounded" and aft_name in ("recovery", "hope", "salvage"):
                bonus += random.randint(1, 8)
        return bonus

    def get_miracle(pool):
        if not pool: return 0, False
        bonus = 0
        adv = False
        if pool.points >= 2:
            adv = pool.spend_advantage()
        elif pool.points >= 1:
            bonus = pool.spend_bonus(1)
        return bonus, adv

    # ── Recovery Check (Vitality) ─────────────────────────────────────────
    adv_rec   = _has(legion, "Medic")    # Medic: advantage on Recovery
    disadv_rec = disadv_recovery or _has(legion, "Fanatic")  # Fanatic: disadvantage
    mir_bon_r, mir_adv_r = get_miracle(pool)
    rec_bonus = warden_recovery_bonus + fort_bonus + roll_pc_aft("recovery") + mir_bon_r
    if _has(legion, "Ironclad"):
        rec_bonus += IRONCLAD_BONUS

    dc = RECOVERY_BASE_DC + legion.injuries

    if (adv_rec or mir_adv_r) and not disadv_rec:
        roll_r = max(d20(vet), d20(vet))
    elif disadv_rec and not (adv_rec or mir_adv_r):
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

    results["recovery"] = {"roll": roll_r, "dc": dc, "passed": passed_r,
                            "injuries_gained": inj, "healed": healed}

    # ── Hope Check (Morale) ───────────────────────────────────────────────
    mir_bon_h, mir_adv_h = get_miracle(pool)
    hope_bonus = rallier_hope_bonus + fort_bonus + roll_pc_aft("hope") + mir_bon_h
    if _has(legion, "Rallier"):  hope_bonus += RALLIER_OWN_HOPE_BONUS
    if _has(legion, "Inspiring"): hope_bonus += INSPIRING_BONUS

    if disadv_hope and not mir_adv_h:
        roll_h = min(d20(vet), d20(vet))
    elif mir_adv_h and not disadv_hope:
        roll_h = max(d20(vet), d20(vet))
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
    mir_bon_s, mir_adv_s = get_miracle(pool)
    salvage_bonus = fort_bonus + roll_pc_aft("salvage") + mir_bon_s
    if _has(legion, "Cunning"): salvage_bonus += CUNNING_BONUS

    if mir_adv_s:
        roll_s = max(d20(vet), d20(vet))
    else:
        roll_s = d20(vet)

    passed_s = roll_s + legion.wit_total + salvage_bonus >= SALVAGE_DC

    if not passed_s and _has(legion, "Divine Blood") and not divine_reroll_used:
        r2 = d20(vet)
        if r2 + legion.wit_total + salvage_bonus >= SALVAGE_DC:
            passed_s = True
        divine_reroll_used = True

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
    is_protected = False
    if pc_deployments:
        for p in pc_deployments:
            if p.type == "Protect": is_protected = True

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
                                "protection": 0, "base_risk": 0, "protected": is_protected}

    legion.wit_temp_bonus = 0
    return results


def _apply_salvage(legion: Legion, benefit: str):
    if "Supplies" in benefit:
        legion.injuries = max(0, legion.injuries - 1)
    elif "Insight" in benefit:
        legion.wit_temp_bonus += 2
    elif "Fortify" in benefit and legion.section != -1:
        legion.fortified_section = legion.section
