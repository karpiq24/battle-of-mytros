import csv
import math
import random
from collections import defaultdict

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

from .config import (
    HOPE_DC, MAX_INJURIES, MORALE_CAP, ROUT_THRESHOLD,
)
from .models import Faction
from .loader import build_armies_from_csv
from .simulator import simulate_round


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
