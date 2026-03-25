# Battle of Mytros (Foundry VTT Module)

A Mass Combat System for Odyssey of the Dragonlords.

## Features

- **Strategic Dashboard:** Command center for GMs to track legions, commanders, and map sections.
- **Interactive Battle Resolver:** A focused interface for resolving engagements phase-by-phase (Maneuver, Charge, Clash).
- **Commander Tags:** Powerful passive bonuses that define how commanders influence their legions.
- **Fast Response Integration:** Automated detection of PC and special unit tokens for immediate battle support.
- **CSV Data Management:** Bulk import/export for Legions and Commanders.
- **Map Section Tracking:** Integrated with Scene Regions for real-time tracking of troop movements.

## Installation

1. In the Foundry VTT Setup screen, navigate to the **Add-on Modules** tab.
2. Click **Install Module**.
3. At the bottom, paste the following Manifest URL:
   `https://raw.githubusercontent.com/karpiq24/battle-of-mytros/main/module.json`
4. Click **Install**.
5. Enable the "Battle of Mytros" module in your world's module settings.

## Getting Started

1. **Prepare your Battlemap:** Create Scene Regions named with the prefix `Section: ` (e.g., `Section: The Docks`).
2. **Setup Data:** Use the **Setup** tab in the Battle Dashboard to import your Legions and Commanders via CSV.
3. **Deploy Legions:** Drag Legion tokens onto the map sections.
4. **Resolve Battles:** When opposing legions occupy the same section, a "Resolve Battle" button will appear on the Dashboard.

For a detailed player-facing guide, see [battle.html](./battle.html).

## Code Architecture

- `scripts/apps/`: Custom ApplicationV2 interfaces (Dashboard, Resolver).
- `scripts/models/`: Data structures and flag management for Actors and Tokens.
- `scripts/regions/`: Logic for map section tracking and token detection.
- `scripts/utils/`: Helper engines (BattleRoller, TagEngine, CSVParser).

## For Developers (Resuming Work)

This project uses the **Gemini CLI Superpowers** workflow.

1. **Check Roadmap:** See `docs/superpowers/roadmap.md` for current phase and pending tasks.
2. **Review Specs:** See `docs/superpowers/specs/` for approved design documents.
3. **Check Plans:** See `docs/superpowers/plans/` for the latest implementation plans.
4. **Current Status:** Phase 1-3 are complete. **Phase 4 (Aftermath & Chat Integration)** is the next focus. A plan has been drafted in `docs/superpowers/plans/2026-03-25-aftermath-and-chat.md`.

To continue, invoke the `executing-plans` or `subagent-driven-development` skill on the Phase 4 plan.
