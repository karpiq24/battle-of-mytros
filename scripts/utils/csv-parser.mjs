export class MytrosCSVParser {
    static async processCSV(csvText, type) {
        const rows = csvText.split('\n').map(r => r.trim()).filter(r => r);
        if (rows.length === 0) return;
        
        const headers = rows.shift().split(',').map(h => h.trim().toLowerCase());

        let created = 0;
        let updated = 0;

        for (const row of rows) {
            // Split by comma, but handle potential quotes (basic implementation)
            const cols = row.split(',').map(c => c.trim());
            const data = {};
            headers.forEach((h, i) => data[h] = cols[i]);

            if (!data.name) continue;

            let actor = game.actors.getName(data.name);
            const isNew = !actor;

            if (isNew) {
                // Determine folder or create root
                actor = await Actor.create({
                    name: data.name,
                    type: "character" // Using 'character' as generic fallback
                });
                created++;
            } else {
                updated++;
            }

            if (type === "legion") {
                await globalThis.MytrosActorData.initLegion(actor, data.faction || "allied");
                await actor.setFlag("battle-of-mytros", "stats", {
                    vitality: Number(data.vitality) || 10,
                    morale: Number(data.morale) || 10,
                    wit: Number(data.wit) || 10,
                    injuries: Number(data.injuries) || 0
                });
            } else if (type === "commander") {
                await globalThis.MytrosActorData.initCommander(actor);
                // Future: parse tags from CSV and create items here
            }
        }
        
        ui.notifications.info(`Processed ${type}s: ${created} created, ${updated} updated.`);
    }

    static async exportLegions() {
        const legions = game.actors.filter(a => globalThis.MytrosActorData.isLegion(a));
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
        const commanders = game.actors.filter(a => globalThis.MytrosActorData.isCommander(a));
        let csv = "Name,Tags\n";
        for (const c of commanders) {
            const tags = c.items.map(i => i.name).join("; ");
            csv += `"${c.name}","${tags}"\n`;
        }
        this._downloadCSV("commanders-export.csv", csv);
    }

    static _downloadCSV(filename, text) {
        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(text));
        element.setAttribute('download', filename);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }
}
