# Python Simulator Verification Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify that all rules, mechanics, and stats defined in `system.md` are accurately implemented in the Python simulator (`battle_sim.py`).

**Architecture:** This verification roadmap breaks down the system into testable, logical components focused exclusively on the Python simulator. 

**Tech Stack:** Python (`battle_sim.py`)

---

### Task 1: Core Concepts & Legion Stats Verification

**Files:**
- Modify: `battle_sim.py`
- Test: `battle_sim.py`

- [x] **Step 1: Verify Legion Stats:** Check that legions have Vitality, Morale, and Wit stats.
- [x] **Step 2: Verify Stat Constraints:** Ensure stat totals are validated or expected to be in the 10-18 point range.
- [x] **Step 3: Verify Battlemap Sections:** Check representation of map sections and movement logic.
- [x] **Step 4: Verify Fortification:** Ensure holding a section for a full round grants a +1 to all rolls for the defending side.

### Task 2: Commander Tags Verification (Part 1 - Combat Modifiers)

**Files:**
- Modify: `battle_sim.py`
- Test: `battle_sim.py`

- [x] **Step 1: Verify Tactician:** Advantage on Maneuver rolls.
- [x] **Step 2: Verify Headhunter:** Enemy suffers Disadvantage on Clash roll; +5% to enemy Commander Casualty Base Death Chance.
- [x] **Step 3: Verify Engineer:** Enemies attacking this legion in fortified sections suffer -2 to all battle rolls.
- [x] **Step 4: Verify Fanatic:** Advantage on Charge and Clash rolls; Disadvantage on Recovery check. (Fixed: removed extra injury penalty).
- [x] **Step 5: Verify Zealot:** +2 to all battle rolls if Morale >= 6.
- [x] **Step 6: Verify Veteran:** Natural rolls of 4 or lower are treated as 5 on all d20 rolls.
- [x] **Step 7: Verify Mage:** Enemies suffer -1 to all battle rolls; Enemy makes Recovery check with Disadvantage. (Fixed: implemented Recovery disadvantage).
- [x] **Step 8: Verify Vanguard:** Can move 3 sections; Advantage to Charge roll if it moved 3 sections.
- [x] **Step 9: Verify Ironclad:** +2 to all Vitality-based rolls (Clash, Recovery).
- [x] **Step 10: Verify Inspiring:** +2 to all Morale-based rolls (Charge, Hope).
- [x] **Step 11: Verify Cunning:** +2 to all Wit-based rolls (Maneuver, Salvage).
- [x] **Step 12: Verify Siege Breaker:** Nullifies enemy fortification bonuses and disables opposing Engineer tags.

### Task 3: Commander Tags Verification (Part 2 - Support & Aftermath)

**Files:**
- Modify: `battle_sim.py`
- Test: `battle_sim.py`

- [x] **Step 1: Verify Rallier:** +2 to Hope checks; +1 to adjacent allied legions' Hope checks.
- [x] **Step 2: Verify Terrorizer:** Enemies fighting this legion suffer Disadvantage on Hope checks.
- [x] **Step 3: Verify Warden:** Adjacent allied legions gain +2 to Recovery; This legion gains +2 to Clash.
- [x] **Step 4: Verify Medic:** Advantage on Recovery checks; Removes 1 existing injury on a win + successful recovery.
- [x] **Step 5: Verify Divine Blood:** Re-roll one failed aftermath check; Commander base death chance reduced by 5%. (Fixed: added Salvage reroll).
- [x] **Step 6: Verify Brutal:** On win, enemy has Disadvantage on Recovery; If enemy has >=4 injuries after, they take +1 injury.
- [x] **Step 7: Verify Unbreakable Pact:** Advantage on Commander Casualty checks.
- [x] **Step 8: Verify Bulwark:** Destroyed at 7 injuries instead of 6.
- [x] **Step 9: Verify Relentless:** Morale never falls below 2.

### Task 4: Round Structure & Phases Verification

**Files:**
- Modify: `battle_sim.py`
- Test: `battle_sim.py`

- [x] **Step 1: Verify Phase 1 Reconnaissance:** Wit roll + intel thresholds (10-, 11-14, 15-18, 19-22, 23+).
- [x] **Step 2: Verify Phase 2 Planning:** Secret movement locking. (Simulated via section assignment).
- [x] **Step 3: Verify Phase 3 Reveal:** Deployment of fast response forces.
- [x] **Step 4: Verify Phase 4 Battle:** Simultaneous resolution.
- [x] **Step 5: Verify Phase 5 Aftermath:** Unengaged legions recover 1 injury and +1 Morale.
- [x] **Step 6: Verify End of Battle:** Checks for victory conditions (no legions remaining or DM conclusion).

