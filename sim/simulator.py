import random
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from .aftermath import run_aftermath
from .battle_log import BattleLog
from .combat import simulate_battle
from .config import (
    HEADHUNTER_DEATH_BONUS,
    IDLE_INJURY_RECOVERY,
    IDLE_MORALE_RECOVERY,
    RALLIER_ADJ_HOPE_BONUS,
    RECON_MANEUVER_BONUS_TIER,
    ROUT_THRESHOLD,
    STRATEGIC_OBJECTIVES,
    WARDEN_ADJ_RECOVERY,
)
from .loader import build_armies_from_csv
from .models import BattleResult, CommanderPool, Faction, MiraclePool, PCDeployment
from .recon import reconnaissance_roll
from .tags import _has, fortification_bonus

# ─── Simulation Engine ──────────────────────────────────────────────────


@dataclass
class RoundSummary:
    round_num: int
    recon_result: str
    recon_total: int
    battles: list = field(default_factory=list)
    allied_losses: int = 0
    enemy_losses: int = 0
    allied_commander_deaths: list = field(default_factory=list)
    enemy_commander_deaths: list = field(default_factory=list)
    allied_commander_death_events: list = field(default_factory=list)
    enemy_commander_death_events: list = field(default_factory=list)
    successions: list = field(default_factory=list)
    rallied: list = field(default_factory=list)
    civilian_deaths: int = 0
    allied_miracles: int = 8
    enemy_miracles: int = 10
    destroyed_objectives: list = field(default_factory=list)
    objective_hold_counters: dict = field(default_factory=dict)


