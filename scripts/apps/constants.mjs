/**
 * Static game-data constants used by the Battle Dashboard.
 * These serve as default values — objectives and events are stored as
 * configurable JSON settings and can be customised per-world.
 */

/** Default strategic objectives with miracle point rewards for Sydon. */
export const STRATEGIC_OBJECTIVES = [
    { id: "temple", name: "Temple of the Five", reward: 2 },
    { id: "palace", name: "The Great Palace", reward: 2 },
    { id: "academy", name: "The Academy", reward: 2 },
    { id: "dockyard", name: "The Dockyard", reward: 1 },
    { id: "soldier", name: "Soldier's Gate", reward: 1 },
    { id: "agora", name: "The Agora", reward: 1 },
    { id: "vault", name: "The Vault of Thylea", reward: 1 },
    { id: "theater", name: "The Theater of the Gods", reward: 1 },
    { id: "vineyards", name: "The Vineyards of Mytros", reward: 1 },
];

/** Default major events that grant allied miracle points when resolved. */
export const MAJOR_EVENTS = [
    { id: "icarus", name: "Icarus Subdued or Calmed", reward: 2 },
    { id: "acastus", name: "Acastus Redeemed", reward: 2 },
    { id: "colossus", name: "The Colossus Awakened", reward: 2 },
    { id: "hergeron", name: "Hergeron Driven from the Temple", reward: 2 },
    { id: "sydon", name: "Sydon Defeated", reward: 2 },
    { id: "lutheria", name: "Lutheria Defeated", reward: 2 },
    { id: "kentimane", name: "Kentimane Defeated", reward: 2 },
];

/** All known commander tags used in the TagEngine. */
export const TAG_DESCRIPTIONS = {
    Tactician: "MYTROS.TagDesc.Tactician",
    Fanatic: "MYTROS.TagDesc.Fanatic",
    Zealot: "MYTROS.TagDesc.Zealot",
    Ironclad: "MYTROS.TagDesc.Ironclad",
    Inspiring: "MYTROS.TagDesc.Inspiring",
    Cunning: "MYTROS.TagDesc.Cunning",
    Warden: "MYTROS.TagDesc.Warden",
    Vanguard: "MYTROS.TagDesc.Vanguard",
    Headhunter: "MYTROS.TagDesc.Headhunter",
    Mage: "MYTROS.TagDesc.Mage",
    Engineer: "MYTROS.TagDesc.Engineer",
    "Siege Breaker": "MYTROS.TagDesc.SiegeBreaker",
    Medic: "MYTROS.TagDesc.Medic",
    Rallier: "MYTROS.TagDesc.Rallier",
    Terrorizer: "MYTROS.TagDesc.Terrorizer",
    Brutal: "MYTROS.TagDesc.Brutal",
    Veteran: "MYTROS.TagDesc.Veteran",
    Bulwark: "MYTROS.TagDesc.Bulwark",
    "Divine Blood": "MYTROS.TagDesc.DivineBlood",
    "Unbreakable Pact": "MYTROS.TagDesc.UnbreakablePact",
    Relentless: "MYTROS.TagDesc.Relentless",
};

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
