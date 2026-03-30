import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from .config import (
    BULWARK_MAX_INJURIES,
    MAX_INJURIES,
    MORALE_CAP,
    RELENTLESS_MIN_MORALE,
)

# ─── Enums & Data Classes ──────────────────────────────────────────────


class Faction(Enum):
    ALLIED = "Allied"
    ENEMY = "Enemy"


class BattleResult(Enum):
    WIN = "Win"
    LOSS = "Loss"
    NO_BATTLE = "No Battle"


@dataclass
class PCDeployment:
    name: str = "PC"
    # "Reinforce", "Shock Assault", "Targeted Strike", "Shield the Wounded", "Protect"
    type: str = "Reinforce"
    phase: Optional[str] = None  # For Targeted Strike: "maneuver", "charge", "clash"


class MiraclePool:
    def __init__(self, points: int):
        self.points = points

    def spend(self, amount: int = 1) -> bool:
        """Spend points. Returns True if points were spent."""
        if self.points >= amount:
            self.points -= amount
            return True
        return False


@dataclass
class Commander:
    name: str
    tags: list = field(default_factory=list)
    alive: bool = True

    def has_tag(self, name: str) -> bool:
        return name in self.tags


@dataclass
class Legion:
    name: str
    faction: Faction
    vit: int  # flat total Vitality
    mor: int  # flat base Morale (shifts via morale_mod)
    wit: int  # flat total Wit
    commander: Commander
    injuries: int = 0
    morale_mod: int = 0  # cumulative Hope check shifts
    routed: bool = False
    destroyed: bool = False
    section: int = 0
    fortified_section: int = -1
    wit_temp_bonus: int = 0  # from Tactical Insight salvage

    commanders_lost: int = 0

    # Per-round history
    history_injuries: list = field(default_factory=list)
    history_morale: list = field(default_factory=list)
    history_results: list = field(default_factory=list)
    history_vit: list = field(default_factory=list)
    history_mor: list = field(default_factory=list)
    history_wit: list = field(default_factory=list)

    @property
    def vit_total(self) -> int:
        return max(0, self.vit)

    @property
    def mor_total(self) -> int:
        raw = self.mor + self.morale_mod
        if self.commander.alive and self.commander.has_tag("Relentless"):
            raw = max(RELENTLESS_MIN_MORALE, raw)
        return min(MORALE_CAP, max(0, raw))

    @property
    def wit_total(self) -> int:
        return max(0, self.wit + self.wit_temp_bonus)

    @property
    def effective(self) -> bool:
        return not self.destroyed and not self.routed

    @property
    def max_injuries(self) -> int:
        if self.commander.alive and self.commander.has_tag("Bulwark"):
            return BULWARK_MAX_INJURIES
        return MAX_INJURIES

    def record_state(self, result: BattleResult):
        self.history_injuries.append(self.injuries)
        self.history_morale.append(self.mor_total)
        self.history_results.append(result)
        self.history_vit.append(self.vit_total)
        self.history_mor.append(self.mor_total)
        self.history_wit.append(self.wit_total)


@dataclass
class CommanderPool:
    allied_reserves: list = field(default_factory=list)
    enemy_reserves: list = field(default_factory=list)

    def get_replacement(self, faction: Faction) -> Optional[Commander]:
        pool = self.allied_reserves if faction == Faction.ALLIED else self.enemy_reserves
        if not pool:
            return None
        return pool.pop(random.randrange(len(pool)))
