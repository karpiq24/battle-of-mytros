import { BOM } from "../config.mjs";

/**
 * Manages the full battle state stored in game.settings.
 * All mutations go through this class to ensure consistency and persistence.
 */
export class BattleState {

  /** @returns {object} The current battle state from settings */
  static get() {
    return game.settings.get(BOM.moduleId, "battleState");
  }

  /** @param {object} state - Full state to persist */
  static async set(state) {
    await game.settings.set(BOM.moduleId, "battleState", state);
  }

  /** @returns {object} A fresh default state */
  static defaultState() {
    return {
      round: 1,
      phase: "reconnaissance",
      day: 1,
      roundsPerDay: BOM.roundsPerDay,
      legions: [],
      reserves: { allied: [], enemy: [] },
      battles: [],
      miracles: {
        allied: { pool: 8, used: 0, advantagesTotal: 2, advantagesUsed: 0 },
        enemy: { pool: 10, used: 0, advantagesTotal: 2, advantagesUsed: 0 }
      },
      objectives: [],
      pcDeployments: [],
      history: []
    };
  }

  // ── Legion CRUD ──

  /**
   * Create a new legion and add it to state.
   * @param {object} data - Legion data (name, faction, vitBase, morBase, witBase, commander)
   * @returns {object} The created legion
   */
  static async addLegion(data) {
    const state = this.get();
    const legion = {
      id: foundry.utils.randomID(),
      name: data.name ?? "New Legion",
      faction: data.faction ?? "allied",
      vitBase: Number(data.vitBase) || 0,
      morBase: Number(data.morBase) || 0,
      witBase: Number(data.witBase) || 0,
      injuries: Number(data.injuries) || 0,
      moraleMod: Number(data.moraleMod) || 0,
      routed: false,
      destroyed: false,
      wonLastRound: false,
      witTempBonus: 0,
      commander: this._normalizeCommander(data.commander)
    };
    state.legions.push(legion);
    await this.set(state);
    return legion;
  }

  /**
   * Update an existing legion by id.
   * @param {string} id
   * @param {object} updates - Partial legion data to merge
   */
  static async updateLegion(id, updates) {
    const state = this.get();
    const idx = state.legions.findIndex(l => l.id === id);
    if (idx === -1) return;
    if (updates.commander) {
      updates.commander = this._normalizeCommander(updates.commander);
    }
    foundry.utils.mergeObject(state.legions[idx], updates);
    await this.set(state);
  }

  /**
   * Remove a legion by id.
   * @param {string} id
   */
  static async removeLegion(id) {
    const state = this.get();
    state.legions = state.legions.filter(l => l.id !== id);
    await this.set(state);
  }

  /**
   * Get a single legion by id.
   * @param {string} id
   * @returns {object|undefined}
   */
  static getLegion(id) {
    return this.get().legions.find(l => l.id === id);
  }

  /**
   * Get all legions for a faction.
   * @param {"allied"|"enemy"} faction
   * @returns {object[]}
   */
  static getLegionsByFaction(faction) {
    return this.get().legions.filter(l => l.faction === faction);
  }

  // ── Computed legion stats ──

  /**
   * Compute effective stats for a legion (base + commander bonus).
   * @param {object} legion
   * @returns {{ vit: number, mor: number, wit: number }}
   */
  static computeStats(legion) {
    const cmd = legion.commander;
    const alive = cmd?.alive !== false;
    const vit = Math.max(0, legion.vitBase + (alive ? (cmd?.vitBonus ?? 0) : 0));
    const morRaw = legion.morBase + (alive ? (cmd?.morBonus ?? 0) : 0) + (legion.moraleMod ?? 0);
    const mor = Math.min(BOM.moraleCap, Math.max(0, morRaw));
    const wit = Math.max(0, legion.witBase + (alive ? (cmd?.witBonus ?? 0) : 0) + (legion.witTempBonus ?? 0));
    return { vit, mor, wit };
  }

  // ── Round / Phase management ──

  /**
   * Advance to the next phase in the round, or next round if at end.
   */
  static async advancePhase() {
    const state = this.get();
    const idx = BOM.phases.indexOf(state.phase);
    if (idx < BOM.phases.length - 1) {
      state.phase = BOM.phases[idx + 1];
    } else {
      await this._advanceRound(state);
    }
    await this.set(state);
  }

