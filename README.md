# Battle of Mytros — Foundry VTT Module

A GM-facing mass combat system for _Odyssey of the Dragonlords_. Resolves legion warfare phase-by-phase through an interactive dashboard and battle resolver, with full persistence to Foundry's actor, token, and region systems.

> **Version:** 0.5.0 · **Foundry:** v12 minimum, v13 verified · **System:** any
>
> For the complete rules and mechanical specification, see [`system.md`](system.md).

---

## Features

| Feature               | Description                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| **Dashboard**         | Three-tab GM window: Overview (live map), Miracles, Setup                                            |
| **Reconnaissance**    | Intelligence rolls with tiered results; 23+ grants a bonus to all allied Maneuver rolls              |
| **Battle Resolver**   | Step-by-step Maneuver → Charge → Clash → Aftermath state machine per engagement                      |
| **Tag Engine**        | All 20 commander tags applied automatically to every relevant roll                                   |
| **PC Fast Response**  | Six deployment modes per PC token with stacking bonuses                                              |
| **Aftermath**         | Recovery, Hope, Salvage with interactive benefit selection; Divine Blood re-roll; Commander Casualty |
| **Section Adjacency** | GM-configured neighbour pairs; adjacency bonuses applied automatically                               |
| **Chat Cards**        | Styled battle summary posted to public chat after every committed engagement                         |
| **Round Advancement** | Passive recovery, per-round death toll, objective destruction tracking                               |
| **Major Events**      | 7 canon events (Icarus → Kentimane) — grant Miracles and apply mechanical effects, locked after use  |
| **CSV Import/Export** | Bulk legion and commander management                                                                 |
| **Localization**      | Full English and Polish translations                                                                 |

---

## Installation

**Via manifest URL:** Foundry Setup → Add-on Modules → Install Module → paste:
`https://raw.githubusercontent.com/karpiq24/battle-of-mytros/main/module.json`

**Manually:** Copy the repo folder into `<Foundry data>/Data/modules/battle-of-mytros/` and enable the module.

---

## Initial World Setup

### 1. Launch the Dashboard

Select the standard Token Controls panel on the left side of your screen. Look for the crossed swords icon to open the **Battle of Mytros Dashboard**.

### 2. Set the Battle Scene

Navigate to the **Setup** tab within the dashboard. Under the Scene & Regions section, select your primary battle map from the **Battle Scene** dropdown. The module will only track tokens and resolve engagements when the active canvas matches this scene.

### 3. Create Map Sections as Scene Regions

On the selected battlemap, draw Scene Regions using the Foundry region tools and name them using the prefix specified in your Setup tab (default is `Section:` — e.g. `Section: The Docks`). Regions without this prefix are ignored by the module.

### 4. Create and Manage Legions & Commanders

Instead of manually creating actors and setting flags, fully manage your armies directly via the dashboard:

-   **Legions Tab**: Click **New Legion**, enter the name, and the actor is automatically created (or converted from an existing actor) with all proper flags.
-   **Commanders Tab**: Click **New Commander**. All commanders appear here.
-   **Bulk Import**: Navigate to the **Setup** tab and use the **Import Legions** and **Import Commanders** buttons to upload CSV files.

### 5. Add Commander Tags

**Tags are Items on the Commander actor.** You no longer need to create them manually! Simply go to the **Setup** tab and click **Auto-create all known tag items**. The module will automatically generate every known tag as an item on all of your Commander actors. You can then add/remove active tags directly using the **Commanders** tab.

### 6. Place Tokens & Assign Commanders

Drag your prepared legion tokens directly onto the battlemap. The Dashboard's Overview tab auto-refreshes when tokens enter or exit your `Section:` regions.

-   Assign commanders to your engaged legions using the dropdown directly on the legion's card in the Overview tab.
-   Player Character (PC) tokens dragged into a section automatically appear in the Support panel, allowing you to assign them specific deployment modes.

### 7. Configure Section Adjacency

In the **Setup** tab under Section Adjacency, select two adjacent map sections from the dropdowns and click **Add Pair**. This informs the Tag Engine when evaluating adjacency-based tags like Warden or Rallier.

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

> **Note:** Tags are evaluated based on their exact spelling. You can rapidly generate all known tags for every imported commander by clicking the **Auto-create all known tag items** button in the dashboard's Setup tab.

---

## Global Exports & Macros

All utility classes are available on `globalThis` for use in macros or the browser console:

```javascript
globalThis.MytrosActorData; // Type checks and actor init helpers
globalThis.MytrosRegionManager; // Section discovery, token queries, adjacency
globalThis.MytrosCSVParser; // CSV import/export
globalThis.BattleRoller; // d20 roll execution
globalThis.TagEngine; // Roll modifier calculation
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
