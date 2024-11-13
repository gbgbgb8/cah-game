// Game Configuration
const MIN_PLAYERS = 2;
const CARDS_PER_HAND = 10;
const ROUND_TIMEOUT = 120000; // 2 minutes
const POINTS_TO_WIN = 5;

// Game State Management
let gameState = {
    screen: 'join', // 'join', 'lobby', 'playing'
    playerName: '',
    roomCode: '',
    isHost: false,
    players: [],
    gameData: null,
    hand: [],
    blackCard: null,
    playedCards: [],
    roundWinner: null,
    czar: null,
    selectedCard: null,
    connections: {},
    peer: null,
    phase: null,
    roundNumber: 0,
    scores: {},
    hostPeerId: null,
    gameWinner: null,
    judgingCards: null
};

// DOM Elements
const elements = {
    screens: {
        join: document.getElementById('joinScreen'),
        lobby: document.getElementById('lobbyScreen'),
        game: document.getElementById('gameScreen')
    },
    inputs: {
        playerName: document.getElementById('playerNameInput'),
        roomCode: document.getElementById('roomCodeInput')
    },
    buttons: {
        join: document.getElementById('joinRoomBtn'),
        create: document.getElementById('createRoomBtn'),
        start: document.getElementById('startGameBtn')
    },
    displays: {
        error: document.getElementById('errorMsg'),
        roomCode: document.getElementById('roomCodeDisplay'),
        playersList: document.getElementById('playersList'),
        playersBar: document.getElementById('playersBar'),
        blackCard: document.getElementById('blackCard'),
        playedCards: document.getElementById('playedCards'),
        playerHand: document.getElementById('playerHand'),
        connectionStatus: document.getElementById('connectionStatus'),
        connectionMessage: document.getElementById('connectionMessage')
    }
};

// Load game cards
async function loadGameData() {
    try {
        const response = await fetch('cah-cards-full.json');
        const data = await response.json();
        gameState.gameData = data[0]; // Using the first deck
        return true;
    } catch (error) {
        console.error('Error loading game data:', error);
        showError('Failed to load game cards');
        return false;
    }
}

// Utility Functions
function showError(message) {
    elements.displays.error.textContent = message;
    elements.displays.error.classList.remove('hidden');
}

function hideError() {
    elements.displays.error.textContent = '';
    elements.displays.error.classList.add('hidden');
}

function showScreen(screenName) {
    Object.values(elements.screens).forEach(screen => {
        screen.classList.add('hidden');
    });
    elements.screens[screenName].classList.remove('hidden');
    gameState.screen = screenName;
}

function showConnectionStatus(message, isError = false) {
    elements.displays.connectionStatus.classList.remove('hidden');
    elements.displays.connectionMessage.textContent = message;
    elements.displays.connectionMessage.style.color = isError ? '#dc2626' : '#4b5563';
}

function hideConnectionStatus() {
    elements.displays.connectionStatus.classList.add('hidden');
}

// PeerJS Connection Setup
function initializePeer() {
    return new Promise((resolve, reject) => {
        showConnectionStatus('Connecting to server...');
        
        const peer = new Peer(null, {
            host: '0.peerjs.com',
            port: 443,
            secure: true,
            debug: 1
        });

        const timeout = setTimeout(() => {
            peer.destroy();
            reject(new Error('Connection timeout'));
        }, 15000);

        peer.on('open', (id) => {
            clearTimeout(timeout);
            console.log('Connected with peer ID:', id);
            hideConnectionStatus();
            gameState.peer = peer;
            resolve(peer);
        });

        peer.on('disconnected', () => {
            showConnectionStatus('Disconnected. Attempting to reconnect...');
            setTimeout(() => peer.reconnect(), 1000);
        });

        peer.on('error', (err) => {
            console.error('Peer error:', err);
            showConnectionStatus(`Connection error: ${err.type}`, true);
            
            if (err.type === 'peer-unavailable') {
                showError('Room not found or host disconnected');
            } else if (err.type === 'network') {
                showError('Network error. Please check your connection');
            } else if (err.type === 'server-error') {
                showError('Server error. Please try again');
            }
        });
    });
}

// After initializePeer(), add connection handling
function handleConnection(conn) {
    gameState.connections[conn.peer] = conn;
    
    conn.on('data', handleGameMessage);
    
    conn.on('close', () => {
        delete gameState.connections[conn.peer];
        removePlayer(conn.peer);
    });
}

