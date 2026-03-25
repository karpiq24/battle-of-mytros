# Phase 2: Setup & Data Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the GM controls for managing global state, section properties, and a CSV importer for bootstrapping Legions and Commanders.

**Architecture:** 
1. Expand `dashboard.hbs` and `dashboard.mjs` with a tabbed interface.
2. Add a "Setup" tab for editing global `game.settings`.
3. Add interactive toggle buttons to the section cards to manage Fortification and Objectives via Region flags.
4. Create a CSV parsing utility and UI to bulk create/update Actors.

**Tech Stack:** Foundry VTT V13 ApplicationV2 API, Handlebars, JS `FileReader`.

---

### Task 1: Tabbed Interface & Global State Controls

**Files:**
- Modify: `scripts/apps/dashboard.mjs`
- Modify: `templates/dashboard.hbs`
- Modify: `styles/battle-dashboard.css`

- [ ] **Step 1: Add Tabs to ApplicationV2 Options**

```javascript
// Modify scripts/apps/dashboard.mjs
    static DEFAULT_OPTIONS = {
        id: "mytros-battle-dashboard",
        title: "Battle of Mytros Dashboard",
        tag: "form",
        window: {
            icon: "fas fa-swords",
            resizable: true
        },
        position: { width: 800, height: 600 },
        actions: {
            changeTab: BattleDashboard.changeTab,
            updateSetting: BattleDashboard.updateSetting
        }
    };

    tab = "overview";

    static changeTab(event, target) {
        this.tab = target.dataset.tab;
        this.render();
    }

    static async updateSetting(event, target) {
        const settingName = target.dataset.setting;
        const isNumeric = target.type === "number";
        let value = isNumeric ? Number(target.value) : target.value;
        await game.settings.set("battle-of-mytros", settingName, value);
        this.render();
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.isGM = game.user.isGM;
        context.round = game.settings.get("battle-of-mytros", "currentRound");
        context.phase = game.settings.get("battle-of-mytros", "currentPhase");
        
        context.tab = this.tab;
        context.deathToll = game.settings.get("battle-of-mytros", "deathToll");
        context.alliedMiracles = game.settings.get("battle-of-mytros", "alliedMiracles");
        context.sydonMiracles = game.settings.get("battle-of-mytros", "sydonMiracles");

        const battleSceneId = game.settings.get("battle-of-mytros", "battleSceneId");
        context.isBattleScene = canvas.scene?.id === battleSceneId;

        if (context.isBattleScene) {
            const sections = globalThis.MytrosRegionManager.getActiveSections();
            context.sections = sections.map(r => {
                const legions = globalThis.MytrosRegionManager.getLegionsInSection(r);
                return {
                    id: r.id,
                    name: r.name.replace(globalThis.MytrosRegionManager.SECTION_PREFIX, "").trim(),
                    control: r.getFlag("battle-of-mytros", "control"),
                    fortified: r.getFlag("battle-of-mytros", "fortified"),
                    hasObjective: r.getFlag("battle-of-mytros", "hasObjective"),
                    legions: legions.map(t => ({
                        name: t.name,
                        faction: t.actor.getFlag("battle-of-mytros", "faction")
                    }))
                };
            });
        } else {
            context.sections = [];
        }

        return context;
    }
```

- [ ] **Step 2: Update Handlebars for Tabs & Setup Controls**

