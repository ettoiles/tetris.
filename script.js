class TetrisDB {
    constructor() {
        this.dbName = 'TetrisDB';
        this.dbVersion = 1;
        this.db = null;
        this.init();
    }

    init() {
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onerror = (event) => {
            console.error("Database error: " + event.target.error);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('highScores')) {
                const store = db.createObjectStore('highScores', { keyPath: 'id', autoIncrement: true });
                store.createIndex('score', 'score');
                store.createIndex('date', 'date');
                store.createIndex('name', 'name');
            }
        };

        request.onsuccess = (event) => {
            this.db = event.target.result;
        };
    }

    async saveScore(scoreData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['highScores'], 'readwrite');
            const store = transaction.objectStore('highScores');
            const request = store.add(scoreData);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getHighScores() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['highScores'], 'readonly');
            const store = transaction.objectStore('highScores');
            const request = store.index('score').openCursor(null, 'prev');
            const scores = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && scores.length < 5) {
                    scores.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(scores);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }
}

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const BLOCK_SIZE = 30;
const PREVIEW_BLOCK_SIZE = 25;

class Tetris {
    constructor() {
        this.db = new TetrisDB();
        this.board = Array(BOARD_HEIGHT).fill().map(() => Array(BOARD_WIDTH).fill(0));
        this.gameBoard = document.getElementById('game-board');
        this.nextPieceContainer = document.getElementById('next-piece-container');
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.gameTime = 0;
        this.gameInterval = null;
        this.currentPiece = null;
        this.nextPiece = null;
        this.gameActive = false;
        this.isPaused = false;

        this.shapes = [
            [[1, 1, 1, 1]], // I
            [[1, 1], [1, 1]], // O
            [[1, 1, 1], [0, 1, 0]], // T
            [[1, 1, 1], [1, 0, 0]], // L
            [[1, 1, 1], [0, 0, 1]]  // J (mirrored L)
        ];

        this.colors = [
            '#00f0f0', // cyan
            '#f0f000', // yellow
            '#a000f0', // purple
            '#f0a000', // orange
            '#0000f0'  // blue
        ];

        this.restartBtn = document.getElementById('restart-btn');
        this.startBtn = document.getElementById('start-btn');
        this.restartBtn.addEventListener('click', () => this.startGame());
        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        document.addEventListener('keydown', (e) => this.handleInput(e));
        setTimeout(() => this.updateRankings(), 100);
    }

    async getHighScores() {
        try {
            return await this.db.getHighScores();
        } catch (error) {
            console.error('Error getting high scores:', error);
            return [];
        }
    }

    async saveHighScore(score) {
        const playerName = prompt('Digite seu nome:', '');
        if (playerName) {
            try {
                const scoreData = {
                    score,
                    name: playerName,
                    date: new Date().toLocaleDateString('pt-BR')
                };
                await this.db.saveScore(scoreData);
                this.updateRankings();
            } catch (error) {
                console.error('Error saving score:', error);
            }
        }
    }

    async updateRankings() {
        const rankingsList = document.getElementById('rankings-list');
        const scores = await this.getHighScores();
        
        rankingsList.innerHTML = scores.map((score, index) => {
            const position = index + 1;
            const medal = position === 1 ? '👑 ' : position === 2 ? '🥈 ' : position === 3 ? '🥉 ' : '';
            return `
                <div class="ranking-item">
                    <span>${medal}${position}º ${score.name}</span>
                    <span class="ranking-score">${score.score}</span>
                    <span>${score.date}</span>
                </div>
            `;
        }).join('');
    }

    startGame() {
        if (this.gameActive) return;

        const existingOverlay = this.gameBoard.querySelector('.game-over-overlay');
        if (existingOverlay) {
            this.gameBoard.removeChild(existingOverlay);
        }

        this.restartBtn.style.display = 'none';

        this.resetGame();
        this.gameActive = true;
        this.generateNextPiece();
        this.spawnPiece();
        this.startTimer();
        this.update();
    }

