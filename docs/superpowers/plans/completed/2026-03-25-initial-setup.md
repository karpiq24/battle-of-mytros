# Battle of Mytros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the foundational global state, actors, and UI for the Battle of Mytros mass combat system in Foundry VTT V13.

**Architecture:** We will build this iteratively. First, establish the core module settings for global data. Next, create the specific actor structures for Legions and Commanders. Then, integrate Scene Region auto-discovery. Finally, build the Dashboard UI ApplicationV2.

**Tech Stack:** Foundry VTT V13 API, ApplicationV2, JavaScript (ES Modules).

---

### Task 1: Module Initialization & Global Settings

**Files:**
- Modify: `scripts/module.mjs`

- [ ] **Step 1: Register Module Settings**
  Implement the `init` hook to register global game settings to store the war state.

```javascript
// scripts/module.mjs
Hooks.once('init', async function() {
    console.log("Battle of Mytros | Initializing module");

    game.settings.register("battle-of-mytros", "currentRound", {
        name: "Current Round",
        hint: "The current round of the battle.",
        scope: "world",
        config: false,
        type: Number,
        default: 1
    });

    game.settings.register("battle-of-mytros", "currentPhase", {
        name: "Current Phase",
        hint: "The current phase of the round (1-5).",
        scope: "world",
        config: false,
        type: Number,
        default: 1
    });

    game.settings.register("battle-of-mytros", "deathToll", {
        name: "Civilian Death Toll",
        hint: "Running total of civilian casualties.",
        scope: "world",
        config: false,
        type: Number,
        default: 0
    });

    game.settings.register("battle-of-mytros", "alliedMiracles", {
        name: "Allied Miracle Points",
        scope: "world",
        config: false,
        type: Number,
        default: 8
    });

    game.settings.register("battle-of-mytros", "sydonMiracles", {
        name: "Sydon Miracle Points",
        scope: "world",
        config: false,
        type: Number,
        default: 10
    });
});
```

- [ ] **Step 2: Commit**

```bash
git add scripts/module.mjs
git commit -m "feat: register core global module settings"
```

---

### Task 2: Legion & Commander Data Models (System Hooks)

Since we are extending actors rather than building a full system from scratch, we will use flags to store our custom data on standard Actors. For testing, we'll assume a standard 5e actor or a simple generic actor.

**Files:**
- Create: `scripts/models/actor-data.mjs`
- Modify: `scripts/module.mjs`

- [ ] **Step 1: Create Data Access Methods**
  Create helpers to safely get/set flags on actors.

```javascript
// scripts/models/actor-data.mjs
export class MytrosActorData {
    static MODULE_ID = "battle-of-mytros";

    static isLegion(actor) {
        return actor.getFlag(this.MODULE_ID, "isLegion") === true;
    }

    static isCommander(actor) {
        return actor.getFlag(this.MODULE_ID, "isCommander") === true;
    }

    static async initLegion(actor, faction = "allied") {
        await actor.setFlag(this.MODULE_ID, "isLegion", true);
        await actor.setFlag(this.MODULE_ID, "stats", {
            vitality: 10,
            morale: 10,
            wit: 10,
            injuries: 0
        });
        await actor.setFlag(this.MODULE_ID, "faction", faction); // "allied" or "sydon"
        await actor.setFlag(this.MODULE_ID, "commanderId", null);
    }

    static async initCommander(actor) {
        await actor.setFlag(this.MODULE_ID, "isCommander", true);
        // Tags will be standard items with a specific flag
    }
}
```

- [ ] **Step 2: Export from Module**

```javascript
// Append to scripts/module.mjs
import { MytrosActorData } from "./models/actor-data.mjs";
globalThis.MytrosActorData = MytrosActorData; // expose for macros/testing
```

- [ ] **Step 3: Commit**

```bash
git add scripts/models/actor-data.mjs scripts/module.mjs
git commit -m "feat: implement Legion and Commander data flag structures"
```

---

