# Phase 3 Fast Response Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement automated support unit detection, deployment selection on the dashboard, and roll bonus integration in the resolver.

**Architecture:** 
1. **Detection:** Update `MytrosRegionManager` to identify PCs and special units (`isFastResponse`) in sections.
2. **Dashboard UI:** Add a "Support" list to section cards on the `Overview` tab with deployment mode dropdowns enabled in Phase 3.
3. **Resolver Engine:** Update `BattleRoller` to handle bonus dice (1d4, 1d6, 1d8) and `BattleResolverApp` to tally and apply them.

**Tech Stack:** Foundry VTT V13 ApplicationV2 API, Handlebars, JavaScript.

---

### Task 1: Actor Data & Detection Logic

**Files:**
- Modify: `scripts/models/actor-data.mjs`
- Modify: `scripts/regions/region-manager.mjs`

- [ ] **Step 1: Add `isFastResponse` helpers to `MytrosActorData`**
  Add detection logic for PCs (`actor.hasPlayerOwner`) and special units (flag `isFastResponse`).

- [ ] **Step 2: Add `getSupportUnitsInSection` to `MytrosRegionManager`**
  Filter tokens in a region to return those with fast response actors.

- [ ] **Step 3: Commit**
```bash
git add scripts/models/actor-data.mjs scripts/regions/region-manager.mjs
git commit -m "feat: add support unit detection logic"
```

---

### Task 2: Dashboard UI & Deployment Selection

**Files:**
- Modify: `scripts/apps/dashboard.mjs`
- Modify: `templates/dashboard.hbs`

- [ ] **Step 1: Update `_prepareContext` for support units**
  Map tokens in sections to include their `deploymentMode` flag.

- [ ] **Step 2: Update `templates/dashboard.hbs`**
  Add the "Support" section to the cards. Show dropdown for GM in Phase 3, text badges otherwise.

- [ ] **Step 3: Add `setDeploymentMode` action to Dashboard**
  Register the action and implement the flag update on the token.

- [ ] **Step 4: Commit**
```bash
git add scripts/apps/dashboard.mjs templates/dashboard.hbs
git commit -m "feat: implement support unit deployment UI on dashboard"
```

---

### Task 3: Resolver & Roller Integration

**Files:**
- Modify: `scripts/utils/battle-roller.mjs`
- Modify: `scripts/apps/resolver.mjs`

- [ ] **Step 1: Update `BattleRoller.executeRoll` to accept bonus dice**
  Update the formula builder to append `+ 1d4`, `+ 1d6`, etc.

- [ ] **Step 2: Update `BattleResolverApp` to tally support bonuses**
  Implement logic to collect bonuses based on the unit's faction and selected mode.

- [ ] **Step 3: Integrate into battle phases**
  Pass collected bonus dice and advantage to the roll calls in `runManeuver`, `runCharge`, and `runClash`.

- [ ] **Step 4: Commit**
```bash
git add scripts/utils/battle-roller.mjs scripts/apps/resolver.mjs
git commit -m "feat: integrate support bonus dice into battle resolution"
```

---

### Task 4: Final Validation

- [ ] **Step 1: Verify token detection on dashboard.**
- [ ] **Step 2: Verify deployment selection during Phase 3.**
- [ ] **Step 3: Verify Resolver correctly includes 1d4/1d6/1d8 dice in battle logs.**
