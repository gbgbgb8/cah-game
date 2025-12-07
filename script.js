// Game Configuration
const MIN_PLAYERS = 2;
const CARDS_PER_HAND = 10;
const POINTS_TO_WIN = 5;
const RANDO_ID = 'rando-cardrissian';
const RANDO_NAME = 'Rando Cardrissian';
const isRando = (id) => id === RANDO_ID;

// Game State Management
let gameState = {
    screen: 'join',
    playerName: '',
    roomCode: '',
    hostPeerId: null,
    isHost: false,
    players: [],
    gameData: null,
    whiteDeck: [],
    blackDeck: [],
    includeRando: false,
    randoHand: [],
    hand: [],
    blackCard: null,
    playedCards: [],
    roundWinner: null,
    gameWinner: null,
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
    checkboxes: {
        includeRando: document.getElementById('includeRandoCheckbox')
    },
    containers: {
        randoOption: document.getElementById('randoOption')
    },
    displays: {
        error: document.getElementById('errorMsg'),
        roomCode: document.getElementById('roomCodeDisplay'),
        playersList: document.getElementById('playersList'),
        playersBar: document.getElementById('playersBar'),
        blackCard: document.getElementById('blackCard'),
        playedCards: document.getElementById('playedCards'),
        playerHand: document.getElementById('playerHand'),
        roundWinnerBanner: document.getElementById('roundWinnerBanner'),
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

// Deck management
function resetDecks() {
    if (!gameState.gameData) return;
    gameState.whiteDeck = _.shuffle([...gameState.gameData.white]);
    gameState.blackDeck = _.shuffle([...gameState.gameData.black]);
}

function drawWhiteCards(count) {
    const cards = [];
    for (let i = 0; i < count; i += 1) {
        const card = gameState.whiteDeck.shift();
        if (card) {
            cards.push(card);
        }
    }
    return cards;
}

function drawBlackCard() {
    return gameState.blackDeck.shift() || null;
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    addStyleToHead();
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
    initializeCardTabs();
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
            console.log('Received judging_start message');
            handleJudgingStart(message.data);
            break;
        case 'czar_choice':
            handleCzarChoice(message.data);
            break;
        case 'new_round':
            handleNewRound(message.data);
            break;
        case 'cards_update':
            console.log('Received cards_update message:', message.data);
            gameState.playedCards = message.data.playedCards;
            if (message.data.phase) {
                gameState.phase = message.data.phase;
            }
            updateGameDisplay();
            break;
        case 'score_update':
            handleScoreUpdate(message.data);
            break;
        case 'game_over':
            handleGameOver(message.data);
            break;
        default:
            console.warn('Unhandled message type:', message.type, message);
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
                roomCodeDisplay.textContent = originalText || gameState.roomCode;
            }, 1000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    });
}

// Add hostStartGame function
function hostStartGame() {
    if (!gameState.isHost) return;
    const includeRando = elements.checkboxes.includeRando?.checked;
    gameState.includeRando = !!includeRando;

    // If Rando will join, count them toward the minimum
    const totalPlayers = gameState.players.length + (includeRando && !gameState.players.find(p => p.id === RANDO_ID) ? 1 : 0);
    
    if (totalPlayers < MIN_PLAYERS) {
        showError(`Need at least ${MIN_PLAYERS} players to start`);
        return;
    }

    if (includeRando && !gameState.players.find(p => p.id === RANDO_ID)) {
        gameState.players.push({
            id: RANDO_ID,
            name: RANDO_NAME,
            isBot: true,
            isHost: false
        });
        broadcastToAll({
            type: 'player_list',
            data: gameState.players
        });
        updatePlayersList();
    }

    const gameSetup = setupNewGame();
    gameSetup.includeRando = includeRando;
    broadcastToAll({
        type: 'start_game',
        data: gameSetup
    });
    
    startGame(gameSetup);
}

