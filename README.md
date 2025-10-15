# Masque Noire

A Firebase-backed multiplayer horror experience set in a 1945 French estate. Players attend a masquerade ball that slips into a noir nightmare: one guest becomes the killer inspired by Jack the Ripper, while the others scramble to survive, unravel puzzles, and escape. An alternate "Alien Hunt" ruleset swaps the killer for an extraterrestrial hunter with reality-warping powers.

## Features

- **Role Assignment** – Firebase Firestore keeps match rosters synchronized and randomly appoints a killer each round.
- **Survivor Objectives** – Environmental puzzle actions unlock tools, improvised weapons, and key fragments required to open the manor's exit.
- **Killer Gameplay** – Killer-exclusive puzzles bestow sabotage tools such as wire cutters and deadly implements. Hidden passages allow fast relocation across the estate.
- **Stealth System** – Survivors can trigger a hold-your-breath event to hide. Failing the quick-time moment tips off the killer and updates the shared log.
- **Event Log** – Every action is chronicled in a noir incident tape that all connected players can read in real time.
- **Alien Hunt Mode** – Swap to a neon-tinged invasion scenario with alien abilities, psychic tracking, and altered survivor tech.

## Getting Started

1. Create a Firebase project and enable **Authentication** (Anonymous sign-in) and **Cloud Firestore** in test mode or with appropriate security rules.
2. Copy your Firebase web configuration from the project settings and paste it into [`script.js`](script.js) in the `firebaseConfig` object.
3. Serve the files locally (for example, `npx serve` or `python -m http.server`) and open `index.html` in multiple tabs or devices to simulate players.
4. Enter a shared Match ID and unique player aliases to join the same lobby. The application will automatically assign roles and broadcast actions.

> **Security Tip:** Once development stabilizes, harden Firestore security rules to restrict write access to authenticated players within their active match.

## Project Structure

```
.
├── index.html      # Single-page layout and interface markup
├── styles.css      # Noir-inspired styling and responsive layout
└── script.js       # Firebase multiplayer logic, role assignment, and gameplay actions
```

## Inspiration & Tone

Masque Noire leans on jazz-age noir, post-war melancholy, and the claustrophobia of occupied France. Ornate UI panels, flickering textures, and ambient copy reinforce the decay of the grand estate while hinting at the survivors' dwindling hope.
