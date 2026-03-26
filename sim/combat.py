import random

from .config import (
    BATTLE_COUNTER_WIN, BATTLE_COUNTER_CLASH_WIN,
    BATTLE_COUNTER_NAT20_BONUS, BATTLE_COUNTER_NAT1_PENALTY,
    CHARGE_WIN_CLASH_BONUS, MANEUVER_BENEFITS,
)
from .models import Legion, PCDeployment, MiraclePool, Faction
from .dice import contested_roll, determine_phase_winner
from .tags import legion_battle_bonuses, enemy_penalties, fortification_bonus, _has
from .battle_log import BattleLog, PhaseResult


# ─── Battle Resolution ──────────────────────────────────────────────────

def simulate_battle(la: Legion, lb: Legion, log: BattleLog,
                    recon_maneuver_bonus: int = 0,
                    pc_a: list[PCDeployment] = None,
                    pc_b: list[PCDeployment] = None,
                    pool_a: MiraclePool = None,
                    pool_b: MiraclePool = None):
    """Resolve a 3-phase battle. Modifies log in-place."""
    counter_a = 0
    counter_b = 0
    charge_bonus_a = 0; charge_bonus_b = 0
    clash_bonus_a  = 0; clash_bonus_b  = 0

    vet_a = _has(la, "Veteran")
    vet_b = _has(lb, "Veteran")

    fort_a = fortification_bonus(la, lb)
    fort_b = fortification_bonus(lb, la)

    def roll_pc(deployments, phase_name):
        bonus = 0
        adv = False
        if not deployments: return 0, False
        for p in deployments:
            if p.type == "Reinforce": bonus += random.randint(1, 4)
            elif p.type == "Shock Assault": bonus += random.randint(1, 6)
            elif p.type == "Targeted Strike" and p.phase == phase_name:
                bonus += random.randint(1, 8)
                adv = True
        return bonus, adv

    def get_miracle(pool):
        if not pool: return 0, False
        # Spend 1 for +1 bonus, or 2 for advantage if pool is large
        bonus = 0
        adv = False
        if pool.points >= 2:
            adv = pool.spend_advantage()
        elif pool.points >= 1:
            bonus = pool.spend_bonus(1)
        return bonus, adv

    # ── Phase 1: Maneuver (Wit) ──────────────────────────────────────────
    bon_a, adv_a, _ = legion_battle_bonuses(la, "maneuver")
    bon_b, adv_b, _ = legion_battle_bonuses(lb, "maneuver")
    pen_a, dd_a     = enemy_penalties(la, lb, "maneuver")
    pen_b, dd_b     = enemy_penalties(lb, la, "maneuver")

    pc_bon_a, pc_adv_a = roll_pc(pc_a, "maneuver")
    pc_bon_b, pc_adv_b = roll_pc(pc_b, "maneuver")

    mir_bon_a, mir_adv_a = get_miracle(pool_a)
    mir_bon_b, mir_adv_b = get_miracle(pool_b)

    # recon bonus only applies to the allied side
    rec_a = recon_maneuver_bonus if la.faction == Faction.ALLIED else 0
    rec_b = recon_maneuver_bonus if lb.faction == Faction.ALLIED else 0

    tot_a = la.wit_total + bon_a + pen_a + fort_a + rec_a + pc_bon_a + mir_bon_a
    tot_b = lb.wit_total + bon_b + pen_b + fort_b + rec_b + pc_bon_b + mir_bon_b

    # Up to 3 rerolls on tie
    winner = 'tie'
    for _ in range(4):
        ra, rb, ta, tb, n20a, n20b, n1a, n1b = contested_roll(
            tot_a, tot_b, adv_a=adv_a or pc_adv_a or mir_adv_a, adv_b=adv_b or pc_adv_b or mir_adv_b,
            disadv_a=dd_a, disadv_b=dd_b, vet_a=vet_a, vet_b=vet_b)
        winner = determine_phase_winner(ta, tb, n20a, n20b, n1a, n1b)
        if winner != 'tie':
            break
    # ... (rest of function unchanged, but using pool_a/b for Charge and Clash)

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

    pc_bon_a2, pc_adv_a2 = roll_pc(pc_a, "charge")
    pc_bon_b2, pc_adv_b2 = roll_pc(pc_b, "charge")

    mir_bon_a2, mir_adv_a2 = get_miracle(pool_a)
    mir_bon_b2, mir_adv_b2 = get_miracle(pool_b)

    tot_a2 = la.mor_total + bon_a2 + pen_a2 + charge_bonus_a + fort_a + pc_bon_a2 + mir_bon_a2
    tot_b2 = lb.mor_total + bon_b2 + pen_b2 + charge_bonus_b + fort_b + pc_bon_b2 + mir_bon_b2

    ra, rb, ta, tb, n20a, n20b, n1a, n1b = contested_roll(
        tot_a2, tot_b2, adv_a=adv_a2 or pc_adv_a2 or mir_adv_a2, adv_b=adv_b2 or pc_adv_b2 or mir_adv_b2,
        disadv_a=dd_a2, disadv_b=dd_b2, vet_a=vet_a, vet_b=vet_b)
    winner_c = determine_phase_winner(ta, tb, n20a, n20b, n1a, n1b)

    # One reroll on tie
    if winner_c == 'tie':
        ra, rb, ta, tb, n20a, n20b, n1a, n1b = contested_roll(
            tot_a2, tot_b2, adv_a=adv_a2 or pc_adv_a2 or mir_adv_a2, adv_b=adv_b2 or pc_adv_b2 or mir_adv_b2,
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

    pc_bon_a3, pc_adv_a3 = roll_pc(pc_a, "clash")
    pc_bon_b3, pc_adv_b3 = roll_pc(pc_b, "clash")

    mir_bon_a3, mir_adv_a3 = get_miracle(pool_a)
    mir_bon_b3, mir_adv_b3 = get_miracle(pool_b)

    tot_a3 = la.vit_total + bon_a3 + pen_a3 + clash_bonus_a + fort_a + pc_bon_a3 + mir_bon_a3
    tot_b3 = lb.vit_total + bon_b3 + pen_b3 + clash_bonus_b + fort_b + pc_bon_b3 + mir_bon_b3

    ra, rb, ta, tb, n20a, n20b, n1a, n1b = contested_roll(
        tot_a3, tot_b3, adv_a=adv_a3 or pc_adv_a3 or mir_adv_a3, adv_b=adv_b3 or pc_adv_b3 or mir_adv_b3,
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
