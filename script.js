// Game Configuration
const MIN_PLAYERS = 2;
const CARDS_PER_HAND = 7;
const ROUND_TIMEOUT = 120000; // 2 minutes

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
    scores: {}
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

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// PeerJS Connection Setup
function initializePeer() {
    return new Promise((resolve, reject) => {
        showConnectionStatus('Connecting to server...');
        
        // Using 0.peerjs.com - one of PeerJS's public servers
        const peer = new Peer(null, {
            host: '0.peerjs.com',
            port: 443,
            secure: true,
            debug: 1,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                ]
            }
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
        case 'join_request':
            handleJoinRequest(message.data, message.peer);
            break;
        case 'player_list':
            updatePlayerList(message.data);
            break;
        case 'start_game':
            startGame(message.data);
            break;
        case 'played_card':
            handlePlayedCard(message.data);
            break;
        case 'czar_choice':
            handleCzarChoice(message.data);
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
        gameState.roomCode = generateRoomCode();
        gameState.isHost = true;
        
        const peer = await initializePeer();
        peer.on('connection', handleConnection);
        
        gameState.players = [{
            id: peer.id,
            name: gameState.playerName,
            isHost: true
        }];
        
        showScreen('lobby');
        elements.displays.roomCode.textContent = gameState.roomCode;
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
        gameState.roomCode = elements.inputs.roomCode.value.toUpperCase();
        
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
        
        const conn = gameState.peer.connect(gameState.roomCode);
        const timeout = setTimeout(() => {
            conn.close();
            reject(new Error('Connection timeout'));
        }, 10000); // 10 second timeout

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
    
    return {
        blackCards: shuffledBlackCards,
        playerHands: playerHands,
        firstCzar: gameState.players[0].id,
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
    // Update black card
    elements.displays.blackCard.textContent = gameState.blackCard.text;
    
    // Update hand
    elements.displays.playerHand.innerHTML = '';
    gameState.hand.forEach((card, index) => {
        const cardElement = createCardElement(card, index);
        elements.displays.playerHand.appendChild(cardElement);
    });
    
    // Update players bar
    updatePlayersBar();
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
    SHOWING_WINNER: 'showing_winner'
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

function updatePlayersList() {
    if (!elements.displays.playersList) return;
    
    elements.displays.playersList.innerHTML = '';
    gameState.players.forEach(player => {
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
            playerName: gameState.playerName
        }
    });
    
    updateGameDisplay();
}

function handlePlayedCard(data) {
    if (!gameState.playedCards.some(card => card.playerId === data.playerId)) {
        gameState.playedCards.push({
            playerId: data.playerId,
            playerName: data.playerName,
            card: null // Card is hidden until judging phase
        });
    }
    
    if (gameState.playedCards.length === gameState.players.length - 1) {
        // All players except czar have played
        startJudging();
    }
    
    updatePlayedCards();
}

function startJudging() {
    gameState.phase = GAME_PHASES.JUDGING;
    
    // Reveal all cards
    if (gameState.isHost) {
        const shuffledCards = _.shuffle(gameState.playedCards);
        broadcastToAll({
            type: 'judging_start',
            data: {
                cards: shuffledCards
            }
        });
    }
}

function handleCzarChoice(data) {
    const winner = gameState.playedCards.find(card => card.playerId === data.winnerId);
    gameState.roundWinner = winner;
    gameState.scores[winner.playerId] = (gameState.scores[winner.playerId] || 0) + 1;
    
    gameState.phase = GAME_PHASES.SHOWING_WINNER;
    updateGameDisplay();
    
    // Start new round after delay
    setTimeout(startNewRound, 3000);
}

function startNewRound() {
    if (!gameState.isHost) return;
    
    // Rotate czar
    const czarIndex = gameState.players.findIndex(p => p.id === gameState.czar);
    const nextCzarIndex = (czarIndex + 1) % gameState.players.length;
    const nextCzar = gameState.players[nextCzarIndex].id;
    
    // Deal new cards
    const newSetup = {
        blackCard: gameState.gameData.black[gameState.roundNumber],
        czar: nextCzar,
        roundNumber: gameState.roundNumber + 1
    };
    
    broadcastToAll({
        type: 'new_round',
        data: newSetup
    });
    
    handleNewRound(newSetup);
}

function handleNewRound(setup) {
    gameState.blackCard = setup.blackCard;
    gameState.czar = setup.czar;
    gameState.roundNumber = setup.roundNumber;
    gameState.phase = GAME_PHASES.SELECTING;
    gameState.playedCards = [];
    gameState.selectedCard = null;
    
    // Draw new card if needed
    if (gameState.hand.length < CARDS_PER_HAND) {
        const newCard = gameState.gameData.white[gameState.roundNumber * CARDS_PER_HAND + gameState.hand.length];
        if (newCard) {
            gameState.hand.push(newCard);
        }
    }
    
    updateGameDisplay();
}

function updatePlayedCards() {
    elements.displays.playedCards.innerHTML = '';
    
    if (gameState.phase === GAME_PHASES.SELECTING) {
        gameState.playedCards.forEach(played => {
            const div = document.createElement('div');
            div.className = 'white-card face-down';
            div.textContent = played.playerName + ' has played';
            elements.displays.playedCards.appendChild(div);
        });
    } else {
        gameState.playedCards.forEach(played => {
            const div = document.createElement('div');
            div.className = 'white-card' + 
                (gameState.phase === GAME_PHASES.SHOWING_WINNER && played === gameState.roundWinner ? ' winner' : '');
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
    
    broadcastToAll({
        type: 'czar_choice',
        data: { winnerId }
    });
    
    handleCzarChoice({ winnerId });
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