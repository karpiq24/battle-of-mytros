# Phase 3: Battle Resolver Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the automated Battle Resolver that executes Phase 1 (Maneuver), Phase 2 (Charge), and Phase 3 (Clash) of a battle engagement.

**Architecture:** 
1. **Resolver Application:** A new `ApplicationV2` UI (`BattleResolverApp`) specifically for executing a battle.
2. **Auto-Detection:** Enhance the Dashboard to detect when opposing Legions occupy the same section, and provide a "Resolve Battle" button that launches the Resolver App.
3. **Roll Engine:** Create a utility class (`BattleRoller`) that handles the core d20 math, advantage/disadvantage, and tie-breakers.
4. **Interactive Flow:** The Resolver App will manage the state machine of the battle (Maneuver -> Choice -> Charge -> Clash -> Results).

**Tech Stack:** Foundry VTT V13 ApplicationV2 API, Handlebars, JS classes.

---

### Task 1: Pending Battle Auto-Detection

**Files:**
- Modify: `scripts/apps/dashboard.mjs`
- Modify: `templates/dashboard.hbs`

- [ ] **Step 1: Identify Opposing Forces in `_prepareContext`**
  Modify `_prepareContext` to detect if a section has both Allied and Sydon legions.

```javascript
// Modify _prepareContext inside scripts/apps/dashboard.mjs
            context.sections = sections.map(r => {
                const legions = globalThis.MytrosRegionManager.getLegionsInSection(r);
                const mappedLegions = legions.map(t => ({
                    id: t.actor.id,
                    name: t.name,
                    faction: t.actor.getFlag("battle-of-mytros", "faction")
                }));
                
                const hasAllied = mappedLegions.some(l => l.faction === "allied");
                const hasSydon = mappedLegions.some(l => l.faction === "sydon");
                const pendingBattle = hasAllied && hasSydon;

                return {
                    id: r.id,
                    name: r.name.replace(globalThis.MytrosRegionManager.SECTION_PREFIX, "").trim(),
                    control: r.getFlag("battle-of-mytros", "control"),
                    fortified: r.getFlag("battle-of-mytros", "fortified"),
                    hasObjective: r.getFlag("battle-of-mytros", "hasObjective"),
                    legions: mappedLegions,
                    pendingBattle: pendingBattle
                };
            });
```

- [ ] **Step 2: Add "Resolve Battle" Button to Template**

```html
<!-- Update section-header in templates/dashboard.hbs -->
                            <div class="section-header">
                                <h3>{{this.name}}</h3>
                                {{#if @root.isGM}}
                                <div class="section-controls">
                                    {{#if this.pendingBattle}}
                                    <button type="button" class="resolve-btn" data-action="openResolver" data-region-id="{{this.id}}">Resolve Battle</button>
                                    {{/if}}
                                    <!-- existing select and toggle buttons -->
```

- [ ] **Step 3: Define Action Stub in Dashboard**

```javascript
// Add to scripts/apps/dashboard.mjs actions and methods
    static DEFAULT_OPTIONS = {
        // ...
        actions: {
            // ...
            openResolver: BattleDashboard.openResolver
        }
    };

    static async openResolver(event, target) {
        const regionId = target.dataset.regionId;
        console.log(`Opening resolver for region ${regionId}`);
        ui.notifications.info("Resolver UI coming in next task!");
    }
```

- [ ] **Step 4: Commit**
```bash
git add scripts/apps/dashboard.mjs templates/dashboard.hbs
git commit -m "feat: auto-detect pending battles and add resolve button to dashboard"
```

---

### Task 2: Core Roll Engine Utility

**Files:**
- Create: `scripts/utils/battle-roller.mjs`
- Modify: `scripts/module.mjs`

- [ ] **Step 1: Implement Roll Math**
  Create a stateless utility to roll 1d20 + stat, handling advantage.

