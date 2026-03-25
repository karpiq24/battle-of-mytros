# Battle of Mytros Module Design Specification

## 1. Overview
A Foundry VTT V13 compatible module to automate the mass combat system defined in "The Battle of Mytros". The module manages global war state, tracks Legions and Commanders as separate Actors, integrates with the canvas via Scene Regions, and provides an interactive UI for the DM and a read-only overview for players.

### 1.1 Rules Reference
**Crucial Note:** This module must act as a strict implementation of the rules outlined in `system.md`. The `system.md` file serves as the single source of truth for:
- All **Commander Tags** and their specific mechanical effects (e.g., Tactician, Vanguard, Bulwark).
- **Battle Resolution Mechanics**, including phase stats, counter points, and tie-breakers.
- **Aftermath Check DCs** (e.g., Recovery DC 12 + injuries, Hope DC 12) and their specific outcomes.
- **Commander Casualty Math** (Base Death Chance and Morale Protection calculations).
- **Civilian Death Toll** dice formulas and **Miracle Points** management.

## 2. Core Architecture & Data Storage
- **Global State:** Tracked via module-level `game.settings`. This includes:
  - Current Round and Phase
  - Civilian Death Toll
  - Allied and Sydon Miracle Points
- **Legions (Actors):** Legions are represented as standard Foundry `Actor` documents (either a custom type or appending data to an existing system actor). Core stats (Vitality, Morale, Wit) and current Injuries are stored in the Actor's system data.
- **Commanders (Actors):** Commanders are separate `Actor` documents. They are assigned to Legions via the module's Dashboard (linking the Commander's ID to the Legion).
- **Commander Tags (Items):** The passive abilities defining a commander are represented as `Item` documents (e.g., Features) embedded within the Commander Actor.

## 3. Map & Section Integration
- **Scene Regions:** The battlemap is divided into sections using Foundry V12+ Scene Regions. 
- **Auto-Discovery:** The module scans the active Scene for Regions using a specific naming convention (e.g., `Section: [Name]`).
- **Token Tracking:** The module utilizes Region Events (`Token Enters`, `Token Moves Out`) to automatically track which Legions occupy which section, avoiding the performance overhead of polling token positions.
- **Section State:** Each tracked Region maintains flags for its control state (Allied, Sydon, Neutral), Fortification status, and whether it contains a Strategic Objective. 

## 4. The Battle Dashboard
An `ApplicationV2` interface serving as the primary control center.
- **DM View:**
  - **Overview:** Edit current round, phase, global stats, death toll, and miracle points.
  - **Map/Sections:** View auto-discovered sections, toggle control/fortification, and see occupying Legions.
  - **Legions:** Manage forces, assign Commanders dynamically, and adjust stats.
  - **CSV Integration:** Import and export Legion/Commander data. Import logic updates existing actors by Name/ID to preserve IDs and assignments, creating new actors only when necessary.
- **Player View:** A read-only, stylized version of the Overview and Map tabs to keep players engaged with the changing tides of war.

## 5. Interactive Battle Resolver
- **Auto-Detection:** When Region Events detect opposing Legion tokens in the same Region, the module flags a "Pending Battle".
- **Resolver UI:** The DM opens the Resolver during the Battle phase. It presents pre-populated engagements, allowing for manual overrides.
- **Stepped Execution Flow:**
  1. **Phase 1 (Maneuver):** Rolls are calculated. If won, the resolver pauses and prompts the winning side to select their Maneuver Benefit.
  2. **Phase 2 & 3 (Charge & Clash):** Automatically calculated, applying the chosen Maneuver Benefit, relevant Commander Tags, Fortifications, and PC Deployment bonuses.
  3. **Determination:** The winner is identified based on Counter Points.
  4. **Aftermath - Recovery & Hope:** Automatically rolled and resolved.
  5. **Aftermath - Salvage:** Rolls are calculated. The resolver pauses to prompt successful parties to choose their Salvage Benefit.
  6. **Aftermath - Casualty:** Calculates base death chance, subtracts protection (morale), and performs the d100 roll. 
- **Chat Integration:** Throughout the resolution, stylized chat cards broadcast phase results, dramatic outcomes, and commander deaths to the players.
