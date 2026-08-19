"use strict";
/**
 * @license
 * Copyright (c) 2025, Jeff Hlywa (jhlywa@gmail.com)
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomChess960 = exports.chess960Fen = exports.CHESS960_POSITIONS = exports.Chess = exports.validateFen = exports.SEVEN_TAG_ROSTER = exports.SQUARES = exports.Move = exports.isChessVariant = exports.DEFAULT_POSITION = exports.KING = exports.QUEEN = exports.ROOK = exports.BISHOP = exports.KNIGHT = exports.PAWN = exports.BLACK = exports.WHITE = exports.xoroshiro128 = void 0;
/*
 * LOCAL FORK OF chess.js 1.4.0
 * ----------------------------------------------------------------------------
 * This file is a copy of chess.js/src/chess.ts, modified so a single engine
 * covers three variants. The copies under `backend-js/src/game/gamestate/games/`
 * and `app/src/games/` must stay byte-identical (`npm run sync:chess-engine`)
 * so the client and the server agree about legality down to the last edge case.
 *
 * Differences from upstream:
 *
 * 1. `variant` constructor option: 'standard' | 'chess960' | 'fog'.
 *
 * 2. Castling is generalised. Upstream hardcodes e1/e8 kings and a1/h1/a8/h8
 *    rooks; this fork tracks the castling rook squares per colour, accepts
 *    Shredder-FEN castling fields (file letters) as well as KQkq, and moves the
 *    king to the g/c file and the rook to the f/d file wherever they started.
 *    Chess960 castle moves are encoded king-takes-rook internally (the only
 *    unambiguous encoding when the king's destination may hold the rook), while
 *    standard chess keeps upstream's king-moves-two-squares encoding so games
 *    recorded before this fork still replay identically.
 *
 * 3. `chess960Fen()` generates any of the 960 Chess960 starting positions using
 *    the standard Scharnagl numbering.
 *
 * 4. Fog of war. `visibleSquares(color)` computes exactly what a player can
 *    see and `fogFen(color)` renders a FEN with everything else erased. In the
 *    fog variant there is no check, no checkmate and no pin: moves are
 *    pseudo-legal and the game is won by capturing the enemy king.
 *
 *    The vision rule is chosen so that a fogged position is *informationally
 *    complete*: the moves generated from a player's fogged FEN are exactly the
 *    moves of the true position, so the server never has to ship hidden squares
 *    for a client to know what it may play. See `_visionSquares`.
 *
 * 5. `loadPgn()` and its generated peggy parser dependency were removed. PGN
 *    output is still supported.
 */
const MASK64 = 0xffffffffffffffffn;
function rotl(x, k) {
    return ((x << k) | (x >> (64n - k))) & 0xffffffffffffffffn;
}
function wrappingMul(x, y) {
    return (x * y) & MASK64;
}
// xoroshiro128**
function xoroshiro128(state) {
    return function () {
        let s0 = BigInt(state & MASK64);
        let s1 = BigInt((state >> 64n) & MASK64);
        const result = wrappingMul(rotl(wrappingMul(s0, 5n), 7n), 9n);
        s1 ^= s0;
        s0 = (rotl(s0, 24n) ^ s1 ^ (s1 << 16n)) & MASK64;
        s1 = rotl(s1, 37n);
        state = (s1 << 64n) | s0;
        return result;
    };
}
exports.xoroshiro128 = xoroshiro128;
const rand = xoroshiro128(0xa187eb39cdcaed8f31c4b365b102e01en);
const PIECE_KEYS = Array.from({ length: 2 }, () => Array.from({ length: 6 }, () => Array.from({ length: 128 }, () => rand())));
const EP_KEYS = Array.from({ length: 8 }, () => rand());
const CASTLING_KEYS = Array.from({ length: 16 }, () => rand());
const SIDE_KEY = rand();
exports.WHITE = 'w';
exports.BLACK = 'b';
exports.PAWN = 'p';
exports.KNIGHT = 'n';
exports.BISHOP = 'b';
exports.ROOK = 'r';
exports.QUEEN = 'q';
exports.KING = 'k';
exports.DEFAULT_POSITION = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CHESS_VARIANTS = ['standard', 'chess960', 'fog'];
function isChessVariant(value) {
    return (typeof value === 'string' && CHESS_VARIANTS.includes(value));
}
exports.isChessVariant = isChessVariant;
class Move {
    constructor(chess, internal) {
        const { color, piece, from, to, flags, captured, promotion } = internal;
        const fromAlgebraic = algebraic(from);
        const toAlgebraic = algebraic(to);
        this.color = color;
        this.piece = piece;
        this.from = fromAlgebraic;
        this.to = toAlgebraic;
        if (flags & (BITS.KSIDE_CASTLE | BITS.QSIDE_CASTLE)) {
            const kingSide = Boolean(flags & BITS.KSIDE_CASTLE);
            this.castleKingTo = algebraic(castleKingSquare(from, kingSide));
            this.castleRookTo = algebraic(castleRookSquare(from, kingSide));
        }
        /*
         * HACK: The chess['_method']() calls below invoke private methods in the
         * Chess class to generate SAN and FEN. It's a bit of a hack, but makes the
         * code cleaner elsewhere.
         */
        this.san = chess['_moveToSan'](internal, chess['_moves']({ legal: true }));
        this.lan = fromAlgebraic + toAlgebraic;
        this.before = chess.fen();
        // Generate the FEN for the 'after' key
        chess['_makeMove'](internal);
        this.after = chess.fen();
        chess['_undoMove']();
        // Build the text representation of the move flags
        this.flags = '';
        for (const flag in BITS) {
            if (BITS[flag] & flags) {
                this.flags += FLAGS[flag];
            }
        }
        if (captured) {
            this.captured = captured;
        }
        if (promotion) {
            this.promotion = promotion;
            this.lan += promotion;
        }
    }
    isCapture() {
        return this.flags.indexOf(FLAGS['CAPTURE']) > -1;
    }
    isPromotion() {
        return this.flags.indexOf(FLAGS['PROMOTION']) > -1;
    }
    isEnPassant() {
        return this.flags.indexOf(FLAGS['EP_CAPTURE']) > -1;
    }
    isKingsideCastle() {
        return this.flags.indexOf(FLAGS['KSIDE_CASTLE']) > -1;
    }
    isQueensideCastle() {
        return this.flags.indexOf(FLAGS['QSIDE_CASTLE']) > -1;
    }
    isCastle() {
        return this.isKingsideCastle() || this.isQueensideCastle();
    }
    isBigPawn() {
        return this.flags.indexOf(FLAGS['BIG_PAWN']) > -1;
    }
}
exports.Move = Move;
const EMPTY = -1;
const FLAGS = {
    NORMAL: 'n',
    CAPTURE: 'c',
    BIG_PAWN: 'b',
    EP_CAPTURE: 'e',
    PROMOTION: 'p',
    KSIDE_CASTLE: 'k',
    QSIDE_CASTLE: 'q',
    NULL_MOVE: '-',
};
// prettier-ignore
exports.SQUARES = [
    'a8', 'b8', 'c8', 'd8', 'e8', 'f8', 'g8', 'h8',
    'a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7',
    'a6', 'b6', 'c6', 'd6', 'e6', 'f6', 'g6', 'h6',
    'a5', 'b5', 'c5', 'd5', 'e5', 'f5', 'g5', 'h5',
    'a4', 'b4', 'c4', 'd4', 'e4', 'f4', 'g4', 'h4',
    'a3', 'b3', 'c3', 'd3', 'e3', 'f3', 'g3', 'h3',
    'a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2',
    'a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1'
];
const BITS = {
    NORMAL: 1,
    CAPTURE: 2,
    BIG_PAWN: 4,
    EP_CAPTURE: 8,
    PROMOTION: 16,
    KSIDE_CASTLE: 32,
    QSIDE_CASTLE: 64,
    NULL_MOVE: 128,
};
/* eslint-disable @typescript-eslint/naming-convention */
// these are required, according to spec
exports.SEVEN_TAG_ROSTER = {
    Event: '?',
    Site: '?',
    Date: '????.??.??',
    Round: '?',
    White: '?',
    Black: '?',
    Result: '*',
};
/**
 * These nulls are placeholders to fix the order of tags (as they appear in PGN spec); null values will be
 * eliminated in getHeaders()
 */
const SUPLEMENTAL_TAGS = {
    WhiteTitle: null,
    BlackTitle: null,
    WhiteElo: null,
    BlackElo: null,
    WhiteUSCF: null,
    BlackUSCF: null,
    WhiteNA: null,
    BlackNA: null,
    WhiteType: null,
    BlackType: null,
    EventDate: null,
    EventSponsor: null,
    Section: null,
    Stage: null,
    Board: null,
    Opening: null,
    Variation: null,
    SubVariation: null,
    ECO: null,
    NIC: null,
    Time: null,
    UTCTime: null,
    UTCDate: null,
    TimeControl: null,
    SetUp: null,
    FEN: null,
    Termination: null,
    Annotator: null,
    Mode: null,
    PlyCount: null,
};
const HEADER_TEMPLATE = {
    ...exports.SEVEN_TAG_ROSTER,
    ...SUPLEMENTAL_TAGS,
};
/* eslint-enable @typescript-eslint/naming-convention */
/*
 * NOTES ABOUT 0x88 MOVE GENERATION ALGORITHM
 * ----------------------------------------------------------------------------
 * From https://github.com/jhlywa/chess.js/issues/230
 *
 * A lot of people are confused when they first see the internal representation
 * of chess.js. It uses the 0x88 Move Generation Algorithm which internally
 * stores the board as an 8x16 array. This is purely for efficiency but has a
 * couple of interesting benefits:
 *
 * 1. 0x88 offers a very inexpensive "off the board" check. Bitwise AND (&) any
 *    square with 0x88, if the result is non-zero then the square is off the
 *    board. For example, assuming a knight square A8 (0 in 0x88 notation),
 *    there are 8 possible directions in which the knight can move. These
 *    directions are relative to the 8x16 board and are stored in the
 *    PIECE_OFFSETS map. One possible move is A8 - 18 (up one square, and two
 *    squares to the left - which is off the board). 0 - 18 = -18 & 0x88 = 0x88
 *    (because of two-complement representation of -18). The non-zero result
 *    means the square is off the board and the move is illegal. Take the
 *    opposite move (from A8 to C7), 0 + 18 = 18 & 0x88 = 0. A result of zero
 *    means the square is on the board.
 *
 * 2. The relative distance (or difference) between two squares on a 8x16 board
 *    is unique and can be used to inexpensively determine if a piece on a
 *    square can attack any other arbitrary square. For example, let's see if a
 *    pawn on E7 can attack E2. The difference between E7 (20) - E2 (100) is
 *    -80. We add 119 to make the ATTACKS array index non-negative (because the
 *    worst case difference is A8 - H1 = -119). The ATTACKS array contains a
 *    bitmask of pieces that can attack from that distance and direction.
 *    ATTACKS[-80 + 119=39] gives us 24 or 0b11000 in binary. Look at the
 *    PIECE_MASKS map to determine the mask for a given piece type. In our pawn
 *    example, we would check to see if 24 & 0x1 is non-zero, which it is
 *    not. So, naturally, a pawn on E7 can't attack a piece on E2. However, a
 *    rook can since 24 & 0x8 is non-zero. The only thing left to check is that
 *    there are no blocking pieces between E7 and E2. That's where the RAYS
 *    array comes in. It provides an offset (in this case 16) to add to E7 (20)
 *    to check for blocking pieces. E7 (20) + 16 = E6 (36) + 16 = E5 (52) etc.
 */