```javascript
// scripts/utils/battle-roller.mjs
export class BattleRoller {
    /**
     * Executes a battle roll.
     * @param {number} stat The base stat (Wit, Morale, Vitality)
     * @param {number} flatBonus Any flat bonuses (+1d4 becomes average or resolved prior, for now assume integer)
     * @param {boolean} advantage 
     * @param {boolean} disadvantage 
     * @returns {object} { roll: Roll, total: number, isNat20: boolean, isNat1: boolean }
     */
    static async executeRoll(stat, flatBonus = 0, advantage = false, disadvantage = false) {
        let formula = "1d20";
        if (advantage && !disadvantage) formula = "2d20kh";
        if (disadvantage && !advantage) formula = "2d20kl";
        
        formula += ` + ${stat}`;
        if (flatBonus !== 0) {
            formula += ` + ${flatBonus}`;
        }

        const roll = await new Roll(formula).evaluate();
        
        // Find the d20 term
        const d20Term = roll.terms.find(t => t.faces === 20);
        const d20Result = d20Term ? d20Term.results.find(r => r.active)?.result || d20Term.total : 0;

        return {
            roll: roll,
            total: roll.total,
            isNat20: d20Result === 20,
            isNat1: d20Result === 1
        };
    }
}
```

- [ ] **Step 2: Export from Module**

```javascript
// Add to scripts/module.mjs
import { BattleRoller } from "./utils/battle-roller.mjs";
globalThis.BattleRoller = BattleRoller;
```

- [ ] **Step 3: Commit**
```bash
git add scripts/utils/battle-roller.mjs scripts/module.mjs
git commit -m "feat: create core battle rolling utility"
```

---

### Task 3: The Battle Resolver Application Scaffold

**Files:**
- Create: `scripts/apps/resolver.mjs`
- Create: `templates/resolver.hbs`
- Modify: `scripts/module.mjs`
- Modify: `scripts/apps/dashboard.mjs`

- [ ] **Step 1: Create Resolver App Class**

```javascript
// scripts/apps/resolver.mjs
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BattleResolverApp extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(region, options={}) {
        super(options);
        this.region = region;
        this.state = {
            phase: "setup", // setup, maneuver, maneuver_choice, charge, clash, aftermath
            allied: null,
            sydon: null,
            log: []
        };
        this.initFactions();
    }

    initFactions() {
        const legions = globalThis.MytrosRegionManager.getLegionsInSection(this.region);
        this.state.allied = legions.find(l => l.actor.getFlag("battle-of-mytros", "faction") === "allied")?.actor;
        this.state.sydon = legions.find(l => l.actor.getFlag("battle-of-mytros", "faction") === "sydon")?.actor;
    }

    static DEFAULT_OPTIONS = {
        id: "mytros-battle-resolver",
        title: "Battle Resolver",
        tag: "form",
        window: { resizable: true },
        position: { width: 600, height: 700 },
        actions: {
            runManeuver: BattleResolverApp.runManeuver
        }
    };

    static PARTS = {
        form: { template: "modules/battle-of-mytros/templates/resolver.hbs" }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.regionName = this.region.name;
        context.state = this.state;
        context.alliedName = this.state.allied?.name || "None";
        context.sydonName = this.state.sydon?.name || "None";
        return context;
    }

    static async runManeuver(event, target) {
        this.state.log.push("Running Phase 1: Maneuver...");
        this.state.phase = "maneuver_choice";
        this.render();
    }
}
```

- [ ] **Step 2: Create Template**

```html
<!-- templates/resolver.hbs -->
<div class="mytros-resolver">
    <header>
        <h2>Battle in {{regionName}}</h2>
        <div class="matchup">
            <span class="allied">{{alliedName}}</span> VS <span class="sydon">{{sydonName}}</span>
        </div>
    </header>

    <main>
        <div class="battle-log">
            <ul>
                {{#each state.log}}<li>{{this}}</li>{{/each}}
            </ul>
        </div>

        <div class="controls">
            {{#if (eq state.phase 'setup')}}
                <button type="button" data-action="runManeuver">Roll Phase 1: Maneuver</button>
            {{/if}}
            {{#if (eq state.phase 'maneuver_choice')}}
                <p>Maneuver completed. Winner chooses benefit (Placeholder).</p>
            {{/if}}
        </div>
    </main>
</div>
```

- [ ] **Step 3: Connect to Dashboard**

