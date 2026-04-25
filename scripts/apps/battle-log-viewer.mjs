const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BattleLogViewerApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static _log = [];
    static _meta = { regionName: "", alliedName: "", sydonName: "", phase: "" };

    static DEFAULT_OPTIONS = {
        id: "mytros-battle-log-viewer",
        window: { title: "Battle Log", resizable: true },
        position: { width: 480, height: 600 },
    };

    static PARTS = {
        form: { template: "modules/battle-of-mytros/templates/battle-log-viewer.hbs" },
    };

    /**
     * Called by the socket handler when the GM emits a log update.
     * Opens the viewer if not open, then re-renders it.
     */
    static update(data) {
        BattleLogViewerApp._log = data.log ?? [];
        BattleLogViewerApp._meta = {
            regionName: data.regionName ?? "",
            alliedName: data.alliedName ?? "",
            sydonName: data.sydonName ?? "",
            phase: data.phase ?? "",
            battleScore: data.battleScore,
        };
        const existing = foundry.applications.instances.get("mytros-battle-log-viewer");
        if (existing) {
            existing.render({ force: true });
        } else {
            new BattleLogViewerApp().render({ force: true });
        }
    }

    /**
     * Called by the socket handler when the GM closes the resolver.
     */
    static clear() {
        BattleLogViewerApp._log = [];
        BattleLogViewerApp._meta = { regionName: "", alliedName: "", sydonName: "", phase: "" };
        foundry.applications.instances.get("mytros-battle-log-viewer")?.close();
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.log = BattleLogViewerApp._log;
        context.meta = BattleLogViewerApp._meta;
        context.isLive = BattleLogViewerApp._meta.phase !== "complete";

        const score = context.meta.battleScore;
        context.battleScoreDisplay = score === undefined || score === null ? "—" : `${score >= 0 ? "+" : ""}${score}`;
        context.battleScoreClass =
            score === undefined || score === null
                ? ""
                : score > 0
                  ? "score-allied"
                  : score < 0
                    ? "score-sydon"
                    : "score-tie";

        return context;
    }

    _onRender(context, options) {
        super._onRender?.(context, options);
        const log = this.element.querySelector(".battle-log");
        if (log) log.scrollTop = log.scrollHeight;
    }
}
