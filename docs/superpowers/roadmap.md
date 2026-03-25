# Battle of Mytros Module Roadmap

## Phase 1: Foundation & Tracking (Completed)
- [x] Initial module setup (`module.json`, structure)
- [x] Global data management (`game.settings` for round, phase, etc.)
- [x] Actor flags for Legions and Commanders
- [x] Scene Region auto-discovery for map sections
- [x] Base ApplicationV2 Dashboard
- [x] Token tracking via Region Events (`tokenEnter`, `tokenExit`)
- [x] Dashboard UI rendering sections and occupying legions

## Phase 2: Setup & Data Management (Completed)
- [x] **Dashboard Setup Tab:** UI to manage global state (Miracles, Death Toll, current Round/Phase).
- [x] **Section Editor:** UI to toggle Fortification and Objective status for each section directly from the Dashboard.
- [x] **CSV Import/Export:** Functionality to bulk import and update Legions and Commanders via CSV files, matching by Name.
- [x] **Commander Assignment UI:** Interface within the Dashboard to easily assign or re-assign Commanders to specific Legions.

## Phase 3: The Battle Resolver Engine (Completed)
- [x] **Resolver UI Scaffold:** Step-by-step interactive resolver flow per section (Maneuver → Charge → Clash → Aftermath).
- [x] **Phase 1: Maneuver (Wit):** Roll with full tag/fortification/support context; four benefit choices including Seized Initiative.
- [x] **Phase 2: Charge (Morale):** Roll applying Maneuver benefits, Commander Tags, charge winner feeds +1 to Clash.
- [x] **Phase 3: Clash (Vitality):** Roll, Counter Point accumulation (1/1/2), nat20 bonus and nat1 penalty, overall victor declared.
- [x] **PC Fast Response Integration:** Five deployment modes — Reinforce (+1d4 all), Shock Assault (+1d6 battle), Targeted Strike (+1d8 + advantage on one phase), Shield the Wounded (+1d8 aftermath), Protect (skips commander casualty check).

## Phase 4: Aftermath & Battle Loop (Completed)
- [x] **Aftermath Checks:** Recovery (Vitality), Hope (Morale), Salvage (Wit) — all rolled with full tag and support bonuses.
- [x] **Salvage Benefit Selection:** Interactive UI for Captured Supplies, Tactical Insight, Enemy Shaken, Quick Fortify.
- [x] **Commander Casualties:** d100 vs (Base% − Morale). Protect bypass, Unbreakable Pact double-roll, Headhunter/Divine Blood modifiers. Death clears assignment and applies −1 Morale.
- [x] **Tag Coverage (Aftermath):** Medic, Fanatic, Ironclad, Brutal, Rallier, Inspiring, Terrorizer, Cunning all wired to aftermath checks.
- [x] **Stat Persistence:** Injuries and Morale written back to actor flags after every battle via Commit step.
- [x] **Tiebreaker:** Sudden-death repeated Vitality rolls until one side wins, then proceeds to aftermath.
- [x] **Seized Initiative:** Fourth maneuver benefit; applies +1d2 extra injuries to loser during recovery if the maneuver winner also wins the battle.
- [x] **Chat Card Engine:** Styled battle summary card posted to public chat after each committed engagement.
- [x] **Round Advancement:** End-of-round button applies passive recovery to idle legions (+1 Morale, −1 injury), rolls death toll for unengaged Sydon legions and destroyed objectives, increments round counter.
- [x] **Objective Destruction Tracking:** Auto-detects when Sydon holds an objective section for two consecutive rounds and permanently marks it destroyed. Death toll accrues each subsequent round.

## Phase 5: Polish & Finalization (Next)
- [x] **Reconnaissance Phase:** 1d20 + highest allied Wit roll in Overview panel; intelligence result table (≤10/11–14/15–18/19–22/23+); 23+ grants +1 to all allied Maneuver rolls (wired to resolver); result clears on round advance.
- [x] **Miracle Point Spending UI:** Miracles tab with Allied/Sydon pool counts and spend buttons (Roll Bonus −1, Divine Advantage −2, Short Rest −2, Long Rest −4).
- [x] **Major Events Integration:** 7 named events (Icarus, Acastus, Colossus, Hergeron, Sydon, Lutheria, Kentimane) in Miracles tab; trigger grants Allied Miracles; special effects: Sydon halves objective deaths, Lutheria subtracts 800 from toll, Kentimane freezes toll entirely. Events marked completed and locked after use.
- [ ] **Rout Handling:** When a legion's Morale hits 0, mark it as routed, log the retreat direction, and block it from acting next round. Auto-disband if an enemy moves into its section uncontested.
- [ ] **Warden/Rallier Adjacency:** Cross-section tag bonuses — requires spatial graph of adjacent regions.
- [ ] **Tactical Insight Integration:** Read `tacInsightBonus` flag in TagEngine maneuver/salvage modifiers and apply +1d2 bonus for one round, then clear the flag.
- [ ] **PC Resting:** Allow PCs to skip a deployment round to take a short rest (tracked as a skip, not a deployment mode).
- [ ] **Dark Mode Support:** Ensure all custom UI and chat cards respect Foundry VTT dark/light modes.
- [ ] **Localization (i18n):** Complete `en.json` and `pl.json` mapping for all UI elements and chat outputs.

## Housekeeping (Completed)
- [x] Registered `ne` Handlebars helper (was used in template but never registered — silently broke deployment mode badges for non-GM players).
- [x] Created stub `lang/en.json` and `lang/pl.json` (declared in `module.json` but missing — produced Foundry load warnings).
- [x] Removed `"socket": true` from `module.json` (declared but no socket code existed — misleading manifest).
