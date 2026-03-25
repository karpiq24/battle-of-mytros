# Spec: Phase 4 Aftermath & Chat Integration

**Date:** 2026-03-25
**Status:** Approved

## Goal
Implement the 4 aftermath checks (Recovery, Hope, Salvage, Casualty), automate consequence updates for legions, and create summary chat cards.

## Architecture

### 1. Aftermath Context Persistence
- **Trigger:** `BattleResolverApp` saves results to a region flag: `battle-of-mytros.battleResult`.
- **Data:** `winner`, `loser`, `alliedScore`, `sydonScore`, `isComplete` (false until aftermath is done).
- **Dashboard:** If `isComplete` is false, show "Resolve Aftermath" button.

### 2. Aftermath Resolver (`scripts/apps/aftermath.mjs`)
- **UI:** A specialized tabbed or sequential interface for the 4 checks.
- **Roll Logic:**
    - **Recovery (Vitality):** vs DC (12 + current injuries). Apply tags (`Medic`, `Ironclad`, `Brutal`) and PC `Shield the Wounded` (+1d8).
    - **Hope (Morale):** vs DC 12. Apply tags (`Inspiring`, `Rallier`, `Terrorizer`). Handle `Rout` at 0 Morale.
    - **Salvage (Wit):** vs DC 12. Success allows selecting one benefit.
    - **Casualty (d100):** `Base Chance (6%/12%/20%) - Morale Protection`. Apply `Headhunter` and `Divine Blood`.
- **Completion:** Updates Legion Actor stats (Injuries/Morale) and sets `isComplete = true` on the region flag.

### 3. Chat Integration
- **Template:** `templates/chat-card.hbs`.
- **Content:** Stylized summary of the engagement, aftermath results, and any commander deaths.

### 4. Round Advancement Logic
- **UI:** "End Round" button on Dashboard Setup tab.
- **Automation:**
    - Find all Legions that did NOT have a `battleResult` flag on their current region this round.
    - Apply +1 Morale and -1 Injury (Passive Recovery).
    - Accumulate `deathToll` from destroyed strategic objectives.
    - Clear all `battleResult` flags from regions for the next round.

## Technical Details

### Dashboard (`scripts/apps/dashboard.mjs`)
- `_prepareContext` to detect pending aftermaths.
- `openAftermath` action.
- `endRound` action.

### Aftermath (`scripts/apps/aftermath.mjs`)
- Logic to update actor flags based on roll outcomes.

## Success Criteria
1. "Resolve Aftermath" button correctly initiates the sequence.
2. All 4 checks correctly incorporate tags and support bonuses.
3. Legion stats are automatically updated based on results.
4. Chat card provides a clear, narrative-friendly summary.
5. Passive recovery works correctly for unengaged units.