function handleGameMessage(message) {
    console.log('Received message:', message);
    switch (message.type) {
        case 'error':
            showError(message.data.message);
            showScreen('join');
            break;
        case 'join_request':
            handleJoinRequest(message.data, message.peer);
            break;
        case 'player_list':
            updatePlayersList(message.data);
            break;
        case 'start_game':
            startGame(message.data);
            break;
        case 'played_card':
            handlePlayedCard(message.data);
            break;
        case 'judging_start':
            handleJudgingStart(message.data);
            break;
        case 'czar_choice':
            handleCzarChoice(message.data);
            break;
        case 'new_round':
            handleNewRound(message.data);
            break;
    }
}

// Add event listeners after DOM Elements
elements.buttons.create.addEventListener('click', createRoom);
elements.buttons.join.addEventListener('click', joinRoom);
elements.buttons.start.addEventListener('click', hostStartGame);

// Room management functions
async function createRoom() {
    if (!elements.inputs.playerName.value) {
        showError('Please enter your name');
        return;
    }

    try {
        gameState.playerName = elements.inputs.playerName.value;
        gameState.isHost = true;
        
        const peer = await initializePeer();
        gameState.roomCode = peer.id;
        gameState.hostPeerId = peer.id;
        
        peer.on('connection', handleConnection);
        
        gameState.players = [{
            id: peer.id,
            name: gameState.playerName,
            isHost: true
        }];
        
        showScreen('lobby');
        elements.displays.roomCode.textContent = gameState.roomCode;
        setupRoomCodeCopy();
        elements.buttons.start.classList.remove('hidden');
        updatePlayersList();
    } catch (error) {
        showError('Failed to create room. Please try again.');
        console.error('Room creation error:', error);
    }
}

async function joinRoom() {
    if (!elements.inputs.playerName.value || !elements.inputs.roomCode.value) {
        showError('Please enter your name and room code');
        return;
    }

    try {
        gameState.playerName = elements.inputs.playerName.value;
        gameState.roomCode = elements.inputs.roomCode.value;
        gameState.hostPeerId = gameState.roomCode;
        
        await initializePeer();
        await connectToHost();
        
        showScreen('lobby');
    } catch (error) {
        showError('Failed to join room. Please check the room code and try again.');
        console.error('Join room error:', error);
    }
}

function connectToHost() {
    return new Promise((resolve, reject) => {
        showConnectionStatus('Connecting to room...');
        
        const conn = gameState.peer.connect(gameState.hostPeerId);
        const timeout = setTimeout(() => {
            conn.close();
            reject(new Error('Connection timeout'));
        }, 10000);

        conn.on('open', () => {
            clearTimeout(timeout);
            gameState.connections[conn.peer] = conn;
            conn.send({
                type: 'join_request',
                data: {
                    name: gameState.playerName,
                    id: gameState.peer.id,
                    roomCode: gameState.roomCode
                }
            });
            hideConnectionStatus();
            resolve(conn);
        });

        conn.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
        
        conn.on('data', handleGameMessage);
    });
}

// Game logic functions
function hostStartGame() {
    if (gameState.players.length < MIN_PLAYERS) {
        showError(`Need at least ${MIN_PLAYERS} players to start`);
        return;
    }

    const gameSetup = setupNewGame();
    broadcastToAll({
        type: 'start_game',
        data: gameSetup
    });
    
    startGame(gameSetup);
}

function setupNewGame() {
    const shuffledBlackCards = _.shuffle(gameState.gameData.black);
    const shuffledWhiteCards = _.shuffle(gameState.gameData.white);
    
    const playerHands = {};
    gameState.players.forEach(player => {
        playerHands[player.id] = shuffledWhiteCards.splice(0, CARDS_PER_HAND);
        gameState.scores[player.id] = 0;
    });
    
    const firstCzar = gameState.players[Math.floor(Math.random() * gameState.players.length)].id;
    
    return {
        blackCards: shuffledBlackCards,
        playerHands: playerHands,
        firstCzar: firstCzar,
        roundNumber: 1
    };
}

