"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wordDropTileForTest = exports.applyWordDropTurnTimeout = exports.applyWordDropMove = exports.viewWordDropState = exports.normalizeWordDropState = exports.createWordDropState = exports.createWordDropStateForPlayers = exports.normalizeWordDropSettings = exports.WORD_DROP_MINI_BONUSES = exports.WORD_DROP_REGULAR_BONUSES = exports.isWordDropWord = exports.WORD_DROP_DICTIONARY_SIZE = exports.WORD_DROP_RACK_SIZE = exports.WORD_DROP_MINI_BOARD_SIZE = exports.WORD_DROP_REGULAR_BOARD_SIZE = void 0;
const enable1_json_1 = __importDefault(require("./data/enable1.json"));
exports.WORD_DROP_REGULAR_BOARD_SIZE = 15;
exports.WORD_DROP_MINI_BOARD_SIZE = 11;
exports.WORD_DROP_RACK_SIZE = 7;
const REGULAR_LETTERS = [
    ["A", 9, 1], ["B", 2, 4], ["C", 2, 3], ["D", 4, 2], ["E", 12, 1],
    ["F", 2, 4], ["G", 3, 2], ["H", 2, 4], ["I", 8, 1], ["J", 1, 8],
    ["K", 1, 5], ["L", 4, 2], ["M", 2, 3], ["N", 6, 1], ["O", 7, 1],
    ["P", 2, 3], ["Q", 1, 10], ["R", 6, 1], ["S", 4, 1], ["T", 6, 1],
    ["U", 4, 2], ["V", 2, 5], ["W", 2, 4], ["X", 1, 8], ["Y", 2, 4], ["Z", 1, 10],
];
const MINI_COUNTS = {
    A: 4, B: 1, C: 1, D: 2, E: 5, F: 1, G: 1, H: 1, I: 4,
    J: 1, K: 1, L: 2, M: 1, N: 3, O: 3, P: 1, Q: 1, R: 3,
    S: 2, T: 3, U: 2, V: 1, W: 1, X: 1, Y: 1, Z: 1,
};
// Temporary endgame test distribution: 20 total tiles means two full racks
// are dealt with exactly six tiles remaining in the bag.
const TEST_COUNTS = {
    A: 3, C: 1, D: 1, E: 4, I: 2, L: 1, N: 2, O: 2, R: 1,
    S: 1, T: 1,
};
const WILDCARD_KEY = "?";
const WORDS = new Set(enable1_json_1.default.map((word) => word.toUpperCase()));
exports.WORD_DROP_DICTIONARY_SIZE = WORDS.size;
function isWordDropWord(word) {
    return WORDS.has(word.toUpperCase());
}
exports.isWordDropWord = isWordDropWord;
function bonus(row, col, type) {
    return { row, col, type };
}
// A custom symmetric layout for Word Drop, deliberately distinct from Scrabble's board.
exports.WORD_DROP_REGULAR_BONUSES = [
    bonus(7, 7, "START"),
    bonus(0, 0, "3W"), bonus(0, 7, "3W"), bonus(0, 14, "3W"),
    bonus(7, 0, "3W"), bonus(7, 14, "3W"),
    bonus(14, 0, "3W"), bonus(14, 7, "3W"), bonus(14, 14, "3W"),
    bonus(2, 2, "2W"), bonus(2, 12, "2W"), bonus(4, 4, "2W"), bonus(4, 10, "2W"),
    bonus(10, 4, "2W"), bonus(10, 10, "2W"), bonus(12, 2, "2W"), bonus(12, 12, "2W"),
    bonus(1, 5, "3L"), bonus(1, 9, "3L"), bonus(5, 1, "3L"), bonus(5, 5, "3L"),
    bonus(5, 9, "3L"), bonus(5, 13, "3L"), bonus(9, 1, "3L"), bonus(9, 5, "3L"),
    bonus(9, 9, "3L"), bonus(9, 13, "3L"), bonus(13, 5, "3L"), bonus(13, 9, "3L"),
    bonus(0, 3, "2L"), bonus(0, 11, "2L"), bonus(3, 0, "2L"), bonus(3, 6, "2L"),
    bonus(3, 8, "2L"), bonus(3, 14, "2L"), bonus(6, 3, "2L"), bonus(6, 11, "2L"),
    bonus(8, 3, "2L"), bonus(8, 11, "2L"), bonus(11, 0, "2L"), bonus(11, 6, "2L"),
    bonus(11, 8, "2L"), bonus(11, 14, "2L"), bonus(14, 3, "2L"), bonus(14, 11, "2L"),
];
exports.WORD_DROP_MINI_BONUSES = [
    bonus(5, 5, "START"),
    bonus(0, 0, "3W"), bonus(0, 10, "3W"),
    bonus(10, 0, "3W"), bonus(10, 10, "3W"),
    bonus(2, 2, "2W"), bonus(2, 8, "2W"),
    bonus(8, 2, "2W"), bonus(8, 8, "2W"),
    bonus(1, 5, "3L"), bonus(5, 1, "3L"),
    bonus(5, 9, "3L"), bonus(9, 5, "3L"),
    bonus(0, 3, "2L"), bonus(0, 7, "2L"), bonus(3, 0, "2L"), bonus(3, 5, "2L"),
    bonus(3, 10, "2L"), bonus(5, 3, "2L"), bonus(5, 7, "2L"), bonus(7, 0, "2L"),
    bonus(7, 5, "2L"), bonus(7, 10, "2L"), bonus(10, 3, "2L"), bonus(10, 7, "2L"),
];
function normalizeWordDropSettings(raw) {
    if (raw === undefined || raw === null)
        return { variant: "REGULAR", moveTimerSeconds: null };
    if (!raw || typeof raw !== "object")
        throw new Error("Invalid Word Drop settings");
    const variant = raw.variant ?? "REGULAR";
    const moveTimerSeconds = raw.moveTimerSeconds ?? null;
    if (variant !== "REGULAR" && variant !== "MINI" && variant !== "TEST")
        throw new Error("Choose a valid Word Drop variant");
    if (moveTimerSeconds !== null && moveTimerSeconds !== 120 && moveTimerSeconds !== 300) {
        throw new Error("Choose a valid move timer");
    }
    return { variant, moveTimerSeconds };
}
exports.normalizeWordDropSettings = normalizeWordDropSettings;
function boardSizeForVariant(variant) {
    return variant === "REGULAR" ? exports.WORD_DROP_REGULAR_BOARD_SIZE : exports.WORD_DROP_MINI_BOARD_SIZE;
}
function bonusesForVariant(variant) {
    return variant === "REGULAR" ? exports.WORD_DROP_REGULAR_BONUSES : exports.WORD_DROP_MINI_BONUSES;
}
function tilePoints(letter) {
    return REGULAR_LETTERS.find(([candidate]) => candidate === letter)?.[2] ?? 0;
}
function createBag(variant) {
    const tiles = [];
    for (const [letter, regularCount, points] of REGULAR_LETTERS) {
        const count = variant === "TEST" ? (TEST_COUNTS[letter] ?? 0) : variant === "MINI" ? MINI_COUNTS[letter] : regularCount;
        for (let index = 0; index < count; index += 1) {
            tiles.push({ id: `${letter}-${index}`, letter, points });
        }
    }
    const wildcardCount = variant === "TEST" ? 1 : variant === "MINI" ? 2 : 4;
    for (let index = 0; index < wildcardCount; index += 1) {
        tiles.push({ id: `WILD-${index}`, letter: "", points: 0, wildcard: true });
    }
    for (let index = tiles.length - 1; index > 0; index -= 1) {
        const target = Math.floor(Math.random() * (index + 1));
        [tiles[index], tiles[target]] = [tiles[target], tiles[index]];
    }
    return tiles;
}
function drawTiles(bag, amount) {
    return bag.splice(Math.max(0, bag.length - amount), amount);
}
function createWordDropStateForPlayers(players, rawSettings) {
    if (players.length < 2 || players.length > 4 || new Set(players).size !== players.length
        || players.some((player) => !Number.isInteger(player) || player <= 0)) {
        throw new Error("Word Drop needs between 2 and 4 different players");
    }
    const { variant } = normalizeWordDropSettings(rawSettings);
    const boardSize = boardSizeForVariant(variant);
    const bag = createBag(variant);
    const racks = Object.fromEntries(players.map((player) => [player, drawTiles(bag, exports.WORD_DROP_RACK_SIZE)]));
    return {
        kind: "word-drop",
        variant,
        boardSize,
        players: [...players],
        player1: players[0],
        player2: players[1],
        board: Array(boardSize * boardSize).fill(null),
        racks,
        bag,
        scores: Object.fromEntries(players.map((player) => [player, 0])),
        turnNumber: 1,
        consecutivePasses: 0,
        lastPlay: null,
    };
}
exports.createWordDropStateForPlayers = createWordDropStateForPlayers;
function createWordDropState(player1, player2, rawSettings) {
    return createWordDropStateForPlayers([player1, player2], rawSettings);
}
exports.createWordDropState = createWordDropState;
function normalizeWordDropState(raw) {
    if (!raw || typeof raw !== "object")
        throw new Error("Stored Word Drop state is invalid");
    const state = raw;
    if (state.kind !== "word-drop" || !Number.isInteger(state.player1) || !Number.isInteger(state.player2)) {
        throw new Error("Stored Word Drop players are invalid");
    }
    if (!Array.isArray(state.board)) {
        throw new Error("Stored Word Drop board is invalid");
    }
    const inferredBoardSize = Math.sqrt(state.board.length);
    const variant = state.variant === "TEST"
        ? "TEST"
        : state.variant === "MINI" || inferredBoardSize === exports.WORD_DROP_MINI_BOARD_SIZE
            ? "MINI"
            : "REGULAR";
    const boardSize = boardSizeForVariant(variant);
    if (state.boardSize !== undefined && state.boardSize !== boardSize)
        throw new Error("Stored Word Drop settings are invalid");
    if (state.board.length !== boardSize * boardSize)
        throw new Error("Stored Word Drop board is invalid");
    const players = Array.isArray(state.players) ? state.players.map(Number) : [Number(state.player1), Number(state.player2)];
    if (players.length < 2 || players.length > 4 || new Set(players).size !== players.length
        || players.some((player) => !Number.isInteger(player) || player <= 0)) {
        throw new Error("Stored Word Drop players are invalid");
    }
    if (!state.racks || players.some((player) => !Array.isArray(state.racks?.[String(player)]))) {
        throw new Error("Stored Word Drop racks are invalid");
    }
    if (!Array.isArray(state.bag) || !state.scores)
        throw new Error("Stored Word Drop bag is invalid");
    return { ...state, players, player1: players[0], player2: players[1], variant, boardSize };
}
exports.normalizeWordDropState = normalizeWordDropState;
function viewWordDropState(raw, viewerId) {
    const state = normalizeWordDropState(raw);
    if (!state.players.includes(viewerId))
        throw new Error("You are not a player in this game");
    const unseenLetterCounts = Object.fromEntries([
        ...REGULAR_LETTERS.map(([letter]) => [letter, 0]),
        [WILDCARD_KEY, 0],
    ]);
    const inventory = [
        ...state.board.filter((tile) => tile !== null),
        ...state.players.flatMap((player) => state.racks[String(player)]),
        ...state.bag,
    ];
    for (const tile of inventory) {
        const key = tile.wildcard ? WILDCARD_KEY : tile.letter;
        unseenLetterCounts[key] = (unseenLetterCounts[key] ?? 0) + 1;
    }
    for (const tile of state.board) {
        if (tile) {
            const key = tile.wildcard ? WILDCARD_KEY : tile.letter;
            unseenLetterCounts[key] = Math.max(0, (unseenLetterCounts[key] ?? 0) - 1);
        }
    }
    for (const tile of state.racks[String(viewerId)]) {
        const key = tile.wildcard ? WILDCARD_KEY : tile.letter;
        unseenLetterCounts[key] = Math.max(0, (unseenLetterCounts[key] ?? 0) - 1);
    }
    return {
        kind: state.kind,
        variant: state.variant,
        boardSize: state.boardSize,
        players: state.players,
        player1: state.player1,
        player2: state.player2,
        board: state.board,
        rack: state.racks[String(viewerId)],
        rackCounts: Object.fromEntries(state.players.map((player) => [player, state.racks[String(player)].length])),
        bagCount: state.bag.length,
        unseenLetterCounts,
        scores: state.scores,
        turnNumber: state.turnNumber,
        consecutivePasses: state.consecutivePasses,
        lastPlay: state.lastPlay,
        bonuses: bonusesForVariant(state.variant),
    };
}
exports.viewWordDropState = viewWordDropState;
function cellIndex(row, col, boardSize) {
    return row * boardSize + col;
}
function isInside(row, col, boardSize) {
    return row >= 0 && row < boardSize && col >= 0 && col < boardSize;
}
function collectWord(board, boardSize, row, col, rowStep, colStep) {
    let startRow = row;
    let startCol = col;
    while (isInside(startRow - rowStep, startCol - colStep, boardSize) && board[cellIndex(startRow - rowStep, startCol - colStep, boardSize)]) {
        startRow -= rowStep;
        startCol -= colStep;
    }
    const cells = [];
    while (isInside(startRow, startCol, boardSize)) {
        const tile = board[cellIndex(startRow, startCol, boardSize)];
        if (!tile)
            break;
        cells.push({ row: startRow, col: startCol, tile });
        startRow += rowStep;
        startCol += colStep;
    }
    return cells;
}
function wordKey(cells) {
    return cells.map((cell) => `${cell.row}:${cell.col}`).join("|");
}
function scoreWord(cells, newCells, bonusByCell) {
    let letters = 0;
    let wordMultiplier = 1;
    for (const cell of cells) {
        const isNew = newCells.has(`${cell.row}:${cell.col}`);
        const bonusType = isNew ? bonusByCell.get(`${cell.row}:${cell.col}`) : undefined;
        const letterMultiplier = bonusType === "2L" ? 2 : bonusType === "3L" ? 3 : 1;
        if (bonusType === "2W")
            wordMultiplier *= 2;
        if (bonusType === "3W")
            wordMultiplier *= 3;
        letters += cell.tile.points * letterMultiplier;
    }
    return letters * wordMultiplier;
}
function nextPlayerAfter(state, playerId) {
    const index = state.players.indexOf(playerId);
    if (index < 0)
        throw new Error("You are not a player in this game");
    return state.players[(index + 1) % state.players.length];
}
function determineWinner(scores, players) {
    const best = Math.max(...players.map((player) => scores[String(player)] ?? 0));
    const winners = players.filter((player) => (scores[String(player)] ?? 0) === best);
    return winners.length === 1 ? winners[0] : -1;
}
function finishRackScores(state) {
    return Object.fromEntries(state.players.map((player) => [
        player,
        Math.max(0, state.scores[String(player)] - state.racks[String(player)].reduce((sum, tile) => sum + tile.points, 0)),
    ]));
}
function applyWordDropMove(raw, playerId, move) {
    const state = normalizeWordDropState(raw);
    const boardSize = state.boardSize;
    const centre = Math.floor(boardSize / 2);
    const bonusByCell = new Map(bonusesForVariant(state.variant).map((item) => [`${item.row}:${item.col}`, item.type]));
    if (!state.players.includes(playerId))
        throw new Error("You are not a player in this game");
    if (!move || typeof move !== "object")
        throw new Error("Choose tiles to play");
    const value = move;
    const nextPlayer = nextPlayerAfter(state, playerId);
    if (value.kind === "pass") {
        const consecutivePasses = state.consecutivePasses + 1;
        const passedState = {
            ...state,
            consecutivePasses,
            turnNumber: state.turnNumber + 1,
            lastPlay: { playerId, words: [], score: 0, placements: [], passed: true },
        };
        return consecutivePasses >= state.players.length
            ? { state: passedState, winner: determineWinner(passedState.scores, state.players), nextPlayer: 0 }
            : { state: passedState, winner: 0, nextPlayer };
    }
    if (value.kind !== "play" || !Array.isArray(value.placements) || value.placements.length < 1 || value.placements.length > exports.WORD_DROP_RACK_SIZE) {
        throw new Error("Place between 1 and 7 tiles");
    }
    const placements = value.placements.map((item) => {
        if (!item || typeof item !== "object")
            throw new Error("A tile placement is invalid");
        const placement = item;
        if (typeof placement.tileId !== "string" || !Number.isInteger(placement.row) || !Number.isInteger(placement.col)) {
            throw new Error("A tile placement is invalid");
        }
        const letter = typeof placement.letter === "string" ? placement.letter.trim().toUpperCase() : undefined;
        return { tileId: placement.tileId, row: placement.row, col: placement.col, ...(letter ? { letter } : {}) };
    });
    const placementCells = new Set(placements.map((item) => `${item.row}:${item.col}`));
    const tileIds = new Set(placements.map((item) => item.tileId));
    if (placementCells.size !== placements.length || tileIds.size !== placements.length)
        throw new Error("Each tile and square can only be used once");
    const rack = state.racks[String(playerId)];
    const rackById = new Map(rack.map((tile) => [tile.id, tile]));
    const board = [...state.board];
    for (const placement of placements) {
        if (!isInside(placement.row, placement.col, boardSize))
            throw new Error("A tile is outside the board");
        if (board[cellIndex(placement.row, placement.col, boardSize)])
            throw new Error("That square is already occupied");
        const tile = rackById.get(placement.tileId);
        if (!tile)
            throw new Error("That tile is not in your rack");
        if (tile.wildcard && (!placement.letter || !/^[A-Z]$/.test(placement.letter))) {
            throw new Error("Choose a letter for every wildcard");
        }
        if (!tile.wildcard && placement.letter !== undefined) {
            throw new Error("Only wildcards can be assigned a letter");
        }
        board[cellIndex(placement.row, placement.col, boardSize)] = {
            ...tile,
            letter: tile.wildcard ? placement.letter : tile.letter,
            ownerId: playerId,
            turn: state.turnNumber,
        };
    }
    const oneRow = placements.every((item) => item.row === placements[0].row);
    const oneColumn = placements.every((item) => item.col === placements[0].col);
    if (placements.length > 1 && !oneRow && !oneColumn)
        throw new Error("Tiles must be placed in one row or column");
    const boardWasEmpty = state.board.every((tile) => tile === null);
    if (boardWasEmpty) {
        if (!placementCells.has(`${centre}:${centre}`))
            throw new Error("The first word must cross the centre");
    }
    else {
        const touchesTile = placements.some((item) => [
            [item.row - 1, item.col], [item.row + 1, item.col], [item.row, item.col - 1], [item.row, item.col + 1],
        ].some(([row, col]) => isInside(row, col, boardSize) && state.board[cellIndex(row, col, boardSize)] !== null));
        if (!touchesTile)
            throw new Error("Your word must connect to the board");
    }
    const words = [];
    if (placements.length === 1) {
        const horizontal = collectWord(board, boardSize, placements[0].row, placements[0].col, 0, 1);
        const vertical = collectWord(board, boardSize, placements[0].row, placements[0].col, 1, 0);
        if (horizontal.length > 1)
            words.push(horizontal);
        if (vertical.length > 1)
            words.push(vertical);
    }
    else {
        const rowStep = oneColumn ? 1 : 0;
        const colStep = oneRow ? 1 : 0;
        const main = collectWord(board, boardSize, placements[0].row, placements[0].col, rowStep, colStep);
        const mainCoordinates = new Set(main.map((cell) => `${cell.row}:${cell.col}`));
        if (!placements.every((item) => mainCoordinates.has(`${item.row}:${item.col}`)))
            throw new Error("There cannot be gaps between placed tiles");
        words.push(main);
        for (const item of placements) {
            const cross = collectWord(board, boardSize, item.row, item.col, colStep, rowStep);
            if (cross.length > 1)
                words.push(cross);
        }
    }
    const uniqueWords = [...new Map(words.filter((word) => word.length > 1).map((word) => [wordKey(word), word])).values()];
    if (uniqueWords.length === 0)
        throw new Error("Your tiles must form a word of at least two letters");
    const labels = uniqueWords.map((word) => word.map((cell) => cell.tile.letter).join(""));
    const invalid = labels.find((word) => !isWordDropWord(word));
    if (invalid)
        throw new Error(`${invalid} is not in the Word Drop dictionary`);
    const score = uniqueWords.reduce((total, word) => total + scoreWord(word, placementCells, bonusByCell), 0)
        + (placements.length === exports.WORD_DROP_RACK_SIZE ? 35 : 0);
    const remainingRack = rack.filter((tile) => !tileIds.has(tile.id));
    const bag = [...state.bag];
    remainingRack.push(...drawTiles(bag, exports.WORD_DROP_RACK_SIZE - remainingRack.length));
    const scores = { ...state.scores, [playerId]: state.scores[String(playerId)] + score };
    const updated = {
        ...state,
        board,
        bag,
        racks: { ...state.racks, [playerId]: remainingRack },
        scores,
        turnNumber: state.turnNumber + 1,
        consecutivePasses: 0,
        lastPlay: { playerId, words: labels, score, placements, passed: false },
    };
    if (bag.length === 0 && remainingRack.length === 0) {
        updated.scores = finishRackScores(updated);
        return { state: updated, winner: determineWinner(updated.scores, state.players), nextPlayer: 0 };
    }
    return { state: updated, winner: 0, nextPlayer };
}
exports.applyWordDropMove = applyWordDropMove;
function applyWordDropTurnTimeout(raw, playerId) {
    return applyWordDropMove(raw, playerId, { kind: "pass" });
}
exports.applyWordDropTurnTimeout = applyWordDropTurnTimeout;
function wordDropTileForTest(id, letter) {
    return letter === WILDCARD_KEY
        ? { id, letter: "", points: 0, wildcard: true }
        : { id, letter, points: tilePoints(letter) };
}
exports.wordDropTileForTest = wordDropTileForTest;