// prettier-ignore
// eslint-disable-next-line
const Ox88 = {
    a8: 0, b8: 1, c8: 2, d8: 3, e8: 4, f8: 5, g8: 6, h8: 7,
    a7: 16, b7: 17, c7: 18, d7: 19, e7: 20, f7: 21, g7: 22, h7: 23,
    a6: 32, b6: 33, c6: 34, d6: 35, e6: 36, f6: 37, g6: 38, h6: 39,
    a5: 48, b5: 49, c5: 50, d5: 51, e5: 52, f5: 53, g5: 54, h5: 55,
    a4: 64, b4: 65, c4: 66, d4: 67, e4: 68, f4: 69, g4: 70, h4: 71,
    a3: 80, b3: 81, c3: 82, d3: 83, e3: 84, f3: 85, g3: 86, h3: 87,
    a2: 96, b2: 97, c2: 98, d2: 99, e2: 100, f2: 101, g2: 102, h2: 103,
    a1: 112, b1: 113, c1: 114, d1: 115, e1: 116, f1: 117, g1: 118, h1: 119
};
const PAWN_OFFSETS = {
    b: [16, 32, 17, 15],
    w: [-16, -32, -17, -15],
};
const PIECE_OFFSETS = {
    n: [-18, -33, -31, -14, 18, 33, 31, 14],
    b: [-17, -15, 17, 15],
    r: [-16, 1, 16, -1],
    q: [-17, -16, -15, 1, 17, 16, 15, -1],
    k: [-17, -16, -15, 1, 17, 16, 15, -1],
};
// prettier-ignore
const ATTACKS = [
    20, 0, 0, 0, 0, 0, 0, 24, 0, 0, 0, 0, 0, 0, 20, 0,
    0, 20, 0, 0, 0, 0, 0, 24, 0, 0, 0, 0, 0, 20, 0, 0,
    0, 0, 20, 0, 0, 0, 0, 24, 0, 0, 0, 0, 20, 0, 0, 0,
    0, 0, 0, 20, 0, 0, 0, 24, 0, 0, 0, 20, 0, 0, 0, 0,
    0, 0, 0, 0, 20, 0, 0, 24, 0, 0, 20, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 20, 2, 24, 2, 20, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 2, 53, 56, 53, 2, 0, 0, 0, 0, 0, 0,
    24, 24, 24, 24, 24, 24, 56, 0, 56, 24, 24, 24, 24, 24, 24, 0,
    0, 0, 0, 0, 0, 2, 53, 56, 53, 2, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 20, 2, 24, 2, 20, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 20, 0, 0, 24, 0, 0, 20, 0, 0, 0, 0, 0,
    0, 0, 0, 20, 0, 0, 0, 24, 0, 0, 0, 20, 0, 0, 0, 0,
    0, 0, 20, 0, 0, 0, 0, 24, 0, 0, 0, 0, 20, 0, 0, 0,
    0, 20, 0, 0, 0, 0, 0, 24, 0, 0, 0, 0, 0, 20, 0, 0,
    20, 0, 0, 0, 0, 0, 0, 24, 0, 0, 0, 0, 0, 0, 20
];
// prettier-ignore
const RAYS = [
    17, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0, 0, 0, 0, 15, 0,
    0, 17, 0, 0, 0, 0, 0, 16, 0, 0, 0, 0, 0, 15, 0, 0,
    0, 0, 17, 0, 0, 0, 0, 16, 0, 0, 0, 0, 15, 0, 0, 0,
    0, 0, 0, 17, 0, 0, 0, 16, 0, 0, 0, 15, 0, 0, 0, 0,
    0, 0, 0, 0, 17, 0, 0, 16, 0, 0, 15, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 17, 0, 16, 0, 15, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 17, 16, 15, 0, 0, 0, 0, 0, 0, 0,
    1, 1, 1, 1, 1, 1, 1, 0, -1, -1, -1, -1, -1, -1, -1, 0,
    0, 0, 0, 0, 0, 0, -15, -16, -17, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, -15, 0, -16, 0, -17, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, -15, 0, 0, -16, 0, 0, -17, 0, 0, 0, 0, 0,
    0, 0, 0, -15, 0, 0, 0, -16, 0, 0, 0, -17, 0, 0, 0, 0,
    0, 0, -15, 0, 0, 0, 0, -16, 0, 0, 0, 0, -17, 0, 0, 0,
    0, -15, 0, 0, 0, 0, 0, -16, 0, 0, 0, 0, 0, -17, 0, 0,
    -15, 0, 0, 0, 0, 0, 0, -16, 0, 0, 0, 0, 0, 0, -17
];
const PIECE_MASKS = { p: 0x1, n: 0x2, b: 0x4, r: 0x8, q: 0x10, k: 0x20 };
const SYMBOLS = 'pnbrqkPNBRQK';
const PROMOTIONS = [exports.KNIGHT, exports.BISHOP, exports.ROOK, exports.QUEEN];
const RANK_1 = 7;
const RANK_2 = 6;
/*
 * const RANK_3 = 5
 * const RANK_4 = 4
 * const RANK_5 = 3
 * const RANK_6 = 2
 */
const RANK_7 = 1;
const RANK_8 = 0;
const SIDES = {
    [exports.KING]: BITS.KSIDE_CASTLE,
    [exports.QUEEN]: BITS.QSIDE_CASTLE,
};
const CASTLE_SIDES = [
    { side: exports.KING, flag: BITS.KSIDE_CASTLE, kingSide: true },
    { side: exports.QUEEN, flag: BITS.QSIDE_CASTLE, kingSide: false },
];
/*
 * Where castling always ends up, in every variant: king to the g/c file, rook
 * to the f/d file of the king's own rank.
 */
