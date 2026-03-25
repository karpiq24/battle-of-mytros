# Foundry VTT Module Development Standards

*Reference for Battle of Mytros project.*

## Core Structure
A Foundry VTT module is defined as a uniquely-named subfolder within `{userData}/Data/modules/`.

- **Mandatory File:** `module.json` at the root.
- **Project Structure:**
  - `scripts/`: JavaScript logic (ES6 modules).
  - `templates/`: Handlebars (.hbs) or HTML templates.
  - `styles/`: CSS files.
  - `lang/`: Localization JSON files (e.g., `en.json`, `pl.json`).
  - `packs/`: Compendium content.

## Development Mandates
- **No NPM by Default:** Foundry modules do not strictly require `npm`, `package.json`, or typical JS build tools unless explicitly configured for advanced pipelines (Vite, Webpack).
- **Validation:** Use browser DevTools (F12) and the Console tab for debugging.
- **Dependencies:** Managed via `relationships` in `module.json`, not `package.json`.
- **Testing:** Automated test suites are not standard in introductory Foundry development. Verification is typically performed through manual UI testing and console logs within the Foundry VTT environment.

## Integration Hooks
Foundry modules rely heavily on the **Hooks API**.
- `init`: Setup logic.
- `ready`: Logic after the world is loaded.
- `render[Application]`: Modifying UI before it's displayed.
- `update[Document]`: Responding to data changes.
