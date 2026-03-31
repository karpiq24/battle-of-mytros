from dataclasses import dataclass, field

# ─── Battle Phase Logs ──────────────────────────────────────────────────


@dataclass
class PhaseResult:
    phase_name: str
    roll_a: int
    roll_b: int
    total_a: int
    total_b: int
    nat20_a: bool
    nat20_b: bool
    nat1_a: bool
    nat1_b: bool
    winner: str
    phase_diff: int = 0  # roll differential (total_a - total_b) for this phase


@dataclass
class BattleLog:
    legion_a: str
    legion_b: str
    phases: list = field(default_factory=list)
    battle_score: int = 0  # final Battle Score (positive = side A won, negative = side B won)
    winner: str = ""
    maneuver_benefit: str = ""
    aftermath_a: dict = field(default_factory=dict)
    aftermath_b: dict = field(default_factory=dict)
    # Extra injuries from Seized Initiative (applied to the loser)
    seized_extra_for_a: int = 0
    seized_extra_for_b: int = 0