### Task 3: Scene Region Auto-Discovery & Events

**Files:**
- Create: `scripts/regions/region-manager.mjs`
- Modify: `scripts/module.mjs`

- [ ] **Step 1: Implement Region Manager**
  Track sections and listen to region events.

```javascript
// scripts/regions/region-manager.mjs
import { MytrosActorData } from "../models/actor-data.mjs";

export class MytrosRegionManager {
    static MODULE_ID = "battle-of-mytros";
    static SECTION_PREFIX = "Section:";

    // Get all valid sections in the current scene
    static getActiveSections() {
        if (!canvas.ready) return [];
        return canvas.scene.regions.filter(r => r.name.startsWith(this.SECTION_PREFIX));
    }

    // Initialize module flags on a region if they don't exist
    static async initSectionFlags(region) {
        if (region.getFlag(this.MODULE_ID, "initialized")) return;
        
        await region.setFlag(this.MODULE_ID, "initialized", true);
        await region.setFlag(this.MODULE_ID, "control", "neutral"); // allied, sydon, neutral
        await region.setFlag(this.MODULE_ID, "fortified", false);
        await region.setFlag(this.MODULE_ID, "hasObjective", false);
    }
}
```

- [ ] **Step 2: Hook Region Initialization**

```javascript
// Append to scripts/module.mjs
import { MytrosRegionManager } from "./regions/region-manager.mjs";

Hooks.on("canvasReady", async () => {
    if (!game.user.isGM) return;
    const sections = MytrosRegionManager.getActiveSections();
    for (const section of sections) {
        await MytrosRegionManager.initSectionFlags(section);
    }
});
```

- [ ] **Step 3: Commit**

```bash
git add scripts/regions/region-manager.mjs scripts/module.mjs
git commit -m "feat: implement Scene Region auto-discovery for map sections"
```

---

### Task 4: The ApplicationV2 Dashboard Shell

**Files:**
- Create: `scripts/apps/dashboard.mjs`
- Create: `templates/dashboard.hbs`
- Modify: `scripts/module.mjs`

- [ ] **Step 1: Create App Class**

```javascript
// scripts/apps/dashboard.mjs
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BattleDashboard extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "mytros-battle-dashboard",
        title: "Battle of Mytros Dashboard",
        tag: "form",
        window: {
            icon: "fas fa-swords",
            resizable: true
        },
        position: {
            width: 800,
            height: 600
        }
    };

    static PARTS = {
        form: {
            template: "modules/battle-of-mytros/templates/dashboard.hbs"
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.isGM = game.user.isGM;
        context.round = game.settings.get("battle-of-mytros", "currentRound");
        context.phase = game.settings.get("battle-of-mytros", "currentPhase");
        return context;
    }
}
```

- [ ] **Step 2: Create Template**

```html
<!-- templates/dashboard.hbs -->
<div>
    <header>
        <h2>Round {{round}} - Phase {{phase}}</h2>
        {{#if isGM}}
            <p>GM Controls Active</p>
        {{else}}
            <p>Read-Only Overview</p>
        {{/if}}
    </header>
    <main>
        <p>Dashboard content will go here.</p>
    </main>
</div>
```

- [ ] **Step 3: Register Token Control Button**

```javascript
// Append to scripts/module.mjs
import { BattleDashboard } from "./apps/dashboard.mjs";

Hooks.on("getSceneControlButtons", (controls) => {
    const tokenControls = controls.find(c => c.name === "token");
    if (tokenControls) {
        tokenControls.tools.push({
            name: "battleDashboard",
            title: "Battle of Mytros",
            icon: "fas fa-swords",
            visible: true, 
            onClick: () => {
                new BattleDashboard().render({ force: true });
            },
            button: true
        });
    }
});
```

- [ ] **Step 4: Commit**

```bash
git add scripts/apps/dashboard.mjs templates/dashboard.hbs scripts/module.mjs
git commit -m "feat: add basic ApplicationV2 Dashboard and token controls button"
```
