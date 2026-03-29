export class MytrosCSVParser {
    /**
     * Find or create a folder in the Actors sidebar.
     * @param {string} name  Folder name
     * @param {Folder|null} parent  Parent folder (null = root)
     * @returns {Promise<Folder>}
     */
    static async _getOrCreateFolder(name, parent = null) {
        const existing = game.folders.find(
            (f) => f.type === "Actor" && f.name === name && (parent ? f.folder?.id === parent.id : !f.folder)
        );
        if (existing) return existing;
        return Folder.create({
            name,
            type: "Actor",
            folder: parent?.id ?? null,
        });
    }

    /**
     * Normalize faction string from CSV to the canonical "allied" or "sydon".
     */
    static _normalizeFaction(raw) {
        if (!raw) return "allied";
        const lower = raw.trim().toLowerCase();
        if (["sydon", "enemy"].includes(lower)) return "sydon";
        return "allied";
    }

    static async processCSV(csvText, type) {
        const rows = csvText
            .split("\n")
            .map((r) => r.trim())
            .filter((r) => r);
        if (rows.length === 0) return;

        const headers = rows
            .shift()
            .split(",")
            .map((h) => h.trim().toLowerCase());

        // Pre-create folders
        const rootFolder = await this._getOrCreateFolder("Battle of Mytros");
        const subFolder = await this._getOrCreateFolder(type === "legion" ? "Legions" : "Commanders", rootFolder);

        let created = 0;
        let updated = 0;

        for (const row of rows) {
            // Split by comma but respect quoted strings
            const cols = this._splitCSVRow(row);
            const data = {};
            headers.forEach((h, i) => (data[h] = (cols[i] || "").trim()));

            if (!data.name) continue;

            // Find existing actor by name (any folder)
            let actor = game.actors.getName(data.name);
            const isNew = !actor;

            if (isNew) {
                const actorType = type === "legion" ? "group" : "npc";
                const prototypeToken =
                    type === "legion"
                        ? {
                              displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
                              displayBars: CONST.TOKEN_DISPLAY_MODES.HOVER,
                              disposition:
                                  this._normalizeFaction(data.faction) === "allied"
                                      ? CONST.TOKEN_DISPOSITIONS.FRIENDLY
                                      : CONST.TOKEN_DISPOSITIONS.HOSTILE,
                              bar1: { attribute: "flags.battle-of-mytros.stats.morale" },
                              bar2: { attribute: "flags.battle-of-mytros.stats.injuries" },
                          }
                        : {};
                actor = await Actor.create({
                    name: data.name,
                    type: actorType,
                    folder: subFolder.id,
                    prototypeToken: prototypeToken,
                });
                created++;
            } else {
                updated++;
            }

            if (type === "legion") {
                const faction = this._normalizeFaction(data.faction);
                await globalThis.MytrosActorData.initLegion(actor, faction);
                await actor.setFlag("battle-of-mytros", "stats", {
                    vitality: Number(data.vitality) || 4,
                    morale: Number(data.morale) || 4,
                    wit: Number(data.wit) || 4,
                    injuries: Number(data.injuries) || 0,
                });
            } else if (type === "commander") {
                const faction = this._normalizeFaction(data.faction);
                await globalThis.MytrosActorData.initCommander(actor, faction);
                // Also always overwrite to the CSV value
                await actor.setFlag("battle-of-mytros", "faction", faction);
                // Parse tags and create Items on the actor
                const tagStr = data.tags || "";
                if (tagStr) {
                    const tagNames = tagStr
                        .split(/[;,]/)
                        .map((t) => t.trim())
                        .filter((t) => t);
                    await this._ensureTagItems(actor, tagNames);
                }
                // Assign to legion if specified
                const legionName = data.legion?.trim();
                if (legionName) {
                    const legion = game.actors.find(
                        (a) => globalThis.MytrosActorData.isLegion(a) && a.name === legionName
                    );
                    if (legion) {
                        await legion.setFlag("battle-of-mytros", "commanderId", actor.id);
                    }
                }
            }
        }

        ui.notifications.info(`Processed ${type}s: ${created} created, ${updated} updated.`);
    }

    /**
     * Split a CSV row respecting quoted fields.
     */
    static _splitCSVRow(row) {
        const result = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < row.length; i++) {
            const char = row[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === "," && !inQuotes) {
                result.push(current);
                current = "";
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    }

    /**
     * Ensure tag Items exist on a commander actor. Creates missing ones.
     * @param {Actor} actor  The commander actor
     * @param {string[]} tagNames  Array of tag name strings
     */
    static async _ensureTagItems(actor, tagNames) {
        const existingTags = actor.items.map((i) => i.name.toLowerCase());
        const toCreate = tagNames.filter((t) => !existingTags.includes(t.toLowerCase()));
        if (toCreate.length === 0) return;

        // Title-case the tag name for display
        const itemData = toCreate.map((tag) => ({
            name: tag
                .split(" ")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(" "),
            type: "loot", // generic item type that works in most systems including dnd5e
        }));

        await actor.createEmbeddedDocuments("Item", itemData);
    }

    static async exportLegions() {
        const legions = game.actors.filter((a) => globalThis.MytrosActorData.isLegion(a));
        let csv = "Name,Faction,Vitality,Morale,Wit,Injuries,CommanderName\n";
        for (const l of legions) {
            const stats = l.getFlag("battle-of-mytros", "stats") || {};
            const commanderId = l.getFlag("battle-of-mytros", "commanderId");
            const commanderName = commanderId ? game.actors.get(commanderId)?.name || "" : "";
            csv += `"${l.name}","${l.getFlag("battle-of-mytros", "faction")}",${stats.vitality || 10},${stats.morale || 10},${stats.wit || 10},${stats.injuries || 0},"${commanderName}"\n`;
        }
        this._downloadCSV("legions-export.csv", csv);
    }

    static async exportCommanders() {
        const commanders = game.actors.filter((a) => globalThis.MytrosActorData.isCommander(a));
        let csv = "Name,Tags\n";
        for (const c of commanders) {
            const tags = c.items.map((i) => i.name).join("; ");
            csv += `"${c.name}","${tags}"\n`;
        }
        this._downloadCSV("commanders-export.csv", csv);
    }

    static _downloadCSV(filename, text) {
        const element = document.createElement("a");
        element.setAttribute("href", "data:text/csv;charset=utf-8," + encodeURIComponent(text));
        element.setAttribute("download", filename);
        element.style.display = "none";
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }
}
