import random


# ─── Dice Rolling ───────────────────────────────────────────────────────

def d20(veteran: bool = False) -> int:
    r = random.randint(1, 20)
    if veteran and r <= 4:
        r = 5
    return r


def roll_d20(bonus: int, advantage: bool = False, disadvantage: bool = False,
             veteran: bool = False):
    """Return (raw_roll, total, is_nat20, is_nat1)."""
    r1 = d20(veteran)
    if advantage and not disadvantage:
        r2 = d20(veteran)
        raw = max(r1, r2)
    elif disadvantage and not advantage:
        r2 = d20(veteran)
        raw = min(r1, r2)
    else:
        raw = r1
    return raw, raw + bonus, raw == 20, raw == 1


def contested_roll(bonus_a: int, bonus_b: int,
                   adv_a=False, adv_b=False,
                   disadv_a=False, disadv_b=False,
                   vet_a=False, vet_b=False):
    """Roll both sides. Returns (ra, rb, ta, tb, n20a, n20b, n1a, n1b)."""
    ra, ta, n20a, n1a = roll_d20(bonus_a, adv_a, disadv_a, vet_a)
    rb, tb, n20b, n1b = roll_d20(bonus_b, adv_b, disadv_b, vet_b)
    return ra, rb, ta, tb, n20a, n20b, n1a, n1b


def determine_phase_winner(ta, tb, n20a, n20b, n1a, n1b) -> str:
    if ta > tb: return 'a'
    if tb > ta: return 'b'
    return 'tie'
