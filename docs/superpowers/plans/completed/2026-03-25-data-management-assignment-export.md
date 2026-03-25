# Phase 2 Data Management (Assignment & Export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement commander assignment via the dashboard and CSV export for legions and commanders.

**Architecture:** 
1. **Commander Assignment:** Add a dropdown to each legion's card in the `Overview` tab (GM only). Update the `commanderId` flag on the legion actor. Use `updateActor` hooks to sync changes across all clients.
2. **CSV Export:** Add "Export Legions" and "Export Commanders" buttons to the `Setup` tab. Implement `exportToCSV` methods in `MytrosCSVParser`.

**Tech Stack:** Foundry VTT V13 ApplicationV2 API, Handlebars, JavaScript.

---

### Task 1: Prepare Dashboard Context & Templates

**Files:**
- Modify: `scripts/apps/dashboard.mjs`
- Modify: `templates/dashboard.hbs`

- [ ] **Step 1: Fetch commanders in `_prepareContext`**
  Modify `scripts/apps/dashboard.mjs` to include all commander actors in the template context and update legion mapping to include commander info.

- [ ] **Step 2: Add Commander Assignment UI to `templates/dashboard.hbs`**
  Update the legion list item to show a dropdown for the GM and text for players.

- [ ] **Step 3: Register `assignCommander` action in `BattleDashboard`**
  Add the action to `DEFAULT_OPTIONS` and implement the static method.

- [ ] **Step 4: Commit**
```bash
git add scripts/apps/dashboard.mjs templates/dashboard.hbs
git commit -m "feat: add commander assignment UI and logic to dashboard"
```

---

### Task 2: Implement Synchronization & Cleanup Hooks

**Files:**
- Modify: `scripts/module.mjs`

- [ ] **Step 1: Add `updateActor` hook for real-time sync**
  Ensure the dashboard re-renders for everyone when a legion's flags change.

- [ ] **Step 2: Add `deleteActor` hook for cleanup**
  If a commander actor is deleted, remove their ID from any legions leading.

- [ ] **Step 3: Commit**
```bash
git add scripts/module.mjs
git commit -m "feat: add actor update and delete hooks for dashboard sync"
```

---

### Task 3: CSV Export Engine

**Files:**
- Modify: `scripts/utils/csv-parser.mjs`
- Modify: `scripts/apps/dashboard.mjs`
- Modify: `templates/dashboard.hbs`

- [ ] **Step 1: Implement `exportLegions` and `exportCommanders` in `MytrosCSVParser`**
  Add CSV generation and download logic.

- [ ] **Step 2: Add export actions to `BattleDashboard`**
  Connect UI buttons to the parser methods.

- [ ] **Step 3: Add buttons to `templates/dashboard.hbs`**
  Update the `Setup` tab with export buttons.

- [ ] **Step 4: Commit**
```bash
git add scripts/utils/csv-parser.mjs scripts/apps/dashboard.mjs templates/dashboard.hbs
git commit -m "feat: implement CSV export for legions and commanders"
```

---

### Task 4: Final Validation

- [ ] **Step 1: Verify Assignment sync**
  Ensure commander changes reflect on all clients.

- [ ] **Step 2: Verify CSV Export content**
  Check exported files for accuracy.

- [ ] **Step 3: Verify Actor Deletion safety**
  Ensure no stale commander references remain after deletion.
