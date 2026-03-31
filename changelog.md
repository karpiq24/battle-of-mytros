# Battle of Mytros — v2 Changelog

All changes validated via Monte Carlo simulation (50,000–100,000 iterations per test).

---

## 1. Battle Resolution — Margin of Victory (MAJOR REWORK)

The counter point system is replaced entirely. Instead of tracking binary phase wins/losses as abstract points, each phase now contributes its **roll differential** to a single running **Battle Score** tracked from one side's perspective. Subtract the enemy's total from yours each phase — positive means you're winning, negative means the enemy is winning. After all three phases, a positive Battle Score means you win; negative means the enemy wins; zero is a tie.

### How It Works

Each battle still has three sequential phases: Maneuver (Wit), Charge (Morale), Clash (Vitality). In each phase, both sides roll 1d20 + stat. The differential (your roll minus enemy roll) is added to the Battle Score. This is a single counter — not two separate tallies.

**Example:**

-   Maneuver: Side A rolls 18, Side B rolls 12 → Battle Score: +6
-   Charge: Side A rolls 8, Side B rolls 15 → Battle Score: +6 − 7 = −1
-   Clash: Side A rolls 14, Side B rolls 11 → Battle Score: −1 + 3 = +2
-   **Side A wins with a margin of 2.**

The Charge→Clash cascade is unchanged: the side that wins the Charge phase (positive differential) gains +1 to their Clash roll. This preserves Morale's "momentum" identity.

### Why This Change

The old counter system was functionally a best-of-3 regardless of phase weighting. Winning any two phases always produced a higher counter total than the opponent — Clash being worth 2 points instead of 1 made no mathematical difference to the outcome. The loser penalty (-1 per lost phase) ensured that winning 2 out of 3 phases was always sufficient, making Clash's extra weight purely cosmetic.

The margin system fixes this:

-   Every stat point matters proportionally. +1 Vit gives +2.5% win rate, +1 Mor gives +2.9%, +1 Wit gives +2.4%. There is no dump stat.
-   High investments create larger swings — a legion with 8 Wit will sometimes dominate Maneuver by 10+, which compensates for weaker stats elsewhere.
-   Comebacks are real. A legion that loses one phase badly (by 10+) still wins the overall battle 14.3% of the time.
-   The margin of victory determines commander casualty severity (see §2), giving the Battle Score narrative weight beyond simply who won.

**Stat balance under the margin system (all tested vs balanced 4/4/4):**

| Build        | V/M/W | Win%  |
| ------------ | ----- | ----- |
| Balanced     | 4/4/4 | 48.7% |
| Vit-heavy    | 6/3/3 | 48.5% |
| Mor-heavy    | 3/6/3 | 49.3% |
| Wit-heavy    | 3/3/6 | 48.4% |
| V+M dump Wit | 6/6/0 | 48.9% |
| M+W dump Vit | 0/6/6 | 49.2% |

All builds land within 48–50% — the 47–53% target band is met with room to spare.

### Remove From Document

Delete the entire **Determining the Victor** section and its counter table. Remove all references to "counter points," "battle counter," and the old tie-breaker rules.

Replace with:

> **Determining the Victor**
>
> After all three phases, sum the roll differentials into a final Battle Score. The side with the higher Battle Score wins. The magnitude of the score determines the severity of aftermath consequences (see Commander Casualty Check).
>
> **Tie-breaker:** If the Battle Score is exactly 0, a sudden-death contested Vitality roll breaks the tie. If that also ties, reroll until one side wins.

Tie frequency is approximately 2.5% of battles — rare enough that the tiebreaker won't feel routine.

### Phase Resolution Updates

The three phases (Maneuver, Charge, Clash) resolve the same way mechanically — both sides roll 1d20 + stat — but the following changes apply:

**Maneuver:** Remove all reroll-on-tie rules. Ties are fine — a 0 differential simply adds nothing to the Battle Score. The Maneuver winner still chooses one benefit from the Maneuver Benefit table (winner = side with positive differential this phase; if tied, no benefit is granted).

**Charge:** Remove all reroll-on-tie rules. The Charge winner (positive differential) still gains +1 to their Clash roll. If tied, no cascade bonus.

**Clash:** Remove the "(+2 for The Clash)" counter value note — Clash no longer awards extra points. Remove the Clash tie-breaker text. A Clash tie simply adds 0 to the Battle Score.

### Natural 20 / Natural 1

Remove the old nat 20/nat 1 counter point bonuses. Under the margin system, extreme natural rolls already create large differentials organically (nat 20 vs nat 1 = a 19-point swing in that phase). No additional bonus is needed.

---

