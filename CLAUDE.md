# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**Battle of Mytros** is a Foundry VTT module implementing a GM-facing mass combat system for *Odyssey of the Dragonlords*. It resolves legion warfare phase-by-phase through an interactive dashboard and battle resolver.

## Commands

### Python Simulator (balance testing / outcome analysis)
```bash
python3 battle_sim.py                          # Run with defaults (32 rounds, 1000 Monte Carlo sims)
python3 battle_sim.py --rounds 20 --seed 42    # Custom rounds + reproducible seed
python3 battle_sim.py --monte-carlo 500        # Fewer simulations
python3 battle_sim.py --no-display             # Save PNG figures to sim/ instead of displaying
```

### Foundry Module
No build step. The module runs directly in Foundry VTT — copy the folder to `Data/modules/battle-of-mytros/` or install via manifest URL in `module.json`. Changes to `.mjs` files take effect on module reload in the browser.

There is no automated test suite. Testing is done manually in Foundry VTT.

## Architecture

### Foundry Module (`scripts/`)

**Entry point:** `scripts/module.mjs` — registers settings, hooks, and global exports.

**Three main apps:**

1. **BattleDashboard** (`scripts/apps/dashboard.mjs`) — Three-tab GM window (Overview, Miracles, Setup). Renders section cards, handles reconnaissance rolls, miracle spending, major events, and legion management. Re-renders on region/actor/token Hook events.

2. **BattleResolverApp** (`scripts/apps/resolver.mjs`) — Per-engagement battle state machine. Executes Maneuver → Charge → Clash → Aftermath workflow. Maintains in-memory state until "Commit Changes to Actors" is clicked, then applies all results atomically.

3. **Support utilities:**
   - `scripts/utils/tag-engine.mjs` — Maps 20 commander tags to roll modifiers (all passive/automatic)
   - `scripts/utils/battle-roller.mjs` — Executes d20 rolls with advantage/disadvantage/Veteran floor (natural 1–4 → 5)
   - `scripts/regions/region-manager.mjs` — Section discovery, token queries, adjacency lookup
   - `scripts/models/actor-data.mjs` — Type checks and initialization helpers for Legion/Commander actors
   - `scripts/utils/csv-parser.mjs` — Bulk import/export for legions and commanders

### Data Persistence

**World settings (`game.settings`, namespace `battle-of-mytros`):** `currentRound`, `currentPhase`, `deathToll`, `alliedMiracles`, `sydonMiracles`, `reconResult`, `reconBonus`, `completedEvents`, `deathTollFrozen`, `sydonObjectiveHalved`, `adjacencyPairs`, `battleSceneId`.

**Legion actor flags (namespace `battle-of-mytros`):** `isLegion`, `faction` ("allied"|"sydon"), `stats` {vitality, morale, wit, injuries}, `commanderId`, `isRouted`, `isDestroyed`, `foughtThisRound`, `tacInsightBonus`.

**Commander actor flags:** `isCommander`. Commander tags are stored as **Items on the actor** (matched case-insensitively by the TagEngine).

**Region flags:** `control` ("neutral"|"allied"|"sydon"), `fortified`, `hasObjective`, `objectiveDestroyed`, `sydonHeldLastRound`.

**Token flags:** `deploymentMode` (reinforce, shock_assault, targeted_strike_*, shield_the_wounded, protect, rest).

### Battle Resolution Flow

```
Reconnaissance → Planning & Commitment → Fast Response Deployment →
Battle Resolution (Maneuver / Charge / Clash / Aftermath) →
Round Advancement (passive recovery, death toll, objective checks)
```

### Global Exports (available to Foundry macros)
```javascript
globalThis.MytrosActorData
globalThis.MytrosRegionManager
globalThis.MytrosCSVParser
globalThis.BattleRoller
globalThis.TagEngine
```

### Python Simulator (`sim/`)

Standalone Monte Carlo engine mirroring the JS mechanics for balance analysis. Key modules: `config.py` (all tunable constants), `models.py` (Legion/Commander dataclasses), `combat.py` (simulate_battle), `aftermath.py` (Recovery/Hope/Salvage), `simulator.py` (main loop), `visualization.py` (11 matplotlib chart types). Entry point is `battle_sim.py` (top-level) which delegates to `sim/main.py`.

## Source of Truth

**`system.md`** is the canonical game design document — the authoritative specification for all battle mechanics, DCs, formulas, tag behavior, and phase rules. When there is any ambiguity between the code and `system.md`, `system.md` wins. Any mechanical change to the module should be grounded in (or explicitly diverge from) what `system.md` specifies. The Python simulator in `sim/` is also expected to mirror `system.md` faithfully.

## Key Conventions

- **Localization:** All UI strings use `game.i18n.localize("MYTROS.KeyName")`. English in `lang/en.json`, Polish in `lang/pl.json`.
- **CSS:** Uses custom properties (`--mytros-*`) with dark mode via `@media (prefers-color-scheme: dark)` and `body.theme-dark` (Foundry v13).
- **Foundry version compatibility:** v12 minimum, v13 verified. The `getSceneControlButtons` hook handles both API shapes.
- **Commander tags:** 20 tags total, all passive. Applied automatically when conditions are met. See `scripts/utils/tag-engine.mjs` for the full list and logic.
- **Simulator constants:** All tunable values (DCs, bonus values, thresholds) live in `sim/config.py`.