def simulate_round(
    allied: list,
    enemy: list,
    round_num: int,
    commander_pool: Optional[CommanderPool] = None,
    miracle_allied: int = 8,
    miracle_enemy: int = 10,
    destroyed_objectives: list = None,
    objective_hold_counters: dict = None,
) -> RoundSummary:
    summary = RoundSummary(
        round_num=round_num,
        recon_result="",
        recon_total=0,
        allied_miracles=miracle_allied,
        enemy_miracles=miracle_enemy,
        destroyed_objectives=list(destroyed_objectives) if destroyed_objectives else [],
        objective_hold_counters=dict(objective_hold_counters) if objective_hold_counters else {},
    )

    active_allied = [legion for legion in allied if legion.effective]
    active_enemy = [legion for legion in enemy if legion.effective]
    if not active_allied or not active_enemy:
        return summary

    # Assign sections for the round if not already (for objective logic)
    # Simplified for batch: each legion occupies its index as a section
    for i, legion in enumerate(allied):
        legion.section = i + 1
    for i, legion in enumerate(enemy):
        legion.section = i + 1

    recon_total, recon_result = reconnaissance_roll(active_allied)
    summary.recon_result = recon_result
    summary.recon_total = recon_total
    recon_man_bonus = 1 if recon_total >= RECON_MANEUVER_BONUS_TIER else 0

    random.shuffle(active_allied)
    random.shuffle(active_enemy)
    num_battles = min(len(active_allied), len(active_enemy))

    # --- Miracle Spending (AI) ---
    # 1. Divine Healing (Priority: most injuries)
    # 2. Divine Inspiration (Priority: lowest morale)

    def ai_spend(legions, pool_points):
        remaining = pool_points
        # Healing
        injured = sorted(
            [legion for legion in legions if not legion.destroyed and legion.injuries > 0],
            key=lambda x: x.injuries,
            reverse=True,
        )
        for legion in injured:
            while legion.injuries > 0 and remaining > 0:
                legion.injuries -= 1
                remaining -= 1
        # Morale
        low_morale = sorted(
            [legion for legion in legions if not legion.destroyed and legion.mor_total < 10],
            key=lambda x: x.mor_total,
        )
        for legion in low_morale:
            while legion.mor_total < 10 and remaining > 0:
                legion.morale_mod += 1
                remaining -= 1
        return remaining

    summary.allied_miracles = ai_spend(allied, summary.allied_miracles)
    summary.enemy_miracles = ai_spend(enemy, summary.enemy_miracles)

    # Empty pools for passing to combat (no longer used for dice,
    # but kept for signature compatibility)
    battle_pools_a = [MiraclePool(0) for _ in range(num_battles)]
    battle_pools_e = [MiraclePool(0) for _ in range(num_battles)]

    # --- PC Deployment (Allied side only for sim) ---
    # Randomly assign 3 PCs to allied battles (max 2 per battle; Rally applies separately)
    pc_types = [
        "Reinforce",
        "Shock Assault",
        "Targeted Strike",
        "Shield the Wounded",
        "Protect",
        "Rally",
    ]
    pc_deployments_by_battle = [[] for _ in range(num_battles)]
    rally_morale_total = 0  # accumulated Rally Morale to distribute after battles
    if num_battles > 0:
        for i in range(3):  # 3 PCs
            ptype = random.choice(pc_types)
            if ptype == "Rally":
                # Rally: restore 1d4 Morale to a random allied legion (applied after battles)
                rally_morale_total += random.randint(1, 4)
            else:
                # Find battles with fewer than 2 PCs already assigned
                eligible = [
                    idx for idx in range(num_battles) if len(pc_deployments_by_battle[idx]) < 2
                ]
                if not eligible:
                    # All battles at cap — treat as Rally instead
                    rally_morale_total += random.randint(1, 4)
                    continue
                battle_idx = random.choice(eligible)
                pphase = (
                    random.choice(["maneuver", "charge", "clash"])
                    if ptype == "Targeted Strike"
                    else None
                )
                pc_deployments_by_battle[battle_idx].append(
                    PCDeployment(name=f"PC{i + 1}", type=ptype, phase=pphase)
                )

    fought = set()

    for i in range(num_battles):
        la = active_allied[i]
        le = active_enemy[i]
        fought.add(id(la))
        fought.add(id(le))

        pcs_a = pc_deployments_by_battle[i]
        pool_a = battle_pools_a[i]
        pool_e = battle_pools_e[i]

        log = BattleLog(legion_a=la.name, legion_b=le.name)
        simulate_battle(
            la,
            le,
            log,
            recon_maneuver_bonus=recon_man_bonus,
            pc_a=pcs_a,
            pool_a=pool_a,
            pool_b=pool_e,
        )

        won_a = log.winner == "a"
        cdiff_a = log.battle_score  # positive = side A won by this margin

        # Cross-effects from opponent tags
        brutal_won_a = won_a and _has(la, "Brutal")
        brutal_won_b = (not won_a) and _has(le, "Brutal")
        terror_a = _has(la, "Terrorizer")
        terror_b = _has(le, "Terrorizer")

        def warden_bonus(legion, active_list):
            return sum(
                WARDEN_ADJ_RECOVERY
                for o in active_list
                if o is not legion and _has(o, "Warden") and abs(o.section - legion.section) == 1
            )

        def rallier_bonus(legion, active_list):
            return sum(
                RALLIER_ADJ_HOPE_BONUS
                for o in active_list
                if o is not legion and _has(o, "Rallier") and abs(o.section - legion.section) == 1
            )

        hh_vs_a = HEADHUNTER_DEATH_BONUS if _has(le, "Headhunter") else 0
        hh_vs_b = HEADHUNTER_DEATH_BONUS if _has(la, "Headhunter") else 0
        mage_vs_a = _has(le, "Mage")
        mage_vs_b = _has(la, "Mage")

        fort_a = fortification_bonus(la, le)
        fort_b = fortification_bonus(le, la)

        aftermath_a = run_aftermath(
            la,
            won_a,
            cdiff_a,
            disadv_recovery=brutal_won_b or mage_vs_a,
            disadv_hope=terror_b,
            seized_extra_injuries=log.seized_extra_for_a,
            warden_recovery_bonus=warden_bonus(la, active_allied),
            rallier_hope_bonus=rallier_bonus(la, active_allied),
            headhunter_death_penalty=hh_vs_a,
            fort_bonus=fort_a,
            pc_deployments=pcs_a,
            pool=pool_a,
        )

        aftermath_b = run_aftermath(
            le,
            not won_a,
            -cdiff_a,
            disadv_recovery=brutal_won_a or mage_vs_b,
            disadv_hope=terror_a,
            seized_extra_injuries=log.seized_extra_for_b,
            warden_recovery_bonus=warden_bonus(le, active_enemy),
            rallier_hope_bonus=rallier_bonus(le, active_enemy),
            headhunter_death_penalty=hh_vs_b,
            fort_bonus=fort_b,
            pool=pool_e,
        )

        if brutal_won_a and le.injuries >= 4 and not le.destroyed:
            le.injuries = min(le.max_injuries, le.injuries + 1)
            if le.injuries >= le.max_injuries:
                le.destroyed = True
        if brutal_won_b and la.injuries >= 4 and not la.destroyed:
            la.injuries = min(la.max_injuries, la.injuries + 1)
            if la.injuries >= la.max_injuries:
                la.destroyed = True

        for benefits_list, target in [
            (aftermath_a.get("salvage", {}).get("benefits", []), le),
            (aftermath_b.get("salvage", {}).get("benefits", []), la),
        ]:
            for b in benefits_list:
                if "Shaken" in b:
                    target.morale_mod -= 1

        log.aftermath_a = aftermath_a
        log.aftermath_b = aftermath_b
        la.record_state(BattleResult.WIN if won_a else BattleResult.LOSS)
        le.record_state(BattleResult.LOSS if won_a else BattleResult.WIN)

        for legion, aft, faction, deaths, events in [
            (
                la,
                aftermath_a,
                Faction.ALLIED,
                summary.allied_commander_deaths,
                summary.allied_commander_death_events,
            ),
            (
                le,
                aftermath_b,
                Faction.ENEMY,
                summary.enemy_commander_deaths,
                summary.enemy_commander_death_events,
            ),
        ]:
            cas = aft.get("casualty", {})
            if cas.get("died", False):
                dead_name = legion.commander.name
                legion.commanders_lost += 1
                deaths.append(dead_name)
                events.append(
                    {
                        "name": dead_name,
                        "legion": legion.name,
                        "round": round_num,
                        "won": won_a if legion is la else not won_a,
                        "crushed": abs(cdiff_a) >= 15,
                        "protection": cas.get("protection", 0),
                        "roll": cas.get("roll", 0),
                        "dc": cas.get("dc", 0),
                        "faction": "Allied" if faction == Faction.ALLIED else "Enemy",
                    }
                )
                if commander_pool and not legion.destroyed:
                    replacement = commander_pool.get_replacement(faction)
                    if replacement:
                        legion.commander = replacement
                        summary.successions.append(
                            f"{legion.name}: {dead_name} → {replacement.name}"
                        )
        summary.battles.append(log)

    # Apply Rally Morale to a random non-destroyed allied legion
    if rally_morale_total > 0:
        rally_targets = [legion for legion in allied if not legion.destroyed]
        if rally_targets:
            target = random.choice(rally_targets)
            target.morale_mod += rally_morale_total  # mor_total property clamps to MORALE_CAP

    for obj_name, data in STRATEGIC_OBJECTIVES.items():
        if obj_name in summary.destroyed_objectives:
            continue
        held_by_enemy = False
        for i in range(num_battles):
            if active_enemy[i].section == data["section"]:
                if summary.battles[i].winner == "b":
                    held_by_enemy = True
                break
        else:
            for legion in active_enemy[num_battles:]:
                if legion.section == data["section"]:
                    held_by_enemy = True
                    break

        if held_by_enemy:
            summary.objective_hold_counters[obj_name] = (
                summary.objective_hold_counters.get(obj_name, 0) + 1
            )
            if summary.objective_hold_counters[obj_name] >= 2:
                summary.destroyed_objectives.append(obj_name)
                summary.enemy_miracles += data["miracles"]
        else:
            summary.objective_hold_counters[obj_name] = 0

    for legion in active_allied[num_battles:] + active_enemy[num_battles:]:
        legion.record_state(BattleResult.NO_BATTLE)
        if legion.injuries > 0:
            legion.injuries = max(0, legion.injuries - IDLE_INJURY_RECOVERY)
        legion.morale_mod += IDLE_MORALE_RECOVERY

    for legion in allied + enemy:
        if legion.routed and not legion.destroyed:
            legion.morale_mod += IDLE_MORALE_RECOVERY
            if legion.injuries > 0:
                legion.injuries = max(0, legion.injuries - 1)
            if legion.mor_total > ROUT_THRESHOLD:
                legion.routed = False
                summary.rallied.append(
                    f"{legion.faction.value}: {legion.name} (Morale: {legion.mor_total})"
                )

    summary.allied_losses = sum(1 for legion in allied if legion.destroyed)
    summary.enemy_losses = sum(1 for legion in enemy if legion.destroyed)
    deaths = 0
    for log in summary.battles:
        deaths += (random.randint(1, 4) * 10) if log.winner == "a" else (random.randint(1, 6) * 30)
    for _ in range(max(0, len(active_enemy) - num_battles)):
        deaths += random.randint(1, 6) * 30
    deaths += len(summary.destroyed_objectives) * random.randint(1, 4) * 10
    summary.civilian_deaths = deaths
    return summary


