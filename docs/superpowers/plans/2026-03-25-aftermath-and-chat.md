# Phase 4 Aftermath & Chat Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 4 aftermath checks, automate legion stat updates, and create summary chat cards.

**Architecture:** 
1. **Persistence:** Save battle results to region flags (`battleResult`). Show "Resolve Aftermath" button on Dashboard.
2. **Aftermath Engine:** New `BattleAftermathApp` for Recovery, Hope, Salvage, and Casualty rolls.
3. **Automation:** Update actor flags (Morale/Injuries) and implement "End Round" passive recovery logic.
4. **Chat:** Create summary chat cards for battle outcomes.

**Tech Stack:** Foundry VTT V13 ApplicationV2 API, Handlebars, JavaScript.

---

### Task 1: Battle Persistence & Dashboard Integration

**Files:**
- Modify: `scripts/apps/resolver.mjs`
- Modify: `scripts/apps/dashboard.mjs`
- Modify: `templates/dashboard.hbs`

- [ ] **Step 1: Save result to region flag in `BattleResolverApp`**
  Modify `runClash` to save results (winner, scores, participant IDs) and close the resolver.

- [ ] **Step 2: Detect pending aftermath in `BattleDashboard._prepareContext`**
  Check region flags for incomplete `battleResult`.

- [ ] **Step 3: Update `templates/dashboard.hbs` to show "Resolve Aftermath"**
  Replace the battle button with the aftermath button when a result is pending.

- [ ] **Step 4: Commit**
```bash
git add scripts/apps/resolver.mjs scripts/apps/dashboard.mjs templates/dashboard.hbs
git commit -m "feat: implement battle result persistence and aftermath dashboard trigger"
```

---

### Task 2: Aftermath App Scaffold & Recovery Check

**Files:**
- Create: `scripts/apps/aftermath.mjs`
- Create: `templates/aftermath.hbs`
- Modify: `scripts/apps/dashboard.mjs`

- [ ] **Step 1: Scaffold `BattleAftermathApp`**
  Basic ApplicationV2 setup fetching data from the region's `battleResult`.

- [ ] **Step 2: Implement Recovery Check logic**
  Automate DC calculation (12 + injuries) and apply Medic/Ironclad/Support bonuses.

- [ ] **Step 3: Commit**
```bash
git add scripts/apps/aftermath.mjs templates/aftermath.hbs scripts/apps/dashboard.mjs
git commit -m "feat: scaffold Aftermath app and implement Recovery check"
```

---

### Task 3: Hope, Salvage, and Casualty Logic

**Files:**
- Modify: `scripts/apps/aftermath.mjs`
- Modify: `templates/aftermath.hbs`

- [ ] **Step 1: Implement Hope Check logic**
  DC 12. Handle morale +/-. Automate "Rout" status if Morale drops to 0.

- [ ] **Step 2: Implement Salvage Check logic**
  DC 12. Present buttons for GM to select benefit on success.

- [ ] **Step 3: Implement Commander Casualty Check**
  Automate d100 math: `Base Chance (6/12/20) - Morale`. Handle Headhunter/Divine Blood.

- [ ] **Step 4: Commit**
```bash
git add scripts/apps/aftermath.mjs templates/aftermath.hbs
git commit -m "feat: implement Hope, Salvage, and Casualty logic"
```

---

### Task 4: Chat Integration & End Round

**Files:**
- Create: `templates/chat-card.hbs`
- Modify: `scripts/apps/aftermath.mjs`
- Modify: `scripts/apps/dashboard.mjs`

- [ ] **Step 1: Implement `postToChat()`**
  Create a summary card using `templates/chat-card.hbs`.

- [ ] **Step 2: Implement "End Round" logic on Dashboard Setup tab**
  Iterate all legions. If no battle occurred, apply passive recovery (+1 Morale, -1 Injury). Increment round. Clear region results.

- [ ] **Step 3: Commit**
```bash
git add templates/chat-card.hbs scripts/apps/aftermath.mjs scripts/apps/dashboard.mjs
git commit -m "feat: implement chat summary and end-round logic"
```

---

### Task 5: Final Validation

- [ ] **Step 1: Verify aftermath button flow.**
- [ ] **Step 2: Verify all 4 checks update legion stats correctly.**
- [ ] **Step 3: Verify chat card output.**
- [ ] **Step 4: Verify End Round passive recovery automation.**
