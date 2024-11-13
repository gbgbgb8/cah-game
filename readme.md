# Cards Against Humanity - Web Version

A browser-based implementation of Cards Against Humanity using PeerJS for peer-to-peer multiplayer functionality. This version is family-friendly and designed for easy deployment on Netlify.

## Current State

### Working Features:
- Basic UI implementation with three screens:
  - Join/Create room screen
  - Lobby screen
  - Game screen
- PeerJS connection setup
- Room creation and joining
- Player management
- Basic game state synchronization

### Project Structure
project_folder/
├── index.html      # Basic game structure and UI elements
├── style.css       # Complete styling for all game components
├── script.js       # Game logic and networking (in progress)
└── cah-cards-full.json  # Card data

## How to Play

1. **Starting a Game**
   - Open the game in a web browser
   - Enter your name
   - Either:
     - Create a new room (generates room code)
     - Join existing room (enter room code)

2. **Lobby**
   - Host sees "Start Game" button when enough players join
   - Other players see "Waiting for host to start"
   - Current players list displayed

3. **Gameplay**
   - Each round, one player is the Card Czar
   - Czar reveals black card
   - Other players choose white cards from their hand
   - Czar picks winning answer
   - Points awarded, new round begins

## TODO List

### High Priority
1. **Core Game Logic**
   - [ ] Complete card dealing system
   - [ ] Implement Card Czar rotation
   - [ ] Add scoring system
   - [ ] Create round management
   - [ ] Handle game end conditions

2. **Networking**
   - [ ] Implement reliable peer connections
   - [ ] Add connection recovery
   - [ ] Handle player disconnections
   - [ ] Sync game state between players

### Medium Priority
1. **Game Features**
   - [ ] Add round timer
   - [ ] Implement card animations
   - [ ] Add sound effects
   - [ ] Create spectator mode

2. **UI Improvements**
   - [ ] Add loading indicators
   - [ ] Improve mobile responsiveness
   - [ ] Add tooltips and help text
   - [ ] Create better card layouts

### Low Priority
1. **Quality of Life**
   - [ ] Add room chat
   - [ ] Create game settings
   - [ ] Add custom house rules
   - [ ] Implement card pack selection

2. **Technical Improvements**
   - [ ] Add error logging
   - [ ] Implement state persistence
   - [ ] Add analytics
   - [ ] Create automated tests

## Known Issues
1. PeerJS connection needs reliability improvements
2. UI not fully responsive on all devices
3. Game state can become desynchronized
4. No recovery mechanism for disconnected players

## Development Setup

1. Clone the repository
2. Open `index.html` in a browser
3. For local testing, open multiple browser windows

## Deployment

Currently set up for Netlify Drop:
1. Drag project folder to Netlify
2. Site automatically deploys
3. Share URL with players

## Contributing

Feel free to contribute by:
1. Opening issues for bugs
2. Suggesting new features
3. Creating pull requests
4. Testing and reporting issues

## Technical Notes

### PeerJS Usage
Currently using PeerJS's public server for development:
```javascript
const peer = new Peer({
    host: 'peer.metered.live',
    port: 443,
    secure: true
});let gameState = {
    screen: 'join',
    playerName: '',
    roomCode: '',
    isHost: false,
    // ... more state properties
};

Network Protocol
Messages are passed between peers using a type-based system:
javascriptCopy{
    type: 'messageType',
    data: {
        // message specific data
    }
}
Future Improvements
Phase 1 (Core Gameplay)

Complete basic game loop
Improve connection reliability
Add basic error handling

Phase 2 (Enhanced Features)

Add room chat
Implement spectator mode
Create custom game settings

Phase 3 (Polish)

Add animations
Improve UI/UX
Add sound effects
Create tutorial

License
MIT License - Feel free to use and modify