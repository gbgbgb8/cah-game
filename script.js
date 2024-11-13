function startGame(gameSetup) {
    try {
        if (!gameSetup || !gameSetup.playerHands || !gameSetup.blackCards) {
            throw new Error('Invalid game setup data');
        }
        
        gameState.hand = gameSetup.playerHands[gameState.peer.id] || [];
        gameState.blackCard = gameSetup.blackCards[0];
        gameState.czar = gameSetup.firstCzar;
        gameState.phase = GAME_PHASES.SELECTING;
        gameState.roundNumber = gameSetup.roundNumber;
        gameState.playedCards = [];
        gameState.scores = {};
        
        showScreen('game');
        updateGameDisplay();
    } catch (error) {
        console.error('Error starting game:', error);
        showError('Failed to start game. Please try again.');
    }
}

function handleNewRound(setup) {
    try {
        if (!setup || !setup.blackCard || !setup.czar) {
            throw new Error('Invalid round setup data');
        }
        
        const previousCzar = gameState.czar;
        
        gameState.blackCard = setup.blackCard;
        gameState.czar = setup.czar;
        gameState.roundNumber = setup.roundNumber;
        
        if (previousCzar === gameState.peer.id) {
            gameState.playedCards = [];
            gameState.judgingCards = null;
        }
        
        gameState.selectedCard = null;
        gameState.roundWinner = null;
        gameState.phase = GAME_PHASES.SELECTING;
        
        if (setup.newCards && setup.newCards[gameState.peer.id]) {
            gameState.hand.push(setup.newCards[gameState.peer.id]);
        }
        
        updateGameDisplay();
    } catch (error) {
        console.error('Error handling new round:', error);
        showError('Failed to start new round. Please refresh.');
    }
}