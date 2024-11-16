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
    
    // If we're the Card Czar, we should manage the game state
    if (gameState.czar === gameState.peer.id) {
        // Count how many players need to submit (everyone except czar)
        const totalPlayers = gameState.players.length;
        const nonCzarPlayers = totalPlayers - 1; // Subtract 1 for czar
        const cardsPlayed = gameState.playedCards.length;
        
        console.log('Game status:', {
            totalPlayers,
            nonCzarPlayers,
            cardsPlayed,
            czarId: gameState.czar,
            playedCards: gameState.playedCards,
            currentPhase: gameState.phase
        });
        
        // First broadcast the played card update to all players
        broadcastToAll({
            type: 'cards_update',
            data: {
                playedCards: gameState.playedCards
            }
        });
        
        // If all cards are in, start judging
        if (cardsPlayed === nonCzarPlayers) {
            console.log('All players have submitted cards, starting judging phase');
            startJudging();
        }
    } else if (gameState.isHost) {
        // If we're the host (but not Czar), just broadcast the update
        broadcastToAll({
            type: 'cards_update',
            data: {
                playedCards: gameState.playedCards
            }
        });
    }
    
    updateGameDisplay();
}