```javascript
// Modify openResolver in scripts/apps/dashboard.mjs
import { BattleResolverApp } from "./resolver.mjs";

    static async openResolver(event, target) {
        const regionId = target.dataset.regionId;
        const region = canvas.scene.regions.get(regionId);
        if (region) {
            new BattleResolverApp(region).render({ force: true });
        }
    }
```

- [ ] **Step 4: Commit**
```bash
git add scripts/apps/resolver.mjs templates/resolver.hbs scripts/apps/dashboard.mjs
git commit -m "feat: scaffold interactive Battle Resolver ApplicationV2"
```

---

### Task 4: Execute Maneuver Phase & State Progression

**Files:**
- Modify: `scripts/apps/resolver.mjs`
- Modify: `templates/resolver.hbs`

- [ ] **Step 1: Implement full Maneuver Logic**

```javascript
// Update runManeuver in scripts/apps/resolver.mjs
    static async runManeuver(event, target) {
        const alliedStats = this.state.allied.getFlag("battle-of-mytros", "stats");
        const sydonStats = this.state.sydon.getFlag("battle-of-mytros", "stats");

        const alliedRoll = await globalThis.BattleRoller.executeRoll(alliedStats.wit);
        const sydonRoll = await globalThis.BattleRoller.executeRoll(sydonStats.wit);

        this.state.log.push(`Allied Maneuver: ${alliedRoll.total}`);
        this.state.log.push(`Sydon Maneuver: ${sydonRoll.total}`);

        if (alliedRoll.total > sydonRoll.total) {
            this.state.log.push("Allied side won the Maneuver!");
            this.state.maneuverWinner = "allied";
        } else if (sydonRoll.total > alliedRoll.total) {
            this.state.log.push("Sydon side won the Maneuver!");
            this.state.maneuverWinner = "sydon";
        } else {
            this.state.log.push("Maneuver is tied! No benefit.");
            this.state.maneuverWinner = "tie";
        }

        // Store points (1 point for winning)
        this.state.counter = { allied: 0, sydon: 0 };
        if (this.state.maneuverWinner === "allied") this.state.counter.allied += 1;
        if (this.state.maneuverWinner === "sydon") this.state.counter.sydon += 1;

        if (this.state.maneuverWinner !== "tie") {
            this.state.phase = "maneuver_choice";
        } else {
            this.state.phase = "charge";
        }
        
        this.render();
    }
```

- [ ] **Step 2: Add Choice Action and Template**

```javascript
// Add to actions in scripts/apps/resolver.mjs
    selectManeuverBenefit: BattleResolverApp.selectManeuverBenefit

// Add method
    static async selectManeuverBenefit(event, target) {
        const benefit = target.dataset.benefit;
        this.state.maneuverBenefit = benefit;
        this.state.log.push(`${this.state.maneuverWinner} selected benefit: ${benefit}`);
        this.state.phase = "charge";
        this.render();
    }
```

```html
<!-- Update templates/resolver.hbs controls -->
            {{#if (eq state.phase 'setup')}}
                <button type="button" data-action="runManeuver">Roll Phase 1: Maneuver</button>
            {{/if}}
            {{#if (eq state.phase 'maneuver_choice')}}
                <h3>{{state.maneuverWinner}} won Maneuver! Choose a benefit:</h3>
                <button type="button" data-action="selectManeuverBenefit" data-benefit="flanking">Flanking (+1d4 to Charge)</button>
                <button type="button" data-action="selectManeuverBenefit" data-benefit="defensive">Defensive Footing (+1d2 to Clash)</button>
                <button type="button" data-action="selectManeuverBenefit" data-benefit="disrupted">Disrupted Formation (-1 enemy Charge/Clash)</button>
            {{/if}}
            {{#if (eq state.phase 'charge')}}
                <button type="button">Roll Phase 2: Charge (Coming Soon)</button>
            {{/if}}
```

- [ ] **Step 3: Commit**
```bash
git add scripts/apps/resolver.mjs templates/resolver.hbs
git commit -m "feat: implement Phase 1 Maneuver logic and benefit selection"
```