```html
<!-- templates/dashboard.hbs -->
<div class="mytros-dashboard">
    <nav class="tabs">
        <a class="item {{#if (eq tab 'overview')}}active{{/if}}" data-action="changeTab" data-tab="overview">Overview</a>
        {{#if isGM}}
        <a class="item {{#if (eq tab 'setup')}}active{{/if}}" data-action="changeTab" data-tab="setup">Setup</a>
        {{/if}}
    </nav>

    <header class="dashboard-header">
        <h2>Round {{round}} - Phase {{phase}}</h2>
    </header>

    <main class="dashboard-body">
        {{#if (eq tab 'overview')}}
            {{#if isBattleScene}}
                <div class="sections-list">
                    {{#each sections}}
                        <div class="section-card control-{{this.control}}">
                            <div class="section-header">
                                <h3>{{this.name}}</h3>
                                <div class="section-badges">
                                    {{#if this.fortified}}<span class="badge fortified" title="Fortified"><i class="fas fa-shield-alt"></i></span>{{/if}}
                                    {{#if this.hasObjective}}<span class="badge objective" title="Strategic Objective"><i class="fas fa-star"></i></span>{{/if}}
                                </div>
                            </div>
                            <div class="section-legions">
                                {{#if this.legions.length}}
                                    <ul>
                                    {{#each this.legions}}
                                        <li class="legion-item faction-{{this.faction}}">{{this.name}}</li>
                                    {{/each}}
                                    </ul>
                                {{else}}
                                    <p class="empty-state">No legions present.</p>
                                {{/if}}
                            </div>
                        </div>
                    {{/each}}
                </div>
            {{else}}
                <p class="warning">Please navigate to the designated Battlemap Scene to view sections.</p>
            {{/if}}
        {{/if}}

        {{#if (eq tab 'setup')}}
            <div class="setup-form">
                <div class="form-group">
                    <label>Current Round</label>
                    <input type="number" data-action="updateSetting" data-setting="currentRound" value="{{round}}">
                </div>
                <div class="form-group">
                    <label>Current Phase (1-5)</label>
                    <input type="number" data-action="updateSetting" data-setting="currentPhase" value="{{phase}}">
                </div>
                <div class="form-group">
                    <label>Allied Miracles</label>
                    <input type="number" data-action="updateSetting" data-setting="alliedMiracles" value="{{alliedMiracles}}">
                </div>
                <div class="form-group">
                    <label>Sydon Miracles</label>
                    <input type="number" data-action="updateSetting" data-setting="sydonMiracles" value="{{sydonMiracles}}">
                </div>
                <div class="form-group">
                    <label>Civilian Death Toll</label>
                    <input type="number" data-action="updateSetting" data-setting="deathToll" value="{{deathToll}}">
                </div>
            </div>
        {{/if}}
    </main>
</div>
```

- [ ] **Step 3: Register Handlebars Eq helper**
  Foundry V13 has Handlebars 4 which needs an `eq` helper.
```javascript
// Modify scripts/module.mjs
Hooks.once('init', async function() {
    Handlebars.registerHelper('eq', function (a, b) {
        return a === b;
    });
    // ...
```

---

### Task 2: Section Editor Controls

**Files:**
- Modify: `scripts/apps/dashboard.mjs`
- Modify: `templates/dashboard.hbs`

- [ ] **Step 1: Add Actions for Toggling Section Flags**

```javascript
// Add to scripts/apps/dashboard.mjs actions object
    static DEFAULT_OPTIONS = {
        // ...
        actions: {
            changeTab: BattleDashboard.changeTab,
            updateSetting: BattleDashboard.updateSetting,
            toggleSectionFlag: BattleDashboard.toggleSectionFlag,
            setSectionControl: BattleDashboard.setSectionControl
        }
    };

// Add methods to BattleDashboard class
    static async toggleSectionFlag(event, target) {
        const regionId = target.dataset.regionId;
        const flagName = target.dataset.flag;
        const region = canvas.scene.regions.get(regionId);
        if (!region) return;

        const current = region.getFlag("battle-of-mytros", flagName);
        await region.setFlag("battle-of-mytros", flagName, !current);
    }

    static async setSectionControl(event, target) {
        const regionId = target.dataset.regionId;
        const control = target.value;
        const region = canvas.scene.regions.get(regionId);
        if (!region) return;

        await region.setFlag("battle-of-mytros", "control", control);
    }
```
*(Note: no need to call `this.render()` manually for flags, region updates will trigger our global hook and re-render automatically).*

- [ ] **Step 2: Add UI controls to Section Cards in Template**

```html
<!-- Update section-header in templates/dashboard.hbs -->
                            <div class="section-header">
                                <h3>{{this.name}}</h3>
                                {{#if @root.isGM}}
                                <div class="section-controls">
                                    <select data-action="setSectionControl" data-region-id="{{this.id}}">
                                        <option value="neutral" {{#if (eq this.control 'neutral')}}selected{{/if}}>Neutral</option>
                                        <option value="allied" {{#if (eq this.control 'allied')}}selected{{/if}}>Allied</option>
                                        <option value="sydon" {{#if (eq this.control 'sydon')}}selected{{/if}}>Sydon</option>
                                    </select>
                                    <button type="button" data-action="toggleSectionFlag" data-region-id="{{this.id}}" data-flag="fortified" class="{{#if this.fortified}}active{{/if}}"><i class="fas fa-shield-alt"></i></button>
                                    <button type="button" data-action="toggleSectionFlag" data-region-id="{{this.id}}" data-flag="hasObjective" class="{{#if this.hasObjective}}active{{/if}}"><i class="fas fa-star"></i></button>
                                </div>
                                {{else}}
                                <div class="section-badges">
                                    {{#if this.fortified}}<span class="badge fortified" title="Fortified"><i class="fas fa-shield-alt"></i></span>{{/if}}
                                    {{#if this.hasObjective}}<span class="badge objective" title="Strategic Objective"><i class="fas fa-star"></i></span>{{/if}}
                                </div>
                                {{/if}}
                            </div>
```

