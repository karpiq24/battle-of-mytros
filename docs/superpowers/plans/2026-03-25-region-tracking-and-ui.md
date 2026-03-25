# Battle of Mytros Implementation Plan: Region Tracking & UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement real-time token tracking via Region events, and expand the Dashboard UI to display the active sections, their states, and the Legions currently occupying them.

**Architecture:** We will leverage Foundry V12+ `region.tokens` property to know who is in a section without manual tracking. We will listen to the global `regionEvent` hook to trigger UI updates. The Dashboard will be expanded to render this data.

**Tech Stack:** Foundry VTT V13 API, ApplicationV2, Handlebars, JavaScript.

---

### Task 1: Expose Region Tokens & Hook Region Events

**Files:**
- Modify: `scripts/regions/region-manager.mjs`
- Modify: `scripts/module.mjs`

- [ ] **Step 1: Add Token Retrieval Method**
  Add a method to `MytrosRegionManager` to get all Legion tokens currently inside a given region.

```javascript
// Add to scripts/regions/region-manager.mjs
    static getLegionsInSection(region) {
        if (!region.tokens) return [];
        return Array.from(region.tokens).filter(token => {
            return token.actor && MytrosActorData.isLegion(token.actor);
        });
    }
```

- [ ] **Step 2: Add regionEvent Hook**
  In `scripts/module.mjs`, listen for `regionEvent`. If the event is `tokenEnter` or `tokenExit` on a valid Section region, trigger a re-render of our Dashboard.

```javascript
// Append to scripts/module.mjs
Hooks.on("regionEvent", (region, event) => {
    if (!game.user.isGM) return;
    const battleSceneId = game.settings.get("battle-of-mytros", "battleSceneId");
    if (canvas.scene?.id !== battleSceneId) return;
    if (!region.name.startsWith(MytrosRegionManager.SECTION_PREFIX)) return;

    if (event.name === "tokenEnter" || event.name === "tokenExit") {
        // Find our active dashboard app and force a re-render
        for (const app of Object.values(ui.windows)) {
            if (app.id === "mytros-battle-dashboard") {
                app.render({ force: true });
            }
        }
    }
});
```

- [ ] **Step 3: Commit**
```bash
git add scripts/regions/region-manager.mjs scripts/module.mjs
git commit -m "feat: add region token retrieval and regionEvent hook for UI updates"
```

---

### Task 2: Expand Dashboard Context

**Files:**
- Modify: `scripts/apps/dashboard.mjs`

- [ ] **Step 1: Prepare Region Data for Template**
  Update `_prepareContext` to map over active sections, grabbing their flags and occupying legions.

```javascript
// Modify _prepareContext in scripts/apps/dashboard.mjs
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.isGM = game.user.isGM;
        context.round = game.settings.get("battle-of-mytros", "currentRound");
        context.phase = game.settings.get("battle-of-mytros", "currentPhase");
        
        // Grab regions if we are on the battle scene
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

- [ ] **Step 2: Ensure correct imports**
  (Make sure MytrosRegionManager is available in `dashboard.mjs`, or use the globalThis reference as done above).

- [ ] **Step 3: Commit**
```bash
git add scripts/apps/dashboard.mjs
git commit -m "feat: expand dashboard context with scene regions and occupying legions"
```

---

### Task 3: Update Dashboard Template

**Files:**
- Modify: `templates/dashboard.hbs`
- Create: `styles/battle-dashboard.css`
- Modify: `module.json` (to include the CSS)

- [ ] **Step 1: Create the new Template Layout**
  Update the HBS file to loop over `sections` and show the data.

```html
<!-- templates/dashboard.hbs -->
<div class="mytros-dashboard">
    <header class="dashboard-header">
        <h2>Round {{round}} - Phase {{phase}}</h2>
    </header>
    <main class="dashboard-body">
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
    </main>
</div>
```

- [ ] **Step 2: Add Basic Styles**
  Create a CSS file so it doesn't look like plain text.

```css
/* styles/battle-dashboard.css */
.mytros-dashboard .sections-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
    padding: 10px;
}
.mytros-dashboard .section-card {
    border: 1px solid var(--color-border-dark-primary);
    border-radius: 5px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.05);
}
.mytros-dashboard .section-card.control-allied { border-top: 3px solid #1a5276; }
.mytros-dashboard .section-card.control-sydon { border-top: 3px solid #7b241c; }
.mytros-dashboard .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(0,0,0,0.1);
    margin-bottom: 5px;
    padding-bottom: 5px;
}
.mytros-dashboard .section-header h3 { margin: 0; font-size: 1.1em; border: none; }
.mytros-dashboard .badge { margin-left: 5px; }
.mytros-dashboard .badge.fortified { color: #5dade2; }
.mytros-dashboard .badge.objective { color: #f1c40f; }
.mytros-dashboard .legion-item { font-weight: bold; }
.mytros-dashboard .legion-item.faction-allied { color: #1a5276; }
.mytros-dashboard .legion-item.faction-sydon { color: #7b241c; }
.mytros-dashboard .empty-state { font-style: italic; color: #777; margin: 0; }
```

- [ ] **Step 3: Register Stylesheet**
  Ensure `"styles": ["styles/battle-dashboard.css"]` is present in `module.json` (it already is, based on earlier reads, but verify).

- [ ] **Step 4: Commit**
```bash
git add templates/dashboard.hbs styles/battle-dashboard.css module.json
git commit -m "feat: render regions and occupying legions in dashboard UI"
```
