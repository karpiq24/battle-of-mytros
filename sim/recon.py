import random

from .config import RECON_THRESHOLDS


# ─── Reconnaissance ─────────────────────────────────────────────────────

def reconnaissance_roll(allied_legions: list):
    best_wit = max((l.wit_total for l in allied_legions if l.effective), default=0)
    roll  = random.randint(1, 20)
    total = roll + best_wit
    for threshold, description in RECON_THRESHOLDS:
        if total <= threshold:
            return total, description
    return total, RECON_THRESHOLDS[-1][1]
