# Spec: Phase 3 PC & Enemy Fast Response Integration

**Date:** 2026-03-25
**Status:** Approved

## Goal
Automate the application of "Fast Response" bonuses (PCs and special units) to battle resolutions by detecting tokens within map sections and allowing deployment mode selection.

## Architecture

### 1. Support Unit Detection
- **Logic:** Extend `MytrosRegionManager` to identify non-legion tokens in a section.
- **Classification:** 
    - **PCs:** Any token linked to a User.
    - **Special Units:** Any actor with the `isFastResponse` flag set to `true`.
- **UI:** These units appear in the `Overview` tab under a "Support" header for each section card.

### 2. Deployment Selection (GM Only)
- **Phase Constraint:** Deployment mode selection is only enabled when `game.settings.currentPhase` is `3` (Fast Response Phase).
- **UI:** A `<select>` dropdown next to each support unit token in the dashboard.
- **Data:** Modes include `reinforce`, `shock_assault`, `targeted_strike`, `shield_the_wounded`, and `protect`.
- **Storage:** Mode is stored as a flag on the **Token** (`battle-of-mytros.deploymentMode`).

### 3. Resolver Automation
- **Detection:** `BattleResolverApp` scans for support tokens in its region on init.
- **Bonus Application:**
    - `reinforce`: Add `+1d4` to all rolls (Maneuver, Charge, Clash, Aftermath).
    - `shock_assault`: Add `+1d6` to battle rolls only.
    - `targeted_strike`: Add `+1d8` and Advantage to a specific roll (GM selects which phase during the resolver flow).
    - `shield_the_wounded`: Add `+1d8` to aftermath rolls.
    - `protect`: Flag to skip the Commander Casualty check in Phase 5.

## Technical Details

### Dashboard (`scripts/apps/dashboard.mjs`)
- `_prepareContext` logic to filter tokens and include deployment modes.
- `setDeploymentMode` action to update token flags.

### Resolver (`scripts/apps/resolver.mjs`)
- Tally support bonuses into the `state`.
- Update roll methods to include bonus dice in `BattleRoller.executeRoll`.

### Actor Data (`scripts/models/actor-data.mjs`)
- `initFastResponse(actor)` helper to mark special units.

## Success Criteria
1. Tokens placed in a section are recognized as support units.
2. GM can set deployment modes during Phase 3.
3. Resolver correctly applies stacking bonus dice to all relevant rolls.
