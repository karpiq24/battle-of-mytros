/**
 * Static game-data constants used by the Battle Dashboard.
 */

/** Miracle Point rewards for each objective location when destroyed by Sydon. */
export const STRATEGIC_OBJECTIVES = [
    { id: "temple", name: "Temple of the Five", reward: 2 },
    { id: "palace", name: "Royal Palace", reward: 2 },
    { id: "dockyard", name: "The Dockyard", reward: 1 },
    { id: "soldier", name: "Soldier's Gate", reward: 1 },
    { id: "agora", name: "The Agora", reward: 1 },
    { id: "academy", name: "The Academy", reward: 2 },
    { id: "gymnasium", name: "The Gymnasium", reward: 1 },
    { id: "bridge", name: "The Harp Bridge", reward: 1 },
    { id: "vineyards", name: "The Vineyards of Mytros", reward: 1 },
    { id: "market", name: "Fish Market & Commerce Gate", reward: 1 },
];

/** Major story events that can be triggered during the battle. */
export const MAJOR_EVENTS = [
    {
        id: "icarus",
        name: "Icarus Subdued or Calmed",
        reward: 2,
        description: "A dragon fights to protect the city rather than destroy it.",
        specialEffect: null,
    },
    {
        id: "acastus",
        name: "Acastus Redeemed",
        reward: 2,
        description: "Acastus hands over the Rod of Rulership. His captains stand down.",
        specialEffect: "acastus_redeemed",
    },
    {
        id: "colossus",
        name: "The Colossus Awakened",
        reward: 2,
        description: "The great guardian rises. Manually fortify the section it occupies.",
        specialEffect: null,
    },
    {
        id: "hergeron",
        name: "Hergeron Driven from the Temple",
        reward: 2,
        description: "Son of Sydon repelled from the Temple of the Five.",
        specialEffect: null,
    },
    {
        id: "sydon",
        name: "Sydon Defeated",
        reward: 2,
        description: "The Lord of Storms falls. Objective deaths halved for remaining rounds.",
        specialEffect: "sydon_defeated",
    },
    {
        id: "lutheria",
        name: "Lutheria Defeated",
        reward: 2,
        description: "Titan of Death gone. Subtracts 800 from the running Death Toll.",
        specialEffect: "lutheria_defeated",
    },
    {
        id: "kentimane",
        name: "Kentimane Defeated",
        reward: 2,
        description: "The Hundred-Handed One falls. Death Toll stops. The battle is over.",
        specialEffect: "kentimane_defeated",
    },
];

/** All known commander tags used in the TagEngine. */
export const KNOWN_TAGS = [
    "Tactician",
    "Fanatic",
    "Zealot",
    "Ironclad",
    "Inspiring",
    "Cunning",
    "Warden",
    "Vanguard",
    "Headhunter",
    "Mage",
    "Engineer",
    "Siege Breaker",
    "Medic",
    "Rallier",
    "Terrorizer",
    "Brutal",
    "Veteran",
    "Bulwark",
    "Divine Blood",
    "Unbreakable Pact",
    "Relentless",
];