  /**
   * Start a new round.
   * @param {object} state - The state object (mutated in place)
   */
  static async _advanceRound(state) {
    state.round += 1;
    state.phase = BOM.phases[0];

    // Apply idle recovery to legions that didn't fight
    const foughtIds = new Set(state.battles.flatMap(b => [b.alliedLegionId, b.enemyLegionId]));
    for (const legion of state.legions) {
      if (legion.destroyed) continue;
      if (!foughtIds.has(legion.id)) {
        // Idle or routed — heal 1 injury, gain 1 morale
        legion.injuries = Math.max(0, legion.injuries - BOM.idleInjuryRecovery);
        legion.moraleMod += BOM.idleMoraleRecovery;
        // Check rally
        if (legion.routed) {
          const stats = this.computeStats(legion);
          if (stats.mor > BOM.routThreshold) {
            legion.routed = false;
          }
        }
      }
      // Reset wit temp bonus each round
      legion.witTempBonus = 0;
    }

    // Check for end of day
    if (state.round > state.roundsPerDay) {
      await this._endDay(state);
    }

    // Clear battles and deployments for new round
    state.battles = [];
    state.pcDeployments = [];
  }

  /**
   * End the current battle day: overnight recovery, tag reset, new day.
   * @param {object} state
   */
  static async _endDay(state) {
    state.day += 1;
    state.round = 1;

    for (const legion of state.legions) {
      if (legion.destroyed) continue;
      // Overnight recovery: heal 1 injury if at 5 or fewer
      if (legion.injuries <= BOM.overnightInjuryMax && legion.injuries > 0) {
        legion.injuries -= BOM.overnightInjuryRecovery;
      }
      // Overnight morale recovery
      legion.moraleMod += BOM.overnightMoraleRecovery;
      // Reset commander tags
      if (legion.commander?.tags) {
        for (const tag of legion.commander.tags) {
          tag.used = false;
        }
      }
      // Reset won last round
      legion.wonLastRound = false;
    }
  }

  // ── Battle pairing ──

  /**
   * Create a battle pairing between two legions.
   * @param {string} alliedId
   * @param {string} enemyId
   * @returns {object} The created battle
   */
  static async addBattle(alliedId, enemyId) {
    const state = this.get();
    const battle = {
      id: foundry.utils.randomID(),
      alliedLegionId: alliedId,
      enemyLegionId: enemyId,
      phases: [],
      counterAllied: 0,
      counterEnemy: 0,
      winner: null,
      maneuverBenefit: null,
      aftermathAllied: null,
      aftermathEnemy: null,
      resolved: false
    };
    state.battles.push(battle);
    await this.set(state);
    return battle;
  }

  /**
   * Remove a battle pairing by id.
   * @param {string} id
   */
  static async removeBattle(id) {
    const state = this.get();
    state.battles = state.battles.filter(b => b.id !== id);
    await this.set(state);
  }

  /**
   * Update a battle by id.
   * @param {string} id
   * @param {object} updates
   */
  static async updateBattle(id, updates) {
    const state = this.get();
    const idx = state.battles.findIndex(b => b.id === id);
    if (idx === -1) return;
    foundry.utils.mergeObject(state.battles[idx], updates);
    await this.set(state);
  }

  // ── Objectives ──

  static async addObjective(data) {
    const state = this.get();
    state.objectives.push({
      id: foundry.utils.randomID(),
      name: data.name ?? "Objective",
      section: data.section ?? "",
      heldBy: null,
      heldRounds: 0,
      destroyed: false
    });
    await this.set(state);
  }

  static async removeObjective(id) {
    const state = this.get();
    state.objectives = state.objectives.filter(o => o.id !== id);
    await this.set(state);
  }

  // ── Reserves ──

  static async addReserve(faction, commander) {
    const state = this.get();
    state.reserves[faction].push(this._normalizeCommander(commander));
    await this.set(state);
  }

  static async removeReserve(faction, index) {
    const state = this.get();
    state.reserves[faction].splice(index, 1);
    await this.set(state);
  }

