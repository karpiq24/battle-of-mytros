# Foundry VTT Module Verification Report (2026-03-27)

This report summarizes the verification of the "Battle of Mytros" Foundry VTT module against the `system.md` specification.

## Executive Summary
The core mechanics, UI flow, and battle resolution are largely implemented and functional. However, several discrepancies between the code and the written rules were identified, along with missing automation for certain features.

---

## Task-by-Task Findings

### Task 1: Core Concepts & Legion Stats
- **Status:** DONE_WITH_CONCERNS
- **Findings:** Legions correctly have Vitality, Morale, and Wit stats.
- **Issues:**
    - Stat total recommendation (10-18) is not hard-coded; defaults are around 12, but CSV parser defaults to 30.
    - Fortification automation ("held for a full round") is missing; it requires manual GM action or the "Quick Fortify" salvage benefit.

### Task 2: Commander Tags (Combat Modifiers)
- **Status:** DONE_WITH_CONCERNS
- **Issues:**
    - **Mage Tag:** The "Disadvantage on enemy Recovery checks" modifier is missing from the aftermath logic.

### Task 3: Commander Tags (Support & Aftermath)
- **Status:** DONE_WITH_CONCERNS
- **Issues:**
    - **Rallier Tag:** Adjacency bonus is +2 in the code, but `system.md` specifies +1.
    - **Warden Tag:** Code provides an extra +2 Clash bonus to adjacent allies that is not in the system rules.

### Task 4: Round Structure & Phases
- **Status:** DONE
- **Findings:** Reconnaissance thresholds and round advancement logic are fully spec-compliant. Manual movement and planning are handled as expected for a VTT.

### Task 5: Player Characters & Fast Response
- **Status:** DONE_WITH_CONCERNS
- **Issues:**
    - **Resting:** The "Rest" deployment mode lacks automation (no automated short rest recovery).
    - **PC Flags:** Deployment flags on tokens are not automatically reset between rounds.

### Task 6: Battle Resolution Phases
- **Status:** DONE_WITH_CONCERNS
- **Issues:**
    - **Flanking Bonus:** Implemented as a flat +2 instead of 1d4; incorrectly attempts to apply to Phase 3 (Clash).
    - **Victory Tallying:** The "Lose a phase: -1" rule is not implemented (awarded 0).
    - **Natural 1 Penalty:** Subtracts 1 for a Natural 1 on a loss, but because the base -1 for the loss is missing, the total penalty is -1 instead of the specified -2.
    - **Maneuver Rerolls:** Code allows 3 total attempts (2 rerolls), while `system.md` specifies 3 rerolls (4 total attempts).

### Task 7: Aftermath Checks
- **Status:** DONE_WITH_CONCERNS
- **Issues:**
    - **Mage Tag:** Missing debuff on enemy Recovery (Same as Task 2).
    - **Tactical Insight:** Bonus (+1d2 to Wit rolls) is not applied to Salvage checks.
    - **Rallier Tag:** Adjacency bonus discrepancy (+2 vs +1) (Same as Task 3).

### Task 8: Strategic Objectives & Events
- **Status:** DONE_WITH_CONCERNS
- **Issues:**
    - **Strategic Objectives:** Sydon's Miracle point rewards for destroying objectives are missing.
    - **Acastus Redeemed:** This event does not add Acastus as a commander to the pool.
    - **Automation:** Major events must be triggered manually via the Dashboard (no automated hooks).

### Task 9: Civilian Death Toll
- **Status:** DONE
- **Findings:** All death toll calculations (win, loss, unengaged, objectives) and special event modifiers (Sydon, Lutheria, Kentimane) are fully spec-compliant.

### Task 10: UI Flow & User Experience
- **Status:** DONE
- **Findings:** The UI correctly supports the intended gameplay loop, with dedicated interfaces for all major phases and mechanics.

---

## Critical Issues for Resolution
1. ~~**Mage Tag Disadvantage:** Missing from aftermath logic.~~ **FIXED** — Added `enemyTags.includes("mage")` disadvantage to recovery phase in `getAftermathModifiers`.
2. ~~**Victory Tallying:** Subtraction for losses and correct Natural 1 penalties.~~ **FIXED** — Added `-1` to loser's counter for all three phases (Maneuver, Charge, Clash); Nat1 penalty now correctly stacks as -2 total.
3. ~~**Flanking Bonus:** Fix die roll (1d4) and misapplication to Phase 3.~~ **FIXED** — Flanking now applies 1d4 bonus die to Charge only; removed flanking from Clash section entirely.
4. ~~**Sydon Objective Rewards:** Implement Miracle point rewards for objective destruction.~~ **FIXED** — Added `OBJECTIVE_MIRACLE_REWARDS` lookup table; Sydon gains points when each objective is first destroyed.
5. ~~**PC Deployment Reset:** Automate resetting of deployment flags between rounds.~~ **FIXED** — `advanceRound` now resets all support unit token `deploymentMode` flags to "none".

## Additional Fixes Applied
- **Rallier Tag adjacency:** Corrected from +2 to +1 for adjacent allies in `getAftermathModifiers`.
- **Warden Tag:** Removed erroneous +2 Clash bonus to adjacent allies (not in spec); adjacent Warden +2 Recovery bonus was already correct.
- **Tactical Insight:** Now applied to Salvage checks in `getAftermathModifiers`.
- **Maneuver Rerolls:** Corrected to 4 total attempts (3 rerolls) per spec.
- **Acastus Redeemed:** Event now finds and flags the Acastus actor as a Commander when triggered.
