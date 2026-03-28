# Battle of Mytros — Foundry VTT Module

A GM-facing mass combat system for *Odyssey of the Dragonlords*. Resolves legion warfare phase-by-phase through an interactive dashboard and battle resolver, with full persistence to Foundry's actor, token, and region systems.

> **Version:** 0.5.0 · **Foundry:** v12 minimum, v13 verified · **System:** any
>
> For the complete rules and mechanical specification, see [`system.md`](system.md).

---

## Features

| Feature | Description |
|---|---|
| **Dashboard** | Three-tab GM window: Overview (live map), Miracles, Setup |
| **Reconnaissance** | Intelligence rolls with tiered results; 23+ grants a bonus to all allied Maneuver rolls |
| **Battle Resolver** | Step-by-step Maneuver → Charge → Clash → Aftermath state machine per engagement |
| **Tag Engine** | All 20 commander tags applied automatically to every relevant roll |
| **PC Fast Response** | Six deployment modes per PC token with stacking bonuses |
| **Aftermath** | Recovery, Hope, Salvage with interactive benefit selection; Divine Blood re-roll; Commander Casualty |
| **Section Adjacency** | GM-configured neighbour pairs; adjacency bonuses applied automatically |
| **Chat Cards** | Styled battle summary posted to public chat after every committed engagement |
| **Round Advancement** | Passive recovery, per-round death toll, objective destruction tracking |
| **Major Events** | 7 canon events (Icarus → Kentimane) — grant Miracles and apply mechanical effects, locked after use |
| **CSV Import/Export** | Bulk legion and commander management |
| **Localization** | Full English and Polish translations |

---

## Installation

**Via manifest URL:** Foundry Setup → Add-on Modules → Install Module → paste:
`https://raw.githubusercontent.com/karpiq24/battle-of-mytros/main/module.json`

**Manually:** Copy the repo folder into `<Foundry data>/Data/modules/battle-of-mytros/` and enable the module.

---

## Initial World Setup

### 1. Set the Battle Scene
Game Settings → Module Settings → **Battlemap Scene ID**. The module only tracks tokens and renders section data when the active canvas matches this scene.

### 2. Create Map Sections as Scene Regions
Draw Scene Regions named with the prefix `Section:` (e.g. `Section: The Docks`). On scene load the module initialises each matching region with default flags. Regions without the prefix are ignored.

### 3. Create Legion Actors
One actor per legion. Set flag `battle-of-mytros.isLegion = true` manually, or use CSV import (sets it automatically).

### 4. Create Commander Actors
One actor per commander. Set flag `battle-of-mytros.isCommander = true`. **Tags are Items on the actor** — create plain items named exactly after each tag (case-insensitive, e.g. `Tactician`, `Divine Blood`).

### 5. Assign Commanders to Legions
In the Dashboard Overview tab, each legion card has a commander dropdown. Only actors flagged as commanders appear.

### 6. Place Tokens
Drag legion tokens onto the battlemap. The Dashboard auto-refreshes when tokens enter or exit `Section:` regions. PC tokens appear in each section's Support panel for deployment mode assignment.

### 7. Configure Section Adjacency
Dashboard → **Setup tab** → Section Adjacency. Select two sections and click **Add Pair**. Pairs are bidirectional.

---

## CSV Data Format

### Legions
```csv
Name,Faction,Vitality,Morale,Wit,Injuries,CommanderName
Iron Shields,allied,6,7,5,0,Acastus
Storm Hounds,sydon,5,8,4,0,Gaius
```

### Commanders
```csv
Name,Tags
Acastus,Tactician;Inspiring
Gaius,Brutal;Headhunter;Veteran
```

> **Note:** Tag items are not auto-created from CSV — add them manually on the actor sheet after import.

---

## Global Exports & Macros

All utility classes are available on `globalThis` for use in macros or the browser console:

```javascript
globalThis.MytrosActorData      // Type checks and actor init helpers
globalThis.MytrosRegionManager  // Section discovery, token queries, adjacency
globalThis.MytrosCSVParser      // CSV import/export
globalThis.BattleRoller         // d20 roll execution
globalThis.TagEngine            // Roll modifier calculation
```

```javascript
// Manually initialise an actor as a legion
const actor = game.actors.getName("Iron Guard");
await MytrosActorData.initLegion(actor, "allied");

// Check all section control states
for (const s of MytrosRegionManager.getActiveSections()) {
    console.log(s.name, s.getFlag("battle-of-mytros", "control"));
}

// List adjacent sections
const region = canvas.scene.regions.getName("Section: The Docks");
console.log(MytrosRegionManager.getAdjacentSections(region.id));
```