  // ── Miracles ──

  static async spendMiracle(faction, amount = 1) {
    const state = this.get();
    const m = state.miracles[faction];
    if (m.used + amount <= m.pool) {
      m.used += amount;
      await this.set(state);
      return true;
    }
    return false;
  }

  static async spendAdvantage(faction) {
    const state = this.get();
    const m = state.miracles[faction];
    if (m.advantagesUsed < m.advantagesTotal) {
      m.advantagesUsed += 1;
      await this.set(state);
      return true;
    }
    return false;
  }

  static async resetMiracles() {
    const state = this.get();
    state.miracles.allied.used = 0;
    state.miracles.allied.advantagesUsed = 0;
    state.miracles.enemy.used = 0;
    state.miracles.enemy.advantagesUsed = 0;
    await this.set(state);
  }

  // ── Reset ──

  static async resetState() {
    await this.set(this.defaultState());
  }

  // ── Import/Export ──

  static exportState() {
    return JSON.stringify(this.get(), null, 2);
  }

  static async importState(json) {
    const state = JSON.parse(json);
    await this.set(state);
  }

  // ── CSV Import ──

  /**
   * Import legions and commanders from CSV text (same format as the Python sim).
   * @param {string} legionsCsv
   * @param {string} commandersCsv
   */
  static async importFromCSV(legionsCsv, commandersCsv) {
    const state = this.get();

    // Parse legions CSV
    const legionRows = this._parseCSV(legionsCsv);
    const cmdRows = this._parseCSV(commandersCsv);

    // Build commander lookup: legion name → commander data
    const cmdByLegion = new Map();
    const reservesByFaction = { allied: [], enemy: [] };

    for (const row of cmdRows) {
      const cmd = {
        name: row.name,
        vitBonus: Number(row.vitality) || 0,
        morBonus: Number(row.morale) || 0,
        witBonus: Number(row.wit) || 0,
        tags: (row.tags || "").split(",").filter(Boolean).map(t => ({ name: t.trim(), used: false })),
        alive: true
      };
      const legionName = (row.legion || "").trim();
      if (legionName) {
        cmdByLegion.set(legionName, cmd);
      } else {
        const faction = row.faction?.toLowerCase() === "enemy" ? "enemy" : "allied";
        reservesByFaction[faction].push(cmd);
      }
    }

    // Build legions
    for (const row of legionRows) {
      const faction = row.faction?.toLowerCase() === "enemy" ? "enemy" : "allied";
      const legion = {
        id: foundry.utils.randomID(),
        name: row.name,
        faction,
        vitBase: Number(row.vitality) || 0,
        morBase: Number(row.morale) || 0,
        witBase: Number(row.wit) || 0,
        injuries: 0,
        moraleMod: 0,
        routed: false,
        destroyed: false,
        wonLastRound: false,
        witTempBonus: 0,
        commander: cmdByLegion.get(row.name) ?? this._normalizeCommander({})
      };
      state.legions.push(legion);
    }

    state.reserves = reservesByFaction;
    await this.set(state);
  }

  // ── Internal helpers ──

  static _normalizeCommander(data) {
    if (!data) data = {};
    return {
      name: data.name ?? "Unknown",
      vitBonus: Number(data.vitBonus) || 0,
      morBonus: Number(data.morBonus) || 0,
      witBonus: Number(data.witBonus) || 0,
      tags: Array.isArray(data.tags) ? data.tags.map(t =>
        typeof t === "string" ? { name: t, used: false } : { name: t.name, used: !!t.used }
      ) : [],
      alive: data.alive !== false
    };
  }

  /**
   * Parse CSV text into array of objects (header row as keys).
   * @param {string} csv
   * @returns {object[]}
   */
  static _parseCSV(csv) {
    const lines = csv.trim().split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      // Handle quoted fields (for tags with commas)
      const fields = [];
      let current = "";
      let inQuotes = false;
      for (const ch of lines[i]) {
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === "," && !inQuotes) { fields.push(current.trim()); current = ""; continue; }
        current += ch;
      }
      fields.push(current.trim());

      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = fields[j] ?? "";
      }
      rows.push(obj);
    }
    return rows;
  }
}
