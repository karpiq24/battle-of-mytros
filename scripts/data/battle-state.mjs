import { BOM } from "../config.mjs";

/**
 * Manages the full battle state stored in game.settings.
 * All mutations go through this class to ensure consistency and persistence.
 *
 * Data model:
 *   state.commanders[] — independent commander entities: { id, name, faction, vitBonus, morBonus, witBonus, tags, alive }
 *   state.legions[]    — reference commanders by commanderId (not embedded)
 */
export class BattleState {

  /** @returns {object} The current battle state from settings (auto-migrated) */
  static get() {
    const state = game.settings.get(BOM.moduleId, "battleState");
    return this._migrateState(state);
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
      commanders: [],
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

  /**
   * Migrate old state format (embedded legion.commander) to new format (separate commanders array).
   * Safe to call repeatedly — only migrates legions that still have an embedded commander object.
   * @param {object} state
   * @returns {object}
   */
  static _migrateState(state) {
    if (!state.commanders) state.commanders = [];
    for (const legion of state.legions ?? []) {
      if (legion.commander && !legion.commanderId) {
        const cmd = {
          id: foundry.utils.randomID(),
          name: legion.commander.name ?? "Unknown",
          faction: legion.faction,
          vitBonus: legion.commander.vitBonus ?? 0,
          morBonus: legion.commander.morBonus ?? 0,
          witBonus: legion.commander.witBonus ?? 0,
          tags: Array.isArray(legion.commander.tags) ? legion.commander.tags : [],
          alive: legion.commander.alive !== false
        };
        state.commanders.push(cmd);
        legion.commanderId = cmd.id;
        delete legion.commander;
      }
    }
    return state;
  }

  // ── Commander CRUD ──

  static async addCommander(data) {
    const state = this.get();
    const cmd = {
      id: foundry.utils.randomID(),
      name: data.name ?? "Unknown",
      faction: data.faction ?? "allied",
      vitBonus: Number(data.vitBonus) || 0,
      morBonus: Number(data.morBonus) || 0,
      witBonus: Number(data.witBonus) || 0,
      tags: this._normalizeTags(data.tags),
      alive: data.alive !== false
    };
    state.commanders.push(cmd);
    await this.set(state);
    return cmd;
  }

  static async updateCommander(id, updates) {
    const state = this.get();
    const idx = state.commanders.findIndex(c => c.id === id);
    if (idx === -1) return;
    if (updates.tags !== undefined) updates.tags = this._normalizeTags(updates.tags);
    foundry.utils.mergeObject(state.commanders[idx], updates);
    await this.set(state);
  }

  static async removeCommander(id) {
    const state = this.get();
    // Unassign from any legion using this commander
    for (const legion of state.legions) {
      if (legion.commanderId === id) legion.commanderId = null;
    }
    state.commanders = state.commanders.filter(c => c.id !== id);
    await this.set(state);
  }

  /** @returns {object|null} */
  static getCommander(id) {
    if (!id) return null;
    return this.get().commanders?.find(c => c.id === id) ?? null;
  }

  /** Assign (or unassign) a commander to a legion. */
  static async assignCommander(legionId, commanderId) {
    const state = this.get();
    const legion = state.legions.find(l => l.id === legionId);
    if (!legion) return;
    legion.commanderId = commanderId || null;
    await this.set(state);
  }

  // ── Legion CRUD ──

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
      commanderId: data.commanderId ?? null
    };
    state.legions.push(legion);
    await this.set(state);
    return legion;
  }

  static async updateLegion(id, updates) {
    const state = this.get();
    const idx = state.legions.findIndex(l => l.id === id);
    if (idx === -1) return;
    // Strip any legacy embedded commander from updates
    delete updates.commander;
    foundry.utils.mergeObject(state.legions[idx], updates);
    await this.set(state);
  }

  static async removeLegion(id) {
    const state = this.get();
    state.legions = state.legions.filter(l => l.id !== id);
    await this.set(state);
  }

  static getLegion(id) {
    return this.get().legions.find(l => l.id === id);
  }

  static getLegionsByFaction(faction) {
    return this.get().legions.filter(l => l.faction === faction);
  }

  // ── Computed legion stats ──

  /**
   * Compute effective stats for a legion (base + commander bonus).
   * Looks up the assigned commander from state by legion.commanderId.
   * @param {object} legion
   * @returns {{ vit: number, mor: number, wit: number }}
   */
  static computeStats(legion) {
    const commanders = this.get().commanders ?? [];
    const cmd = commanders.find(c => c.id === legion.commanderId) ?? null;
    const alive = cmd?.alive !== false;
    const vit = Math.max(0, legion.vitBase + (alive && cmd ? (cmd.vitBonus ?? 0) : 0));
    const morRaw = legion.morBase + (alive && cmd ? (cmd.morBonus ?? 0) : 0) + (legion.moraleMod ?? 0);
    const mor = Math.min(BOM.moraleCap, Math.max(0, morRaw));
    const wit = Math.max(0, legion.witBase + (alive && cmd ? (cmd.witBonus ?? 0) : 0) + (legion.witTempBonus ?? 0));
    return { vit, mor, wit };
  }

  // ── Round / Phase management ──

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

  static async _advanceRound(state) {
    state.round += 1;
    state.phase = BOM.phases[0];

    const foughtIds = new Set(state.battles.flatMap(b => [b.alliedLegionId, b.enemyLegionId]));
    for (const legion of state.legions) {
      if (legion.destroyed) continue;
      if (!foughtIds.has(legion.id)) {
        legion.injuries = Math.max(0, legion.injuries - BOM.idleInjuryRecovery);
        legion.moraleMod += BOM.idleMoraleRecovery;
        if (legion.routed) {
          const stats = this.computeStats(legion);
          if (stats.mor > BOM.routThreshold) {
            legion.routed = false;
          }
        }
      }
      legion.witTempBonus = 0;
    }

    if (state.round > state.roundsPerDay) {
      await this._endDay(state);
    }

    state.battles = [];
    state.pcDeployments = [];
  }

  static async _endDay(state) {
    state.day += 1;
    state.round = 1;

    for (const legion of state.legions) {
      if (legion.destroyed) continue;
      if (legion.injuries <= BOM.overnightInjuryMax && legion.injuries > 0) {
        legion.injuries -= BOM.overnightInjuryRecovery;
      }
      legion.moraleMod += BOM.overnightMoraleRecovery;
      legion.wonLastRound = false;
    }

    // Reset commander tags each day (not per round — tags are per-day resources)
    for (const cmd of state.commanders ?? []) {
      for (const tag of cmd.tags ?? []) {
        tag.used = false;
      }
    }
  }

  // ── Battle pairing ──

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

  static async removeBattle(id) {
    const state = this.get();
    state.battles = state.battles.filter(b => b.id !== id);
    await this.set(state);
  }

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

  static async importFromCSV(legionsCsv, commandersCsv) {
    const state = this.get();

    const legionRows = this._parseCSV(legionsCsv);
    const cmdRows = this._parseCSV(commandersCsv);

    // Create commander entities; build legion-name → commanderId map
    const cmdByLegion = new Map();
    const newCommanders = [];

    for (const row of cmdRows) {
      const cmd = {
        id: foundry.utils.randomID(),
        name: row.name,
        faction: row.faction?.toLowerCase() === "enemy" ? "enemy" : "allied",
        vitBonus: Number(row.vitality) || 0,
        morBonus: Number(row.morale) || 0,
        witBonus: Number(row.wit) || 0,
        tags: (row.tags || "").split(",").filter(Boolean).map(t => ({ name: t.trim(), used: false })),
        alive: true
      };
      newCommanders.push(cmd);
      const legionName = (row.legion || "").trim();
      if (legionName) {
        cmdByLegion.set(legionName, cmd.id);
      }
    }

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
        commanderId: cmdByLegion.get(row.name) ?? null
      };
      state.legions.push(legion);
    }

    state.commanders.push(...newCommanders);
    await this.set(state);
  }

  // ── Internal helpers ──

  static _normalizeTags(tags) {
    if (!Array.isArray(tags)) return [];
    return tags.map(t =>
      typeof t === "string" ? { name: t, used: false } : { name: t.name, used: !!t.used }
    );
  }

  /** @deprecated Only kept for reserves which still use embedded commander objects */
  static _normalizeCommander(data) {
    if (!data) data = {};
    return {
      name: data.name ?? "Unknown",
      vitBonus: Number(data.vitBonus) || 0,
      morBonus: Number(data.morBonus) || 0,
      witBonus: Number(data.witBonus) || 0,
      tags: this._normalizeTags(data.tags),
      alive: data.alive !== false
    };
  }

  static _parseCSV(csv) {
    const lines = csv.trim().split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
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