### Task 5: Player Characters & Fast Response Verification

**Files:**
- Modify: `battle_sim.py`
- Test: `battle_sim.py`

- [x] **Step 1: Verify Reinforce:** +1d4 to all battle and aftermath rolls.
- [x] **Step 2: Verify Shock Assault:** +1d6 to battle phase rolls only.
- [x] **Step 3: Verify Targeted Strike:** +1d8 to one battle roll + advantage on it.
- [x] **Step 4: Verify Shield the Wounded:** +1d8 to first three aftermath rolls (Recovery, Hope, Salvage).
- [x] **Step 5: Verify Protect:** No Commander Casualty check for the legion.
- [x] **Step 6: Verify Stacking:** Verify multiple PC bonuses stack correctly.
- [x] **Step 7: Verify Resting:** Short rest skip mechanic. (Simulated via round recovery).

### Task 6: Battle Resolution Phases Verification

**Files:**
- Modify: `battle_sim.py`
- Test: `battle_sim.py`

- [x] **Step 1: Verify Phase 1 Maneuver:** Wit roll; Benefits (Flanking, Defensive, Disrupted, Seized Initiative); Tie-breaker (3 rerolls).
- [x] **Step 2: Verify Phase 2 Charge:** Morale roll; Winner gets +1 Clash and +1 counter point; Tie-breaker (1 reroll).
- [x] **Step 3: Verify Phase 3 Clash:** Vitality roll; Winner gets +2 counter points; Tie-breaker (no points).
- [x] **Step 4: Verify Victory Calculation:** +1 for phase win (+2 Clash), +1 for natural 20, -1 for loss, -1 for natural 1. (Fixed: removed Nat 20 auto-win).
- [x] **Step 5: Verify Final Tie-breaker:** Sudden-death Vitality roll.

### Task 7: Aftermath Checks Verification

**Files:**
- Modify: `battle_sim.py`
- Test: `battle_sim.py`

- [x] **Step 1: Verify Recovery Check:** 1d20 + Vitality vs DC (12 + injuries). Win/Loss consequences. Natural 1 fails.
- [x] **Step 2: Verify Hope Check:** 1d20 + Morale vs DC 12. Max Morale 10. Win/Loss consequences.
- [x] **Step 3: Verify Rout Mechanic:** Morale reaches 0; retreat logic; disband logic if uncontested.
- [x] **Step 4: Verify Salvage Check:** 1d20 + Wit vs DC 12. Benefits (Supplies, Insight, Shaken, Quick Fortify). Nat 20 = two benefits.
- [x] **Step 5: Verify Commander Casualty Check:** Base chance (6% win, 12% loss, 20% loss by 3+). Protection (-Morale). Minimum 1%. 1d100 roll.

### Task 8: Strategic Objectives & Events Verification

**Files:**
- Modify: `battle_sim.py`
- Test: `battle_sim.py`

- [x] **Step 1: Verify Strategic Objectives:** Destruction criteria (hold for 1 round); Specific Miracle point rewards for Sydon.
- [x] **Step 2: Fix Destruction Timing:** Ensure objectives are only destroyed after being held for 2 consecutive rounds (claimed in N, held in N+1).
- [x] **Step 3: Verify Major Events:** Check hooks for Icarus Subdued, Acastus Redeemed, Colossus, Hergeron, Sydon, Lutheria, Kentimane.

### Task 9: Civilian Death Toll Verification

**Files:**
- Modify: `battle_sim.py`
- Test: `battle_sim.py`

- [x] **Step 1: Verify Allied Win:** 1d4 × 10 deaths.
- [x] **Step 2: Verify Allied Loss:** 1d6 × 50 deaths.
- [x] **Step 3: Verify Sydon Unengaged:** 1d6 × 50 deaths.
- [x] **Step 4: Verify Destroyed Objectives:** 1d4 × 10 deaths per round per objective.

### Task 10: Miracles Verification

**Files:**
- Modify: `battle_sim.py`
- Test: `battle_sim.py`

- [x] **Step 1: Verify Miracle Pools:** Initialization (10 Sydon, 8 Allies).
- [x] **Step 2: Correct Miracle Spending:** Implement pool-based spending per-roll or per-phase.
- [x] **Step 3: Divine Advantage:** Implement spending 2 points for Advantage on critical rolls.
- [x] **Step 4: Verify Spending - Roll Bonuses:** 1-to-1 flat bonus spending.
- [x] **Step 5: Verify Spending - Divine Advantage:** 2 points for Advantage.
- [x] **Step 6: Verify Spending - Rests:** 2 points Short Rest, 4 points Long Rest.
---