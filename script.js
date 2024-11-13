// Game Configuration
const MIN_PLAYERS = 2;
const CARDS_PER_HAND = 10;
const POINTS_TO_WIN = 5;

// Game State Management
let gameState = {
    screen: 'join',
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
    judgingCards: null,
    scores: {}
};

// Game Phases
const GAME_PHASES = {
    SELECTING: 'selecting',
    JUDGING: 'judging',
    SHOWING_WINNER: 'showing_winner',
    GAME_OVER: 'game_over'
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

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    showConnectionStatus('Loading game data...');
    const loaded = await loadGameData();
    if (!loaded) {
        showError('Failed to load game data. Please refresh.');
        return;
    }
    hideConnectionStatus();
    
    // Add button event listeners
    elements.buttons.join.addEventListener('click', joinRoom);
    elements.buttons.create.addEventListener('click', createRoom);
    elements.buttons.start.addEventListener('click', hostStartGame);
});

// Add broadcastToAll utility function
function broadcastToAll(message) {
    Object.values(gameState.connections).forEach(conn => {
        conn.send(message);
    });
}

// Add joinRoom function
async function joinRoom() {
    if (!elements.inputs.playerName.value || !elements.inputs.roomCode.value) {
        showError('Please enter your name and room code');
        return;
    }

    try {
        gameState.playerName = elements.inputs.playerName.value;
        gameState.roomCode = elements.inputs.roomCode.value;
        gameState.hostPeerId = gameState.roomCode; // Host's peer ID is the room code
        
        await initializePeer();
        await connectToHost();
        
        showScreen('lobby');
    } catch (error) {
        showError('Failed to join room. Please check the room code and try again.');
        console.error('Join room error:', error);
    }
}

// Add connectToHost function
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
                    id: gameState.peer.id
                }
            });
            
            conn.on('data', (message) => {
                message.peer = conn.peer;
                handleGameMessage(message);
            });
            
            hideConnectionStatus();
            resolve(conn);
        });

        conn.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

// Add loadGameData function if it's missing
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

// Update handleGameMessage to include all message types
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
        case 'join_confirmed':
            gameState.players = message.data.players;
            updatePlayersList();
            break;
        case 'player_list':
            gameState.players = message.data;
            updatePlayersList();
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

function handleConnection(conn) {
    console.log('New connection:', conn.peer);
    
    gameState.connections[conn.peer] = conn;
    
    conn.on('data', (message) => {
        message.peer = conn.peer; // Add sender's peer id to message
        handleGameMessage(message);
    });
    
    conn.on('close', () => {
        console.log('Connection closed:', conn.peer);
        delete gameState.connections[conn.peer];
        // Remove player from game
        gameState.players = gameState.players.filter(p => p.id !== conn.peer);
        updatePlayersList();
    });
    
    conn.on('error', (err) => {
        console.error('Connection error:', err);
        showError('Connection error occurred');
    });
}

// Add setupRoomCodeCopy function
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
                roomCodeDisplay.textContent = `Room Code: ${gameState.roomCode}`;
            }, 1000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    });
}

// Add hostStartGame function
function hostStartGame() {
    if (!gameState.isHost) return;
    
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

// Add setupNewGame function
function setupNewGame() {
    const shuffledBlackCards = _.shuffle(gameState.gameData.black);
    const shuffledWhiteCards = _.shuffle(gameState.gameData.white);
    
    const playerHands = {};
    gameState.players.forEach(player => {
        playerHands[player.id] = shuffledWhiteCards.splice(0, CARDS_PER_HAND);
        gameState.scores[player.id] = 0;
    });
    
    // Choose first Czar randomly
    const firstCzar = gameState.players[Math.floor(Math.random() * gameState.players.length)].id;
    
    return {
        blackCards: shuffledBlackCards,
        playerHands: playerHands,
        firstCzar: firstCzar,
        roundNumber: 1
    };
}

// Add startGame function
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

// Add updateGameDisplay function
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

// Add createCardElement function
function createCardElement(card, index) {
    const div = document.createElement('div');
    div.className = 'white-card';
    div.textContent = card.text;
    
    if (gameState.phase === GAME_PHASES.SELECTING && gameState.czar !== gameState.peer.id) {
        div.onclick = () => playCard(index);
    }
    
    return div;
}

// Update createRoom to setup room code copy
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
        updatePlayersList();
        
        console.log('Room created:', {
            roomCode: gameState.roomCode,
            hostId: gameState.hostPeerId,
            playerName: gameState.playerName
        });
    } catch (error) {
        showError('Failed to create room. Please try again.');
        console.error('Room creation error:', error);
    }
}

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
            clearTimeout(timeout);
            console.error('Peer error:', err);
            showConnectionStatus(`Connection error: ${err.type}`, true);
            reject(err);
        });
    });
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
    console.log('Total players:', gameState.players.length);
    console.log('Current czar:', gameState.czar);
    
    // Check if all non-czar players have played
    const nonCzarPlayers = gameState.players.length - 1; // Subtract 1 for czar
    if (gameState.playedCards.length === nonCzarPlayers) {
        console.log('All players have played, starting judging phase');
        if (gameState.isHost) {
            startJudging();
        }
    }
    
    updateGameDisplay();
}

function startJudging() {
    if (gameState.phase !== GAME_PHASES.SELECTING) return;
    
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

function handleJudgingStart(data) {
    // Keep both copies of the cards
    gameState.judgingCards = data.cards;
    gameState.playedCards = [...data.cards]; // Make a copy
    gameState.phase = GAME_PHASES.JUDGING;
    console.log('Received judging start, updating display with cards:', data.cards);
    updateGameDisplay();
}

function handleJoinRequest(data, peerId) {
    if (!gameState.isHost) return;
    
    const newPlayer = {
        id: data.id,
        name: data.name,
        isHost: false
    };
    
    // Add new player to the list
    gameState.players.push(newPlayer);
    
    // Send current player list to ALL players, including the new one
    broadcastToAll({
        type: 'player_list',
        data: gameState.players
    });
    
    // Send direct confirmation to the new player
    const conn = gameState.connections[peerId];
    if (conn) {
        conn.send({
            type: 'join_confirmed',
            data: {
                players: gameState.players,
                hostId: gameState.peer.id
            }
        });
    }
    
    updatePlayersList();
    
    // Update minimum players message
    const waitingMessage = document.getElementById('waitingMessage');
    if (waitingMessage) {
        if (gameState.players.length >= MIN_PLAYERS) {
            waitingMessage.textContent = 'Ready to start!';
            elements.buttons.start.classList.remove('hidden');
        } else {
            waitingMessage.textContent = `Waiting for more players... (Need ${MIN_PLAYERS - gameState.players.length} more)`;
        }
    }
}

function updatePlayersList() {
    if (!elements.displays.playersList) return;
    
    elements.displays.playersList.innerHTML = '';
    gameState.players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = `${player.name}${player.isHost ? ' (Host)' : ''}`;
        elements.displays.playersList.appendChild(li);
    });
    
    // Update the waiting message based on player count
    const waitingMessage = document.getElementById('waitingMessage');
    if (waitingMessage) {
        if (gameState.players.length >= MIN_PLAYERS) {
            waitingMessage.textContent = gameState.isHost ? 
                'Ready to start!' : 
                'Waiting for host to start the game...';
            if (gameState.isHost) {
                elements.buttons.start.classList.remove('hidden');
            }
        } else {
            waitingMessage.textContent = `Waiting for more players... (Need ${MIN_PLAYERS - gameState.players.length} more)`;
        }
    }
}