// Add setupNewGame function
function setupNewGame() {
    resetDecks();

    const playerHands = {};
    const initialScores = {};
    gameState.players.forEach(player => {
        playerHands[player.id] = drawWhiteCards(CARDS_PER_HAND);
        initialScores[player.id] = 0;
    });
    
    const czarCandidates = gameState.players.filter(p => p.id !== RANDO_ID);
    const firstCzarPool = czarCandidates.length ? czarCandidates : gameState.players;
    const firstCzar = firstCzarPool[Math.floor(Math.random() * firstCzarPool.length)].id;
    const firstBlackCard = drawBlackCard() || gameState.gameData.black[0];

    return {
        blackCard: firstBlackCard,
        playerHands,
        firstCzar,
        roundNumber: 1,
        scores: initialScores,
        includeRando: gameState.includeRando
    };
}

// Add startGame function
function startGame(gameSetup) {
    gameState.hand = gameSetup.playerHands[gameState.peer.id] || [];
    gameState.blackCard = gameSetup.blackCard || gameState.blackCard || gameState.gameData?.black?.[0];
    gameState.czar = gameSetup.firstCzar;
    gameState.phase = GAME_PHASES.SELECTING;
    gameState.roundNumber = gameSetup.roundNumber;
    gameState.playedCards = [];
    gameState.selectedCard = null;
    gameState.roundWinner = null;
    gameState.gameWinner = null;
    gameState.scores = gameSetup.scores;  // Initialize scores from game setup
    gameState.includeRando = !!gameSetup.includeRando;
    gameState.randoHand = gameState.isHost && gameState.includeRando
        ? (gameSetup.playerHands[RANDO_ID] || [])
        : [];
    
    showScreen('game');
    updateGameDisplay();

    // Kick off Rando's play on the first round
    if (gameState.isHost) {
        setTimeout(playRandoCard, 400);
    }
}

// Update updateGameDisplay function to better handle judging phase
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
    updateRoundWinnerBanner();
    
    // Update played cards
    updatePlayedCards();

    // Log current game state for debugging
    console.log('Game Display Updated:', {
        phase: gameState.phase,
        isCzar: gameState.czar === gameState.peer.id,
        playedCardsCount: gameState.playedCards.length,
        judgingCardsCount: gameState.judgingCards?.length,
        selectedCard: gameState.selectedCard
    });

    // Show appropriate tab based on game phase
    const tabs = document.querySelectorAll('.tab');
    if (gameState.phase === GAME_PHASES.SELECTING && gameState.czar !== gameState.peer.id) {
        tabs[1].click(); // Show hand tab
    } else {
        tabs[0].click(); // Show played cards tab
    }
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
        updateLobbyControls();
        
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

// Updated handlePlayedCard function
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
    const playedCard = {
        playerId: data.playerId,
        playerName: data.playerName,
        card: data.card
    };
    gameState.playedCards.push(playedCard);

    // Broadcast the played card update
    broadcastToAll({
        type: 'cards_update',
        data: {
            playedCards: gameState.playedCards
        }
    });

    // Check if all cards are played (excluding the Czar)
    const totalPlayers = gameState.players.length;
    const nonCzarPlayers = gameState.players.filter(p => p.id !== gameState.czar).length;
    const cardsPlayed = gameState.playedCards.length;

    console.log('Game status:', {
        totalPlayers,
        nonCzarPlayers,
        cardsPlayed,
        czarId: gameState.czar,
        playedCards: gameState.playedCards,
        currentPhase: gameState.phase
    });

    // Start judging if all non-Czar players have played
    if (cardsPlayed === nonCzarPlayers) {
        console.log('All players have submitted cards, starting judging phase');
        startJudging();
    }

    updateGameDisplay();
}

function updateRoundWinnerBanner() {
    const banner = elements.displays.roundWinnerBanner;
    if (!banner) return;

    const shouldShow = gameState.roundWinner && gameState.phase === GAME_PHASES.SHOWING_WINNER;
    banner.classList.toggle('hidden', !shouldShow);

    if (!shouldShow) {
        banner.textContent = '';
        return;
    }

    const winnerPlayer = gameState.players.find(p => p.id === gameState.roundWinner.playerId);
    const winnerName = winnerPlayer?.name || gameState.roundWinner.playerName || 'Winner';
    banner.textContent = `${winnerName} wins the round!`;
}

