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
            // Update our local player list when we join
            gameState.players = message.data.players;
            updatePlayersList();
            break;
        case 'player_list':
            // Update player list when it changes
            gameState.players = message.data;
            updatePlayersList();
            break;
        // ... rest of the cases ...
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