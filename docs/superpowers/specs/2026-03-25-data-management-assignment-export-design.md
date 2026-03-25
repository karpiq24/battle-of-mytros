# Spec: Phase 2 Data Management (Assignment & Export)

**Date:** 2026-03-25
**Status:** Approved

## Goal
Build the GM controls for managing commander assignments directly from the dashboard and provide CSV export functionality for both Legions and Commanders.

## Architecture

### 1. Commander Assignment
- **Logic:** Link a Commander Actor to a Legion Actor via the `commanderId` flag.
- **UI:** A `<select>` dropdown within each Legion's card on the `Overview` tab (GM only).
- **Sync:** Use `updateActor` hooks to ensure all connected clients re-render the dashboard when assignments or stats change.

### 2. CSV Export Engine
- **Logic:** A new utility in `MytrosCSVParser` to generate CSV strings from current Actor data and trigger browser downloads.
- **UI:** Two buttons in the `Setup` tab: "Export Legions" and "Export Commanders".

## Technical Details

### Dashboard Context (`scripts/apps/dashboard.mjs`)
- Fetch all actors with `isCommander` flag to populate assignment dropdowns.
- Pass `commanders` list to the Handlebars template.

### Handlebars Template (`templates/dashboard.hbs`)
- **GM View:** Dropdown for selecting a commander.
- **Player View:** Text display of the assigned commander.
- Add visual indicators (icons) for led legions.

### CSV Parser (`scripts/utils/csv-parser.mjs`)
- `exportLegions()`: Exports `Name, Faction, Vitality, Morale, Wit, Injuries, CommanderName`.
- `exportCommanders()`: Exports `Name, Tags` (comma-separated list of items).

### Global Hooks (`scripts/module.mjs`)
- `updateActor`: Trigger dashboard re-render if a Legion actor is updated.
- `deleteActor`: Ensure `commanderId` references are cleaned up or handled gracefully if a commander is deleted.

## Success Criteria
1. DM can assign/unassign commanders from the dashboard.
2. Players see the updated commander assignment in real-time.
3. DM can download two separate CSV files containing the current state of all Legions and Commanders.