---

### Task 3: CSV Importer Engine

**Files:**
- Create: `scripts/utils/csv-parser.mjs`
- Modify: `scripts/module.mjs`

- [ ] **Step 1: Write CSV Parser Utility**
  Creates/updates actors based on CSV.

```javascript
// scripts/utils/csv-parser.mjs
export class MytrosCSVParser {
    static async processCSV(csvText, type) {
        const rows = csvText.split('\n').map(r => r.trim()).filter(r => r);
        if (rows.length === 0) return;
        
        const headers = rows.shift().split(',').map(h => h.trim().toLowerCase());

        let created = 0;
        let updated = 0;

        for (const row of rows) {
            // Split by comma, but handle potential quotes (basic implementation)
            const cols = row.split(',').map(c => c.trim());
            const data = {};
            headers.forEach((h, i) => data[h] = cols[i]);

            if (!data.name) continue;

            let actor = game.actors.getName(data.name);
            const isNew = !actor;

            if (isNew) {
                // Determine folder or create root
                actor = await Actor.create({
                    name: data.name,
                    type: "character" // Using 'character' as generic fallback
                });
                created++;
            } else {
                updated++;
            }

            if (type === "legion") {
                await globalThis.MytrosActorData.initLegion(actor, data.faction || "allied");
                await actor.setFlag("battle-of-mytros", "stats", {
                    vitality: Number(data.vitality) || 10,
                    morale: Number(data.morale) || 10,
                    wit: Number(data.wit) || 10,
                    injuries: Number(data.injuries) || 0
                });
            } else if (type === "commander") {
                await globalThis.MytrosActorData.initCommander(actor);
                // Future: parse tags from CSV and create items here
            }
        }
        
        ui.notifications.info(`Processed ${type}s: ${created} created, ${updated} updated.`);
    }
}
```

- [ ] **Step 2: Export in Module**

```javascript
// Add to scripts/module.mjs
import { MytrosCSVParser } from "./utils/csv-parser.mjs";
globalThis.MytrosCSVParser = MytrosCSVParser;
```

---

### Task 4: CSV UI Integration in Dashboard

**Files:**
- Modify: `scripts/apps/dashboard.mjs`
- Modify: `templates/dashboard.hbs`

- [ ] **Step 1: Add Import Action**

```javascript
// Add to scripts/apps/dashboard.mjs actions
    static DEFAULT_OPTIONS = {
        // ...
        actions: {
            // ...
            importCSV: BattleDashboard.importCSV
        }
    };

// Add method
    static async importCSV(event, target) {
        const type = target.dataset.type; // 'legion' or 'commander'
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                await globalThis.MytrosCSVParser.processCSV(ev.target.result, type);
            };
            reader.readAsText(file);
        };
        input.click();
    }
```

- [ ] **Step 2: Add buttons to Setup Tab**

```html
<!-- Update setup tab in templates/dashboard.hbs -->
        {{#if (eq tab 'setup')}}
            <div class="setup-form">
                <!-- existing form groups -->
                
                <hr>
                <h3>Data Management</h3>
                <div class="form-group">
                    <button type="button" data-action="importCSV" data-type="legion"><i class="fas fa-file-csv"></i> Import Legions CSV</button>
                    <button type="button" data-action="importCSV" data-type="commander"><i class="fas fa-file-csv"></i> Import Commanders CSV</button>
                </div>
            </div>
        {{/if}}
```

- [ ] **Step 3: Update Region Update Hook**
Update the `regionEvent` hook to also listen for region updates to re-render the dashboard.

```javascript
// Add to scripts/module.mjs
Hooks.on("updateRegion", (region, changes, options, userId) => {
    if (changes.flags && changes.flags["battle-of-mytros"]) {
        for (const app of Object.values(ui.windows)) {
            if (app.id === "mytros-battle-dashboard") {
                app.render({ force: true });
            }
        }
    }
});
```
