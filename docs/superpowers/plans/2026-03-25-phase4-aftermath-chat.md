# Phase 4: Aftermath & Chat Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate the 4 Aftermath checks (Recovery, Hope, Salvage, Casualty) and output the dramatic results as a stylized Chat Message to the players.

**Architecture:** 
1. **Aftermath Engine:** Extend `BattleResolverApp` to sequentially process the Aftermath phases based on the `overallWinner` calculated in Phase 3.
2. **Actor Data Mutations:** Directly apply injury adjustments, morale changes, and casualty results to the Legion Actors in the database.
3. **Chat Broadcast:** Assemble a final HTML summary of the engagement (Phases 1-3 scores, Aftermath results, casualties) and create a Foundry `ChatMessage` document.

**Tech Stack:** Foundry VTT V13 ApplicationV2 API, Handlebars templates (for chat cards), JS.

---

### Task 1: Aftermath - Recovery & Hope Checks

**Files:**
- Modify: `scripts/apps/resolver.mjs`
- Modify: `templates/resolver.hbs`

- [ ] **Step 1: Write `runAftermath` Method (Recovery & Hope)**
  Calculate injuries and morale based on the DCs in `system.md`.

```javascript
// Add to scripts/apps/resolver.mjs
    static async runAftermath(event, target) {
        this.state.phase = "processing_aftermath";
        this.render();

        const aStats = this.state.allied.getFlag("battle-of-mytros", "stats");
        const sStats = this.state.sydon.getFlag("battle-of-mytros", "stats");
        
        const aWon = this.state.overallWinner === "allied";
        const sWon = this.state.overallWinner === "sydon";

        // Tags to consider: Medic, Brutal, Fanatic, Rallier, Terrorizer
        // For brevity in the plan, assume basic DC checks first
        
        // 1. Recovery Check (Vitality vs DC 12 + injuries)
        const aRecRoll = await globalThis.BattleRoller.executeRoll(aStats.vitality);
        const sRecRoll = await globalThis.BattleRoller.executeRoll(sStats.vitality);
        
        const aRecDC = 12 + (aStats.injuries || 0);
        const sRecDC = 12 + (sStats.injuries || 0);

        let aInjuriesTaken = 0;
        let sInjuriesTaken = 0;

        if (aRecRoll.total >= aRecDC) { aInjuriesTaken = aWon ? 0 : 1; } 
        else { aInjuriesTaken = aWon ? 1 : 2; }

        if (sRecRoll.total >= sRecDC) { sInjuriesTaken = sWon ? 0 : 1; } 
        else { sInjuriesTaken = sWon ? 1 : 2; }

        this.state.log.push(`Allied Recovery (${aRecRoll.total} vs ${aRecDC}): Takes ${aInjuriesTaken} injuries.`);
        this.state.log.push(`Sydon Recovery (${sRecRoll.total} vs ${sRecDC}): Takes ${sInjuriesTaken} injuries.`);

        // Apply Injuries
        await this.state.allied.setFlag("battle-of-mytros", "stats.injuries", (aStats.injuries || 0) + aInjuriesTaken);
        await this.state.sydon.setFlag("battle-of-mytros", "stats.injuries", (sStats.injuries || 0) + sInjuriesTaken);

        // 2. Hope Check (Morale vs DC 12)
        const aHopeRoll = await globalThis.BattleRoller.executeRoll(aStats.morale);
        const sHopeRoll = await globalThis.BattleRoller.executeRoll(sStats.morale);

        let aMoraleChange = 0;
        let sMoraleChange = 0;

        if (aHopeRoll.total >= 12) { aMoraleChange = aWon ? 2 : -1; }
        else { aMoraleChange = aWon ? 1 : -2; }

        if (sHopeRoll.total >= 12) { sMoraleChange = sWon ? 2 : -1; }
        else { sMoraleChange = sWon ? 1 : -2; }

        this.state.log.push(`Allied Hope (${aHopeRoll.total} vs 12): Morale change ${aMoraleChange}`);
        this.state.log.push(`Sydon Hope (${sHopeRoll.total} vs 12): Morale change ${sMoraleChange}`);

        // Apply Morale (Clamp between 0 and 10)
        await this.state.allied.setFlag("battle-of-mytros", "stats.morale", Math.max(0, Math.min(10, aStats.morale + aMoraleChange)));
        await this.state.sydon.setFlag("battle-of-mytros", "stats.morale", Math.max(0, Math.min(10, sStats.morale + sMoraleChange)));

        this.state.phase = "salvage";
        this.render();
    }
```

- [ ] **Step 2: Add Action and Update Template**

```javascript
// Add to actions in scripts/apps/resolver.mjs
    runAftermath: BattleResolverApp.runAftermath
```

```html
<!-- Update template -->
            {{#if (eq state.phase 'aftermath')}}
                <h3>Battle Resolved!</h3>
                <p>Winner: {{state.overallWinner}}</p>
                <button type="button" data-action="runAftermath">Execute Recovery & Hope Checks</button>
            {{/if}}
            {{#if (eq state.phase 'salvage')}}
                <p>Salvage Phase implementation pending.</p>
            {{/if}}
```

- [ ] **Step 3: Commit**
```bash
git add scripts/apps/resolver.mjs templates/resolver.hbs
git commit -m "feat: implement Phase 4 Aftermath Recovery and Hope checks"
```

---

### Task 2: Salvage & Commander Casualties

**Files:**
- Modify: `scripts/apps/resolver.mjs`
- Modify: `templates/resolver.hbs`

- [ ] **Step 1: Write Salvage & Casualty Logic**

