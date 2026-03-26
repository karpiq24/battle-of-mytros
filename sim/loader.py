import csv
import random

from .models import Commander, Legion, CommanderPool, Faction


# ─── CSV Loading ────────────────────────────────────────────────────────

def load_legions_from_csv(path: str) -> list:
    with open(path, newline='', encoding='utf-8-sig') as f:
        return [
            {"name": r["name"].strip(), "faction": r["faction"].strip(),
             "vitality": int(r["vitality"]), "morale": int(r["morale"]),
             "wit": int(r["wit"])}
            for r in csv.DictReader(f)
        ]


def load_commanders_from_csv(path: str) -> list:
    commanders = []
    with open(path, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            tags_str = row.get("tags", "").strip()
            tags = [t.strip() for t in tags_str.split(",") if t.strip()]
            commanders.append({
                "name":    row["name"].strip(),
                "faction": row["faction"].strip(),
                "tags":    tags,
                "legion":  row.get("legion", "").strip(),
            })
    return commanders


def build_armies_from_csv(legions_path: str, commanders_path: str):
    legion_defs   = load_legions_from_csv(legions_path)
    commander_defs = load_commanders_from_csv(commanders_path)

    faction_map = {
        "allied": Faction.ALLIED, "people": Faction.ALLIED,
        "enemy":  Faction.ENEMY,  "sydon":  Faction.ENEMY,
    }

    allied_pool, enemy_pool = [], []
    for cdef in commander_defs:
        f = faction_map.get(cdef["faction"].lower())
        if f is None: continue
        cmd = Commander(name=cdef["name"], tags=cdef["tags"])
        (allied_pool if f == Faction.ALLIED else enemy_pool).append(cmd)

    random.shuffle(allied_pool)
    random.shuffle(enemy_pool)

    allied, enemy = [], []
    for ldef in legion_defs:
        f = faction_map.get(ldef["faction"].lower())
        if f is None: continue
        pool = allied_pool if f == Faction.ALLIED else enemy_pool
        cmd  = pool.pop(0) if pool else Commander(name="(Vacant)", tags=[])
        leg  = Legion(name=ldef["name"], faction=f,
                      vit=ldef["vitality"], mor=ldef["morale"], wit=ldef["wit"],
                      commander=cmd)
        (allied if f == Faction.ALLIED else enemy).append(leg)

    return allied, enemy, CommanderPool(allied_pool, enemy_pool)