// Update startJudging function
function startJudging() {
    console.log('Starting judging phase');
    
    if (gameState.phase !== GAME_PHASES.SELECTING) {
        console.log('Cannot start judging - wrong phase:', gameState.phase);
        return;
    }
    
    // Create a deep copy of played cards to prevent reference issues
    const cardsWithData = JSON.parse(JSON.stringify(gameState.playedCards));
    const shuffledCards = _.shuffle(cardsWithData);
    
    // Update local state first
    gameState.phase = GAME_PHASES.JUDGING;
    gameState.playedCards = shuffledCards;
    gameState.judgingCards = shuffledCards;
    
    // Then broadcast to all players
    broadcastToAll({
        type: 'judging_start',
        data: {
            cards: shuffledCards,
            blackCard: gameState.blackCard,
            phase: GAME_PHASES.JUDGING
        }
    });
    
    console.log('Judging phase started with cards:', shuffledCards);
    updateGameDisplay();
}

// Update handleJudgingStart function to properly handle the phase transition
function handleJudgingStart(data) {
    console.log('Received judging start with data:', data);
    
    // Update game state for judging phase
    gameState.phase = GAME_PHASES.JUDGING;
    gameState.judgingCards = data.cards;
    gameState.playedCards = [...data.cards]; // Make a copy
    
    console.log('Updated game state for judging:', {
        phase: gameState.phase,
        judgingCards: gameState.judgingCards,
        playedCards: gameState.playedCards,
        isCzar: gameState.czar === gameState.peer.id,
        cards: data.cards
    });
    
    // Force an immediate display update
    requestAnimationFrame(() => {
        updateGameDisplay();
    });
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
        const role = player.isHost ? ' (Host)' : player.id === RANDO_ID ? ' (Bot)' : '';
        li.textContent = `${player.name}${role}`;
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

    updateLobbyControls();
}

function updateLobbyControls() {
    const randoContainer = elements.containers.randoOption;
    const includeRandoCheckbox = elements.checkboxes.includeRando;

    if (!randoContainer || !includeRandoCheckbox) return;

    if (gameState.isHost) {
        randoContainer.classList.remove('hidden');
        includeRandoCheckbox.disabled = false;
    } else {
        randoContainer.classList.add('hidden');
        includeRandoCheckbox.checked = false;
        includeRandoCheckbox.disabled = true;
    }
}

// Add updatePlayersBar function
function updatePlayersBar() {
    elements.displays.playersBar.innerHTML = '';
    gameState.players.forEach(player => {
        const div = document.createElement('div');
        div.className = `player-score ${player.id === gameState.czar ? 'czar' : ''}`;
        const score = gameState.scores[player.id] || 0;
        div.innerHTML = `
            <div>${player.name}</div>
            <div>${score} ${score === 1 ? 'pt' : 'pts'}</div>
            ${player.id === gameState.czar ? '<div>(Czar)</div>' : ''}
        `;
        elements.displays.playersBar.appendChild(div);
    });
}

// Add playCard function
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

// Host-driven helper for the Rando bot
function playRandoCard() {
    if (!gameState.isHost || !gameState.includeRando) return;
    if (gameState.phase !== GAME_PHASES.SELECTING) return;
    if (gameState.czar === RANDO_ID) return;
    if (gameState.playedCards.some(card => card.playerId === RANDO_ID)) return;

    let card = null;
    if (gameState.randoHand.length) {
        card = gameState.randoHand.shift();
    } else {
        const [drawn] = drawWhiteCards(1);
        card = drawn || null;
    }

    if (!card) return;

    handlePlayedCard({
        playerId: RANDO_ID,
        playerName: RANDO_NAME,
        card
    });
}