function startGame(gameSetup) {
    gameState.hand = gameSetup.playerHands[gameState.peer.id];
    gameState.blackCard = gameSetup.blackCards[0];
    gameState.czar = gameSetup.firstCzar;
    gameState.phase = GAME_PHASES.SELECTING;
    gameState.roundNumber = gameSetup.roundNumber;
    gameState.playedCards = [];
    
    showScreen('game');
    updateGameDisplay();
}

// UI update functions
function updateGameDisplay() {
    if (gameState.phase === GAME_PHASES.GAME_OVER) {
        showGameOver();
        return;
    }

    // Update black card
    elements.displays.blackCard.textContent = gameState.blackCard.text;
    
    // Update hand
    elements.displays.playerHand.innerHTML = '';
    if (gameState.czar === gameState.peer.id) {
        const czarMessage = document.createElement('div');
        czarMessage.className = 'czar-message';
        czarMessage.textContent = gameState.phase === GAME_PHASES.SELECTING ? 
            "You're the Card Czar! Wait for others to play their cards." :
            "You're the Card Czar! Pick the funniest answer!";
        elements.displays.playerHand.appendChild(czarMessage);
    } else if (gameState.phase === GAME_PHASES.SELECTING && !gameState.selectedCard) {
        gameState.hand.forEach((card, index) => {
            const cardElement = createCardElement(card, index);
            elements.displays.playerHand.appendChild(cardElement);
        });
    } else {
        const waitingMessage = document.createElement('div');
        waitingMessage.className = 'czar-message';
        waitingMessage.textContent = "Waiting for the Card Czar to pick...";
        elements.displays.playerHand.appendChild(waitingMessage);
    }
    
    // Update players bar with scores and czar
    updatePlayersBar();
    
    // Update played cards
    updatePlayedCards();
}

function createCardElement(card, index) {
    const div = document.createElement('div');
    div.className = 'white-card';
    div.textContent = card.text;
    
    if (gameState.phase === GAME_PHASES.SELECTING && gameState.czar !== gameState.peer.id) {
        div.onclick = () => playCard(index);
    }
    
    return div;
}

// Add these CSS styles to handle the new elements

// Add after the existing game constants
const GAME_PHASES = {
    SELECTING: 'selecting',
    JUDGING: 'judging',
    SHOWING_WINNER: 'showing_winner',
    GAME_OVER: 'game_over'
};

// Add these utility functions
function broadcastToAll(message) {
    Object.values(gameState.connections).forEach(conn => {
        conn.send(message);
    });
}

function removePlayer(playerId) {
    gameState.players = gameState.players.filter(p => p.id !== playerId);
    updatePlayersList();
    
    if (gameState.screen === 'playing' && gameState.czar === playerId) {
        // Handle czar disconnection
        startNewRound();
    }
}

// Add player management functions
function handleJoinRequest(data, peerId) {
    if (!gameState.isHost) return;
    if (data.roomCode !== gameState.roomCode) {
        // Wrong room code
        const conn = gameState.connections[peerId];
        if (conn) {
            conn.send({
                type: 'error',
                data: { message: 'Invalid room code' }
            });
            conn.close();
        }
        return;
    }
    
    const newPlayer = {
        id: data.id,
        name: data.name,
        isHost: false
    };
    
    gameState.players.push(newPlayer);
    updatePlayersList();
    
    // Send current player list to all players
    broadcastToAll({
        type: 'player_list',
        data: gameState.players
    });
}

function updatePlayersList(players) {
    if (!Array.isArray(players)) return;
    gameState.players = players;
    
    if (!elements.displays.playersList) return;
    
    elements.displays.playersList.innerHTML = '';
    players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = `${player.name}${player.isHost ? ' (Host)' : ''}`;
        elements.displays.playersList.appendChild(li);
    });
}

function updatePlayersBar() {
    elements.displays.playersBar.innerHTML = '';
    gameState.players.forEach(player => {
        const div = document.createElement('div');
        div.className = `player-score ${player.id === gameState.czar ? 'czar' : ''}`;
        div.innerHTML = `
            <div>${player.name}</div>
            <div>${gameState.scores[player.id] || 0} pts</div>
            ${player.id === gameState.czar ? '<div>(Czar)</div>' : ''}
        `;
        elements.displays.playersBar.appendChild(div);
    });
}

