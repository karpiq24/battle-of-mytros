# Phase 3 Part 2: Tags & Combat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Commander Tag engine, execute Phase 2 (Charge) and Phase 3 (Clash), and calculate the final battle victor based on the rules in `system.md`.

**Architecture:** 
1. **Tag Engine:** Create a `TagEngine` utility that parses a legion's commander and returns active modifiers (advantage, flat bonuses) for a specific phase, considering conditions (like Morale > 6 or Fortified).
2. **Resolver State Machine:** Expand `BattleResolverApp` to progress through Phase 2 and Phase 3.
3. **PC Fast Response:** Add UI inputs to allow the GM to inject PC bonuses (+1d4, +1d6, +1d8) into specific rolls.
4. **Victory Calculation:** Tally counter points (+1 for Maneuver/Charge, +2 for Clash) and handle the Sudden Death Vitality tiebreaker.

**Tech Stack:** Foundry VTT V13 ApplicationV2 API, Handlebars, JS.

---

### Task 1: Commander Tag Engine

**Files:**
- Create: `scripts/utils/tag-engine.mjs`
- Modify: `scripts/module.mjs`

- [ ] **Step 1: Write Tag Engine Logic**
  Create a utility to calculate modifiers for a specific roll.

```javascript
// scripts/utils/tag-engine.mjs
export class TagEngine {
    /**
     * Calculates modifiers for a specific battle phase.
     * @param {Actor} legion The legion actor rolling.
     * @param {Actor} enemyLegion The opposing legion actor.
     * @param {string} phase "maneuver", "charge", or "clash"
     * @param {object} context Additional context { isFortified: boolean, enemyIsFortified: boolean, maneuverBenefit: string }
     * @returns {object} { advantage: boolean, disadvantage: boolean, flatBonus: number }
     */
    static getRollModifiers(legion, enemyLegion, phase, context = {}) {
        let mods = { advantage: false, disadvantage: false, flatBonus: 0 };
        
        // Fetch Commander Items (assuming tags are stored as Items on the Commander actor)
        const commanderId = legion.getFlag("battle-of-mytros", "commanderId");
        const commander = commanderId ? game.actors.get(commanderId) : null;
        const tags = commander ? commander.items.map(i => i.name.toLowerCase()) : [];

        const enemyCommanderId = enemyLegion.getFlag("battle-of-mytros", "commanderId");
        const enemyCommander = enemyCommanderId ? game.actors.get(enemyCommanderId) : null;
        const enemyTags = enemyCommander ? enemyCommander.items.map(i => i.name.toLowerCase()) : [];

        const stats = legion.getFlag("battle-of-mytros", "stats");

        // --- Check Allied Tags ---
        if (phase === "maneuver" && tags.includes("tactician")) mods.advantage = true;
        if (tags.includes("fanatic") && (phase === "charge" || phase === "clash")) mods.advantage = true;
        if (tags.includes("zealot") && stats.morale >= 6) mods.flatBonus += 2;
        if (phase === "clash" && tags.includes("ironclad")) mods.flatBonus += 2;
        if (phase === "charge" && tags.includes("inspiring")) mods.flatBonus += 2;
        if (phase === "maneuver" && tags.includes("cunning")) mods.flatBonus += 2;

        // --- Check Enemy Tags (Debuffs) ---
        if (phase === "clash" && enemyTags.includes("headhunter")) mods.disadvantage = true;
        if (enemyTags.includes("mage")) mods.flatBonus -= 1;
        
        // Engineer logic: Enemy suffers -2 if fighting this legion in a fortified section
        const siegeBreaker = tags.includes("siege breaker");
        if (enemyTags.includes("engineer") && context.enemyIsFortified && !siegeBreaker) {
            mods.flatBonus -= 2;
        }

        // --- Section Fortification ---
        if (context.isFortified && !enemyTags.includes("siege breaker")) {
            mods.flatBonus += 1;
        }

        // --- Maneuver Benefits ---
        if (phase === "charge" && context.maneuverBenefit === "flanking") mods.flatBonus += 2; // Assuming +1d4 averages to +2 for simplicity in UI
        if (phase === "clash" && context.maneuverBenefit === "defensive") mods.flatBonus += 1; // Assuming +1d2 averages to +1
        if (context.enemyManeuverBenefit === "disrupted" && (phase === "charge" || phase === "clash")) mods.flatBonus -= 1;

        return mods;
    }
}
```

- [ ] **Step 2: Export TagEngine**

```javascript
// Add to scripts/module.mjs
import { TagEngine } from "./utils/tag-engine.mjs";
globalThis.TagEngine = TagEngine;
```

- [ ] **Step 3: Commit**
```bash
git add scripts/utils/tag-engine.mjs scripts/module.mjs
git commit -m "feat: implement commander TagEngine logic"
```

---

### Task 2: Phase 2 (Charge) & Phase 3 (Clash)

**Files:**
- Modify: `scripts/apps/resolver.mjs`
- Modify: `templates/resolver.hbs`

