import random

from .battle_log import BattleLog, PhaseResult
from .config import (
    CHARGE_WIN_CLASH_BONUS,
    MANEUVER_BENEFITS,
)
from .dice import contested_roll
from .models import Faction, Legion, MiraclePool, PCDeployment
from .tags import _has, enemy_penalties, fortification_bonus, legion_battle_bonuses

# ─── Battle Resolution ──────────────────────────────────────────────────


def simulate_battle(
    la: Legion,
    lb: Legion,
    log: BattleLog,
    recon_maneuver_bonus: int = 0,
    pc_a: list[PCDeployment] = None,
    pc_b: list[PCDeployment] = None,
    pool_a: MiraclePool = None,
    pool_b: MiraclePool = None,
):
    """Resolve a 3-phase battle using the margin/Battle Score system. Modifies log in-place."""
    battle_score = 0  # positive = side A ahead, negative = side B ahead
    charge_bonus_a = 0
    charge_bonus_b = 0
    clash_bonus_a = 0
    clash_bonus_b = 0

    vet_a = _has(la, "Veteran")
    vet_b = _has(lb, "Veteran")

    fort_a = fortification_bonus(la, lb)
    fort_b = fortification_bonus(lb, la)

    def roll_pc(deployments, phase_name):
        bonus = 0
        adv = False
        if not deployments:
            return 0, False
        for p in deployments:
            if p.type == "Reinforce":
                bonus += random.randint(1, 4)
            elif p.type == "Shock Assault":
                bonus += random.randint(1, 6)
            elif p.type == "Targeted Strike" and p.phase == phase_name:
                bonus += random.randint(1, 8)
                adv = True
        return bonus, adv

    # --- Reconnaissance bonus ---
    rec_a = recon_maneuver_bonus if la.faction == Faction.ALLIED else 0
    rec_b = recon_maneuver_bonus if lb.faction == Faction.ALLIED else 0

    # ── Phase 1: Maneuver (Wit) ──────────────────────────────────────────
    bon_a, adv_a, _ = legion_battle_bonuses(la, "maneuver")
    bon_b, adv_b, _ = legion_battle_bonuses(lb, "maneuver")
    pen_a, dd_a = enemy_penalties(la, lb, "maneuver")
    pen_b, dd_b = enemy_penalties(lb, la, "maneuver")

    pc_bon_a, pc_adv_a = roll_pc(pc_a, "maneuver")
    pc_bon_b, pc_adv_b = roll_pc(pc_b, "maneuver")

    tot_a = la.wit_total + bon_a + pen_a + fort_a + rec_a + pc_bon_a
    tot_b = lb.wit_total + bon_b + pen_b + fort_b + rec_b + pc_bon_b

    ra, rb, ta, tb, n20a, n20b, n1a, n1b = contested_roll(
        tot_a,
        tot_b,
        adv_a=adv_a or pc_adv_a,
        adv_b=adv_b or pc_adv_b,
        disadv_a=dd_a,
        disadv_b=dd_b,
        vet_a=vet_a,
        vet_b=vet_b,
    )

    diff_man = ta - tb
    battle_score += diff_man

    # Winner picks a Maneuver benefit (tie = no benefit)
    seized_for_b = 0
    seized_for_a = 0
    if diff_man != 0:
        winner_man = "a" if diff_man > 0 else "b"
        winner_leg = la if winner_man == "a" else lb
        benefit = random.choice(MANEUVER_BENEFITS)
        log.maneuver_benefit = f"{winner_leg.name}: {benefit[0]}"

        def roll_extra(d):
            return random.randint(1, d)

        if winner_man == "a":
            if "Flanking" in benefit[0]:
                charge_bonus_a += roll_extra(4)
            elif "Defensive" in benefit[0]:
                clash_bonus_a += roll_extra(2)
            elif "Disrupted" in benefit[0]:
                charge_bonus_b -= 1
                clash_bonus_b -= 1
            elif "Seized" in benefit[0]:
                seized_for_b = roll_extra(2)
        else:
            if "Flanking" in benefit[0]:
                charge_bonus_b += roll_extra(4)
            elif "Defensive" in benefit[0]:
                clash_bonus_b += roll_extra(2)
            elif "Disrupted" in benefit[0]:
                charge_bonus_a -= 1
                clash_bonus_a -= 1
            elif "Seized" in benefit[0]:
                seized_for_a = roll_extra(2)
    else:
        winner_man = "tie"

    log.phases.append(
        PhaseResult("Maneuver (Wit)", ra, rb, ta, tb, n20a, n20b, n1a, n1b, winner_man, diff_man)
    )

    # ── Phase 2: Charge (Morale) ─────────────────────────────────────────
    bon_a2, adv_a2, _ = legion_battle_bonuses(la, "charge")
    bon_b2, adv_b2, _ = legion_battle_bonuses(lb, "charge")
    pen_a2, dd_a2 = enemy_penalties(la, lb, "charge")
    pen_b2, dd_b2 = enemy_penalties(lb, la, "charge")

    pc_bon_a2, pc_adv_a2 = roll_pc(pc_a, "charge")
    pc_bon_b2, pc_adv_b2 = roll_pc(pc_b, "charge")

    tot_a2 = la.mor_total + bon_a2 + pen_a2 + charge_bonus_a + fort_a + pc_bon_a2
    tot_b2 = lb.mor_total + bon_b2 + pen_b2 + charge_bonus_b + fort_b + pc_bon_b2

    ra, rb, ta, tb, n20a, n20b, n1a, n1b = contested_roll(
        tot_a2,
        tot_b2,
        adv_a=adv_a2 or pc_adv_a2,
        adv_b=adv_b2 or pc_adv_b2,
        disadv_a=dd_a2,
        disadv_b=dd_b2,
        vet_a=vet_a,
        vet_b=vet_b,
    )

    diff_chg = ta - tb
    battle_score += diff_chg

    # Charge cascade: winner gets +1 to Clash; tie = no bonus
    if diff_chg > 0:
        winner_c = "a"
        clash_bonus_a += CHARGE_WIN_CLASH_BONUS
    elif diff_chg < 0:
        winner_c = "b"
        clash_bonus_b += CHARGE_WIN_CLASH_BONUS
    else:
        winner_c = "tie"

    log.phases.append(
        PhaseResult("Charge (Morale)", ra, rb, ta, tb, n20a, n20b, n1a, n1b, winner_c, diff_chg)
    )

    # ── Phase 3: Clash (Vitality) ────────────────────────────────────────
    bon_a3, adv_a3, _ = legion_battle_bonuses(la, "clash")
    bon_b3, adv_b3, _ = legion_battle_bonuses(lb, "clash")
    pen_a3, dd_a3 = enemy_penalties(la, lb, "clash")
    pen_b3, dd_b3 = enemy_penalties(lb, la, "clash")

    pc_bon_a3, pc_adv_a3 = roll_pc(pc_a, "clash")
    pc_bon_b3, pc_adv_b3 = roll_pc(pc_b, "clash")

    tot_a3 = la.vit_total + bon_a3 + pen_a3 + clash_bonus_a + fort_a + pc_bon_a3
    tot_b3 = lb.vit_total + bon_b3 + pen_b3 + clash_bonus_b + fort_b + pc_bon_b3

    ra, rb, ta, tb, n20a, n20b, n1a, n1b = contested_roll(
        tot_a3,
        tot_b3,
        adv_a=adv_a3 or pc_adv_a3,
        adv_b=adv_b3 or pc_adv_b3,
        disadv_a=dd_a3,
        disadv_b=dd_b3,
        vet_a=vet_a,
        vet_b=vet_b,
    )

    diff_cl = ta - tb
    battle_score += diff_cl
    winner_cl = "a" if diff_cl > 0 else ("b" if diff_cl < 0 else "tie")

    log.phases.append(
        PhaseResult("Clash (Vitality)", ra, rb, ta, tb, n20a, n20b, n1a, n1b, winner_cl, diff_cl)
    )

    # ── Tie-breaker: sudden-death contested Vitality if Battle Score == 0 ──
    while battle_score == 0:
        ra2, rb2, ta2, tb2, _, _, _, _ = contested_roll(la.vit_total, lb.vit_total)
        if ta2 > tb2:
            battle_score += 1
        elif tb2 > ta2:
            battle_score -= 1

    log.battle_score = battle_score
    log.winner = "a" if battle_score > 0 else "b"

    # Seized Initiative: extra injuries go to the loser
    log.seized_extra_for_b = seized_for_b if log.winner == "a" else 0
    log.seized_extra_for_a = seized_for_a if log.winner == "b" else 0

    return log