// Add game mechanics functions
function playCard(index) {
    if (gameState.phase !== GAME_PHASES.SELECTING || gameState.czar === gameState.peer.id) return;
    
    const playedCard = gameState.hand.splice(index, 1)[0];
    gameState.selectedCard = playedCard;
    
    broadcastToAll({
        type: 'played_card',
        data: {
            playerId: gameState.peer.id,
            playerName: gameState.playerName,
            card: playedCard
        }
    });
    
    updateGameDisplay();
}

function handlePlayedCard(data) {
    console.log('Handling played card:', data);
    
    // Only accept cards during selection phase
    if (gameState.phase !== GAME_PHASES.SELECTING) {
        console.log('Ignoring played card - wrong phase:', gameState.phase);
        return;
    }
    
    // Remove any existing plays from this player
    gameState.playedCards = gameState.playedCards.filter(card => card.playerId !== data.playerId);
    
    // Add the new play with complete data
    gameState.playedCards.push({
        playerId: data.playerId,
        playerName: data.playerName,
        card: data.card
    });
    
    console.log('Current played cards:', gameState.playedCards);
    
    if (gameState.playedCards.length === gameState.players.length - 1) {
        // All players except czar have played
        startJudging();
    }
    
    updateGameDisplay();
}

function startJudging() {
    gameState.phase = GAME_PHASES.JUDGING;
    
    // Reveal all cards
    if (gameState.isHost) {
        // Create a deep copy of played cards to prevent reference issues
        const cardsWithData = JSON.parse(JSON.stringify(gameState.playedCards));
        const shuffledCards = _.shuffle(cardsWithData);
        
        broadcastToAll({
            type: 'judging_start',
            data: {
                cards: shuffledCards,
                blackCard: gameState.blackCard
            }
        });
        
        // Update local played cards with shuffled order
        gameState.playedCards = shuffledCards;
    }
    
    console.log('Starting judging phase with cards:', gameState.playedCards);
    updateGameDisplay();
}

function handleCzarChoice(data) {
    console.log('Handling czar choice:', data);
    
    // Use judgingCards if available, otherwise use playedCards
    const cardsToCheck = gameState.judgingCards || gameState.playedCards;
    console.log('Cards available for judging:', cardsToCheck);
    
    // Find the winning play using playerId
    const winner = cardsToCheck.find(play => play.playerId === data.winnerId);
    
    if (!winner) {
        console.error('Winner not found:', data.winnerId);
        console.log('Available cards:', cardsToCheck);
        return;
    }
    
    gameState.roundWinner = winner;
    gameState.scores[winner.playerId] = (gameState.scores[winner.playerId] || 0) + 1;
    
    // Check if someone won the game
    if (gameState.scores[winner.playerId] >= POINTS_TO_WIN) {
        gameState.gameWinner = winner;
        gameState.phase = GAME_PHASES.GAME_OVER;
        updateGameDisplay();
        return;
    }
    
    gameState.phase = GAME_PHASES.SHOWING_WINNER;
    updateGameDisplay();
    
    // Start new round after delay
    if (gameState.isHost) {
        setTimeout(() => {
            startNewRound();
        }, 3000);
    }
}

function startNewRound() {
    if (!gameState.isHost) return;
    
    // Rotate czar
    const czarIndex = gameState.players.findIndex(p => p.id === gameState.czar);
    const nextCzarIndex = (czarIndex + 1) % gameState.players.length;
    const nextCzar = gameState.players[nextCzarIndex].id;
    
    // Get next black card
    const nextBlackCard = gameState.gameData.black[gameState.roundNumber];
    
    // Deal new white cards to all players
    const newCards = {};
    gameState.players.forEach(player => {
        if (player.id !== nextCzar) {
            // Get a new card for each player who played
            const newCard = gameState.gameData.white[
                gameState.roundNumber * gameState.players.length + 
                Object.keys(newCards).length
            ];
            if (newCard) {
                newCards[player.id] = newCard;
            }
        }
    });
    
    const newSetup = {
        blackCard: nextBlackCard,
        czar: nextCzar,
        roundNumber: gameState.roundNumber + 1,
        newCards: newCards
    };
    
    broadcastToAll({
        type: 'new_round',
        data: newSetup
    });
    
    handleNewRound(newSetup);
}

