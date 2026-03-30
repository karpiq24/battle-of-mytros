/**
 * Draws gold lines between adjacent section regions on the canvas.
 * Toggled via a scene control button.
 */
export class AdjacencyOverlay {
    static _visible = false;
    static _graphics = null;

    static toggle() {
        this._visible = !this._visible;
        this.draw();
    }

    static draw() {
        // Remove existing graphics
        if (this._graphics) {
            this._graphics.destroy();
            this._graphics = null;
        }
        if (!this._visible) return;

        const battleSceneId = game.settings.get("battle-of-mytros", "battleSceneId");
        if (canvas.scene?.id !== battleSceneId) return;

        const pairs = JSON.parse(game.settings.get("battle-of-mytros", "adjacencyPairs") || "[]");
        if (!pairs.length) return;

        const sections = globalThis.MytrosRegionManager.getActiveSections();
        const sectionCenters = new Map();
        for (const region of sections) {
            const obj = region.object;
            if (!obj) continue;
            // Compute center from the region's shapes bounding box
            const bounds = obj.bounds ?? obj.shape?.getBounds?.();
            if (bounds) {
                sectionCenters.set(region.id, {
                    x: bounds.x + bounds.width / 2,
                    y: bounds.y + bounds.height / 2,
                });
            }
        }

        this._graphics = new PIXI.Graphics();
        canvas.controls.addChild(this._graphics);

        const color = 0xd4a017; // --mytros-accent gold
        const lineWidth = 3;
        const alpha = 0.8;
        const dotRadius = 8;

        this._graphics.lineStyle(lineWidth, color, alpha);

        for (const [aId, bId] of pairs) {
            const a = sectionCenters.get(aId);
            const b = sectionCenters.get(bId);
            if (!a || !b) continue;

            this._graphics.moveTo(a.x, a.y);
            this._graphics.lineTo(b.x, b.y);

            this._graphics.beginFill(color, 0.6);
            this._graphics.drawCircle(a.x, a.y, dotRadius);
            this._graphics.drawCircle(b.x, b.y, dotRadius);
            this._graphics.endFill();
        }
    }

    static clear() {
        if (this._graphics) {
            this._graphics.destroy();
            this._graphics = null;
        }
        this._visible = false;
    }
}
