import argparse
import os

import matplotlib.pyplot as plt

SIM_DIR = os.path.dirname(__file__)

from .simulator import run_simulation
from .visualization import (
    plot_overview_dashboard,
    plot_legion_detail,
    plot_battle_results,
    plot_commander_status,
    plot_stat_radar,
    plot_morale_timeline,
    plot_graveyard,
    plot_death_toll,
    plot_monte_carlo,
    plot_cmdr_deaths_analysis,
    plot_balance_analysis,
)


# ─── Main ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Battle of Mytros — Mass Combat Simulator")
    parser.add_argument("--rounds",      type=int, default=32, help="Max rounds (default: 32)")
    parser.add_argument("--seed",        type=int, default=None)
    parser.add_argument("--no-display",  action="store_true", default=True, help="Save figures instead of displaying")
    parser.add_argument("--monte-carlo", type=int, default=1000, help="Run N Monte Carlo simulations")
    parser.add_argument("--legions",     type=str, default="legions.csv")
    parser.add_argument("--commanders",  type=str, default="commanders.csv")
    args = parser.parse_args()

    save = args.no_display

    def img(name):
        return os.path.join(SIM_DIR, name) if save else None

    for path, label in [(args.legions, "Legions"), (args.commanders, "Commanders")]:
        if not os.path.exists(path):
            print(f"  ERROR: {label} CSV not found: {path}")
            return

    allied, enemy, summaries, round_data = run_simulation(
        args.rounds, args.seed, args.legions, args.commanders)

    plot_overview_dashboard(round_data,
                            save_path=img("01_overview.png"))
    plot_legion_detail(allied, enemy,
                       save_path=img("02_legion_detail.png"))
    plot_battle_results(summaries,
                        save_path=img("03_battle_results.png"))
    plot_commander_status(allied, enemy,
                          save_path=img("04_commanders.png"))
    plot_stat_radar(allied, enemy,
                    save_path=img("05_radar.png"))
    plot_morale_timeline(allied, enemy,
                         save_path=img("06_morale_timeline.png"))
    plot_graveyard(allied, enemy, summaries,
                   save_path=img("07_graveyard.png"))
    plot_death_toll(round_data,
                    save_path=img("08_death_toll.png"))

    if args.monte_carlo > 0:
        _, all_death_events = plot_monte_carlo(
            args.monte_carlo, args.rounds,
            save_path=img("99_monte_carlo.png"),
            legions_path=args.legions, commanders_path=args.commanders)
        plot_cmdr_deaths_analysis(all_death_events, num_sims=args.monte_carlo,
                                  save_path=img("97_cmdr_deaths.png"))
        plot_balance_analysis(
            legions_path=args.legions, commanders_path=args.commanders,
            save_path=img("98_balance.png"))

    if not save:
        plt.show()
    else:
        print("\n  Figures saved to files.")