// Update updatePlayedCards function to better handle the judging phase
function updatePlayedCards() {
    elements.displays.playedCards.innerHTML = '';
    
    console.log('Updating played cards display:', {
        phase: gameState.phase,
        playedCards: gameState.playedCards,
        judgingCards: gameState.judgingCards,
        isCzar: gameState.czar === gameState.peer.id
    });
    
    if (gameState.phase === GAME_PHASES.SELECTING) {
        // During selection, show face-down cards for played cards
        gameState.playedCards.forEach(played => {
            const div = document.createElement('div');
            div.className = 'white-card face-down';
            div.textContent = played.playerName + ' has played';
            elements.displays.playedCards.appendChild(div);
        });
    } else if (gameState.phase === GAME_PHASES.JUDGING) {
        // During judging, show all cards face-up
        const cardsToShow = gameState.judgingCards || gameState.playedCards;
        
        if (!cardsToShow || cardsToShow.length === 0) {
            console.error('No cards to show in judging phase!');
            return;
        }

        cardsToShow.forEach(played => {
            const div = document.createElement('div');
            div.className = 'white-card';
            
            // Make sure we have the card text
            if (!played.card || !played.card.text) {
                console.error('Invalid card data:', played);
                return;
            }
            
            div.textContent = played.card.text;
            
            // Make cards clickable only for the Czar
            if (gameState.czar === gameState.peer.id) {
                div.onclick = () => selectWinner(played.playerId);
                div.classList.add('clickable');
                div.title = 'Click to select winner';
            }
            
            elements.displays.playedCards.appendChild(div);
        });
    } else if (gameState.phase === GAME_PHASES.SHOWING_WINNER) {
        // Show winner card highlighted
        gameState.playedCards.forEach(played => {
            const div = document.createElement('div');
            div.className = 'white-card' + 
                (played.playerId === gameState.roundWinner?.playerId ? ' winner' : '');
            div.textContent = played.card.text;
            elements.displays.playedCards.appendChild(div);
        });
    }
}

// Add selectWinner function if it's missing
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

// Add handleCzarChoice function
function handleCzarChoice(data) {
    console.log('Handling czar choice:', data);
    
    const cardsToCheck = gameState.judgingCards || gameState.playedCards;
    const winner = cardsToCheck.find(play => play.playerId === data.winnerId);
    
    if (!winner) {
        console.error('Winner not found:', data.winnerId);
        console.log('Available cards:', cardsToCheck);
        return;
    }
    
    gameState.roundWinner = winner;
    
    // Update scores
    const updatedScores = {...gameState.scores};
    updatedScores[winner.playerId] = (updatedScores[winner.playerId] || 0) + 1;
    gameState.scores = updatedScores;
    
    // Check if someone won the game
    if (gameState.scores[winner.playerId] >= POINTS_TO_WIN) {
        gameState.gameWinner = winner;
        gameState.phase = GAME_PHASES.GAME_OVER;
        
        // Broadcast final game state
        if (gameState.isHost) {
            broadcastToAll({
                type: 'game_over',
                data: {
                    winner: winner,
                    finalScores: gameState.scores
                }
            });
        }
        
        updateGameDisplay();
        return;
    }
    
    gameState.phase = GAME_PHASES.SHOWING_WINNER;
    
    // Broadcast score update to all players
    if (gameState.isHost) {
        broadcastToAll({
            type: 'score_update',
            data: {
                scores: gameState.scores,
                roundWinner: winner
            }
        });
    }
    
    updateGameDisplay();
    
    // Start new round after delay, but only if we're the host
    if (gameState.isHost) {
        setTimeout(() => {
            startNewRound();
        }, 3000);
    }
}