## 2. Commander Casualty Check — Margin-Based Tiers

The old tier system (won / lost / lost by 3+ counters) is replaced with margin thresholds.

### New Table

| Situation                           | Base Death Chance                       |
| ----------------------------------- | --------------------------------------- |
| Won the battle                      | 6% _(unchanged)_                        |
| Lost the battle                     | 12% _(unchanged)_                       |
| Lost by **15+** on the Battle Score | 20% _(was "lost by 3+ on the counter")_ |

The resolution mechanic (subtract Morale as Protection, roll d100, floor of 1%) is unchanged.

**Rationale:** Under the margin system, approximately 34% of losses are by a margin of 15 or more — this makes the heavy tier feel like a genuine blowout without being so common it loses meaning.

**12-round battle survival probabilities (with new Morale diminishing gains):**

| Scenario                           | Dies in 12 rounds | Avg round of death |
| ---------------------------------- | ----------------- | ------------------ |
| Always winning, Morale 5           | 11.2%             | 6.3                |
| Mixed (8 wins, 4 losses), Morale 5 | 20.5%             | 8.4                |
| Always losing, Morale 5            | 75.6%             | 5.6                |
| Losing by 15+, Morale 3            | 92.7%             | 4.3                |

With Headhunter (+5% base death): winning commander death rate doubles from 11.2% to 22.1% over 12 rounds.

---

## 3. Commander Tags

### Fanatic — Reworked

**Old:** Advantage on both Charge and Clash rolls. Disadvantage on Recovery check.

**New:** **+2 to both Charge and Clash rolls.** Disadvantage on Recovery check.

**Rationale:** Advantage on two phases was worth +17.9% win rate — the strongest effect in the system by far. A flat +2 to both phases gives +11.4% under the margin system, placing Fanatic at the top of Tier 1 (59.9% win rate) but only ~2% above Headhunter (57.9%) and Tactician (57.6%). The tag still feels dangerous and aggressive. The Recovery disadvantage costs roughly 1 fewer battle survived — a real cost for a reckless legion.

### Zealot — Threshold Raised

**Old:** While this legion's current Morale is **6** or higher, it gains +2 to all three battle rolls.

**New:** While this legion's current Morale is **7** or higher, it gains +2 to all three battle rolls.

**Rationale:** At threshold 6, Zealot activated after a single won Hope check — too easy. At threshold 8 (tested), it was nearly dead (0.9/5 rounds active from Morale 5). At threshold 7, the legion must earn a win or two before the bonus kicks in. Once active, it provides 64.7% win rate — a powerful reward for maintaining momentum, and a real loss when Morale drops.

### No Other Tag Changes

Aftermath-only tags (Brutal, Terrorizer, Rallier, Medic) remain unchanged. These are support/utility roles by design — not every commander is a combat monster. Since commanders are premade with fixed tags, the DM controls which legions get combat tags vs support tags, and the roster provides enough variety for meaningful differentiation.

**Tag balance summary under margin system:**

| Tier                        | Tags                                                          | Win% Range              |
| --------------------------- | ------------------------------------------------------------- | ----------------------- |
| Tier 1 (combat powerhouses) | Fanatic, Tactician, Headhunter                                | 57–60%                  |
| Tier 2 (solid combat bonus) | Mage, Inspiring, Ironclad, Cunning, Veteran                   | 54–57%                  |
| Tier 3 (aftermath/utility)  | Brutal, Terrorizer, Rallier, Medic, Bulwark, Relentless, etc. | ~50% (no combat impact) |
| Conditional                 | Zealot (64.7% when active, 48.7% when not)                    | Varies                  |

---

## 4. Morale — Diminishing Gains + Rally

### Diminishing Morale Gains for Winners

**New rule:** When a legion's current Morale is **7 or higher**, all Morale gains from Hope checks are reduced by 1 (minimum 0).

In practice for **winners:**

-   Morale < 7: Hope success = +2, Hope fail = +1 _(unchanged)_
-   Morale ≥ 7: Hope success = **+1** _(was +2)_, Hope fail = **+0** _(was +1)_

Loser outcomes are **unchanged** (success: −1, fail: −2). No Morale floor is added.

**Rationale:** Under old rules, a winning legion hit Morale 10 by round 3 and stayed there permanently. With diminishing gains, the winner reaches ~8.6 by round 3 and ~9.5 by round 4. The Morale gap between winner and loser compresses by ~1 point per round. Losing still hurts — the death spiral is real — but the winner doesn't accelerate as hard.

**Add to Hope Check section, after the outcome table:**

> _Diminishing Returns:_ When a legion's current Morale is 7 or higher, reduce all Morale gains from Hope checks by 1 (minimum 0). This does not affect Morale losses.

