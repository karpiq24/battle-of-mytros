# Battle of Mytros Module Roadmap

## Phase 1: Foundation & Tracking (Completed)
- [x] Initial module setup (`module.json`, structure)
- [x] Global data management (`game.settings` for round, phase, etc.)
- [x] Actor flags for Legions and Commanders
- [x] Scene Region auto-discovery for map sections
- [x] Base ApplicationV2 Dashboard
- [x] Token tracking via Region Events (`tokenEnter`, `tokenExit`)
- [x] Dashboard UI rendering sections and occupying legions

## Phase 2: Setup & Data Management (Completed)
- [x] **Dashboard Setup Tab:** UI to manage global state (Miracles, Death Toll, current Round/Phase).
- [x] **Section Editor:** UI to toggle Fortification and Objective status for each section directly from the Dashboard.
- [x] **CSV Import/Export:** Functionality to bulk import and update Legions and Commanders via CSV files, matching by Name.
- [x] **Commander Assignment UI:** Interface within the Dashboard to easily assign or re-assign Commanders to specific Legions.

## Phase 3: The Battle Resolver Engine (Completed)
- [x] **Resolver UI Scaffold:** Create the interactive flow interface for resolving battles within a section.
- [x] **Phase 1: Maneuver:** Automate the Wit roll, apply bonuses, and prompt the winner for their Maneuver Benefit.
- [x] **Phase 2: Charge:** Automate the Morale roll, applying Maneuver benefits and Commander Tags.
- [x] **Phase 3: Clash:** Automate the Vitality roll and calculate Counter Points to determine the overall victor.
- [x] **PC & Enemy Fast Response Integration:** Automatic detection of tokens in regions and application of bonus dice (1d4, 1d6, 1d8) to battle rolls.

## Phase 4: Aftermath & Chat Integration (Next)
- [ ] **Aftermath Checks:** Automate Recovery (injuries), Hope (morale/rout), and Salvage (benefits).
- [ ] **Commander Casualties:** Implement the tense d100 math (Base Death Chance - Morale Protection) and permanently handle commander death.
- [ ] **Chat Card Engine:** Create beautiful, stylized chat cards summarizing the rolls, choices, and outcomes of each battle to keep players engaged.
- [ ] **Round Advancement:** Logic to cleanly advance to the next round, auto-healing unengaged legions, and tracking death tolls from burning objectives.

## Phase 5: Polish & Localization
- [ ] **Dark Mode Support:** Ensure all custom UI and chat cards respect standard Foundry VTT dark/light modes.
- [ ] **Localization (i18n):** Complete `en.json` and `pl.json` mapping for all UI elements and chat outputs.
- [ ] **Visual Flair:** Add icons, animations (if applicable), and final styling tweaks to the Dashboard and Resolver.