- [ ] **Step 1: Update runManeuver to use TagEngine**
  Refactor `runManeuver` to apply `TagEngine.getRollModifiers`.

```javascript
// Update runManeuver in scripts/apps/resolver.mjs
    static async runManeuver(event, target) {
        // Build Context
        const alliedIsFortified = this.region.getFlag("battle-of-mytros", "control") === "allied" && this.region.getFlag("battle-of-mytros", "fortified");
        const sydonIsFortified = this.region.getFlag("battle-of-mytros", "control") === "sydon" && this.region.getFlag("battle-of-mytros", "fortified");

        const alliedMods = globalThis.TagEngine.getRollModifiers(this.state.allied, this.state.sydon, "maneuver", { isFortified: alliedIsFortified, enemyIsFortified: sydonIsFortified });
        const sydonMods = globalThis.TagEngine.getRollModifiers(this.state.sydon, this.state.allied, "maneuver", { isFortified: sydonIsFortified, enemyIsFortified: alliedIsFortified });

        const alliedStats = this.state.allied.getFlag("battle-of-mytros", "stats");
        const sydonStats = this.state.sydon.getFlag("battle-of-mytros", "stats");

        const alliedRoll = await globalThis.BattleRoller.executeRoll(alliedStats.wit, alliedMods.flatBonus, alliedMods.advantage, alliedMods.disadvantage);
        const sydonRoll = await globalThis.BattleRoller.executeRoll(sydonStats.wit, sydonMods.flatBonus, sydonMods.advantage, sydonMods.disadvantage);
        
        // ... rest of logic remains the same
```

- [ ] **Step 2: Add `runCharge` Method**

```javascript
// Add to scripts/apps/resolver.mjs
    static async runCharge(event, target) {
        const alliedIsFortified = this.region.getFlag("battle-of-mytros", "control") === "allied" && this.region.getFlag("battle-of-mytros", "fortified");
        const sydonIsFortified = this.region.getFlag("battle-of-mytros", "control") === "sydon" && this.region.getFlag("battle-of-mytros", "fortified");

        const aContext = { 
            isFortified: alliedIsFortified, enemyIsFortified: sydonIsFortified, 
            maneuverBenefit: this.state.maneuverWinner === "allied" ? this.state.maneuverBenefit : null,
            enemyManeuverBenefit: this.state.maneuverWinner === "sydon" ? this.state.maneuverBenefit : null
        };
        const sContext = { 
            isFortified: sydonIsFortified, enemyIsFortified: alliedIsFortified, 
            maneuverBenefit: this.state.maneuverWinner === "sydon" ? this.state.maneuverBenefit : null,
            enemyManeuverBenefit: this.state.maneuverWinner === "allied" ? this.state.maneuverBenefit : null
        };

        const alliedMods = globalThis.TagEngine.getRollModifiers(this.state.allied, this.state.sydon, "charge", aContext);
        const sydonMods = globalThis.TagEngine.getRollModifiers(this.state.sydon, this.state.allied, "charge", sContext);

        const aStats = this.state.allied.getFlag("battle-of-mytros", "stats");
        const sStats = this.state.sydon.getFlag("battle-of-mytros", "stats");

        const aRoll = await globalThis.BattleRoller.executeRoll(aStats.morale, alliedMods.flatBonus, alliedMods.advantage, alliedMods.disadvantage);
        const sRoll = await globalThis.BattleRoller.executeRoll(sStats.morale, sydonMods.flatBonus, sydonMods.advantage, sydonMods.disadvantage);

        this.state.log.push(`Allied Charge (Morale): ${aRoll.total}`);
        this.state.log.push(`Sydon Charge (Morale): ${sRoll.total}`);

        if (aRoll.total > sRoll.total) {
            this.state.log.push("Allied won Charge! (+1 Clash)");
            this.state.counter.allied += 1;
            this.state.chargeWinner = "allied";
        } else if (sRoll.total > aRoll.total) {
            this.state.log.push("Sydon won Charge! (+1 Clash)");
            this.state.counter.sydon += 1;
            this.state.chargeWinner = "sydon";
        } else {
            this.state.log.push("Charge Tied!");
            this.state.chargeWinner = "tie";
        }

        // Apply Nat20 / Nat1 rules
        if (aRoll.isNat20 && aRoll.total > sRoll.total) this.state.counter.allied += 1;
        if (sRoll.isNat20 && sRoll.total > aRoll.total) this.state.counter.sydon += 1;
        if (aRoll.isNat1 && sRoll.total > aRoll.total) this.state.counter.allied -= 1;
        if (sRoll.isNat1 && aRoll.total > sRoll.total) this.state.counter.sydon -= 1;

        this.state.phase = "clash";
        this.render();
    }
```

- [ ] **Step 3: Update Template**

```html
<!-- templates/resolver.hbs -->
            {{#if (eq state.phase 'charge')}}
                <button type="button" data-action="runCharge">Roll Phase 2: Charge</button>
            {{/if}}
            {{#if (eq state.phase 'clash')}}
                <button type="button" data-action="runClash">Roll Phase 3: Clash</button>
            {{/if}}
```

