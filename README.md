# Battle of Mytros — Foundry VTT Module

A complete GM-facing mass combat system for *Odyssey of the Dragonlords*, implementing the **Battle of Mytros** rules from `system.md`. Resolves legion warfare phase-by-phase through an interactive dashboard and battle resolver, tracks commander casualties, civilian deaths, Miracle points, and major story events — all wired to Foundry's actor, token, and region systems with full persistence.

> **Version:** 0.4.0 · **Foundry:** v12 minimum, v13 verified · **System:** any

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [Installation](#2-installation)
3. [Initial World Setup](#3-initial-world-setup)
4. [CSV Data Format](#4-csv-data-format)
5. [Running a Battle — Round by Round](#5-running-a-battle--round-by-round)
6. [Dashboard Reference](#6-dashboard-reference)
7. [Battle Resolver Reference](#7-battle-resolver-reference)
8. [Commander Tags Reference](#8-commander-tags-reference)
9. [Code Architecture](#9-code-architecture)
10. [Data Model — Flags and Settings](#10-data-model--flags-and-settings)
11. [Global Exports & Macros](#11-global-exports--macros)

---

## 1. Feature Overview

| Feature | What it does |
|---|---|
| **Dashboard** | Three-tab GM window: Overview (live map), Miracles, Setup |
| **Reconnaissance** | 1d20 + highest allied Wit; intelligence result table; 23+ auto-wires +1 bonus to every allied Maneuver roll this round |
| **Battle Resolver** | Step-by-step Maneuver → Charge → Clash → full Aftermath state machine per engagement |
| **Tag Engine** | All 20 commander tags automatically applied to every relevant roll and aftermath check |
| **PC Fast Response** | Six deployment modes per PC token (Rest included); Targeted Strike is phase-specific (Maneuver/Charge/Clash); bonuses detected from token flags and applied in the resolver |
| **Aftermath** | Recovery, Hope, Salvage with interactive benefit selection; Divine Blood re-roll phase; Commander Casualty d100 check |
| **Section Adjacency** | GM-configured adjacency pairs: Warden grants +2 Clash and Rallier grants +2 Hope to allied legions in neighbouring sections |
| **Stat Persistence** | Stats, rout/destruction, section control written to actor/region flags at Commit |
| **Chat Cards** | Styled battle summary posted to public chat after every committed engagement |
| **Round Advancement** | Passive recovery for idle legions, per-round death toll, objective destruction tracking, recon/insight cleared |
| **Miracle UI** | Allied/Sydon pools with one-click spend buttons (Roll Bonus, Divine Advantage, Short/Long Rest) |
| **Major Events** | 7 canon events (Icarus → Kentimane) — grant Miracles and apply mechanical effects, locked after use |
| **CSV Import/Export** | Bulk legion and commander management via CSV files |
| **Dark Mode** | CSS custom properties respect `prefers-color-scheme: dark` and Foundry v13 `body.theme-dark` |
| **Localization** | Full English and Polish translations via `lang/en.json` and `lang/pl.json` |

---

## 2. Installation

**Via manifest URL:**
1. Foundry Setup → Add-on Modules → Install Module
2. Paste: `https://raw.githubusercontent.com/karpiq24/battle-of-mytros/main/module.json`
3. Enable in your world under Module Settings

**Manually:**
Copy the repo folder into `<Foundry data>/Data/modules/battle-of-mytros/` so that `module.json` is at the root, then enable the module.

---

## 3. Initial World Setup

### 3.1 Set the Battle Scene

Game Settings → Module Settings → **Battlemap Scene ID**. Enter the ID of your battlemap scene. The module only activates token tracking and renders section data when the active canvas matches this ID. Find a scene's ID in its configuration sheet (shown at the bottom of the sheet).

### 3.2 Create Map Sections as Scene Regions

In the battlemap scene, draw **Scene Regions** for each city section. Name each one with the prefix `Section:`:

```
Section: The Docks
Section: Temple District
Section: Royal Quarter
```

The module finds regions automatically by this prefix. On scene load it initialises each region with default flags (`control: neutral`, `fortified: false`, `hasObjective: false`). Regions without the prefix are invisible to the module.

### 3.3 Create Legion Actors

Create one Actor per legion. Mark it as a legion by:
- Setting the flag `battle-of-mytros.isLegion = true` manually in the actor's flags editor, **or**
- Using the CSV import (sets the flag automatically)

Legion actors store all combat data as flags: `stats` (vitality/morale/wit/injuries), `faction`, `commanderId`, `isRouted`, `isDestroyed`, `foughtThisRound`, `tacInsightBonus`.

### 3.4 Create Commander Actors

Create one Actor per commander. Set the flag `battle-of-mytros.isCommander = true`.

**Tags are Items on the actor.** Create plain items named exactly after each tag (case-insensitive). For example: an item named `Tactician` gives the Tactician tag; an item named `Divine Blood` gives the Divine Blood tag.

### 3.5 Assign Commanders to Legions

In the Dashboard Overview tab, each legion card shows a commander dropdown. Select the correct commander — this writes the commander actor's ID to the legion's `commanderId` flag. The dropdown only shows actors flagged as commanders.

### 3.6 Place Tokens

Drag legion actor tokens onto the battlemap. When a token enters or exits a `Section:` region, the Dashboard auto-refreshes. Fast Response tokens (any actor with `hasPlayerOwner === true`, or flagged as `isFastResponse`) appear under each section's Support panel and can be assigned deployment modes.

### 3.7 Configure Section Adjacency

In the Dashboard **Setup tab**, scroll to **Section Adjacency**. Use the two dropdowns to select a pair of neighbouring sections and click **Add Pair**. Pairs are bidirectional — adding A ↔ B also makes B adjacent to A. You must be on the battle scene for the dropdowns to populate.

Adjacency is used by the Warden tag (+2 Clash to allied legions in neighbouring sections) and the Rallier tag (+2 Hope to allied legions in neighbouring sections).

---

## 4. CSV Data Format

### Legions

```csv
Name,Faction,Vitality,Morale,Wit,Injuries,CommanderName
Iron Shields,allied,6,7,5,0,Acastus
Storm Hounds,sydon,5,8,4,0,Gaius
```

- **Name** — matches an existing actor by name; creates a new one if not found
- **Faction** — `allied` or `sydon`
- **Vitality / Morale / Wit** — integers; recommended total 10–18 per legion
- **Injuries** — starting injuries (usually 0)
- **CommanderName** — optional; matched to an existing commander actor by name

### Commanders

```csv
Name,Tags
Acastus,Tactician;Inspiring
Gaius,Brutal;Headhunter;Veteran
```

Tag parsing from CSV is a partial stub — the actor is created and flagged as a commander, but tag items are not automatically created from the CSV. Recommended workflow: import the actor via CSV to create it, then add tag items manually on the actor sheet.

---

## 5. Running a Battle — Round by Round

### Phase 1 — Reconnaissance

Open the Dashboard (crossed-swords button in the token toolbar). On the **Overview** tab (battle scene only, GM only), click **Roll Recon**. The module rolls 1d20 + the highest Wit among all non-destroyed allied legions and shows the intelligence result:

| Total | Result |
|---|---|
| ≤ 10 | No enemy movements revealed |
| 11–14 | Learn destinations of 2 enemy legions |
| 15–18 | Learn destinations of up to half the enemy legions |
| 19–22 | Learn all enemy legion destinations |
| 23+ | Learn all destinations **+ +1 to all allied Maneuver rolls this round** |

The result text persists until Advance Round clears it. The +1 bonus is stored in a setting and automatically added to allied Maneuver rolls in the resolver.

### Phase 2 — Planning & Commitment

Record enemy movements privately. Reveal intel per the recon result. Players plan and lock in allied moves.

### Phase 3 — Fast Response Deployment

The current phase is tracked as a number in the Setup tab. When Phase = 3, support unit deployment selectors appear in each section card. Assign deployment modes to PC/support tokens:

| Mode | Bonus |
|---|---|
| **Reinforce** | +1d4 to all battle and aftermath rolls for the allied legion |
| **Shock Assault** | +1d6 to all three battle phase rolls (no aftermath bonus) |
| **Targeted Strike: Maneuver** | +1d8 + Advantage on the Maneuver roll only |
| **Targeted Strike: Charge** | +1d8 + Advantage on the Charge roll only |
| **Targeted Strike: Clash** | +1d8 + Advantage on the Clash roll only |
| **Shield the Wounded** | +1d8 to all three aftermath rolls (Recovery, Hope, Salvage) |
| **Protect** | No Commander Casualty check this round |
| **Rest** | PC takes a Short Rest; no bonuses applied this round |

Multiple PC tokens can deploy to the same battle; their bonuses stack.

### Phase 4 — Battle Resolution

Each section card where both an allied and sydon legion are present shows a **Resolve Battle** button. Click it to open the Battle Resolver for that engagement. Work through the phase buttons in order. All intermediate results are held in the resolver's in-memory state until you click **Commit Changes to Actors** at the end.

### Phase 5 — Aftermath & Round Advance

After all battles are resolved, click **Advance to Round N+1** (Setup tab). This runs:
1. For each non-destroyed legion that did not fight: +1 Morale (cap 10), −1 injury (min 0)
2. Rout cleared on any legion whose Morale recovered above 0
3. 1d6×50 death toll per unengaged Sydon legion (skipped if death toll is frozen)
4. Objective destruction check — if Sydon held an objective section last round too, it's permanently destroyed
5. 1d4×10 per already-destroyed objective (halved if Sydon Defeated event was triggered; skipped if frozen)
6. Tactical Insight bonus and recon result cleared from all legions and settings
7. Round counter incremented, phase reset to 1

---

## 6. Dashboard Reference

### Overview Tab

One card per map section. Colour-coded border: blue = Allied control, red = Sydon control.

**Section card (GM view):**
- Control dropdown (Neutral / Allied / Sydon)
- Fortify toggle button (shield icon)
- Objective toggle button (star icon)
- **Resolve Battle** button — appears only when both allied and sydon legions are present (active, non-routed allied required)
- **Overrun Routed** button — appears when only routed allied legions remain against a sydon legion; click to disband them and roll death toll
- Legion list: `Name · Inj X · Mor Y` with faction colour, Routed flag (orange), Destroyed badge (red strikethrough)
- Commander assignment dropdown
- Support unit list with deployment mode selector (Phase 3 only)

**Section card (player view):**
- Section name, fortification badge, objective badge, destroyed-objective flame badge
- Legion names with faction colour and status badges
- Assigned commander name (read-only)
- Active deployment mode badge for their PC token

**Recon panel** (GM, battle scene only, top of Overview):
- Roll button + result text
- Gold highlight when 23+ bonus is active
- Frozen death toll banner if Kentimane was defeated

### Miracles Tab

**Miracle pools** (visible to all players):
- Allied pool (blue) — large pool count + spend buttons (GM only): Roll Bonus −1, Divine Advantage −2, PC Short Rest −2, PC Long Rest −4
- Sydon pool (red) — pool count + Roll Bonus −1 and Divine Advantage −2 spend buttons

Spend buttons only decrement the pool. The DM announces the effect verbally; there is no binding between a spent miracle and a specific resolver roll.

**Major Events** (GM only):

| Event | Miracle Reward | Special Effect |
|---|---|---|
| Icarus Subdued or Calmed | +2 Allied | — |
| Acastus Redeemed | +2 Allied | — |
| The Colossus Awakened | +2 Allied | Manually fortify the section it occupies |
| Hergeron Driven from the Temple | +2 Allied | — |
| **Sydon Defeated** | +2 Allied | Halves destroyed-objective deaths every round |
| **Lutheria Defeated** | +2 Allied | Immediately subtracts 800 from Death Toll |
| **Kentimane Defeated** | +2 Allied | Freezes Death Toll entirely |

Each event can only be triggered once. The button locks and shows "✓ Resolved" afterward.

### Setup Tab (GM only)

Manual overrides: Round, Phase, Allied Miracles, Sydon Miracles, Death Toll. Also contains:
- **Advance Round** button
- **Section Adjacency** — list of current adjacent pairs with remove buttons; two dropdowns + Add Pair button to define new pairs
- CSV import/export controls for legions and commanders

---

## 7. Battle Resolver Reference

### State Machine Flow

```
setup → runManeuver
  ├─ (winner) → maneuver_choice → selectManeuverBenefit → charge
  └─ (tie)   ──────────────────────────────────────────→ charge
                                                            │
                                                          clash
                                                       ┌────┴────┐
                                                    winner      tie
                                                       │    tiebreaker (loop)
                                                       └────┬────┘
                                                    aftermath_recovery
                                                    aftermath_hope
                                                    aftermath_salvage
                                          ┌──────────────┤
                                 allied needs choice  sydon needs choice
                                 aftermath_salvage_allied_choice
                                 aftermath_salvage_sydon_choice
                                          └──────────────┤
                                              aftermath_divine_blood (if applicable)
                                                    aftermath_commander
                                                    done (commit)
                                                     complete
```

### Maneuver (Wit)

Rolls 1d20 + Wit for each side. Modifiers applied: Tactician (Advantage), Cunning (+2), Zealot (+2 if Morale ≥ 6), Engineer (−2 to enemy in fortified section), Mage (−1 to enemy), Siege Breaker (nullifies enemy fortification), Veteran (floor nat 1–4 to 5), Tactical Insight pre-roll stored bonus, Recon +1 bonus (allied only, 23+ result).

Counter points: winner +1, nat20 winner +1 more, nat1 loser −1.

Tie → no benefit, no counter, proceeds directly to Charge.

Winner chooses one benefit:
- **Flanking Position** — +1d4 to own Charge roll
- **Defensive Footing** — +1d2 to own Clash roll
- **Disrupted Formation** — −1 to enemy Charge and Clash rolls
- **Seized Initiative** — if you win the battle, enemy takes +1d2 extra injuries during Recovery

### Charge (Morale)

Rolls 1d20 + Morale. Modifiers: Inspiring (+2), Fanatic (Advantage), Flanking bonus, Disrupted penalty, Engineer (−2 to enemy in fortified), Mage (−1 to enemy), Veteran.

Winner: +1 counter point, +1 flat bonus applied to own Clash roll.

### Clash (Vitality)

Rolls 1d20 + Vitality. Modifiers: Ironclad (+2), Fanatic (Advantage), Warden (+2 own, +2 if an allied legion with Warden is in an adjacent section), Zealot (+2 if Morale ≥ 6), Headhunter (enemy Disadvantage), Defensive Footing bonus, Charge winner +1, Engineer (−2 to enemy in fortified), Mage (−1 to enemy), Veteran.

Winner: +2 counter points.

Tie after all three phases → **Tiebreaker**: repeated 1d20 + Vitality rolls (Veteran applies, no other modifiers) until one side wins.

### Recovery (Vitality)

DC = 12 + current injuries. Natural 1 always fails regardless of total.

| | Success | Failure |
|---|---|---|
| **Winner** | 0 injuries | +1 injury |
| **Loser** | +1 injury | +2 injuries |

Post-check additions: Seized Initiative (+1d2 to loser if applicable); Brutal (+1 to loser if projected injuries ≥ 4). Tags: Medic (Advantage), Ironclad (+2), Fanatic (Disadvantage on own roll), Brutal (enemy Disadvantage + extra injury trigger), Mage (enemy Disadvantage).

### Hope (Morale)

DC = 12, rolled with 1d20 + Morale.

| | Success | Failure |
|---|---|---|
| **Winner** | +2 Morale | +1 Morale |
| **Loser** | −1 Morale | −2 Morale |

Tags: Rallier (+2 own, +2 if an allied legion with Rallier is in an adjacent section), Inspiring (+2), Terrorizer (enemy Disadvantage).

### Salvage (Wit)

DC = 12. Success = 1 benefit. Nat20 = 2 benefits. Both sides roll independently.

| Benefit | Effect |
|---|---|
| Captured Supplies | −1 injury from this legion |
| Tactical Insight | Pre-rolls 1d2; stores value as `tacInsightBonus` flag; applied to this legion's Wit rolls next round |
| Enemy Shaken | Enemy −1 Morale |
| Quick Fortify | Fortifies this section immediately, sets control to this side |

### Divine Blood Re-roll

After Salvage (and all benefit choices), any side with the **Divine Blood** tag that failed one or more aftermath checks is offered a re-roll for each failed check (Recovery, Hope, or Salvage). Only one re-roll per check per side. The better result is kept.

- Recovery re-roll: injuries taken only if the new roll is worse than the original
- Hope re-roll: morale delta updated only if the new roll is better
- Salvage re-roll to success: triggers an additional benefit selection sub-flow within the Divine Blood phase

Either or both sides may skip their re-roll by clicking **Proceed to Commander Casualty**.

### Commander Casualty

For each side's commander (if assigned and not Protected by a PC):

1. Base death chance: Won = 6%, Lost = 12%, Lost by 3+ counter = 20%
2. Headhunter on enemy: +5%. Divine Blood: −5%.
3. Subtract current Morale as Protection (floor 1%)
4. Roll 1d100 ≤ final target → commander dies
5. Unbreakable Pact: roll twice, take the lower

**On death:** −1 Morale to the legion, `commanderId` flag cleared.

### Commit

Writes everything to the database in one async sequence: stats → rout/destruction flags → section control (clears fortification on capture) → both legions marked `foughtThisRound: true` → death toll rolled and accumulated → chat card posted.

---

## 8. Commander Tags Reference

Tags are Items on the commander actor, matched case-insensitively by name. All effects are passive and automatic.

| Tag | Phase(s) | Effect |
|---|---|---|
| **Tactician** | Maneuver | Advantage on Maneuver rolls |
| **Headhunter** | Clash, Casualty | Enemy Disadvantage on Clash; enemy commander +5% death chance |
| **Engineer** | All battle rolls | Enemy −2 to all battle rolls when this legion's section is fortified (Siege Breaker cancels) |
| **Rallier** | Hope | +2 to own Hope check; +2 to Hope of allied legions in adjacent sections |
| **Terrorizer** | Hope | Enemy Disadvantage on Hope checks |
| **Fanatic** | Charge, Clash, Recovery | Advantage on Charge and Clash; Disadvantage on own Recovery |
| **Zealot** | All battle rolls | +2 to all battle rolls while Morale ≥ 6 |
| **Veteran** | All d20 rolls | Natural 1–4 treated as 5 (applied in BattleRoller before all other math) |
| **Warden** | Clash | +2 to own Clash; +2 Clash to allied legions in adjacent sections |
| **Mage** | All battle rolls, Recovery | Enemy −1 to all battle rolls; enemy Recovery Disadvantage |
| **Medic** | Recovery | Advantage on Recovery |
| **Vanguard** | Planning | Extended movement *(Planning phase is manual; not automated)* |
| **Divine Blood** | Casualty, Aftermath | −5% death chance; re-roll one failed aftermath check (Recovery, Hope, or Salvage) and keep the better result |
| **Brutal** | Recovery | Enemy Recovery Disadvantage; +1 injury if enemy projected ≥ 4 injuries |
| **Unbreakable Pact** | Casualty | Roll 1d100 twice, take lower result |
| **Ironclad** | Clash, Recovery | +2 to Vitality-based rolls |
| **Inspiring** | Charge, Hope | +2 to Morale-based rolls |
| **Cunning** | Maneuver, Salvage | +2 to Wit-based rolls |
| **Bulwark** | Destruction check | Destroyed at 7 injuries instead of 6 |
| **Relentless** | Morale clamp | Morale cannot fall below 2 |
| **Siege Breaker** | All battle rolls | Nullifies enemy fortification bonus and enemy Engineer tag |

---

## 9. Code Architecture

```
battle-of-mytros/
├── module.json                   Foundry manifest (id, version, esmodules, styles, languages)
├── scripts/
│   ├── module.mjs                Entry point: settings, hooks, globalThis exports
│   ├── apps/
│   │   ├── dashboard.mjs         BattleDashboard — main GM window (ApplicationV2)
│   │   └── resolver.mjs          BattleResolverApp — per-engagement state machine (ApplicationV2)
│   ├── models/
│   │   └── actor-data.mjs        MytrosActorData — actor type checks and init helpers
│   ├── regions/
│   │   └── region-manager.mjs    MytrosRegionManager — section discovery and token queries
│   └── utils/
│       ├── battle-roller.mjs     BattleRoller — executes d20 rolls (adv/dis/veteran/bonus dice)
│       ├── tag-engine.mjs        TagEngine — translates commander tags into roll modifiers
│       └── csv-parser.mjs        MytrosCSVParser — bulk import/export
├── templates/
│   ├── dashboard.hbs             Dashboard window (all three tabs)
│   ├── resolver.hbs              Resolver window (state machine UI buttons)
│   └── chat-card.hbs            Battle summary card for public chat
├── styles/
│   └── battle-dashboard.css      All module CSS (CSS custom properties, dark mode support)
└── lang/
    ├── en.json                   English localisation (~95 keys, full coverage)
    └── pl.json                   Polish localisation (full coverage)
```

### `scripts/module.mjs`

Registers all 12 `game.settings` (world-scoped), exposes utility classes on `globalThis`, and sets up 6 Foundry hooks:

| Hook | Purpose |
|---|---|
| `init` | Register settings; register `eq` and `ne` Handlebars helpers |
| `canvasReady` | Initialise section flags (control/fortified/hasObjective) on battle scene load |
| `getSceneControlButtons` | Inject the dashboard button into the token toolbar |
| `regionEvent` | Re-render dashboard on `tokenEnter` / `tokenExit` (no auto-actions — tokenEnter fires for every pass-through region during a drag) |
| `updateRegion` | Re-render dashboard when region flags change |
| `updateActor` | Re-render dashboard when legion flags change |
| `deleteActor` | Clear `commanderId` from all legions when a commander is deleted |

### `scripts/apps/dashboard.mjs` — BattleDashboard

`HandlebarsApplicationMixin(ApplicationV2)`. Renders `templates/dashboard.hbs`.

**Key statics:**
- `MAJOR_EVENTS` — array of 7 event definitions (id, name, reward, description, specialEffect)
- `DEFAULT_OPTIONS.actions` — maps 15 action strings to static handler methods

**`tab` instance property** — defaults to `"overview"`, updated by `changeTab` (no setting write; purely in-memory per window instance).

**`_prepareContext`** — called on every render, pulls the full template context from `game.settings`, `game.actors`, `MytrosRegionManager`, and the `MAJOR_EVENTS` constant. Also resolves `adjacencyPairs` to named pairs and provides `sectionOpts` for the adjacency dropdowns.

**Action handlers** (static methods bound to the app instance):

| Handler | What it does |
|---|---|
| `changeTab` | Sets `this.tab`, re-renders |
| `updateSetting` | Writes to `game.settings`, re-renders |
| `toggleSectionFlag` | Flips a boolean region flag (fortified / hasObjective) |
| `setSectionControl` | Sets `control` region flag |
| `importCSV` | Creates file input, reads file, delegates to `MytrosCSVParser.processCSV` |
| `exportCSV` | Delegates to `MytrosCSVParser.exportLegions/Commanders` |
| `openResolver` | Constructs `new BattleResolverApp(region)` and renders it |
| `assignCommander` | Sets `commanderId` flag on legion actor |
| `setDeploymentMode` | Sets `deploymentMode` flag on the token document |
| `advanceRound` | Full end-of-round processing (see §5 Phase 5) |
| `rollRecon` | Rolls 1d20 + highest Wit, stores result + bonus to settings |
| `spendMiracle` | Decrements miracle pool setting; warns if insufficient |
| `triggerMajorEvent` | Marks event complete, grants miracles, applies special effect |
| `disbandRoutedLegions` | Marks routed legions destroyed, rolls death toll, posts chat message |
| `addAdjacencyPair` | Reads two section dropdowns, adds pair to `adjacencyPairs` setting (guards against duplicates and self-pairs) |
| `removeAdjacencyPair` | Removes pair at given index from `adjacencyPairs` setting |

### `scripts/apps/resolver.mjs` — BattleResolverApp

`HandlebarsApplicationMixin(ApplicationV2)`. One instance per engagement. Constructed with a `Region` object; finds the allied and sydon legion actors in that region via `initFactions()` (skips routed and destroyed legions).

**`this.state`** is the entire battle's working memory: `phase`, `allied` (actor ref), `sydon` (actor ref), `log[]`, plus accumulated results (`counter`, `maneuverWinner`, `maneuverBenefit`, `overallWinner`, `recoveryResult`, `hopeResult`, `salvageResult`, `salvageBenefits`, `commanderResult`, `divineBloodPending`, `divineBloodSalvageNeedChoice`). None of this is persisted until `commitAftermath` runs.

**Instance helpers:**
- `hasTag(legion, tagName)` — checks if the legion's commander has an item with that name
- `getCommander(legion)` — returns the commander actor or null
- `getSupportBonuses(faction, phase)` — returns `{ dice[], advantage }` for battle phases
- `getSupportBonusesAftermath(faction)` — returns `{ dice[] }` for aftermath (reinforce + shield_the_wounded)
- `_computeAdjacencyContext()` — returns `{ adjacentWarden, adjacentRallier }` by checking allied legions in sections adjacent to `this.region`
- `_computeDivineBloodPending()` — returns per-side object of failed checks eligible for Divine Blood re-roll
- `_nextPhaseAfterSalvage()` — decides whether to go to `aftermath_divine_blood` or `aftermath_commander`

**`commitAftermath`** is the only method that writes to the database. It applies the entire accumulated `this.state` in sequence — see §7 Commit for the full list.

### `scripts/models/actor-data.mjs` — MytrosActorData

Static flag namespace. Not a DataModel.

- `isLegion(actor)` / `isCommander(actor)` / `isFastResponse(actor)` — type checks via flags
- `initLegion(actor, faction)` — writes `isLegion`, default `stats`, `faction`, `commanderId: null`
- `initCommander(actor)` — writes `isCommander: true`

### `scripts/regions/region-manager.mjs` — MytrosRegionManager

- `SECTION_PREFIX = "Section:"` — the region naming convention the module depends on
- `getActiveSections()` — returns all regions in the battle scene starting with the prefix
- `getLegionsInSection(region)` — filters `region.tokens` for legion actors
- `getSupportUnitsInSection(region)` — filters for fast-response actors
- `getAdjacentSections(regionId)` — reads `adjacencyPairs` setting, returns IDs of all sections adjacent to the given region (bidirectional lookup)
- `initSectionFlags(region)` — sets default flags if not yet initialised (idempotent)

### `scripts/utils/battle-roller.mjs` — BattleRoller

Single static method: `executeRoll(stat, flatBonus, advantage, disadvantage, isVeteran, bonusDice[])`.

Builds the Roll formula dynamically:
- Base: `1d20` / `2d20kh` (advantage) / `2d20kl` (disadvantage)
- Adds `+ stat`, optionally `+ flatBonus`, and appends each `bonusDice` element
- Extracts the active d20 face result after evaluation to detect nat20/nat1 correctly (regardless of advantage/disadvantage keep/drop)
- Applies Veteran floor: if natural d20 ≤ 4, adds the difference to bring it to 5

Returns `{ roll, total, isNat20, isNat1 }`.

### `scripts/utils/tag-engine.mjs` — TagEngine

**`getRollModifiers(legion, enemyLegion, phase, context)`** — for battle phases (`"maneuver"`, `"charge"`, `"clash"`).

Context object keys: `isFortified`, `enemyIsFortified`, `maneuverBenefit`, `enemyManeuverBenefit`, `adjacentWarden`.

Also reads `tacInsightBonus` from the legion flag for maneuver and salvage phases.

**`getAftermathModifiers(legion, enemyLegion, phase, context)`** — for aftermath phases (`"recovery"`, `"hope"`, `"salvage"`).

Context object keys: `isWinner`, `adjacentRallier`.

Both methods return `{ advantage: boolean, disadvantage: boolean, flatBonus: number }`.

### `scripts/utils/csv-parser.mjs` — MytrosCSVParser

- `processCSV(csvText, type)` — splits on newlines, parses headers, creates or updates actors. For legions: calls `initLegion` and writes stats flags. For commanders: calls `initCommander`.
- `exportLegions()` / `exportCommanders()` — builds CSV string, triggers browser download via a hidden `<a>` element.

---

## 10. Data Model — Flags and Settings

### Actor Flags — Legion

| Flag | Type | Description |
|---|---|---|
| `isLegion` | Boolean | Marks this actor as a legion |
| `faction` | String | `"allied"` or `"sydon"` |
| `stats` | Object | `{ vitality, morale, wit, injuries }` — all integers |
| `commanderId` | String\|null | Actor ID of the assigned commander |
| `isRouted` | Boolean | Set when Morale hits 0; cleared when Morale recovers above 0 |
| `isDestroyed` | Boolean | Set when injuries reach threshold (6, or 7 with Bulwark) |
| `foughtThisRound` | Boolean | Set by `commitAftermath`; cleared by `advanceRound` |
| `tacInsightBonus` | Number\|null | Pre-rolled 1d2 value from Tactical Insight salvage; read by TagEngine for one round, then cleared |

### Actor Flags — Commander

| Flag | Type | Description |
|---|---|---|
| `isCommander` | Boolean | Marks this actor as a commander |

Tags are stored as **Items on the actor** — each item's `name` (lowercase) is the tag.

### Token Flags

| Flag | Type | Description |
|---|---|---|
| `deploymentMode` | String | `"none"`, `"reinforce"`, `"shock_assault"`, `"targeted_strike_maneuver"`, `"targeted_strike_charge"`, `"targeted_strike_clash"`, `"shield_the_wounded"`, `"protect"`, or `"rest"` |

### Region Flags

| Flag | Type | Description |
|---|---|---|
| `initialized` | Boolean | Prevents double-init on scene load |
| `control` | String | `"neutral"`, `"allied"`, or `"sydon"` |
| `fortified` | Boolean | Whether this section is currently fortified |
| `hasObjective` | Boolean | Whether this section contains a strategic objective |
| `objectiveDestroyed` | Boolean | Permanently true once the objective is destroyed |
| `sydonHeldLastRound` | Boolean | Two-round destruction timer — true after first round of Sydon control |

### World Settings

| Key | Type | Default | Description |
|---|---|---|---|
| `battleSceneId` | String | `""` | Scene ID of the battle map |
| `currentRound` | Number | 1 | Current round counter |
| `currentPhase` | Number | 1 | Current phase (1–5) |
| `deathToll` | Number | 0 | Running civilian casualty total |
| `alliedMiracles` | Number | 8 | Allied Miracle Point pool |
| `sydonMiracles` | Number | 10 | Sydon Miracle Point pool |
| `reconResult` | String | `""` | Last recon roll result text; shown in Overview panel |
| `reconBonus` | Number | 0 | +1 if recon rolled 23+; added to allied Maneuver rolls this round |
| `completedEvents` | String | `"[]"` | JSON array of completed major event IDs |
| `deathTollFrozen` | Boolean | false | Set by Kentimane Defeated; prevents all future death toll accumulation |
| `sydonObjectiveHalved` | Boolean | false | Set by Sydon Defeated; halves destroyed-objective deaths per round |
| `adjacencyPairs` | String | `"[]"` | JSON array of `[regionId, regionId]` pairs defining neighbouring sections |

---

## 11. Global Exports & Macros

All utility classes are exposed on `globalThis` for use in Foundry macros or the browser console:

```javascript
globalThis.MytrosActorData      // Type checks and actor init helpers
globalThis.MytrosRegionManager  // Section discovery, token queries, adjacency lookup
globalThis.MytrosCSVParser      // CSV import/export
globalThis.BattleRoller         // Roll execution
globalThis.TagEngine            // Roll modifier calculation
```

**Example — manually initialise an actor as a legion:**
```javascript
const actor = game.actors.getName("Iron Guard");
await MytrosActorData.initLegion(actor, "allied");
```

**Example — check all section control states:**
```javascript
for (const s of MytrosRegionManager.getActiveSections()) {
    console.log(s.name, s.getFlag("battle-of-mytros", "control"));
}
```

**Example — list adjacent sections for a given region:**
```javascript
const region = canvas.scene.regions.getName("Section: The Docks");
const adjacentIds = MytrosRegionManager.getAdjacentSections(region.id);
console.log(adjacentIds);
```

**Example — trigger a recon roll from a macro:**
```javascript
const legions = game.actors.filter(a => MytrosActorData.isLegion(a) && a.getFlag("battle-of-mytros", "faction") === "allied");
const wit = legions.reduce((m, l) => Math.max(m, l.getFlag("battle-of-mytros", "stats")?.wit ?? 0), 0);
const r = await new Roll(`1d20 + ${wit}`).evaluate({ async: true });
r.toMessage({ flavor: `Reconnaissance: ${r.total}` });
```
