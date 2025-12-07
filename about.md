# Cards Against Humanity Family — About

Playable at: https://cute-puffpuff-9dee4b.netlify.app

This is a peer-to-peer, browser-based implementation of a Cards Against Humanity–style party game, tuned for quick play on desktop and mobile. The app uses WebRTC (via PeerJS) to connect players directly, keeps the UI compact for small screens, and supports an optional bot (“Rando Cardrissian”) that will auto-play random cards each round.

## Players

- **Goal**: Be the first to reach the configured points-to-win (default 5) by having the Card Czar select your white card as the funniest response to the black card prompt.
- **Joining a game**
  - Open https://cute-puffpuff-9dee4b.netlify.app.
  - Enter your name (20 chars max) and the room code provided by the host, then click “Join Room.”
  - If you are hosting, click “Create New Room” to generate a code and share it.
- **Lobby**
  - See the room code and current players list.
  - The host can optionally enable **Rando Cardrissian (bot)**. Rando plays a random white card every round and never becomes Czar.
  - The host can start once the minimum players threshold is met (default 2; Rando counts toward the minimum when enabled).
- **Roles and flow**
  - One player each round is the **Card Czar**. The Czar does not play a white card that round; they judge instead.
  - Non-Czar players choose one white card from their hand to answer the black card prompt.
  - When all non-Czar players have submitted, the Czar sees all submitted white cards face up (shuffled) and picks the winner.
  - The winning player earns 1 point. First to `POINTS_TO_WIN` (default 5) wins the game.
  - The Czar role rotates each round and explicitly skips Rando.
- **In-round UI cues**
  - **Selecting phase**: Non-Czar players see their hand; Czar sees a waiting message. Played cards display as face-down placeholders until judging starts.
  - **Judging phase**: All submitted cards are shown face up to the Czar (clickable to pick a winner). Non-Czar players see the same grid (read-only).
  - **Round winner banner**: When a winner is chosen, a green banner under the black card shows who won the round for all players.
  - **Game over**: Shows the game winner and provides a “Play Again” button for the host to restart.
- **Connection status**
  - A small status box shows connection messages (connecting/disconnected/errors). If your connection drops, the app will attempt to reconnect automatically.
- **Copying the room code**
  - Click the room code to copy it to clipboard (desktop and mobile supported).
- **Device notes**
  - Mobile: The layout is compact and scrollable; tabs let you flip between “Played Cards” and “Your Hand.”
  - Desktop: Wider grid for cards; horizontal player-score bar shows Czar marker and scores.
- **Privacy**
  - Game state is relayed peer-to-peer through the host’s browser; no server stores gameplay state. Your name and cards are shared only with connected peers.

## Developers

- **Tech stack**
  - HTML/CSS/JS (vanilla) front-end.
  - Peer-to-peer networking via PeerJS (CDN, current version pinned in `index.html`).
  - Lodash for shuffling and small utilities.
  - Static hosting friendly (Netlify).
- **Key files**
  - `index.html` — markup, CDN script includes, root screens.
  - `style.css` — layout, responsive grid, banner styling, lobby controls.
  - `script.js` — all game logic: connection handling, state machine, deck management, UI updates.
  - `cah-cards-full.json` — card data (black and white decks).
- **State model (script.js)**
  - `gameState`: holds player roster, host flags, decks (`whiteDeck`, `blackDeck`), hands, phase, czar, scores, played cards, winners, and connections.
  - Phases: `selecting` → `judging` → `showing_winner` → (repeat) or `game_over`.
  - Rando support: `RANDO_ID`, `RANDO_NAME`, `isRando` helper; `includeRando` flag; `randoHand` for host-managed bot cards; bot never becomes Czar.
- **Networking**
  - PeerJS host runs as the room code ID; peers connect to host’s ID.
  - Messages broadcast via `broadcastToAll`; host mirrors player lists, game setup, card plays, judging start, czar choice, score updates, new rounds, and game over.
  - Connection lifecycle: join request/confirmation, player list sync, error handling, reconnect attempts on disconnect.
- **Deck handling**
  - Decks shuffle per game start (`resetDecks`); draws via `drawWhiteCards`/`drawBlackCard`.
  - Each non-Czar player draws replacements after each round; black cards advance each round. If black deck depletes, host reshuffles source deck as a fallback.
- **Rounds and Czar rotation**
  - Czar chosen randomly from non-Rando players for the first round; rotation skips Rando each round (`getNextCzar`).
  - Judging begins automatically once all non-Czar submissions are in.
- **UI updates**
  - `updateGameDisplay` drives all screen updates; hand/played card rendering depends on phase and role.
  - `updateRoundWinnerBanner` shows the winner banner only during `showing_winner`.
  - Tabs switch between played cards and hand; cards are clickable only when eligible to play/judge.
- **Bot behavior (Rando Cardrissian)**
  - Optional host toggle in lobby; counts toward minimum players.
  - Never the Czar; auto-plays a random card during `selecting` via `playRandoCard`.
  - Receives replacement cards each round when included.
- **Game over**
  - Triggered when any player reaches `POINTS_TO_WIN` (default 5). Host broadcasts `game_over` with final scores; UI shows a restart button for host.
- **Configuration constants**
  - `MIN_PLAYERS`, `CARDS_PER_HAND`, `POINTS_TO_WIN`, `RANDO_ID`, `RANDO_NAME`.
  - Adjust cautiously; `POINTS_TO_WIN` impacts pacing; `CARDS_PER_HAND` impacts deck consumption.
- **Hosting/Deployment**
  - Static deploy: `index.html`, `style.css`, `script.js`, `cah-cards-full.json`, `netlify.toml`.
  - Live instance: https://cute-puffpuff-9dee4b.netlify.app
- **Testing tips**
  - Open multiple tabs or devices; create a room, join as guests, and enable Rando to validate auto-plays.
  - Verify phases: selection → judging → winner banner → next round; ensure Czar rotation skips Rando.
  - Simulate disconnects (toggle network) to see status messaging and reconnect behavior.
- **Future improvements (ideas)**
  - Add per-round timers for auto-advance.
  - Persist host state to allow re-host after refresh.
  - Add card pack selection or custom packs.
  - Add basic accessibility roles/labels for screen readers.

