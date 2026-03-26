# Battle of Mytros — Simulation Engine

Mass combat simulator for the Battle of Mytros (Odyssey of the Dragonlords). Runs from the project root via `battle_sim.py`.

## Usage

```bash
# Run with defaults (32 rounds, 1000 Monte Carlo sims, save images)
python3 battle_sim.py

# Custom run
python3 battle_sim.py --rounds 20 --seed 42 --monte-carlo 500

# Display plots interactively instead of saving
python3 battle_sim.py --no-display=false
```

### Arguments

| Flag | Default | Description |
|---|---|---|
| `--rounds` | `32` | Maximum number of battle rounds |
| `--seed` | random | RNG seed for reproducibility |
| `--no-display` | `true` | Save figures to `sim/` instead of showing them |
| `--monte-carlo` | `1000` | Number of Monte Carlo simulations (0 to skip) |
| `--legions` | `legions.csv` | Path to legions CSV |
| `--commanders` | `commanders.csv` | Path to commanders CSV |

## Input Files

Both CSVs live in the project root.

**`legions.csv`** — one row per legion: name, faction, vitality, morale, wit, tags, section, etc.

**`commanders.csv`** — one row per commander: name, faction, tags.

## Output Images

All PNGs are saved to this (`sim/`) directory:

| File | Contents |
|---|---|
| `01_overview.png` | Active legions, injuries, morale, commanders alive over time |
| `02_legion_detail.png` | Per-legion injury and morale heatmaps |
| `03_battle_results.png` | Win/loss grid per battle per round |
| `04_commanders.png` | Commander status, tags, injuries |
| `05_radar.png` | Army-wide stat radar comparison |
| `06_morale_timeline.png` | Morale trajectory per legion |
| `07_graveyard.png` | Legion lifespans and commander deaths over time |
| `08_death_toll.png` | Civilian deaths per round and cumulative |
| `97_cmdr_deaths.png` | Commander death analysis (Monte Carlo) |
| `98_balance.png` | Army balance analysis |
| `99_monte_carlo.png` | Monte Carlo outcome distributions |

## Module Structure

```
sim/
├── config.py         # All constants and tuning values
├── models.py         # Dataclasses: Legion, Commander, MiraclePool, etc.
├── dice.py           # d20 rolling: roll_d20(), contested_roll()
├── tags.py           # Tag bonus/penalty helpers
├── battle_log.py     # PhaseResult, BattleLog dataclasses
├── combat.py         # simulate_battle() — 3-phase combat engine
├── aftermath.py      # run_aftermath(), _apply_salvage()
├── recon.py          # reconnaissance_roll()
├── loader.py         # CSV loaders, build_armies_from_csv()
├── simulator.py      # simulate_round(), run_simulation()
├── visualization.py  # All plot_* functions
└── main.py           # CLI entrypoint
```

## Combat Overview

Each battle resolves in three phases:

1. **Maneuver** (Wit) — winner gains a random tactical benefit (flanking, defensive footing, etc.)
2. **Charge** (Morale) — winner carries a +1 bonus into the Clash
3. **Clash** (Vitality) — highest-stakes phase; winner determined by total counter points

A **battle counter** accumulates across phases (+1/+2 per phase win, ±1 for nat20/nat1). The side with more points wins the battle.

### Aftermath

After each battle both sides make three checks:

- **Recovery** (Vit, DC 12 + injuries) — determines injuries gained/healed
- **Hope** (Morale, DC 12) — shifts morale; rout triggered if morale ≤ 0
- **Salvage** (Wit, DC 12) — on success: one random benefit (supplies, insight, fortify, enemy shaken)

### Commander Casualties

Base death chance: 6% (winner) / 12% (loser) / 20% (crushed, counter diff ≤ −3). Modified by tags (Divine Blood, Headhunter) and morale.

## Tuning

All numeric constants are in [config.py](config.py). Key values:

- `MAX_INJURIES = 6` — legion destroyed at this threshold
- `ROUT_THRESHOLD = 0` — morale at/below this triggers rout
- `CASUALTY_BASE_RISK` — commander death percentages per outcome
- `RECON_THRESHOLDS` — recon roll breakpoints and their effects
- `STRATEGIC_OBJECTIVES` — map locations, miracle values, sections
