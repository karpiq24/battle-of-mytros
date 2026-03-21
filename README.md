# Battle of Mytros (Foundry VTT Module)

A DM workflow assistant module for running mass combat in *Odyssey of the Dragonlords* within Foundry VTT.

This module automates the custom mass combat system rules (A War of Steel, Will, and Cunning) for the climactic Battle of Mytros, turning a multi-session strategic war into an easily manageable VTT experience. It tracks legion stats, handles complex automated battle rolls, and presents dramatic outcomes directly to your players in the chat.

## Features

- **The Battle Dashboard:** A centralized, constantly accessible UI for the Game Master to oversee the war. It completely manages the state of all allied and enemy legions, current rounds, and phases.
- **Legion & Commander Management:** Built-in editors to quickly create and configure legions (Vitality, Morale, Wit) and their commanders. Assign unique, game-changing tags (e.g., Tactician, Vanguard, Brutal) that correctly apply bonuses to automated rolls.
- **Automated Battle Resolution:** Forget manual math and cross-referencing tables. The module comes with a battle resolver that automatically rolls and calculates the results for the three phases of combat: The Maneuver (Wit), The Charge (Morale), and The Clash (Vitality), correctly applying advantages, counter points, and PC deployment bonuses.
- **Automated Aftermath Handling:** Instantly processes Recovery checks (injuries), Hope checks (morale adjustments and routs), Salvage checks, and tension-filled Commander Casualty rolls.
- **Chat Log Integration:** Sends beautiful, stylized chat cards for battle phase resolutions, recon intel, aftermath summaries, and dramatic commander deaths, keeping the players engaged with the changing tides of war.
- **Easy Access:** Adds a dedicated launch button directly to the Foundry VTT Token Controls layer natively (`fas fa-swords`).
- **Localization Support:** Fully supports English and Polish out of the box.

## Installation

1. In the Foundry VTT Setup screen, navigate to the **Add-on Modules** tab.
2. Click **Install Module**.
3. At the bottom, paste the following Manifest URL:
   `https://raw.githubusercontent.com/karpiq24/battle-of-mytros/main/module.json`
4. Click **Install**.
5. Enable the "Battle of Mytros" module in your world's module settings.

## Getting Started

Once the module is active and you log in as a Game Master:
1. Navigate to the **Token Controls** menu on the left side of the screen.
2. Click the new crossed-swords icon to open the **Battle Dashboard**.
3. Use the **Setup** and **Legions** tabs to configure Sydon's forces and your Allied legions. 
4. Move through the rounds and use the **Battle Resolver** to automatically clash legions and apply aftermath effects.

## The Mass Combat System
This module is built specifically for the "War of Steel, Will, and Cunning" ruleset overhaul for *Odyssey of the Dragonlords*. It focuses on three core stats for legions (Vitality, Morale, Wit), permanent commander deaths, and using player characters as fast-response forces to tip the balance of specific clashes while playing out major narrative D&D encounters in between.