    resetGame() {
        this.board = Array(BOARD_HEIGHT).fill().map(() => Array(BOARD_WIDTH).fill(0));
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.gameTime = 0;
        this.updateStats();
        this.drawBoard();
    }

    generateNextPiece() {
        const shapeIndex = Math.floor(Math.random() * this.shapes.length);
        return {
            shape: this.shapes[shapeIndex],
            color: this.colors[shapeIndex],
            index: shapeIndex
        };
    }

    drawNextPiece() {
        this.nextPieceContainer.innerHTML = '';
        
        if (!this.nextPiece) return;

        const shape = this.nextPiece.shape;
        const color = this.nextPiece.color;
        
        const offsetX = (120 - (shape[0].length * PREVIEW_BLOCK_SIZE)) / 2;
        const offsetY = (120 - (shape.length * PREVIEW_BLOCK_SIZE)) / 2;

        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (shape[y][x]) {
                    const block = document.createElement('div');
                    block.className = 'preview-block';
                    block.style.backgroundColor = color;
                    block.style.left = (offsetX + x * PREVIEW_BLOCK_SIZE) + 'px';
                    block.style.top = (offsetY + y * PREVIEW_BLOCK_SIZE) + 'px';
                    this.nextPieceContainer.appendChild(block);
                }
            }
        }
    }

    spawnPiece() {
        if (!this.nextPiece) {
            const shapeIndex = Math.floor(Math.random() * 5);
            this.nextPiece = {
                shape: this.shapes[shapeIndex],
                color: this.colors[shapeIndex],
                index: shapeIndex
            };
        }

        this.currentPiece = {
            shape: this.nextPiece.shape,
            color: this.nextPiece.color,
            x: Math.floor(BOARD_WIDTH / 2) - Math.floor(this.nextPiece.shape[0].length / 2),
            y: 0
        };

        const shapeIndex = Math.floor(Math.random() * 5);
        this.nextPiece = {
            shape: this.shapes[shapeIndex],
            color: this.colors[shapeIndex],
            index: shapeIndex
        };
        this.drawNextPiece();
    }

    startTimer() {
        if (this.gameInterval) clearInterval(this.gameInterval);
        this.gameInterval = setInterval(() => {
            this.gameTime++;
            this.updateStats();
        }, 1000);
    }

    updateStats() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('lines').textContent = this.lines;
        document.getElementById('level').textContent = this.level;
        
        const minutes = Math.floor(this.gameTime / 60);
        const seconds = this.gameTime % 60;
        document.getElementById('time').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    update() {
        if (!this.gameActive || this.isPaused) return;

        if (this.canMove(0, 1)) {
            this.currentPiece.y++;
        } else {
            this.placePiece();
            this.clearLines();
            this.spawnPiece();
            
            if (!this.canMove(0, 0)) {
                this.gameOver();
                return;
            }
        }

        this.drawBoard();
        
        const baseSpeed = 800; 
        const speedMultiplier = this.level; 
        const speed = baseSpeed / speedMultiplier; 
        
        setTimeout(() => this.update(), speed);
    }

    drawBoard() {
        this.gameBoard.innerHTML = '';
        
        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                if (this.board[y][x]) {
                    this.drawBlock(x, y, this.board[y][x]);
                }
            }
        }

        if (this.currentPiece) {
            for (let y = 0; y < this.currentPiece.shape.length; y++) {
                for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
                    if (this.currentPiece.shape[y][x]) {
                        this.drawBlock(
                            this.currentPiece.x + x,
                            this.currentPiece.y + y,
                            this.currentPiece.color
                        );
                    }
                }
            }
        }
    }

    drawBlock(x, y, color) {
        const block = document.createElement('div');
        block.className = 'block';
        block.style.backgroundColor = color;
        block.style.left = (x * BLOCK_SIZE) + 'px';
        block.style.top = (y * BLOCK_SIZE) + 'px';
        this.gameBoard.appendChild(block);
    }

    canMove(offsetX, offsetY) {
        for (let y = 0; y < this.currentPiece.shape.length; y++) {
            for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
                if (this.currentPiece.shape[y][x]) {
                    const newX = this.currentPiece.x + x + offsetX;
                    const newY = this.currentPiece.y + y + offsetY;

                    if (newX < 0 || newX >= BOARD_WIDTH || 
                        newY >= BOARD_HEIGHT ||
                        (newY >= 0 && this.board[newY][newX])) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    placePiece() {
        for (let y = 0; y < this.currentPiece.shape.length; y++) {
            for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
                if (this.currentPiece.shape[y][x]) {
                    const boardY = this.currentPiece.y + y;
                    const boardX = this.currentPiece.x + x;
                    if (boardY >= 0) {
                        this.board[boardY][boardX] = this.currentPiece.color;
                    }
                }
            }
        }
    }

    clearLines() {
        let linesCleared = 0;
        
        for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
            if (this.board[y].every(cell => cell !== 0)) {
                this.board.splice(y, 1);
                this.board.unshift(Array(BOARD_WIDTH).fill(0));
                linesCleared++;
                y++;
            }
        }

        if (linesCleared > 0) {
            this.lines += linesCleared;
            this.score += linesCleared * 100 * this.level;
            this.level = Math.floor(this.lines / 10) + 1;
            this.updateStats();
        }
    }

    rotatePiece() {
        const rotated = [];
        for (let i = 0; i < this.currentPiece.shape[0].length; i++) {
            rotated.push([]);
            for (let j = this.currentPiece.shape.length - 1; j >= 0; j--) {
                rotated[i].push(this.currentPiece.shape[j][i]);
            }
        }

        const originalShape = this.currentPiece.shape;
        this.currentPiece.shape = rotated;
        
        if (!this.canMove(0, 0)) {
            this.currentPiece.shape = originalShape;
        }
    }

    togglePause() {
        if (!this.gameActive) return;
        
        this.isPaused = !this.isPaused;
        
        if (this.isPaused) {
            clearInterval(this.gameInterval);
            const overlay = document.createElement('div');
            overlay.className = 'pause-overlay';
            
            const pauseText = document.createElement('div');
            pauseText.className = 'pause-text';
            pauseText.textContent = 'PAUSADO';
            
            overlay.appendChild(pauseText);
            this.gameBoard.appendChild(overlay);
        } else {
            const overlay = this.gameBoard.querySelector('.pause-overlay');
            if (overlay) {
                this.gameBoard.removeChild(overlay);
            }
            this.startTimer();
            this.update();
        }
    }

    handleInput(e) {
        if (e.key === 'Escape') {
            this.togglePause();
            return;
        }
        
        if (!this.gameActive || this.isPaused) return;

        switch (e.key) {
            case 'ArrowLeft':
                if (this.canMove(-1, 0)) {
                    this.currentPiece.x--;
                    this.drawBoard();
                }
                break;
            case 'ArrowRight':
                if (this.canMove(1, 0)) {
                    this.currentPiece.x++;
                    this.drawBoard();
                }
                break;
            case 'ArrowDown':
                if (this.canMove(0, 1)) {
                    this.currentPiece.y++;
                    this.drawBoard();
                }
                break;
            case 'ArrowUp':
                this.rotatePiece();
                this.drawBoard();
                break;
            case ' ':
                while (this.canMove(0, 1)) {
                    this.currentPiece.y++;
                }
                this.drawBoard();
                break;
        }
    }

    gameOver() {
        this.gameActive = false;
        clearInterval(this.gameInterval);
        this.saveHighScore(this.score);
        
        const overlay = document.createElement('div');
        overlay.className = 'game-over-overlay';
        
        const gameOverText = document.createElement('div');
        gameOverText.className = 'game-over-text';
        gameOverText.textContent = 'GAME OVER';
        
        const scoreText = document.createElement('div');
        scoreText.style.color = '#ffffff';
        scoreText.style.marginBottom = '20px';
        scoreText.textContent = `Pontuação: ${this.score}`;
        
        overlay.appendChild(gameOverText);
        overlay.appendChild(scoreText);
        
        this.gameBoard.appendChild(overlay);

        this.restartBtn.style.display = 'block';
    }
}
const game = new Tetris();
