import pandas as pd

legions_csv = "legions.csv"
commanders_csv = "commanders.csv"

# --- LEGIONS STATS ---
try:
    df_legions = pd.read_csv(legions_csv)

    # Grouping by faction to calculate averages and totals
    stats_avg = df_legions.groupby("faction")[["vitality", "morale", "wit"]].mean().round(2)
    stats_total = df_legions.groupby("faction")[["vitality", "morale", "wit"]].sum()

    print("Average Stats per Faction:")
    print(stats_avg)
    print("\nTotal Stats per Faction:")
    print(stats_total)

    print(
        "\nTotal Allied: ",
        stats_total.loc["Allied", "vitality"]
        + stats_total.loc["Allied", "morale"]
        + stats_total.loc["Allied", "wit"],
    )
    print(
        "Total Enemy: ",
        stats_total.loc["Enemy", "vitality"]
        + stats_total.loc["Enemy", "morale"]
        + stats_total.loc["Enemy", "wit"],
    )
except FileNotFoundError:
    print(f"File {legions_csv} not found. Skipping legions stats...")

# --- COMMANDERS & TAGS ---
# 1. Define all known tags from the system rules
known_tags = [
    "Tactician",
    "Headhunter",
    "Engineer",
    "Rallier",
    "Terrorizer",
    "Fanatic",
    "Zealot",
    "Veteran",
    "Warden",
    "Mage",
    "Medic",
    "Vanguard",
    "Divine Blood",
    "Brutal",
    "Unbreakable Pact",
    "Ironclad",
    "Inspiring",
    "Cunning",
    "Bulwark",
    "Relentless",
    "Siege Breaker",
]

# Define which tags are primarily focused on the Battle Phases (Maneuver, Charge, Clash)
battle_phase_tags = {
    "Tactician",
    "Headhunter",
    "Engineer",
    "Fanatic",
    "Zealot",
    "Warden",
    "Mage",
    "Vanguard",
    "Ironclad",
    "Inspiring",
    "Cunning",
    "Siege Breaker",
}

try:
    df_commanders = pd.read_csv(commanders_csv)

    # 2. Initialize a dictionary with all known tags set to 0
    tag_counts = {tag: 0 for tag in known_tags}

    # 3. Iterate through the rows and count the tags
    for tag_string in df_commanders["tags"]:
        if pd.notna(tag_string):
            # Split by comma and strip any leading/trailing spaces
            tags = [t.strip() for t in tag_string.split(",")]
            for tag in tags:
                if tag in tag_counts:
                    tag_counts[tag] += 1

    # 4. Sort the results in descending order by count
    sorted_tags = sorted(tag_counts.items(), key=lambda item: item[1], reverse=True)

    # 5. Print the tag counts
    print("\nTag Usage Count:")
    print("-" * 30)
    for tag, count in sorted_tags:
        print(f"{tag:<20} | {count}")

    # 6. Calculate Commander Points
    def calculate_points(tag_string):
        if pd.isna(tag_string):
            return 0

        points = 0
        tags = [t.strip() for t in tag_string.split(",")]
        for tag in tags:
            if tag in battle_phase_tags:
                points += 2
            else:
                # This covers Aftermath, defense, general d20 buffs (like Veteran), etc.
                points += 1
        return points

    # Apply the function to create a new column
    df_commanders["points"] = df_commanders["tags"].apply(calculate_points)

    # 7. Print Commanders with their calculated points
    print("\nCommander Points:")
    print("-" * 50)
    print(f"{'Commander Name':<25} | {'Faction':<10} | {'Points':<5}")
    print("-" * 50)

    # Sort by points descending for a nicer display (optional, but helpful!)
    df_commanders_sorted = df_commanders.sort_values(by=["points", "name"], ascending=[False, True])

    for index, row in df_commanders_sorted.iterrows():
        print(f"{row['name']:<25} | {row['faction']:<10} | {row['points']} pts")

except FileNotFoundError:
    print(f"\nFile {commanders_csv} not found. Ensure it is in the same directory.")