```javascript
// Add to scripts/apps/resolver.mjs
    static async runCasualties(event, target) {
        // 1. Salvage (Simplified for now: auto-roll, skip choice UI to maintain flow speed)
        const aStats = this.state.allied.getFlag("battle-of-mytros", "stats");
        const sStats = this.state.sydon.getFlag("battle-of-mytros", "stats");
        
        const aSalRoll = await globalThis.BattleRoller.executeRoll(aStats.wit);
        const sSalRoll = await globalThis.BattleRoller.executeRoll(sStats.wit);
        this.state.log.push(`Allied Salvage: ${aSalRoll.total >= 12 ? 'Success' : 'Fail'} | Sydon Salvage: ${sSalRoll.total >= 12 ? 'Success' : 'Fail'}`);

        // 2. Commander Casualties (d100)
        const aWon = this.state.overallWinner === "allied";
        const aBaseDeath = aWon ? 6 : (this.state.counter.sydon - this.state.counter.allied >= 3 ? 20 : 12);
        const sBaseDeath = !aWon ? 6 : (this.state.counter.allied - this.state.counter.sydon >= 3 ? 20 : 12);

        // Fetch CURRENT morale (after Hope checks) for protection
        const aMorale = this.state.allied.getFlag("battle-of-mytros", "stats").morale;
        const sMorale = this.state.sydon.getFlag("battle-of-mytros", "stats").morale;

        const aTarget = Math.max(1, aBaseDeath - aMorale);
        const sTarget = Math.max(1, sBaseDeath - sMorale);

        const aD100 = (await new Roll("1d100").evaluate()).total;
        const sD100 = (await new Roll("1d100").evaluate()).total;

        if (aD100 <= aTarget) {
            this.state.log.push(`*** ALLIED COMMANDER DIES! (Rolled ${aD100} <= Target ${aTarget}) ***`);
            this.state.alliedCommanderDead = true;
        } else {
            this.state.log.push(`Allied Commander survives (Rolled ${aD100} > Target ${aTarget})`);
        }

        if (sD100 <= sTarget) {
            this.state.log.push(`*** SYDON COMMANDER DIES! (Rolled ${sD100} <= Target ${sTarget}) ***`);
            this.state.sydonCommanderDead = true;
        } else {
            this.state.log.push(`Sydon Commander survives (Rolled ${sD100} > Target ${sTarget})`);
        }

        this.state.phase = "complete";
        this.render();
    }
```

- [ ] **Step 2: Update Actions and Template**

```javascript
// Add action
    runCasualties: BattleResolverApp.runCasualties
```

```html
<!-- Update template -->
            {{#if (eq state.phase 'salvage')}}
                <button type="button" data-action="runCasualties">Roll Salvage & Casualties</button>
            {{/if}}
            {{#if (eq state.phase 'complete')}}
                <h3>Engagement Complete</h3>
                <button type="button" data-action="broadcastToChat">Broadcast Results to Chat</button>
            {{/if}}
```

- [ ] **Step 3: Commit**
```bash
git add scripts/apps/resolver.mjs templates/resolver.hbs
git commit -m "feat: implement Salvage rolls and Commander Casualty d100 math"
```

---

### Task 3: Chat Broadcast Engine

**Files:**
- Create: `templates/chat/battle-summary.hbs`
- Modify: `scripts/apps/resolver.mjs`

- [ ] **Step 1: Create Chat Template**

```html
<!-- templates/chat/battle-summary.hbs -->
<div class="mytros-chat-card">
    <header class="chat-header">
        <h3>Battle in {{regionName}}</h3>
        <p>{{alliedName}} vs {{sydonName}}</p>
    </header>
    <div class="chat-body">
        <h4>Winner: {{winner}}</h4>
        <p><strong>Score:</strong> Allied {{counter.allied}} - {{counter.sydon}} Sydon</p>
        <hr>
        <h4>Casualties</h4>
        {{#if alliedCommanderDead}}<p class="death">💀 The Allied Commander has fallen!</p>{{/if}}
        {{#if sydonCommanderDead}}<p class="death">💀 The Sydon Commander has fallen!</p>{{/if}}
        {{#unless alliedCommanderDead}}{{#unless sydonCommanderDead}}
            <p>Both commanders survived the engagement.</p>
        {{/unless}}{{/unless}}
    </div>
</div>
```

- [ ] **Step 2: Implement `broadcastToChat`**

```javascript
// Add to scripts/apps/resolver.mjs
    static async broadcastToChat(event, target) {
        const templateData = {
            regionName: this.region.name.replace(globalThis.MytrosRegionManager.SECTION_PREFIX, "").trim(),
            alliedName: this.state.allied.name,
            sydonName: this.state.sydon.name,
            winner: this.state.overallWinner === 'allied' ? "Allied Legion" : "Sydon's Forces",
            counter: this.state.counter,
            alliedCommanderDead: this.state.alliedCommanderDead,
            sydonCommanderDead: this.state.sydonCommanderDead
        };

        const html = await renderTemplate("modules/battle-of-mytros/templates/chat/battle-summary.hbs", templateData);

        await ChatMessage.create({
            content: html,
            speaker: ChatMessage.getSpeaker({alias: "Battle of Mytros"}),
            type: CONST.CHAT_MESSAGE_TYPES.OTHER
        });

        // Close resolver
        this.close();
    }
```

- [ ] **Step 3: Update CSS**
Add basic styling for the chat card in `styles/battle-dashboard.css`.
```css
.mytros-chat-card .chat-header { border-bottom: 2px solid #333; margin-bottom: 5px; }
.mytros-chat-card .death { color: #c0392b; font-weight: bold; }
```

- [ ] **Step 4: Commit**
```bash
git add scripts/apps/resolver.mjs templates/chat/battle-summary.hbs styles/battle-dashboard.css
git commit -m "feat: implement ChatMessage broadcast for battle summary"
```