- [ ] **Step 4: Register Action**
  Add `runCharge` and `runClash` to `BattleResolverApp.DEFAULT_OPTIONS.actions`.

- [ ] **Step 5: Commit**
```bash
git add scripts/apps/resolver.mjs templates/resolver.hbs
git commit -m "feat: implement Phase 2 Charge and tag engine integration"
```

---

### Task 3: Phase 3 (Clash) & Victory

**Files:**
- Modify: `scripts/apps/resolver.mjs`
- Modify: `templates/resolver.hbs`

- [ ] **Step 1: Implement runClash**

```javascript
// Add to scripts/apps/resolver.mjs
    static async runClash(event, target) {
        const alliedIsFortified = this.region.getFlag("battle-of-mytros", "control") === "allied" && this.region.getFlag("battle-of-mytros", "fortified");
        const sydonIsFortified = this.region.getFlag("battle-of-mytros", "control") === "sydon" && this.region.getFlag("battle-of-mytros", "fortified");

        const aContext = { maneuverBenefit: this.state.maneuverWinner === "allied" ? this.state.maneuverBenefit : null, enemyManeuverBenefit: this.state.maneuverWinner === "sydon" ? this.state.maneuverBenefit : null, isFortified: alliedIsFortified, enemyIsFortified: sydonIsFortified };
        const sContext = { maneuverBenefit: this.state.maneuverWinner === "sydon" ? this.state.maneuverBenefit : null, enemyManeuverBenefit: this.state.maneuverWinner === "allied" ? this.state.maneuverBenefit : null, isFortified: sydonIsFortified, enemyIsFortified: alliedIsFortified };

        const aMods = globalThis.TagEngine.getRollModifiers(this.state.allied, this.state.sydon, "clash", aContext);
        const sMods = globalThis.TagEngine.getRollModifiers(this.state.sydon, this.state.allied, "clash", sContext);

        if (this.state.chargeWinner === "allied") aMods.flatBonus += 1;
        if (this.state.chargeWinner === "sydon") sMods.flatBonus += 1;

        const aStats = this.state.allied.getFlag("battle-of-mytros", "stats");
        const sStats = this.state.sydon.getFlag("battle-of-mytros", "stats");

        const aRoll = await globalThis.BattleRoller.executeRoll(aStats.vitality, aMods.flatBonus, aMods.advantage, aMods.disadvantage);
        const sRoll = await globalThis.BattleRoller.executeRoll(sStats.vitality, sMods.flatBonus, sMods.advantage, sMods.disadvantage);

        this.state.log.push(`Allied Clash (Vitality): ${aRoll.total}`);
        this.state.log.push(`Sydon Clash (Vitality): ${sRoll.total}`);

        if (aRoll.total > sRoll.total) {
            this.state.log.push("Allied won Clash!");
            this.state.counter.allied += 2;
        } else if (sRoll.total > aRoll.total) {
            this.state.log.push("Sydon won Clash!");
            this.state.counter.sydon += 2;
        }

        // Apply Nat20 / Nat1 rules
        if (aRoll.isNat20 && aRoll.total > sRoll.total) this.state.counter.allied += 1;
        if (sRoll.isNat20 && sRoll.total > aRoll.total) this.state.counter.sydon += 1;
        if (aRoll.isNat1 && sRoll.total > aRoll.total) this.state.counter.allied -= 1;
        if (sRoll.isNat1 && aRoll.total > sRoll.total) this.state.counter.sydon -= 1;

        this.state.log.push(`FINAL SCORE - Allied: ${this.state.counter.allied} | Sydon: ${this.state.counter.sydon}`);

        if (this.state.counter.allied > this.state.counter.sydon) {
            this.state.log.push(">>> ALLIED LEGION WINS THE BATTLE <<<");
            this.state.overallWinner = "allied";
        } else if (this.state.counter.sydon > this.state.counter.allied) {
            this.state.log.push(">>> SYDON LEGION WINS THE BATTLE <<<");
            this.state.overallWinner = "sydon";
        } else {
            this.state.log.push(">>> BATTLE TIED! Sudden Death Required. <<<");
            this.state.phase = "tiebreaker";
            this.render();
            return;
        }

        this.state.phase = "aftermath";
        this.render();
    }
```

- [ ] **Step 2: Update Template for Aftermath**

```html
<!-- templates/resolver.hbs -->
            {{#if (eq state.phase 'aftermath')}}
                <h3>Battle Resolved!</h3>
                <p>Winner: {{state.overallWinner}}</p>
                <button type="button">Proceed to Aftermath (Coming soon)</button>
            {{/if}}
            {{#if (eq state.phase 'tiebreaker')}}
                <h3>Tiebreaker: Sudden Death Vitality Roll Needed</h3>
                <button type="button">Roll Tiebreaker (Coming soon)</button>
            {{/if}}
```

- [ ] **Step 3: Commit**
```bash
git add scripts/apps/resolver.mjs templates/resolver.hbs
git commit -m "feat: implement Phase 3 Clash and victory calculation"
```