function handleNewRound(setup) {
    // Update game state for new round
    gameState.blackCard = setup.blackCard;
    gameState.czar = setup.czar;
    gameState.roundNumber = setup.roundNumber;
    
    // Clear played cards and judging cards for new round
    gameState.playedCards = [];
    gameState.judgingCards = null;
    gameState.selectedCard = null;
    gameState.roundWinner = null;
    
    gameState.phase = GAME_PHASES.SELECTING;
    
    // Add new card to hand if we got one
    if (setup.newCards && setup.newCards[gameState.peer.id]) {
        gameState.hand.push(setup.newCards[gameState.peer.id]);
    }
    
    console.log('New round state:', {
        phase: gameState.phase,
        czar: gameState.czar,
        playedCards: gameState.playedCards,
        hand: gameState.hand
    });
    
    updateGameDisplay();
}

function updatePlayedCards() {
    elements.displays.playedCards.innerHTML = '';
    
    const cardsToShow = gameState.phase === GAME_PHASES.JUDGING ? 
        (gameState.judgingCards || gameState.playedCards) : 
        gameState.playedCards;
    
    if (gameState.phase === GAME_PHASES.SELECTING) {
        cardsToShow.forEach(played => {
            const div = document.createElement('div');
            div.className = 'white-card face-down';
            div.textContent = played.playerName + ' has played';
            elements.displays.playedCards.appendChild(div);
        });
    } else {
        cardsToShow.forEach(played => {
            const div = document.createElement('div');
            div.className = 'white-card' + 
                (gameState.phase === GAME_PHASES.SHOWING_WINNER && 
                 played.playerId === gameState.roundWinner?.playerId ? ' winner' : '');
            
            div.textContent = played.card.text;
            
            if (gameState.phase === GAME_PHASES.JUDGING && gameState.czar === gameState.peer.id) {
                div.onclick = () => selectWinner(played.playerId);
            }
            
            elements.displays.playedCards.appendChild(div);
        });
    }
}

function selectWinner(winnerId) {
    if (gameState.phase !== GAME_PHASES.JUDGING || gameState.czar !== gameState.peer.id) return;
    
    const winner = gameState.playedCards.find(play => play.playerId === winnerId);
    if (!winner) {
        console.error('Cannot find winner to select:', winnerId);
        return;
    }
    
    const winnerData = {
        winnerId: winnerId,
        card: winner.card,
        playerName: winner.playerName
    };
    
    broadcastToAll({
        type: 'czar_choice',
        data: winnerData
    });
    
    handleCzarChoice(winnerData);
}

// Add this at the top of the file, after the gameState definition
document.addEventListener('DOMContentLoaded', async () => {
    showConnectionStatus('Loading game data...');
    const loaded = await loadGameData();
    if (!loaded) {
        showError('Failed to load game data. Please refresh.');
        return;
    }
    hideConnectionStatus();
});

// Add cleanup when leaving/closing
window.addEventListener('beforeunload', () => {
    if (gameState.isHost) {
        localStorage.removeItem(gameState.roomCode);
    }
});

// Add after showScreen function
function setupRoomCodeCopy() {
    const roomCodeDisplay = elements.displays.roomCode;
    roomCodeDisplay.title = 'Click to copy';
    roomCodeDisplay.style.cursor = 'pointer';
    
    roomCodeDisplay.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(gameState.roomCode);
            const originalText = roomCodeDisplay.textContent;
            roomCodeDisplay.textContent = 'Copied!';
            setTimeout(() => {
                roomCodeDisplay.textContent = originalText;
            }, 1000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    });
}

function showGameOver() {
    const winner = gameState.players.find(p => p.id === gameState.gameWinner.playerId);
    
    elements.displays.blackCard.innerHTML = `
        <h2>Game Over!</h2>
        <p>${winner.name} wins with ${gameState.scores[winner.id]} Awesome Points!</p>
    `;
    
    elements.displays.playedCards.innerHTML = '';
    elements.displays.playerHand.innerHTML = `
        <button id="newGameBtn" class="btn btn-primary">Play Again</button>
    `;
    
    document.getElementById('newGameBtn')?.addEventListener('click', () => {
        if (gameState.isHost) {
            hostStartGame();
        }
    });
}

// Add function to handle judging start
function handleJudgingStart(data) {
    // Keep a copy of the cards for judging
    gameState.judgingCards = data.cards;
    gameState.playedCards = data.cards;
    gameState.phase = GAME_PHASES.JUDGING;
    updateGameDisplay();
}