// Add startNewRound function
function startNewRound() {
    if (!gameState.isHost) return;
    
    const nextCzar = getNextCzar();
    
    const newCards = {};
    gameState.players.forEach(player => {
        if (player.id !== gameState.czar) {
            const [newCard] = drawWhiteCards(1);
            if (newCard) {
                newCards[player.id] = newCard;
            }
        }
    });

    let nextBlackCard = drawBlackCard();
    if (!nextBlackCard && gameState.gameData?.black?.length) {
        console.warn('Black card deck empty, reshuffling.');
        gameState.blackDeck = _.shuffle([...gameState.gameData.black]);
        nextBlackCard = drawBlackCard();
    }
    if (!nextBlackCard) {
        nextBlackCard = gameState.blackCard;
    }

    const roundSetup = {
        blackCard: nextBlackCard,
        czar: nextCzar,
        roundNumber: gameState.roundNumber + 1,
        newCards: newCards,
        previousState: {
            playedCards: gameState.playedCards,
            judgingCards: gameState.judgingCards,
            roundWinner: gameState.roundWinner
        }
    };

    broadcastToAll({
        type: 'new_round',
        data: roundSetup
    });

    handleNewRound(roundSetup);
}

// Update handleNewRound function to properly reset state
function handleNewRound(setup) {
    console.log('Starting new round with setup:', setup);
    
    // Store the current state before updating
    const previousCzar = gameState.czar;
    
    // Update game state for new round
    gameState.blackCard = setup.blackCard || gameState.blackCard;
    gameState.czar = setup.czar;
    gameState.roundNumber = setup.roundNumber;
    gameState.playedCards = [];
    gameState.judgingCards = null;
    gameState.selectedCard = null;
    gameState.roundWinner = null;
    gameState.phase = GAME_PHASES.SELECTING;

    // Add new card to hand if we got one
    if (setup.newCards && setup.newCards[gameState.peer.id]) {
        gameState.hand.push(setup.newCards[gameState.peer.id]);
    }
    if (gameState.isHost && gameState.includeRando && setup.newCards && setup.newCards[RANDO_ID]) {
        gameState.randoHand.push(setup.newCards[RANDO_ID]);
    }

    console.log('New round state:', {
        roundNumber: gameState.roundNumber,
        czar: gameState.czar,
        previousCzar: previousCzar,
        handSize: gameState.hand.length,
        phase: gameState.phase,
        isCzar: gameState.czar === gameState.peer.id
    });

    updateGameDisplay();
    if (gameState.isHost) {
        setTimeout(playRandoCard, 400);
    }
}// Add showGameOver function if it's missing
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
// Add these functions after handleCzarChoice

function getNextCzar() {
    // Find current czar's index
    const eligiblePlayers = gameState.players.filter(p => !isRando(p.id));
    const currentCzarIndex = eligiblePlayers.findIndex(p => p.id === gameState.czar);
    if (currentCzarIndex === -1) {
        return eligiblePlayers[0]?.id || gameState.czar;
    }
    // Get next player's index (wrap around to 0 if at end)
    const nextCzarIndex = (currentCzarIndex + 1) % eligiblePlayers.length;
    return eligiblePlayers[nextCzarIndex].id;
}

// Add CSS class for clickable cards
function addStyleToHead() {
    const style = document.createElement('style');
    style.textContent = `
        .white-card.clickable {
            cursor: pointer;
            border: 2px solid transparent;
        }
        .white-card.clickable:hover {
            border-color: #9333ea;
            transform: translateY(-5px);
        }
    `;
    document.head.appendChild(style);
}

// Add this new function after your existing code
function initializeCardTabs() {
    const tabs = document.querySelectorAll('.tab');
    const playedCards = document.getElementById('playedCards');
    const playerHand = document.getElementById('playerHand');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show/hide corresponding content
            if (tab.dataset.tab === 'played') {
                playedCards.classList.remove('hidden');
                playerHand.classList.add('hidden');
            } else {
                playerHand.classList.remove('hidden');
                playedCards.classList.add('hidden');
            }
        });
    });
}

// Add new handler functions
function handleScoreUpdate(data) {
    gameState.scores = data.scores;
    gameState.roundWinner = data.roundWinner;
    updateGameDisplay();
}

function handleGameOver(data) {
    gameState.gameWinner = data.winner;
    gameState.scores = data.finalScores;
    gameState.phase = GAME_PHASES.GAME_OVER;
    updateGameDisplay();
}