function castleKingSquare(kingFrom, kingSide) {
    return (rank(kingFrom) << 4) | (kingSide ? 6 : 2);
}
function castleRookSquare(kingFrom, kingSide) {
    return (rank(kingFrom) << 4) | (kingSide ? 5 : 3);
}
function defaultCastlingRooks() {
    return {
        w: { k: Ox88.h1, q: Ox88.a1 },
        b: { k: Ox88.h8, q: Ox88.a8 },
    };
}
function defaultCastlingKings() {
    return { w: Ox88.e1, b: Ox88.e8 };
}
const SECOND_RANK = { b: RANK_7, w: RANK_2 };
const TERMINATION_MARKERS = ['1-0', '0-1', '1/2-1/2', '*'];
const SAN_NULLMOVE = '--';
// Extracts the zero-based rank of an 0x88 square.
function rank(square) {
    return square >> 4;
}
// Extracts the zero-based file of an 0x88 square.
function file(square) {
    return square & 0xf;
}
function isDigit(c) {
    return '0123456789'.indexOf(c) !== -1;
}
// Converts a 0x88 square to algebraic notation.
function algebraic(square) {
    const f = file(square);
    const r = rank(square);
    return ('abcdefgh'.substring(f, f + 1) +
        '87654321'.substring(r, r + 1));
}
function swapColor(color) {
    return color === exports.WHITE ? exports.BLACK : exports.WHITE;
}
function validateFen(fen, { variant = 'standard' } = {}) {
    // 1st criterion: 6 space-seperated fields?
    const tokens = fen.split(/\s+/);
    if (tokens.length !== 6) {
        return {
            ok: false,
            error: 'Invalid FEN: must contain six space-delimited fields',
        };
    }
    // 2nd criterion: move number field is a integer value > 0?
    const moveNumber = parseInt(tokens[5], 10);
    if (isNaN(moveNumber) || moveNumber <= 0) {
        return {
            ok: false,
            error: 'Invalid FEN: move number must be a positive integer',
        };
    }
    // 3rd criterion: half move counter is an integer >= 0?
    const halfMoves = parseInt(tokens[4], 10);
    if (isNaN(halfMoves) || halfMoves < 0) {
        return {
            ok: false,
            error: 'Invalid FEN: half move counter number must be a non-negative integer',
        };
    }
    // 4th criterion: 4th field is a valid e.p.-string?
    if (!/^(-|[abcdefgh][36])$/.test(tokens[3])) {
        return { ok: false, error: 'Invalid FEN: en-passant square is invalid' };
    }
    /*
     * 5th criterion: 3th field is a valid castle-string? Chess960 also accepts
     * Shredder-FEN fields, which name the castling rook's file instead of its
     * side (e.g. "HAha" for the standard position).
     */
    const castlingPattern = variant === 'chess960' ? /[^kKqQa-hA-H-]/ : /[^kKqQ-]/;
    if (castlingPattern.test(tokens[2])) {
        return { ok: false, error: 'Invalid FEN: castling availability is invalid' };
    }
    // 6th criterion: 2nd field is "w" (white) or "b" (black)?
    if (!/^(w|b)$/.test(tokens[1])) {
        return { ok: false, error: 'Invalid FEN: side-to-move is invalid' };
    }
    // 7th criterion: 1st field contains 8 rows?
    const rows = tokens[0].split('/');
    if (rows.length !== 8) {
        return {
            ok: false,
            error: "Invalid FEN: piece data does not contain 8 '/'-delimited rows",
        };
    }
    // 8th criterion: every row is valid?
    for (let i = 0; i < rows.length; i++) {
        // check for right sum of fields AND not two numbers in succession
        let sumFields = 0;
        let previousWasNumber = false;
        for (let k = 0; k < rows[i].length; k++) {
            if (isDigit(rows[i][k])) {
                if (previousWasNumber) {
                    return {
                        ok: false,
                        error: 'Invalid FEN: piece data is invalid (consecutive number)',
                    };
                }
                sumFields += parseInt(rows[i][k], 10);
                previousWasNumber = true;
            }
            else {
                if (!/^[prnbqkPRNBQK]$/.test(rows[i][k])) {
                    return {
                        ok: false,
                        error: 'Invalid FEN: piece data is invalid (invalid piece)',
                    };
                }
                sumFields += 1;
                previousWasNumber = false;
            }
        }
        if (sumFields !== 8) {
            return {
                ok: false,
                error: 'Invalid FEN: piece data is invalid (too many squares in rank)',
            };
        }
    }
    // 9th criterion: is en-passant square legal?
    if ((tokens[3][1] == '3' && tokens[1] == 'w') ||
        (tokens[3][1] == '6' && tokens[1] == 'b')) {
        return { ok: false, error: 'Invalid FEN: illegal en-passant square' };
    }
    /*
     * 10th criterion: does chess position contain exact two kings? Fog positions
     * are allowed to be missing a king: a fogged board hides the enemy king
     * behind the fog, and a captured king is how a fog game ends.
     */
    const kings = [
        { color: 'white', regex: /K/g },
        { color: 'black', regex: /k/g },
    ];
    for (const { color, regex } of kings) {
        if (variant !== 'fog' && !regex.test(tokens[0])) {
            return { ok: false, error: `Invalid FEN: missing ${color} king` };
        }
        if ((tokens[0].match(regex) || []).length > 1) {
            return { ok: false, error: `Invalid FEN: too many ${color} kings` };
        }
    }
    /*
     * 11th criterion: are any pawns on the first or eighth rows? A finished fog
     * game may well have one: a pawn that captures the king on the back rank ends
     * the game before it can promote, so that position is legal there.
     */
    if (variant !== 'fog' &&
        Array.from(rows[0] + rows[7]).some((char) => char.toUpperCase() === 'P')) {
        return {
            ok: false,
            error: 'Invalid FEN: some pawns are on the edge rows',
        };
    }
    return { ok: true };
}
exports.validateFen = validateFen;
// this function is used to uniquely identify ambiguous moves
function getDisambiguator(move, moves) {
    const from = move.from;
    const to = move.to;
    const piece = move.piece;
    let ambiguities = 0;
    let sameRank = 0;
    let sameFile = 0;
    for (let i = 0, len = moves.length; i < len; i++) {
        const ambigFrom = moves[i].from;
        const ambigTo = moves[i].to;
        const ambigPiece = moves[i].piece;
        /*
         * if a move of the same piece type ends on the same to square, we'll need
         * to add a disambiguator to the algebraic notation
         */
        if (piece === ambigPiece && from !== ambigFrom && to === ambigTo) {
            ambiguities++;
            if (rank(from) === rank(ambigFrom)) {
                sameRank++;
            }
            if (file(from) === file(ambigFrom)) {
                sameFile++;
            }
        }
    }
    if (ambiguities > 0) {
        if (sameRank > 0 && sameFile > 0) {
            /*
             * if there exists a similar moving piece on the same rank and file as
             * the move in question, use the square as the disambiguator
             */
            return algebraic(from);
        }
        else if (sameFile > 0) {
            /*
             * if the moving piece rests on the same file, use the rank symbol as the
             * disambiguator
             */
            return algebraic(from).charAt(1);
        }
        else {
            // else use the file symbol
            return algebraic(from).charAt(0);
        }
    }
    return '';
}
function addMove(moves, color, from, to, piece, captured = undefined, flags = BITS.NORMAL, allowPromotion = true) {
    const r = rank(to);
    if (allowPromotion && piece === exports.PAWN && (r === RANK_1 || r === RANK_8)) {
        for (let i = 0; i < PROMOTIONS.length; i++) {
            const promotion = PROMOTIONS[i];
            moves.push({
                color,
                from,
                to,
                piece,
                captured,
                promotion,
                flags: flags | BITS.PROMOTION,
            });
        }
    }
    else {
        moves.push({
            color,
            from,
            to,
            piece,
            captured,
            flags,
        });
    }
}
function inferPieceType(san) {
    let pieceType = san.charAt(0);
    if (pieceType >= 'a' && pieceType <= 'h') {
        const matches = san.match(/[a-h]\d.*[a-h]\d/);
        if (matches) {
            return undefined;
        }
        return exports.PAWN;
    }
    pieceType = pieceType.toLowerCase();
    if (pieceType === 'o') {
        return exports.KING;
    }
    return pieceType;
}
// parses all of the decorators out of a SAN string
function strippedSan(move) {
    return move.replace(/=/, '').replace(/[+#]?[?!]*$/, '');
}
class Chess {
    constructor(fen, { skipValidation = false, variant = 'standard', } = {}) {
        this._board = new Array(128);
        this._turn = exports.WHITE;
        this._header = {};
        this._kings = { w: EMPTY, b: EMPTY };
        this._epSquare = -1;
        this._halfMoves = 0;
        this._moveNumber = 0;
        this._history = [];
        this._comments = {};
        this._castling = { w: 0, b: 0 };
        this._variant = 'standard';
        this._castlingRooks = defaultCastlingRooks();
        this._castlingKings = defaultCastlingKings();
        this._hash = 0n;
        // tracks number of times a position has been seen for repetition checking
        this._positionCount = new Map();
        this._variant = variant;
        this.load(fen ?? exports.DEFAULT_POSITION, { skipValidation });
    }
    /** The variant this instance plays. */
    variant() {
        return this._variant;
    }
    /** True when castling follows Chess960 rules (rooks on arbitrary files). */
    isChess960() {
        return this._variant === 'chess960';
    }
    /** True when the position is fogged: no check, win by capturing the king. */
    isFogOfWar() {
        return this._variant === 'fog';
    }
    clear({ preserveHeaders = false } = {}) {
        this._board = new Array(128);
        this._kings = { w: EMPTY, b: EMPTY };
        this._turn = exports.WHITE;
        this._castling = { w: 0, b: 0 };
        this._castlingRooks = { w: { k: EMPTY, q: EMPTY }, b: { k: EMPTY, q: EMPTY } };
        this._castlingKings = { w: EMPTY, b: EMPTY };
        this._epSquare = EMPTY;
        this._halfMoves = 0;
        this._moveNumber = 1;
        this._history = [];
        this._comments = {};
        this._header = preserveHeaders ? this._header : { ...HEADER_TEMPLATE };
        this._hash = this._computeHash();
        this._positionCount = new Map();
        /*
         * Delete the SetUp and FEN headers (if preserved), the board is empty and
         * these headers don't make sense in this state. They'll get added later
         * via .load() or .put()
         */
        this._header['SetUp'] = null;
        this._header['FEN'] = null;
    }
    load(fen, { skipValidation = false, preserveHeaders = false } = {}) {
        let tokens = fen.split(/\s+/);
        // append commonly omitted fen tokens
        if (tokens.length >= 2 && tokens.length < 6) {
            const adjustments = ['-', '-', '0', '1'];
            fen = tokens.concat(adjustments.slice(-(6 - tokens.length))).join(' ');
        }
        tokens = fen.split(/\s+/);
        if (!skipValidation) {
            const { ok, error } = validateFen(fen, { variant: this._variant });
            if (!ok) {
                throw new Error(error);
            }
        }
        const position = tokens[0];
        let square = 0;
        this.clear({ preserveHeaders });
        for (let i = 0; i < position.length; i++) {
            const piece = position.charAt(i);
            if (piece === '/') {
                square += 8;
            }
            else if (isDigit(piece)) {
                square += parseInt(piece, 10);
            }
            else {
                const color = piece < 'a' ? exports.WHITE : exports.BLACK;
                this._put({ type: piece.toLowerCase(), color }, algebraic(square));
                square++;
            }
        }
        this._turn = tokens[1];
        this._loadCastling(tokens[2]);
        this._epSquare = tokens[3] === '-' ? EMPTY : Ox88[tokens[3]];
        this._halfMoves = parseInt(tokens[4], 10);
        this._moveNumber = parseInt(tokens[5], 10);
        this._hash = this._computeHash();
        this._updateSetup(fen);
        this._incPositionCount();
    }
    /**
     * Reads the castling field of a FEN. Understands the classic KQkq form and
     * the Shredder form that names the castling rook's file (e.g. "HAha"), and
     * resolves either down to the rook's actual square so that Chess960 back
     * ranks castle correctly.
     */
    _loadCastling(field) {
        this._castlingKings = { w: this._kings.w, b: this._kings.b };
        if (!field || field === '-')
            return;
        for (const token of field) {
            const color = token === token.toUpperCase() ? exports.WHITE : exports.BLACK;
            const kingSquare = this._kings[color];
            if (kingSquare === EMPTY)
                continue;
            const backRank = rank(kingSquare);
            const kingFile = file(kingSquare);
            const symbol = token.toLowerCase();
            const isRook = (square) => this._board[square]?.type === exports.ROOK && this._board[square]?.color === color;
            let rookSquare = EMPTY;
            if (symbol === 'k' || symbol === 'q') {
                /*
                 * KQkq names a side, not a file, so take the outermost rook on that
                 * side of the king (the X-FEN reading, which is also the only reading
                 * that can be right for a standard board).
                 */
                const step = symbol === 'k' ? -1 : 1;
                for (let f = symbol === 'k' ? 7 : 0; f !== kingFile; f += step) {
                    const square = (backRank << 4) | f;
                    if (isRook(square)) {
                        rookSquare = square;
                        break;
                    }
                }
            }
            else {
                const f = symbol.charCodeAt(0) - 'a'.charCodeAt(0);
                if (f < 0 || f > 7)
                    continue;
                const square = (backRank << 4) | f;
                if (isRook(square))
                    rookSquare = square;
            }
            // A right without a rook to exercise it is not a right.
            if (rookSquare === EMPTY)
                continue;
            const side = file(rookSquare) > kingFile ? exports.KING : exports.QUEEN;
            this._castlingRooks[color][side] = rookSquare;
            this._castling[color] |= SIDES[side];
        }
    }
    fen({ forceEnpassantSquare = false, } = {}) {
        let empty = 0;
        let fen = '';
        for (let i = Ox88.a8; i <= Ox88.h1; i++) {
            if (this._board[i]) {
                if (empty > 0) {
                    fen += empty;
                    empty = 0;
                }
                const { color, type: piece } = this._board[i];
                fen += color === exports.WHITE ? piece.toUpperCase() : piece.toLowerCase();
            }
            else {
                empty++;
            }
            if ((i + 1) & 0x88) {
                if (empty > 0) {
                    fen += empty;
                }
                if (i !== Ox88.h1) {
                    fen += '/';
                }
                empty = 0;
                i += 8;
            }
        }
        const castling = this._castlingField();
        let epSquare = '-';
        /*
         * only print the ep square if en passant is a valid move (pawn is present
         * and ep capture is not pinned)
         */
        if (this._epSquare !== EMPTY) {
            if (forceEnpassantSquare) {
                epSquare = algebraic(this._epSquare);
            }
            else {
                const bigPawnSquare = this._epSquare + (this._turn === exports.WHITE ? 16 : -16);
                const squares = [bigPawnSquare + 1, bigPawnSquare - 1];
                for (const square of squares) {
                    // is the square off the board?
                    if (square & 0x88) {
                        continue;
                    }
                    const color = this._turn;
                    // is there a pawn that can capture the epSquare?
                    if (this._board[square]?.color === color &&
                        this._board[square]?.type === exports.PAWN) {
                        /*
                         * Fog has no pins — a king may be left en prise — so a pawn that
                         * bears on the square is all it takes for the capture to be real.
                         */
                        if (this.isFogOfWar()) {
                            epSquare = algebraic(this._epSquare);
                            break;
                        }
                        // if the pawn makes an ep capture, does it leave its king in check?
                        this._makeMove({
                            color,
                            from: square,
                            to: this._epSquare,
                            piece: exports.PAWN,
                            captured: exports.PAWN,
                            flags: BITS.EP_CAPTURE,
                        });
                        const isLegal = !this._isKingAttacked(color);
                        this._undoMove();
                        // if ep is legal, break and set the ep square in the FEN output
                        if (isLegal) {
                            epSquare = algebraic(this._epSquare);
                            break;
                        }
                    }
                }
            }
        }
        return [
            fen,
            this._turn,
            castling,
            epSquare,
            this._halfMoves,
            this._moveNumber,
        ].join(' ');
    }
    /**
     * The castling field of a FEN. Restricting `colors` yields the field for a
     * fogged position, where the opponent's rights are not the viewer's business.
     */
    _castlingField(colors = [exports.WHITE, exports.BLACK]) {
        let castling = '';
        for (const color of colors) {
            for (const { side, flag } of CASTLE_SIDES) {
                const square = this._castlingRooks[color][side];
                if (!(this._castling[color] & flag) || square === EMPTY)
                    continue;
                /*
                 * Shredder-FEN names the rook's file, which is the only unambiguous
                 * way to describe a Chess960 back rank. Everything else keeps KQkq so
                 * that standard games produce byte-identical FENs to upstream.
                 */
                const letter = this.isChess960() ? 'abcdefgh'[file(square)] : side;
                castling += color === exports.WHITE ? letter.toUpperCase() : letter;
            }
        }
        return castling || '-';
    }
    _pieceKey(i) {
        if (!this._board[i]) {
            return 0n;
        }
        const { color, type } = this._board[i];
        const colorIndex = {
            w: 0,
            b: 1,
        }[color];
        const typeIndex = {
            p: 0,
            n: 1,
            b: 2,
            r: 3,
            q: 4,
            k: 5,
        }[type];
        return PIECE_KEYS[colorIndex][typeIndex][i];
    }
    _epKey() {
        return this._epSquare === EMPTY ? 0n : EP_KEYS[this._epSquare & 7];
    }
    _castlingKey() {
        const index = (this._castling.w >> 5) | (this._castling.b >> 3);
        return CASTLING_KEYS[index];
    }
    _computeHash() {
        let hash = 0n;
        for (let i = Ox88.a8; i <= Ox88.h1; i++) {
            // did we run off the end of the board
            if (i & 0x88) {
                i += 7;
                continue;
            }
            if (this._board[i]) {
                hash ^= this._pieceKey(i);
            }
        }
        hash ^= this._epKey();
        hash ^= this._castlingKey();
        if (this._turn === 'b') {
            hash ^= SIDE_KEY;
        }
        return hash;
    }
    /*
     * Called when the initial board setup is changed with put() or remove().
     * modifies the SetUp and FEN properties of the header object. If the FEN
     * is equal to the default position, the SetUp and FEN are deleted the setup
     * is only updated if history.length is zero, ie moves haven't been made.
     */
    _updateSetup(fen) {
        if (this._history.length > 0)
            return;
        if (fen !== exports.DEFAULT_POSITION) {
            this._header['SetUp'] = '1';
            this._header['FEN'] = fen;
        }
        else {
            this._header['SetUp'] = null;
            this._header['FEN'] = null;
        }
    }
    reset() {
        this.load(exports.DEFAULT_POSITION);
    }
    get(square) {
        return this._board[Ox88[square]];
    }
    findPiece(piece) {
        const squares = [];
        for (let i = Ox88.a8; i <= Ox88.h1; i++) {
            // did we run off the end of the board
            if (i & 0x88) {
                i += 7;
                continue;
            }
            // if empty square or wrong color
            if (!this._board[i] || this._board[i]?.color !== piece.color) {
                continue;
            }
            // check if square contains the requested piece
            if (this._board[i].color === piece.color &&
                this._board[i].type === piece.type) {
                squares.push(algebraic(i));
            }
        }
        return squares;
    }
    put({ type, color }, square) {
        if (this._put({ type, color }, square)) {
            this._updateCastlingRights();
            this._updateEnPassantSquare();
            this._updateSetup(this.fen());
            return true;
        }
        return false;
    }
    _set(sq, piece) {
        this._hash ^= this._pieceKey(sq);
        this._board[sq] = piece;
        this._hash ^= this._pieceKey(sq);
    }
    _put({ type, color }, square) {
        // check for piece
        if (SYMBOLS.indexOf(type.toLowerCase()) === -1) {
            return false;
        }
        // check for valid square
        if (!(square in Ox88)) {
            return false;
        }
        const sq = Ox88[square];
        // don't let the user place more than one king
        if (type == exports.KING &&
            !(this._kings[color] == EMPTY || this._kings[color] == sq)) {
            return false;
        }
        const currentPieceOnSquare = this._board[sq];
        // if one of the kings will be replaced by the piece from args, set the `_kings` respective entry to `EMPTY`
        if (currentPieceOnSquare && currentPieceOnSquare.type === exports.KING) {
            this._kings[currentPieceOnSquare.color] = EMPTY;
        }
        this._set(sq, { type: type, color: color });
        if (type === exports.KING) {
            this._kings[color] = sq;
        }
        return true;
    }
    _clear(sq) {
        this._hash ^= this._pieceKey(sq);
        delete this._board[sq];
    }
    remove(square) {
        const piece = this.get(square);
        this._clear(Ox88[square]);
        if (piece && piece.type === exports.KING) {
            this._kings[piece.color] = EMPTY;
        }
        this._updateCastlingRights();
        this._updateEnPassantSquare();
        this._updateSetup(this.fen());
        return piece;
    }
    _updateCastlingRights() {
        this._hash ^= this._castlingKey();
        /*
         * Same rule as upstream — a right survives only while its king and its rook
         * are both still home — except that "home" is wherever this position
         * started them rather than e1/a1/h1.
         */
        for (const color of [exports.WHITE, exports.BLACK]) {
            const kingSquare = this._castlingKings[color];
            const kingInPlace = kingSquare !== EMPTY &&
                this._board[kingSquare]?.type === exports.KING &&
                this._board[kingSquare]?.color === color;
            for (const { side, flag } of CASTLE_SIDES) {
                const rookSquare = this._castlingRooks[color][side];
                if (!kingInPlace ||
                    rookSquare === EMPTY ||
                    this._board[rookSquare]?.type !== exports.ROOK ||
                    this._board[rookSquare]?.color !== color) {
                    this._castling[color] &= ~flag;
                }
            }
        }
        this._hash ^= this._castlingKey();
    }
    _updateEnPassantSquare() {
        if (this._epSquare === EMPTY) {
            return;
        }
        const startSquare = this._epSquare + (this._turn === exports.WHITE ? -16 : 16);
        const currentSquare = this._epSquare + (this._turn === exports.WHITE ? 16 : -16);
        const attackers = [currentSquare + 1, currentSquare - 1];
        if (this._board[startSquare] !== null ||
            this._board[this._epSquare] !== null ||
            this._board[currentSquare]?.color !== swapColor(this._turn) ||
            this._board[currentSquare]?.type !== exports.PAWN) {
            this._hash ^= this._epKey();
            this._epSquare = EMPTY;
            return;
        }
        const canCapture = (square) => !(square & 0x88) &&
            this._board[square]?.color === this._turn &&
            this._board[square]?.type === exports.PAWN;
        if (!attackers.some(canCapture)) {
            this._hash ^= this._epKey();
            this._epSquare = EMPTY;
        }
    }
    _attacked(color, square, verbose) {
        const attackers = [];
        for (let i = Ox88.a8; i <= Ox88.h1; i++) {
            // did we run off the end of the board
            if (i & 0x88) {
                i += 7;
                continue;
            }
            // if empty square or wrong color
            if (this._board[i] === undefined || this._board[i].color !== color) {
                continue;
            }
            const piece = this._board[i];
            const difference = i - square;
            // skip - to/from square are the same
            if (difference === 0) {
                continue;
            }
            const index = difference + 119;
            if (ATTACKS[index] & PIECE_MASKS[piece.type]) {
                if (piece.type === exports.PAWN) {
                    if ((difference > 0 && piece.color === exports.WHITE) ||
                        (difference <= 0 && piece.color === exports.BLACK)) {
                        if (!verbose) {
                            return true;
                        }
                        else {
                            attackers.push(algebraic(i));
                        }
                    }
                    continue;
                }
                // if the piece is a knight or a king
                if (piece.type === 'n' || piece.type === 'k') {
                    if (!verbose) {
                        return true;
                    }
                    else {
                        attackers.push(algebraic(i));
                        continue;
                    }
                }
                const offset = RAYS[index];
                let j = i + offset;
                let blocked = false;
                while (j !== square) {
                    if (this._board[j] != null) {
                        blocked = true;
                        break;
                    }
                    j += offset;
                }
                if (!blocked) {
                    if (!verbose) {
                        return true;
                    }
                    else {
                        attackers.push(algebraic(i));
                        continue;
                    }
                }
            }
        }
        if (verbose) {
            return attackers;
        }
        else {
            return false;
        }
    }
    attackers(square, attackedBy) {
        if (!attackedBy) {
            return this._attacked(this._turn, Ox88[square], true);
        }
        else {
            return this._attacked(attackedBy, Ox88[square], true);
        }
    }
    _isKingAttacked(color) {
        const square = this._kings[color];
        return square === -1 ? false : this._attacked(swapColor(color), square);
    }
    hash() {
        return this._hash.toString(16);
    }
    isAttacked(square, attackedBy) {
        return this._attacked(attackedBy, Ox88[square]);
    }
    isCheck() {
        // Fog has no check: an attack you cannot see cannot restrain you.
        if (this.isFogOfWar())
            return false;
        return this._isKingAttacked(this._turn);
    }
    inCheck() {
        return this.isCheck();
    }
    isCheckmate() {
        // Fog games are decided by capturing the king, never by mate.
        if (this.isFogOfWar())
            return false;
        return this.isCheck() && this._moves().length === 0;
    }
    /**
     * The colour whose king has been captured, or null while both kings stand.
     * Only reachable in the fog variant, where moving into an attack is legal.
     */
    capturedKing() {
        if (this._kings[exports.WHITE] === EMPTY)
            return exports.WHITE;
        if (this._kings[exports.BLACK] === EMPTY)
            return exports.BLACK;
        return null;
    }
    isStalemate() {
        if (this.capturedKing())
            return false;
        return !this.isCheck() && this._moves().length === 0;
    }
    isInsufficientMaterial() {
        /*
         * k.b. vs k.b. (of opposite colors) with mate in 1:
         * 8/8/8/8/1b6/8/B1k5/K7 b - - 0 1
         *
         * k.b. vs k.n. with mate in 1:
         * 8/8/8/8/1n6/8/B7/K1k5 b - - 2 1
         */
        const pieces = {
            b: 0,
            n: 0,
            r: 0,
            q: 0,
            k: 0,
            p: 0,
        };
        const bishops = [];
        let numPieces = 0;
        let squareColor = 0;
        for (let i = Ox88.a8; i <= Ox88.h1; i++) {
            squareColor = (squareColor + 1) % 2;
            if (i & 0x88) {
                i += 7;
                continue;
            }
            const piece = this._board[i];
            if (piece) {
                pieces[piece.type] = piece.type in pieces ? pieces[piece.type] + 1 : 1;
                if (piece.type === exports.BISHOP) {
                    bishops.push(squareColor);
                }
                numPieces++;
            }
        }
        // k vs. k
        if (numPieces === 2) {
            return true;
        }
        else if (
        // k vs. kn .... or .... k vs. kb
        numPieces === 3 &&
            (pieces[exports.BISHOP] === 1 || pieces[exports.KNIGHT] === 1)) {
            return true;
        }
        else if (numPieces === pieces[exports.BISHOP] + 2) {
            // kb vs. kb where any number of bishops are all on the same color
            let sum = 0;
            const len = bishops.length;
            for (let i = 0; i < len; i++) {
                sum += bishops[i];
            }
            if (sum === 0 || sum === len) {
                return true;
            }
        }
        return false;
    }
    isThreefoldRepetition() {
        return this._getPositionCount(this._hash) >= 3;
    }
    isDrawByFiftyMoves() {
        return this._halfMoves >= 100; // 50 moves per side = 100 half moves
    }
    isDraw() {
        /*
         * Fog keeps only the draw a player can actually observe. Repetition and the
         * fifty-move rule are claims about a position neither player can see, and
         * "insufficient material" would be a running commentary on the material the
         * fog is meant to hide, so all three are off.
         */
        if (this.isFogOfWar())
            return this.isStalemate();
        return (this.isDrawByFiftyMoves() ||
            this.isStalemate() ||
            this.isInsufficientMaterial() ||
            this.isThreefoldRepetition());
    }
    isGameOver() {
        return this.capturedKing() !== null || this.isCheckmate() || this.isDraw();
    }
    moves({ verbose = false, square = undefined, piece = undefined, } = {}) {
        const moves = this._moves({ square, piece });
        if (verbose) {
            return moves.map((move) => new Move(this, move));
        }
        else {
            return moves.map((move) => this._moveToSan(move, moves));
        }
    }
    _moves({ legal = true, piece = undefined, square = undefined, } = {}) {
        const forSquare = square ? square.toLowerCase() : undefined;
        const forPiece = piece?.toLowerCase();
        const moves = [];
        const us = this._turn;
        const them = swapColor(us);
        let firstSquare = Ox88.a8;
        let lastSquare = Ox88.h1;
        let singleSquare = false;
        // are we generating moves for a single square?
        if (forSquare) {
            // illegal square, return empty moves
            if (!(forSquare in Ox88)) {
                return [];
            }
            else {
                firstSquare = lastSquare = Ox88[forSquare];
                singleSquare = true;
            }
        }
        for (let from = firstSquare; from <= lastSquare; from++) {
            // did we run off the end of the board
            if (from & 0x88) {
                from += 7;
                continue;
            }
            // empty square or opponent, skip
            if (!this._board[from] || this._board[from].color === them) {
                continue;
            }
            const { type } = this._board[from];
            let to;
            if (type === exports.PAWN) {
                if (forPiece && forPiece !== type)
                    continue;
                // single square, non-capturing
                to = from + PAWN_OFFSETS[us][0];
                if (!this._board[to]) {
                    addMove(moves, us, from, to, exports.PAWN);
                    // double square
                    to = from + PAWN_OFFSETS[us][1];
                    if (SECOND_RANK[us] === rank(from) && !this._board[to]) {
                        addMove(moves, us, from, to, exports.PAWN, undefined, BITS.BIG_PAWN);
                    }
                }
                // pawn captures
                for (let j = 2; j < 4; j++) {
                    to = from + PAWN_OFFSETS[us][j];
                    if (to & 0x88)
                        continue;
                    if (this._board[to]?.color === them) {
                        /*
                         * Taking the king ends a fog game where it stands, so a pawn that
                         * captures one on the back rank never gets to promote — and must
                         * not be offered the choice.
                         */
                        const decisive = this.isFogOfWar() && this._board[to].type === exports.KING;
                        addMove(moves, us, from, to, exports.PAWN, this._board[to].type, BITS.CAPTURE, !decisive);
                    }
                    else if (to === this._epSquare) {
                        addMove(moves, us, from, to, exports.PAWN, exports.PAWN, BITS.EP_CAPTURE);
                    }
                }
            }
            else {
                if (forPiece && forPiece !== type)
                    continue;
                for (let j = 0, len = PIECE_OFFSETS[type].length; j < len; j++) {
                    const offset = PIECE_OFFSETS[type][j];
                    to = from;
                    while (true) {
                        to += offset;
                        if (to & 0x88)
                            break;
                        if (!this._board[to]) {
                            addMove(moves, us, from, to, type);
                        }
                        else {
                            // own color, stop loop
                            if (this._board[to].color === us)
                                break;
                            addMove(moves, us, from, to, type, this._board[to].type, BITS.CAPTURE);
                            break;
                        }
                        /* break, if knight or king */
                        if (type === exports.KNIGHT || type === exports.KING)
                            break;
                    }
                }
            }
        }
        /*
         * check for castling if we're:
         *   a) generating all moves, or
         *   b) doing single square move generation on the king's square
         */
        if (forPiece === undefined || forPiece === exports.KING) {
            if (!singleSquare || lastSquare === this._kings[us]) {
                for (const { side, flag, kingSide } of CASTLE_SIDES) {
                    const castling = this._castlingMove(us, side, flag, kingSide);
                    if (castling !== null) {
                        addMove(moves, us, this._kings[us], castling, exports.KING, undefined, flag);
                    }
                }
            }
        }
        /*
         * return all pseudo-legal moves (this includes moves that allow the king
         * to be captured)
         *
         * Fog stops here always: leaving your king en prise is legal (and often
         * unavoidable, since you cannot see the attacker), so there is nothing to
         * filter out.
         */
        if (!legal || this.isFogOfWar() || this._kings[us] === -1) {
            return moves;
        }
        // filter out illegal moves
        const legalMoves = [];
        for (let i = 0, len = moves.length; i < len; i++) {
            this._makeMove(moves[i]);
            if (!this._isKingAttacked(us)) {
                legalMoves.push(moves[i]);
            }
            this._undoMove();
        }
        return legalMoves;
    }
    /**
     * Castling for an arbitrary king and rook placement. Returns the `to` square
     * of the castling move (the rook's square in Chess960, the king's two-square
     * destination otherwise) or null when the castle is not available.
     *
     * The king always finishes on the g/c file and the rook on the f/d file. Both
     * paths must be clear of everything but the castling pair itself, and — fog
     * aside, where attacks are unknowable — the king may not start, cross or land
     * on an attacked square.
     */
    _castlingMove(us, side, flag, kingSide) {
        if (!(this._castling[us] & flag))
            return null;
        const kingFrom = this._kings[us];
        const rookFrom = this._castlingRooks[us][side];
        if (kingFrom === EMPTY || rookFrom === EMPTY)
            return null;
        const kingTo = castleKingSquare(kingFrom, kingSide);
        const rookTo = castleRookSquare(kingFrom, kingSide);
        // Every square either piece travels over (or lands on) must be empty,
        // ignoring the two squares the castling pair is vacating.
        for (const [start, end] of [
            [kingFrom, kingTo],
            [rookFrom, rookTo],
        ]) {
            const step = start <= end ? 1 : -1;
            for (let square = start;; square += step) {
                if (square !== kingFrom &&
                    square !== rookFrom &&
                    this._board[square]) {
                    return null;
                }
                if (square === end)
                    break;
            }
        }
        if (!this.isFogOfWar()) {
            const them = swapColor(us);
            const step = kingFrom <= kingTo ? 1 : -1;
            for (let square = kingFrom;; square += step) {
                if (this._attacked(them, square))
                    return null;
                if (square === kingTo)
                    break;
            }
        }
        return this.isChess960() ? rookFrom : kingTo;
    }
    move(move, { strict = false } = {}) {
        /*
         * The move function can be called with in the following parameters:
         *
         * .move('Nxb7')       <- argument is a case-sensitive SAN string
         *
         * .move({ from: 'h7', <- argument is a move object
         *         to :'h8',
         *         promotion: 'q' })
         *
         *
         * An optional strict argument may be supplied to tell chess.js to
         * strictly follow the SAN specification.
         */
        let moveObj = null;
        if (typeof move === 'string') {
            moveObj = this._moveFromSan(move, strict);
        }
        else if (move === null) {
            moveObj = this._moveFromSan(SAN_NULLMOVE, strict);
        }
        else if (typeof move === 'object') {
            const moves = this._moves();
            // convert the pretty move object to an ugly move object
            for (let i = 0, len = moves.length; i < len; i++) {
                if (move.from === algebraic(moves[i].from) &&
                    move.to === algebraic(moves[i].to) &&
                    (!('promotion' in moves[i]) || move.promotion === moves[i].promotion)) {
                    moveObj = moves[i];
                    break;
                }
            }
            /*
             * Castling has two natural ways to express it — move the king to its
             * destination square, or play king-takes-rook — and which one is
             * canonical depends on the variant. Accept either, since neither can
             * collide with another legal move of the same king.
             */
            if (!moveObj) {
                for (const candidate of moves) {
                    if (!(candidate.flags & (BITS.KSIDE_CASTLE | BITS.QSIDE_CASTLE))) {
                        continue;
                    }
                    const kingSide = Boolean(candidate.flags & BITS.KSIDE_CASTLE);
                    const alternatives = [
                        castleKingSquare(candidate.from, kingSide),
                        this._castlingRooks[candidate.color][kingSide ? exports.KING : exports.QUEEN],
                    ].map(algebraic);
                    if (move.from === algebraic(candidate.from) &&
                        alternatives.includes(move.to)) {
                        moveObj = candidate;
                        break;
                    }
                }
            }
        }
        // failed to find move
        if (!moveObj) {
            if (typeof move === 'string') {
                throw new Error(`Invalid move: ${move}`);
            }
            else {
                throw new Error(`Invalid move: ${JSON.stringify(move)}`);
            }
        }
        //disallow null moves when in check
        if (this.isCheck() && moveObj.flags & BITS.NULL_MOVE) {
            throw new Error('Null move not allowed when in check');
        }
        /*
         * need to make a copy of move because we can't generate SAN after the move
         * is made
         */
        const prettyMove = new Move(this, moveObj);
        this._makeMove(moveObj);
        this._incPositionCount();
        return prettyMove;
    }
    _push(move) {
        this._history.push({
            move,
            kings: { b: this._kings.b, w: this._kings.w },
            turn: this._turn,
            castling: { b: this._castling.b, w: this._castling.w },
            epSquare: this._epSquare,
            halfMoves: this._halfMoves,
            moveNumber: this._moveNumber,
            epCaptured: Boolean(move.flags & BITS.EP_CAPTURE) &&
                Boolean(this._board[move.to + (this._turn === exports.WHITE ? 16 : -16)]),
        });
    }
    _movePiece(from, to) {
        this._hash ^= this._pieceKey(from);
        this._board[to] = this._board[from];
        delete this._board[from];
        this._hash ^= this._pieceKey(to);
    }
    _makeMove(move) {
        const us = this._turn;
        const them = swapColor(us);
        this._push(move);
        if (move.flags & BITS.NULL_MOVE) {
            if (us === exports.BLACK) {
                this._moveNumber++;
            }
            this._halfMoves++;
            this._turn = them;
            this._epSquare = EMPTY;
            return;
        }
        this._hash ^= this._epKey();
        this._hash ^= this._castlingKey();
        if (move.flags & (BITS.KSIDE_CASTLE | BITS.QSIDE_CASTLE)) {
            /*
             * Castling moves two pieces at once, and on a Chess960 back rank either
             * one can already be standing on the other's destination, so lift both
             * before placing either.
             */
            const kingSide = Boolean(move.flags & BITS.KSIDE_CASTLE);
            const rookFrom = this._castlingRooks[us][kingSide ? exports.KING : exports.QUEEN];
            this._clear(move.from);
            this._clear(rookFrom);
            this._set(castleKingSquare(move.from, kingSide), {
                type: exports.KING,
                color: us,
            });
            this._set(castleRookSquare(move.from, kingSide), {
                type: exports.ROOK,
                color: us,
            });
            this._kings[us] = castleKingSquare(move.from, kingSide);
            this._castling[us] = 0;
        }
        else {
            if (move.captured) {
                this._hash ^= this._pieceKey(move.to);
                // a captured king ends a fog game
                if (this._board[move.to]?.type === exports.KING) {
                    this._kings[them] = EMPTY;
                }
            }
            this._movePiece(move.from, move.to);
            // if ep capture, remove the captured pawn
            if (move.flags & BITS.EP_CAPTURE) {
                if (this._turn === exports.BLACK) {
                    this._clear(move.to - 16);
                }
                else {
                    this._clear(move.to + 16);
                }
            }
            // if pawn promotion, replace with new piece
            if (move.promotion) {
                this._clear(move.to);
                this._set(move.to, { type: move.promotion, color: us });
            }
            // if we moved the king
            if (this._board[move.to].type === exports.KING) {
                this._kings[us] = move.to;
                // turn off castling
                this._castling[us] = 0;
            }
        }
        // turn off castling if we move a rook
        if (this._castling[us]) {
            for (const { side, flag } of CASTLE_SIDES) {
                if (move.from === this._castlingRooks[us][side] &&
                    this._castling[us] & flag) {
                    this._castling[us] ^= flag;
                    break;
                }
            }
        }
        // turn off castling if we capture a rook
        if (this._castling[them]) {
            for (const { side, flag } of CASTLE_SIDES) {
                if (move.to === this._castlingRooks[them][side] &&
                    this._castling[them] & flag) {
                    this._castling[them] ^= flag;
                    break;
                }
            }
        }
        this._hash ^= this._castlingKey();
        // if big pawn move, update the en passant square
        if (move.flags & BITS.BIG_PAWN) {
            let epSquare;
            if (us === exports.BLACK) {
                epSquare = move.to - 16;
            }
            else {
                epSquare = move.to + 16;
            }
            if ((!((move.to - 1) & 0x88) &&
                this._board[move.to - 1]?.type === exports.PAWN &&
                this._board[move.to - 1]?.color === them) ||
                (!((move.to + 1) & 0x88) &&
                    this._board[move.to + 1]?.type === exports.PAWN &&
                    this._board[move.to + 1]?.color === them)) {
                this._epSquare = epSquare;
                this._hash ^= this._epKey();
            }
            else {
                this._epSquare = EMPTY;
            }
        }
        else {
            this._epSquare = EMPTY;
        }
        // reset the 50 move counter if a pawn is moved or a piece is captured
        if (move.piece === exports.PAWN) {
            this._halfMoves = 0;
        }
        else if (move.flags & (BITS.CAPTURE | BITS.EP_CAPTURE)) {
            this._halfMoves = 0;
        }
        else {
            this._halfMoves++;
        }
        if (us === exports.BLACK) {
            this._moveNumber++;
        }
        this._turn = them;
        this._hash ^= SIDE_KEY;
    }
    undo() {
        const hash = this._hash;
        const move = this._undoMove();
        if (move) {
            const prettyMove = new Move(this, move);
            this._decPositionCount(hash);
            return prettyMove;
        }
        return null;
    }
    _undoMove() {
        const old = this._history.pop();
        if (old === undefined) {
            return null;
        }
        this._hash ^= this._epKey();
        this._hash ^= this._castlingKey();
        const move = old.move;
        this._kings = old.kings;
        this._turn = old.turn;
        this._castling = old.castling;
        this._epSquare = old.epSquare;
        this._halfMoves = old.halfMoves;
        this._moveNumber = old.moveNumber;
        this._hash ^= this._epKey();
        this._hash ^= this._castlingKey();
        this._hash ^= SIDE_KEY;
        const us = this._turn;
        const them = swapColor(us);
        if (move.flags & BITS.NULL_MOVE) {
            return move;
        }
        if (move.flags & (BITS.KSIDE_CASTLE | BITS.QSIDE_CASTLE)) {
            const kingSide = Boolean(move.flags & BITS.KSIDE_CASTLE);
            const rookFrom = this._castlingRooks[us][kingSide ? exports.KING : exports.QUEEN];
            this._clear(castleKingSquare(move.from, kingSide));
            this._clear(castleRookSquare(move.from, kingSide));
            this._set(move.from, { type: exports.KING, color: us });
            this._set(rookFrom, { type: exports.ROOK, color: us });
            return move;
        }
        this._movePiece(move.to, move.from);
        // to undo any promotions
        if (move.piece) {
            this._clear(move.from);
            this._set(move.from, { type: move.piece, color: us });
        }
        if (move.captured) {
            if (move.flags & BITS.EP_CAPTURE) {
                // en passant capture — unless the pawn was never there to take (fog)
                let index;
                if (us === exports.BLACK) {
                    index = move.to - 16;
                }
                else {
                    index = move.to + 16;
                }
                if (old.epCaptured) {
                    this._set(index, { type: exports.PAWN, color: them });
                }
            }
            else {
                // regular capture
                this._set(move.to, { type: move.captured, color: them });
            }
        }
        return move;
    }
    pgn({ newline = '\n', maxWidth = 0, } = {}) {
        /*
         * using the specification from http://www.chessclub.com/help/PGN-spec
         * example for html usage: .pgn({ max_width: 72, newline_char: "<br />" })
         */
        const result = [];
        let headerExists = false;
        /* add the PGN header information */
        for (const i in this._header) {
            /*
             * TODO: order of enumerated properties in header object is not
             * guaranteed, see ECMA-262 spec (section 12.6.4)
             *
             * By using HEADER_TEMPLATE, the order of tags should be preserved; we
             * do have to check for null placeholders, though, and omit them
             */
            const headerTag = this._header[i];
            if (headerTag)
                result.push(`[${i} "${this._header[i]}"]` + newline);
            headerExists = true;
        }
        if (headerExists && this._history.length) {
            result.push(newline);
        }
        const appendComment = (moveString) => {
            const comment = this._comments[this.fen()];
            if (typeof comment !== 'undefined') {
                const delimiter = moveString.length > 0 ? ' ' : '';
                moveString = `${moveString}${delimiter}{${comment}}`;
            }
            return moveString;
        };
        // pop all of history onto reversed_history
        const reversedHistory = [];
        while (this._history.length > 0) {
            reversedHistory.push(this._undoMove());
        }
        const moves = [];
        let moveString = '';
        // special case of a commented starting position with no moves
        if (reversedHistory.length === 0) {
            moves.push(appendComment(''));
        }
        // build the list of moves.  a move_string looks like: "3. e3 e6"
        while (reversedHistory.length > 0) {
            moveString = appendComment(moveString);
            const move = reversedHistory.pop();
            // make TypeScript stop complaining about move being undefined
            if (!move) {
                break;
            }
            // if the position started with black to move, start PGN with #. ...
            if (!this._history.length && move.color === 'b') {
                const prefix = `${this._moveNumber}. ...`;
                // is there a comment preceding the first move?
                moveString = moveString ? `${moveString} ${prefix}` : prefix;
            }
            else if (move.color === 'w') {
                // store the previous generated move_string if we have one
                if (moveString.length) {
                    moves.push(moveString);
                }
                moveString = this._moveNumber + '.';
            }
            moveString =
                moveString + ' ' + this._moveToSan(move, this._moves({ legal: true }));
            this._makeMove(move);
        }
        // are there any other leftover moves?
        if (moveString.length) {
            moves.push(appendComment(moveString));
        }
        // is there a result? (there ALWAYS has to be a result according to spec; see Seven Tag Roster)
        moves.push(this._header.Result || '*');
        /*
         * history should be back to what it was before we started generating PGN,
         * so join together moves
         */
        if (maxWidth === 0) {
            return result.join('') + moves.join(' ');
        }
        // TODO (jah): huh?
        const strip = function () {
            if (result.length > 0 && result[result.length - 1] === ' ') {
                result.pop();
                return true;
            }
            return false;
        };
        // NB: this does not preserve comment whitespace.
        const wrapComment = function (width, move) {
            for (const token of move.split(' ')) {
                if (!token) {
                    continue;
                }
                if (width + token.length > maxWidth) {
                    while (strip()) {
                        width--;
                    }
                    result.push(newline);
                    width = 0;
                }
                result.push(token);
                width += token.length;
                result.push(' ');
                width++;
            }
            if (strip()) {
                width--;
            }
            return width;
        };
        // wrap the PGN output at max_width
        let currentWidth = 0;
        for (let i = 0; i < moves.length; i++) {
            if (currentWidth + moves[i].length > maxWidth) {
                if (moves[i].includes('{')) {
                    currentWidth = wrapComment(currentWidth, moves[i]);
                    continue;
                }
            }
            // if the current move will push past max_width
            if (currentWidth + moves[i].length > maxWidth && i !== 0) {
                // don't end the line with whitespace
                if (result[result.length - 1] === ' ') {
                    result.pop();
                }
                result.push(newline);
                currentWidth = 0;
            }
            else if (i !== 0) {
                result.push(' ');
                currentWidth++;
            }
            result.push(moves[i]);
            currentWidth += moves[i].length;
        }
        return result.join('');
    }
    /**
     * @deprecated Use `setHeader` and `getHeaders` instead. This method will return null header tags (which is not what you want)
     */
    header(...args) {
        for (let i = 0; i < args.length; i += 2) {
            if (typeof args[i] === 'string' && typeof args[i + 1] === 'string') {
                this._header[args[i]] = args[i + 1];
            }
        }
        return this._header;
    }
    // TODO: value validation per spec
    setHeader(key, value) {
        this._header[key] = value ?? exports.SEVEN_TAG_ROSTER[key] ?? null;
        return this.getHeaders();
    }
    removeHeader(key) {
        if (key in this._header) {
            this._header[key] = exports.SEVEN_TAG_ROSTER[key] || null;
            return true;
        }
        return false;
    }
    // return only non-null headers (omit placemarker nulls)
    getHeaders() {
        const nonNullHeaders = {};
        for (const [key, value] of Object.entries(this._header)) {
            if (value !== null) {
                nonNullHeaders[key] = value;
            }
        }
        return nonNullHeaders;
    }
    /*
     * Convert a move from 0x88 coordinates to Standard Algebraic Notation
     * (SAN)
     *
     * @param {boolean} strict Use the strict SAN parser. It will throw errors
     * on overly disambiguated moves (see below):
     *
     * r1bqkbnr/ppp2ppp/2n5/1B1pP3/4P3/8/PPPP2PP/RNBQK1NR b KQkq - 2 4
     * 4. ... Nge7 is overly disambiguated because the knight on c6 is pinned
     * 4. ... Ne7 is technically the valid SAN
     */
    _moveToSan(move, moves) {
        let output = '';
        if (move.flags & BITS.KSIDE_CASTLE) {
            output = 'O-O';
        }
        else if (move.flags & BITS.QSIDE_CASTLE) {
            output = 'O-O-O';
        }
        else if (move.flags & BITS.NULL_MOVE) {
            return SAN_NULLMOVE;
        }
        else {
            if (move.piece !== exports.PAWN) {
                const disambiguator = getDisambiguator(move, moves);
                output += move.piece.toUpperCase() + disambiguator;
            }
            if (move.flags & (BITS.CAPTURE | BITS.EP_CAPTURE)) {
                if (move.piece === exports.PAWN) {
                    output += algebraic(move.from)[0];
                }
                output += 'x';
            }
            output += algebraic(move.to);
            if (move.promotion) {
                output += '=' + move.promotion.toUpperCase();
            }
        }
        this._makeMove(move);
        if (this.isCheck()) {
            if (this.isCheckmate()) {
                output += '#';
            }
            else {
                output += '+';
            }
        }
        this._undoMove();
        return output;
    }
    // convert a move from Standard Algebraic Notation (SAN) to 0x88 coordinates
    _moveFromSan(move, strict = false) {
        // strip off any move decorations: e.g Nf3+?! becomes Nf3
        let cleanMove = strippedSan(move);
        if (!strict) {
            if (cleanMove === '0-0') {
                cleanMove = 'O-O';
            }
            else if (cleanMove === '0-0-0') {
                cleanMove = 'O-O-O';
            }
        }
        //first implementation of null with a dummy move (black king moves from a8 to a8), maybe this can be implemented better
        if (cleanMove == SAN_NULLMOVE) {
            const res = {
                color: this._turn,
                from: 0,
                to: 0,
                piece: 'k',
                flags: BITS.NULL_MOVE,
            };
            return res;
        }
        let pieceType = inferPieceType(cleanMove);
        let moves = this._moves({ legal: true, piece: pieceType });
        // strict parser
        for (let i = 0, len = moves.length; i < len; i++) {
            if (cleanMove === strippedSan(this._moveToSan(moves[i], moves))) {
                return moves[i];
            }
        }
        // the strict parser failed
        if (strict) {
            return null;
        }
        let piece = undefined;
        let matches = undefined;
        let from = undefined;
        let to = undefined;
        let promotion = undefined;
        /*
         * The default permissive (non-strict) parser allows the user to parse
         * non-standard chess notations. This parser is only run after the strict
         * Standard Algebraic Notation (SAN) parser has failed.
         *
         * When running the permissive parser, we'll run a regex to grab the piece, the
         * to/from square, and an optional promotion piece. This regex will
         * parse common non-standard notation like: Pe2-e4, Rc1c4, Qf3xf7,
         * f7f8q, b1c3
         *
         * NOTE: Some positions and moves may be ambiguous when using the permissive
         * parser. For example, in this position: 6k1/8/8/B7/8/8/8/BN4K1 w - - 0 1,
         * the move b1c3 may be interpreted as Nc3 or B1c3 (a disambiguated bishop
         * move). In these cases, the permissive parser will default to the most
         * basic interpretation (which is b1c3 parsing to Nc3).
         */
        let overlyDisambiguated = false;
        matches = cleanMove.match(/([pnbrqkPNBRQK])?([a-h][1-8])x?-?([a-h][1-8])([qrbnQRBN])?/);
        if (matches) {
            piece = matches[1];
            from = matches[2];
            to = matches[3];
            promotion = matches[4];
            if (from.length == 1) {
                overlyDisambiguated = true;
            }
        }
        else {
            /*
             * The [a-h]?[1-8]? portion of the regex below handles moves that may be
             * overly disambiguated (e.g. Nge7 is unnecessary and non-standard when
             * there is one legal knight move to e7). In this case, the value of
             * 'from' variable will be a rank or file, not a square.
             */
            matches = cleanMove.match(/([pnbrqkPNBRQK])?([a-h]?[1-8]?)x?-?([a-h][1-8])([qrbnQRBN])?/);
            if (matches) {
                piece = matches[1];
                from = matches[2];
                to = matches[3];
                promotion = matches[4];
                if (from.length == 1) {
                    overlyDisambiguated = true;
                }
            }
        }
        pieceType = inferPieceType(cleanMove);
        moves = this._moves({
            legal: true,
            piece: piece ? piece : pieceType,
        });
        if (!to) {
            return null;
        }
        for (let i = 0, len = moves.length; i < len; i++) {
            if (!from) {
                // if there is no from square, it could be just 'x' missing from a capture
                if (cleanMove ===
                    strippedSan(this._moveToSan(moves[i], moves)).replace('x', '')) {
                    return moves[i];
                }
                // hand-compare move properties with the results from our permissive regex
            }
            else if ((!piece || piece.toLowerCase() == moves[i].piece) &&
                Ox88[from] == moves[i].from &&
                Ox88[to] == moves[i].to &&
                (!promotion || promotion.toLowerCase() == moves[i].promotion)) {
                return moves[i];
            }
            else if (overlyDisambiguated) {
                /*
                 * SPECIAL CASE: we parsed a move string that may have an unneeded
                 * rank/file disambiguator (e.g. Nge7).  The 'from' variable will
                 */
                const square = algebraic(moves[i].from);
                if ((!piece || piece.toLowerCase() == moves[i].piece) &&
                    Ox88[to] == moves[i].to &&
                    (from == square[0] || from == square[1]) &&
                    (!promotion || promotion.toLowerCase() == moves[i].promotion)) {
                    return moves[i];
                }
            }
        }
        return null;
    }
    ascii() {
        let s = '   +------------------------+\n';
        for (let i = Ox88.a8; i <= Ox88.h1; i++) {
            // display the rank
            if (file(i) === 0) {
                s += ' ' + '87654321'[rank(i)] + ' |';
            }
            if (this._board[i]) {
                const piece = this._board[i].type;
                const color = this._board[i].color;
                const symbol = color === exports.WHITE ? piece.toUpperCase() : piece.toLowerCase();
                s += ' ' + symbol + ' ';
            }
            else {
                s += ' . ';
            }
            if ((i + 1) & 0x88) {
                s += '|\n';
                i += 8;
            }
        }
        s += '   +------------------------+\n';
        s += '     a  b  c  d  e  f  g  h';
        return s;
    }
    perft(depth) {
        const moves = this._moves({ legal: false });
        let nodes = 0;
        const color = this._turn;
        for (let i = 0, len = moves.length; i < len; i++) {
            this._makeMove(moves[i]);
            if (!this._isKingAttacked(color)) {
                if (depth - 1 > 0) {
                    nodes += this.perft(depth - 1);
                }
                else {
                    nodes++;
                }
            }
            this._undoMove();
        }
        return nodes;
    }
    setTurn(color) {
        if (this._turn == color) {
            return false;
        }
        this.move('--');
        return true;
    }
    turn() {
        return this._turn;
    }
    board() {
        const output = [];
        let row = [];
        for (let i = Ox88.a8; i <= Ox88.h1; i++) {
            if (this._board[i] == null) {
                row.push(null);
            }
            else {
                row.push({
                    square: algebraic(i),
                    type: this._board[i].type,
                    color: this._board[i].color,
                });
            }
            if ((i + 1) & 0x88) {
                output.push(row);
                row = [];
                i += 8;
            }
        }
        return output;
    }
    squareColor(square) {
        if (square in Ox88) {
            const sq = Ox88[square];
            return (rank(sq) + file(sq)) % 2 === 0 ? 'light' : 'dark';
        }
        return null;
    }
    history({ verbose = false } = {}) {
        const reversedHistory = [];
        const moveHistory = [];
        while (this._history.length > 0) {
            reversedHistory.push(this._undoMove());
        }
        while (true) {
            const move = reversedHistory.pop();
            if (!move) {
                break;
            }
            if (verbose) {
                moveHistory.push(new Move(this, move));
            }
            else {
                moveHistory.push(this._moveToSan(move, this._moves()));
            }
            this._makeMove(move);
        }
        return moveHistory;
    }
    /*
     * Keeps track of position occurrence counts for the purpose of repetition
     * checking. Old positions are removed from the map if their counts are reduced to 0.
     */
    _getPositionCount(hash) {
        return this._positionCount.get(hash) ?? 0;
    }
    _incPositionCount() {
        this._positionCount.set(this._hash, (this._positionCount.get(this._hash) ?? 0) + 1);
    }
    _decPositionCount(hash) {
        const currentCount = this._positionCount.get(hash) ?? 0;
        if (currentCount === 1) {
            this._positionCount.delete(hash);
        }
        else {
            this._positionCount.set(hash, currentCount - 1);
        }
    }
    _pruneComments() {
        const reversedHistory = [];
        const currentComments = {};
        const copyComment = (fen) => {
            if (fen in this._comments) {
                currentComments[fen] = this._comments[fen];
            }
        };
        while (this._history.length > 0) {
            reversedHistory.push(this._undoMove());
        }
        copyComment(this.fen());
        while (true) {
            const move = reversedHistory.pop();
            if (!move) {
                break;
            }
            this._makeMove(move);
            copyComment(this.fen());
        }
        this._comments = currentComments;
    }
    getComment() {
        return this._comments[this.fen()];
    }
    setComment(comment) {
        this._comments[this.fen()] = comment.replace('{', '[').replace('}', ']');
    }
    /**
     * @deprecated Renamed to `removeComment` for consistency
     */
    deleteComment() {
        return this.removeComment();
    }
    removeComment() {
        const comment = this._comments[this.fen()];
        delete this._comments[this.fen()];
        return comment;
    }
    getComments() {
        this._pruneComments();
        return Object.keys(this._comments).map((fen) => {
            return { fen: fen, comment: this._comments[fen] };
        });
    }
    /**
     * @deprecated Renamed to `removeComments` for consistency
     */
    deleteComments() {
        return this.removeComments();
    }
    removeComments() {
        this._pruneComments();
        return Object.keys(this._comments).map((fen) => {
            const comment = this._comments[fen];
            delete this._comments[fen];
            return { fen: fen, comment: comment };
        });
    }
    setCastlingRights(color, rights) {
        for (const side of [exports.KING, exports.QUEEN]) {
            if (rights[side] !== undefined) {
                if (rights[side]) {
                    this._castling[color] |= SIDES[side];
                }
                else {
                    this._castling[color] &= ~SIDES[side];
                }
            }
        }
        this._updateCastlingRights();
        const result = this.getCastlingRights(color);
        return ((rights[exports.KING] === undefined || rights[exports.KING] === result[exports.KING]) &&
            (rights[exports.QUEEN] === undefined || rights[exports.QUEEN] === result[exports.QUEEN]));
    }
    getCastlingRights(color) {
        return {
            [exports.KING]: (this._castling[color] & SIDES[exports.KING]) !== 0,
            [exports.QUEEN]: (this._castling[color] & SIDES[exports.QUEEN]) !== 0,
        };
    }
    moveNumber() {
        return this._moveNumber;
    }
    /*
     * FOG OF WAR
     * --------------------------------------------------------------------------
     * A player sees a square when one of their own pieces bears on it:
     *
     *   - the squares their own pieces stand on;
     *   - for sliding pieces, every square along each ray up to and including the
     *     first piece in the way (so you see what stops you, but not past it);
     *   - for knights and kings, their eight destinations;
     *   - for pawns, both capture diagonals (occupied or not — that is what a
     *     pawn guards), the square directly ahead, and the double-step square
     *     when the pawn is still home and the square ahead is empty;
     *   - the squares castling would carry the king and rook across, while that
     *     castling right survives.
     *
     * That last pawn and castling clause are what make the rule not just
     * atmospheric but *sound*: a fogged position contains every square that can
     * affect the viewer's own move legality, so `moves()` on a fogged FEN returns
     * exactly the moves `moves()` returns on the true position. The server can
     * therefore hand a client nothing but its own view and still have the client
     * agree with it about what is playable — the same guarantee Word Drop gets by
     * never shipping the opponent's rack.
     */
    _visionSquares(color) {
        const seen = new Array(128).fill(false);
        const mark = (square) => {
            if (!(square & 0x88))
                seen[square] = true;
        };
        for (let from = Ox88.a8; from <= Ox88.h1; from++) {
            if (from & 0x88) {
                from += 7;
                continue;
            }
            const piece = this._board[from];
            if (!piece || piece.color !== color)
                continue;
            mark(from);
            if (piece.type === exports.PAWN) {
                // The square ahead is always seen: whatever blocks a pawn is in
                // contact with it, and the viewer has to know why it cannot advance.
                const ahead = from + PAWN_OFFSETS[color][0];
                mark(ahead);
                if (!(ahead & 0x88) &&
                    !this._board[ahead] &&
                    rank(from) === SECOND_RANK[color]) {
                    mark(from + PAWN_OFFSETS[color][1]);
                }
                mark(from + PAWN_OFFSETS[color][2]);
                mark(from + PAWN_OFFSETS[color][3]);
                continue;
            }
            for (const offset of PIECE_OFFSETS[piece.type]) {
                let to = from;
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    to += offset;
                    if (to & 0x88)
                        break;
                    mark(to);
                    if (this._board[to])
                        break;
                    if (piece.type === exports.KNIGHT || piece.type === exports.KING)
                        break;
                }
            }
        }
        for (const { side, flag, kingSide } of CASTLE_SIDES) {
            if (!(this._castling[color] & flag))
                continue;
            const kingFrom = this._kings[color];
            const rookFrom = this._castlingRooks[color][side];
            if (kingFrom === EMPTY || rookFrom === EMPTY)
                continue;
            for (const [start, end] of [
                [kingFrom, castleKingSquare(kingFrom, kingSide)],
                [rookFrom, castleRookSquare(kingFrom, kingSide)],
            ]) {
                const step = start <= end ? 1 : -1;
                for (let square = start;; square += step) {
                    mark(square);
                    if (square === end)
                        break;
                }
            }
        }
        return seen;
    }
    /** The squares `color` can currently see. */
    visibleSquares(color) {
        const seen = this._visionSquares(color);
        const squares = [];
        for (let i = Ox88.a8; i <= Ox88.h1; i++) {
            if (i & 0x88) {
                i += 7;
                continue;
            }
            if (seen[i])
                squares.push(algebraic(i));
        }
        return squares;
    }
    isVisible(square, color) {
        return square in Ox88 && this._visionSquares(color)[Ox88[square]];
    }
    /**
     * Visibility as 64 characters of '1' and '0', ordered a8..h1 like the board
     * half of a FEN. Compact enough to ship on every state update.
     */
    fogMask(color) {
        const seen = this._visionSquares(color);
        let mask = '';
        for (let i = Ox88.a8; i <= Ox88.h1; i++) {
            if (i & 0x88) {
                i += 7;
                continue;
            }
            mask += seen[i] ? '1' : '0';
        }
        return mask;
    }
    /**
     * The position as `color` knows it: hidden squares come back empty, the
     * opponent's castling rights are withheld (they record whether pieces the
     * viewer cannot see have moved), the en passant square is only named when the
     * viewer is the one who could take, and the halfmove clock is zeroed because
     * it counts captures and pawn moves that happened inside the fog.
     */
    fogFen(color) {
        const seen = this._visionSquares(color);
        let board = '';
        let empty = 0;
        for (let i = Ox88.a8; i <= Ox88.h1; i++) {
            const piece = seen[i] ? this._board[i] : undefined;
            if (piece) {
                if (empty > 0) {
                    board += empty;
                    empty = 0;
                }
                board +=
                    piece.color === exports.WHITE ? piece.type.toUpperCase() : piece.type;
            }
            else {
                empty++;
            }
            if ((i + 1) & 0x88) {
                if (empty > 0)
                    board += empty;
                if (i !== Ox88.h1)
                    board += '/';
                empty = 0;
                i += 8;
            }
        }
        const epSquare = this._turn === color ? this.fen().split(' ')[3] : '-';
        return [
            board,
            this._turn,
            this._castlingField([color]),
            epSquare,
            0,
            this._moveNumber,
        ].join(' ');
    }
}
exports.Chess = Chess;
const KNIGHT_PLACEMENTS = [
    'nnrkr',
    'nrnkr',
    'nrknr',
    'nrkrn',
    'rnnkr',
    'rnknr',
    'rnkrn',
    'rknnr',
    'rknrn',
    'rkrnn',
];
exports.CHESS960_POSITIONS = 960;
/**
 * The starting FEN of a Chess960 position, numbered the standard way
 * (Scharnagl), so 518 is the orthodox `rnbqkbnr` back rank.
 *
 * The castling field is written Shredder-style — the files of the two rooks —
 * because KQkq cannot say which rook castles when they do not start in the
 * corners.
 */
function chess960Fen(index) {
    if (!Number.isInteger(index) || index < 0 || index >= exports.CHESS960_POSITIONS) {
        throw new Error(`Invalid Chess960 position number: ${index}`);
    }
    const backRank = new Array(8);
    // Bishops first: one on a light square, one on a dark square.
    const lightBishop = index % 4;
    const remainingAfterLight = Math.floor(index / 4);
    const darkBishop = remainingAfterLight % 4;
    const remainingAfterDark = Math.floor(remainingAfterLight / 4);
    backRank[2 * lightBishop + 1] = exports.BISHOP;
    backRank[2 * darkBishop] = exports.BISHOP;
    // Then the queen, on the nth square still free.
    const queen = remainingAfterDark % 6;
    const knightPlacement = Math.floor(remainingAfterDark / 6);
    let free = 0;
    for (let f = 0; f < 8; f++) {
        if (backRank[f])
            continue;
        if (free === queen) {
            backRank[f] = exports.QUEEN;
            break;
        }
        free++;
    }
    // The last five squares take one of the ten knight/rook/king arrangements,
    // every one of which leaves the king between the two rooks.
    const pattern = KNIGHT_PLACEMENTS[knightPlacement];
    let placed = 0;
    for (let f = 0; f < 8; f++) {
        if (backRank[f])
            continue;
        backRank[f] = pattern[placed++];
    }
    const black = backRank.join('');
    const white = black.toUpperCase();
    const rookFiles = [0, 1, 2, 3, 4, 5, 6, 7].filter((f) => backRank[f] === exports.ROOK);
    const castling = rookFiles
        .map((f) => 'abcdefgh'[f].toUpperCase())
        .reverse()
        .join('') +
        rookFiles
            .map((f) => 'abcdefgh'[f])
            .reverse()
            .join('');
    return `${black}/pppppppp/8/8/8/8/PPPPPPPP/${white} w ${castling} - 0 1`;
}
exports.chess960Fen = chess960Fen;
/** A uniformly random Chess960 starting position. */
function randomChess960(random = Math.random) {
    const index = Math.min(exports.CHESS960_POSITIONS - 1, Math.max(0, Math.floor(random() * exports.CHESS960_POSITIONS)));
    return { index, fen: chess960Fen(index) };
}
exports.randomChess960 = randomChess960;
