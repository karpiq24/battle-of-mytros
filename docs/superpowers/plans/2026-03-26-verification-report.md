# Verification Report: Python Simulator (`battle_sim.py`) vs `system.md`

## Overview

The Python simulator correctly implements the core 3-phase battle resolution (Maneuver, Charge, Clash) and most of the Aftermath checks. However, several mechanics from `system.md` are missing or slightly divergent.

## Task 1: Core Concepts & Legion Stats

-   [x] **Legion Stats:** Verified. `vit`, `mor`, `wit` are present and used.
-   [x] **Stat Constraints:** Verified. Current legions in CSV are in 10-18 range.
-   [x] **Battlemap Sections:** Partial. Adjacency is used for tags, but movement is not simulated (batch pairing only).
-   [ ] **Fortification:** Divergent. Currently +1 to battle rolls only. `system.md` says "+1 to ALL rolls", which should include aftermath.

## Task 2: Commander Tags (Part 1 - Combat)

-   [x] **Tactician:** Verified.
-   [x] **Headhunter:** Verified.
-   [x] **Engineer:** Verified.
-   [ ] **Fanatic:** Divergent. Correct Advantage/Disadvantage, but adds a +1 injury penalty (`FANATIC_EXTRA_INJURY`) not in `system.md`.
-   [x] **Zealot:** Verified.
-   [x] **Veteran:** Verified.
-   [ ] **Mage:** Bug. -1 to battle rolls is correct, but the Disadvantage on enemy Recovery is NOT implemented (commented as "partially captured" but actually missing).
-   [x] **Vanguard:** Verified (Advantage on Charge is always on since movement isn't simulated).
-   [x] **Ironclad:** Verified.
-   [x] **Inspiring:** Verified.
-   [x] **Cunning:** Verified.
-   [x] **Siege Breaker:** Verified.

## Task 3: Commander Tags (Part 2 - Support & Aftermath)

-   [x] **Rallier:** Verified.
-   [x] **Terrorizer:** Verified.
-   [x] **Warden:** Verified.
-   [x] **Medic:** Verified.
-   [ ] **Divine Blood:** Bug. Reroll for Recovery and Hope is present, but Reroll for **Salvage** is missing.
-   [x] **Brutal:** Verified.
-   [x] **Unbreakable Pact:** Verified.
-   [x] **Bulwark:** Verified.
-   [x] **Relentless:** Verified.

## Task 4: Round Structure & Phases

-   [x] **Phase 1 Reconnaissance:** Verified.
-   [ ] **Phase 2 & 3:** Missing (Planning/Reveal not needed for batch sim).
-   [x] **Phase 4 Battle:** Verified.
-   [x] **Phase 5 Aftermath:** Verified.
-   [x] **End of Battle:** Verified.

## Task 5: Player Characters & Fast Response

-   [ ] **PC Deployment:** Missing. No mechanism to apply PC bonuses to specific battles.

## Task 6: Battle Resolution Phases

-   [x] **Phase 1 Maneuver:** Verified.
-   [x] **Phase 2 Charge:** Verified.
-   [x] **Phase 3 Clash:** Verified.
-   [ ] **Victory Calculation:** Divergent. `determine_phase_winner` makes Nat 20/Nat 1 auto-win/loss for the phase, while `system.md` only mentions they add/subtract counter points.
-   [x] **Final Tie-breaker:** Verified.

## Task 7: Aftermath Checks

-   [x] **Recovery:** Verified.
-   [x] **Hope:** Verified.
-   [x] **Rout:** Verified (simplified for batch).
-   [x] **Salvage:** Verified.
-   [x] **Commander Casualty:** Verified.

## Task 8-10: Strategic Objectives, Death Toll, Miracles

-   [ ] **Strategic Objectives:** Missing.
-   [x] **Civilian Death Toll:** Partial. Battle deaths and unengaged enemy deaths are correct. Objective deaths are missing.
-   [ ] **Miracles:** Missing.

## Recommendations

1. Fix `Divine Blood` to include Salvage reroll.
2. Fix `Mage` to correctly pass Disadvantage on Recovery to the enemy.
3. Remove `FANATIC_EXTRA_INJURY` to match `system.md` unless it's a desired secret mechanic.
4. Implement PC Deployment options to allow manual/simulated hero intervention.
5. Clarify if Fortification should apply to Aftermath rolls.