def run_simulation(
    num_rounds=30, seed=None, legions_path="legions.csv", commanders_path="commanders.csv"
):
    if seed is not None:
        random.seed(seed)

    allied, enemy, commander_pool = build_armies_from_csv(legions_path, commanders_path)
    summaries = []

    round_data = {
        "allied_active": [],
        "enemy_active": [],
        "allied_total_injuries": [],
        "enemy_total_injuries": [],
        "allied_avg_morale": [],
        "enemy_avg_morale": [],
        "allied_commanders_alive": [],
        "enemy_commanders_alive": [],
        "civilian_deaths": [],
        "civilian_deaths_cum": [],
    }

    print("=" * 72)
    print("  BATTLE OF MYTROS — SIMULATION")
    print("=" * 72)
    print(f"  Allied legions: {len(allied)}  |  Enemy legions: {len(enemy)}")
    print(
        f"  Reserve commanders: Allied {len(commander_pool.allied_reserves)}"
        f" | Enemy {len(commander_pool.enemy_reserves)}"
    )
    print(f"  Max rounds: {num_rounds}")
    print("=" * 72)

    mir_a, mir_e = 8, 10
    destroyed_objs = []
    hold_counters = {}

    for rnd in range(1, num_rounds + 1):
        summary = simulate_round(
            allied, enemy, rnd, commander_pool, mir_a, mir_e, destroyed_objs, hold_counters
        )
        summaries.append(summary)
        mir_a, mir_e = summary.allied_miracles, summary.enemy_miracles
        destroyed_objs = summary.destroyed_objectives
        hold_counters = summary.objective_hold_counters

        active_a = [legion for legion in allied if not legion.destroyed]
        active_e = [legion for legion in enemy if not legion.destroyed]
        effective_a = [legion for legion in allied if legion.effective]
        effective_e = [legion for legion in enemy if legion.effective]
        routed_a = [legion for legion in allied if legion.routed and not legion.destroyed]
        routed_e = [legion for legion in enemy if legion.routed and not legion.destroyed]

        round_data["allied_active"].append(len(active_a))
        round_data["enemy_active"].append(len(active_e))
        round_data["allied_total_injuries"].append(sum(legion.injuries for legion in active_a))
        round_data["enemy_total_injuries"].append(sum(legion.injuries for legion in active_e))
        round_data["allied_avg_morale"].append(
            np.mean([legion.mor_total for legion in active_a]) if active_a else 0
        )
        round_data["enemy_avg_morale"].append(
            np.mean([legion.mor_total for legion in active_e]) if active_e else 0
        )
        round_data["allied_commanders_alive"].append(
            sum(1 for legion in allied if legion.commander.alive)
        )
        round_data["enemy_commanders_alive"].append(
            sum(1 for legion in enemy if legion.commander.alive)
        )
        round_data["civilian_deaths"].append(summary.civilian_deaths)
        round_data["civilian_deaths_cum"].append(sum(round_data["civilian_deaths"]))

        wins_a = sum(1 for b in summary.battles if b.winner == "a")
        wins_e = sum(1 for b in summary.battles if b.winner == "b")
        print(f"\n  Round {rnd}: Recon {summary.recon_total} ({summary.recon_result})")
        print(
            f"    Battles: {len(summary.battles)}"
            f"  |  Allied wins: {wins_a}  |  Enemy wins: {wins_e}"
        )
        print(f"    Miracles: Allied {summary.allied_miracles} | Enemy {summary.enemy_miracles}")
        if summary.destroyed_objectives:
            new_objs = [
                o
                for o in summary.destroyed_objectives
                if rnd == 1 or o not in summaries[-2].destroyed_objectives
            ]
            for o in new_objs:
                print(f"    🔥 OBJECTIVE DESTROYED: {o}")

        for b in summary.battles:
            w = b.legion_a if b.winner == "a" else b.legion_b
            print(f"      {b.legion_a} vs {b.legion_b}  →  {w} wins (score: {b.battle_score:+d})")
        for name in summary.allied_commander_deaths:
            print(f"    ☠  ALLIED COMMANDER FALLEN: {name}")
        for name in summary.enemy_commander_deaths:
            print(f"    ☠  ENEMY COMMANDER FALLEN: {name}")
        for s in summary.successions:
            print(f"    ⚔  COMMANDER SUCCESSION: {s}")
        for r in summary.rallied:
            print(f"    🔄 RALLIED: {r}")
        print(
            f"    💀 Civilian deaths this round: {summary.civilian_deaths:,}"
            f"  (total: {round_data['civilian_deaths_cum'][-1]:,})"
        )

        destroyed_a = [
            legion.name
            for legion in allied
            if legion.destroyed and len(legion.history_results) == rnd
        ]
        destroyed_e = [
            legion.name
            for legion in enemy
            if legion.destroyed and len(legion.history_results) == rnd
        ]
        for n in destroyed_a:
            print(f"    💀 ALLIED LEGION DESTROYED: {n}")
        for n in destroyed_e:
            print(f"    💀 ENEMY LEGION DESTROYED: {n}")
        for legion in routed_a:
            print(f"    🏳  ALLIED ROUTED: {legion.name} (Morale: {legion.mor_total})")
        for legion in routed_e:
            print(f"    🏳  ENEMY ROUTED: {legion.name} (Morale: {legion.mor_total})")

        parts = [f"Allied {len(effective_a)} fighting"]
        if routed_a:
            parts.append(f"{len(routed_a)} routed")
        parts.append(f"| Enemy {len(effective_e)} fighting")
        if routed_e:
            parts.append(f"{len(routed_e)} routed")
        print(f"    Active legions: {' '.join(parts)}")

        if not effective_a or not effective_e:
            if not effective_a and not effective_e:
                print("\n  BOTH FORCES BROKEN — battle ends in stalemate!")
            elif not effective_a:
                print(
                    f"\n  ALLIED FORCES {'ELIMINATED' if not active_a else 'BROKEN'} — battle ends!"
                )
            else:
                print(
                    f"\n  ENEMY FORCES {'ELIMINATED' if not active_e else 'BROKEN'} — battle ends!"
                )
            break

    print("\n" + "=" * 72)
    final_a = [legion for legion in allied if not legion.destroyed]
    final_e = [legion for legion in enemy if not legion.destroyed]
    print(f"  FINAL: Allied {len(final_a)} legions | Enemy {len(final_e)} legions")
    if destroyed_objs:
        print(f"  Destroyed Objectives: {', '.join(destroyed_objs)}")
    rf_a = sum(1 for legion in final_a if legion.routed)
    rf_e = sum(1 for legion in final_e if legion.routed)
    if rf_a or rf_e:
        print(f"  Routed: Allied {rf_a} | Enemy {rf_e}")
    print(
        f"  Commander deaths: Allied {sum(legion.commanders_lost for legion in allied)}"
        f" | Enemy {sum(legion.commanders_lost for legion in enemy)}"
    )
    print(
        f"  Reserves remaining: Allied {len(commander_pool.allied_reserves)}"
        f" | Enemy {len(commander_pool.enemy_reserves)}"
    )
    print(
        f"  Total injuries: Allied {sum(legion.injuries for legion in final_a)}"
        f" | Enemy {sum(legion.injuries for legion in final_e)}"
    )
    print("=" * 72)

    return allied, enemy, summaries, round_data
