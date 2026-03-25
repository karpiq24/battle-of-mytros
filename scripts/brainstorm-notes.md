# Brainstorming Notes

## Map & Sections Integration
- **Approach:** Fully Integrated with Scene Regions (Option B).
- **Implementation:** Sections are directly tied to Foundry's Scene Regions on a specific Battlemap Scene.
- **Actors:** Legions will be represented by special Actors. Moving tokens representing these legions between regions handles their movement between sections.

## Commanders
- **Approach:** Separate Commander Actors (Option B).
- **Implementation:** Commanders are distinct Actors. They are assigned to Legions via a dropdown in the Legion's sheet or Dashboard.
- **Tags:** Commander Tags (e.g., Tactician, Zealot) are represented as Items (Features) on the Commander Actor.

## Battle Overview Dashboard
- **Approach:** Read-Only View for Players (Option A).
- **Implementation:** The DM manages all clicks and decisions. Players have a read-only view of the dashboard that displays the same information (minus hidden GM info) so they can follow along with the battle state.

## Section Management
- **Approach:** Auto-Discovery (Option A).
- **Implementation:** The module automatically scans the active Scene for Regions matching a specific naming convention or flag (e.g., `[Section] Name`).
- **State Tracking:** Each section tracks who currently holds it (Allied, Sydon, Neutral) and if it is Fortified by that faction. This state is managed via the Dashboard and reflected visually on the canvas (e.g., region color changes). Strategic Objectives are also tracked within their respective sections.

## CSV Import/Export
- **Purpose:** Fast bootstrapping and backup of Legions and Commanders.
- **Scope:** Update by Name/ID (Option B).
- **Implementation:** The module parses the CSV and checks existing Actors in the world. If an Actor with a matching name exists, it updates their stats (Vitality, Morale, Wit, injuries, etc.). If it doesn't exist, it creates a new Actor in a designated folder.

## Battle Resolver & Chat Integration
- **Workflow:** Auto-Detection with Manual Override (Option D).
- **Implementation:** The system automatically detects which Legions are in which Scene Regions by listening to Region Events (e.g. `Token Enters`, `Token Moves Out`). It automatically pre-populates incoming battles when opposing Legions occupy the same section. The system dynamically updates as tokens are moved. The DM can manually override or adjust these pairings in the Dashboard before resolving.
- **Interactivity:** The battle resolution is a stepped flow, not instant. It pauses to prompt the DM for choices when required by the rules (e.g., choosing a benefit after winning the Maneuver phase, choosing a Salvage benefit in the Aftermath).

## Core Data & Module Architecture
- **Approach:** Module Settings (Option B).
- **Implementation:** Global state (Miracle points, death toll, current round/phase) is stored in hidden `game.settings`. This is the standard, fast way to sync global module state.