### New PC Deployment Option: Rally

Add to the **PC Deployment Options** table:

| Option    | Effect                                                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Rally** | The PC restores **1d4 Morale** to one allied legion (up to the cap of 10). The legion does not need to be in combat this round. The PC does not contribute to any battle this round. |

**Rationale:** A single Rally at round 3 reduces a losing legion's rout chance from 100% to 46%. It competes directly with Reinforce/Shock Assault — saving a doomed legion means abandoning a current fight. This is exactly the kind of meaningful, costly PC decision the system needs.

Rally does not require the PC to be in the same section. It represents the hero riding out to personally inspire the troops, abstracted the same way all PC deployments are.

---

## 5. Civilian Death Toll — Reduced Multipliers

### Updated Death Roll Table

| Situation                                      | Old          | New                    |
| ---------------------------------------------- | ------------ | ---------------------- |
| Allied legion won the battle                   | 1d4 × 10     | 1d4 × 10 _(unchanged)_ |
| Allied legion lost the battle                  | 1d6 × **50** | 1d6 × **30**           |
| Sydon's legion was not engaged this round      | 1d6 × **50** | 1d6 × **30**           |
| Each destroyed Strategic Objective (per round) | 1d4 × 10     | 1d4 × 10 _(unchanged)_ |

**Effect over a 12-round battle (6v7 scenario):**

-   Old average: ~9,500 civilian deaths, range 8,770–10,290
-   New average: ~6,200 civilian deaths, range 5,700–6,630

**Rationale:** The old unengaged-enemy penalty (1d6×50) was so harsh it effectively mandated engaging every enemy legion every round, constraining strategic choices. The ×30 multiplier still punishes uncontested enemy presence but gives players room to make trade-offs about where to commit forces.

---

## 6. PC Deployment — 2 PC Maximum Per Battle

**New rule:** A maximum of **2 PCs** may deploy to the same battle. Remaining PCs must deploy elsewhere, Rally, rest, or respond to other engagements.

**Add to the PC Deployment section, after the deployment options table:**

> _Deployment Limit:_ No more than 2 PCs may deploy to the same battle in a single round.

**Rationale:** Under the old rules, 4 PCs stacking Shock Assault gave +14 average to battle rolls — a guaranteed win. With the 2-PC cap, the maximum stack is +7 (2× Shock Assault), which gives an 86.6% win rate: strong and decisive, but beatable. This forces the party to spread support across at least 2 engagements.

---

## 7. Quick Reference — Every Text Edit Needed

### Sections to Rewrite

1. **Battle Resolution intro & Determining the Victor** — Replace entirely. Remove counter points. Each phase adds its roll differential to a running Battle Score. Highest total wins. See §1 for full replacement text.

2. **Maneuver phase** — Remove reroll-on-tie rules. Ties add 0 to Battle Score. Winner (positive differential) still picks a benefit.

3. **Charge phase** — Remove reroll-on-tie rules. Ties add 0. Winner still gets +1 to Clash.

4. **Clash phase** — Remove "(+2 for The Clash)" note. Remove Clash-specific tie rules.

5. **Natural 20 / Natural 1** — Remove counter point bonuses. Optionally add the ±3 crit rule, or remove entirely.

### Sections to Edit (Smaller Changes)

6. **Commander Casualty Check table** — Change "Lost by 3+ on the battle counter" to "Lost by 15+ on the Battle Score."

7. **Fanatic tag** — Replace "Advantage on both Charge and Clash rolls" with "+2 to both Charge and Clash rolls."

8. **Zealot tag** — Change "Morale is 6 or higher" to "Morale is 7 or higher."

9. **Hope Check section** — Add after outcome table: "When a legion's current Morale is 7 or higher, reduce all Morale gains from Hope checks by 1 (minimum 0)."

10. **PC Deployment Options table** — Add Rally row: "The PC restores 1d4 Morale to one allied legion (up to cap of 10). The PC does not contribute to any battle this round."

11. **PC Deployment section** — Add: "No more than 2 PCs may deploy to the same battle in a single round."

12. **Civilian Death Toll table** — Change ×50 to ×30 for allied losses and unengaged enemy legions.

### Sections Unchanged

No changes to: Reconnaissance, Planning and Commitment, Reveal and Fast Response, fortification rules, idle recovery (1 injury + 1 Morale for non-fighting legions), Recovery checks, Salvage checks, Rout rules, Maneuver benefit table, Strategic Objectives, Major Events, Miracles, Resting, End of Battle conditions, legion stat ranges (10–18 points), or any commander tags other than Fanatic and Zealot.
