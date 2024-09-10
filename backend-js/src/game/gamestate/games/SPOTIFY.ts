import { GameStatus } from "@prisma/client";
import { prisma, spotifyApi } from "../../..";
import { pickSongFromAlbum, pickSongFromArtist, pickSongFromPlaylist } from "../../../spotify/game/init";
import { updateGame } from "../../game";
import { GameMoveStatus, GameState, GameStateManipulator, getOtherUser } from "../gamestate";

export interface Spotify_GameState extends GameState {
    song: any,
    songChoices: any,
    player1Stage: number,
    player2Stage: number
}

function checkWinner(board: number[][]) {
    // Check rows
    for (let i = 0; i < 3; i++) {
        if (board[i][0] !== 0 && board[i][0] === board[i][1] && board[i][1] === board[i][2]) {
            return board[i][0];
        }
    }

    // Check columns
    for (let i = 0; i < 3; i++) {
        if (board[0][i] !== 0 && board[0][i] === board[1][i] && board[1][i] === board[2][i]) {
            return board[0][i];
        }
    }

    // Check main diagonal
    if (board[0][0] !== 0 && board[0][0] === board[1][1] && board[1][1] === board[2][2]) {
        return board[0][0];
    }

    // Check anti-diagonal
    if (board[0][2] !== 0 && board[0][2] === board[1][1] && board[1][1] === board[2][0]) {
        return board[0][2];
    }

    // Check for draw
    if (board.flat().every(cell => cell !== 0)) {
        return -1;  // Return -1 for a draw
    }

    // No winner
    return 0;
}

export const SPOTIFY: GameStateManipulator = {
    async init(user1, user2, options) {

        console.log("INIT SPOTIFY GAME!!")

        const type = options.type
        const id = options.id
        const name = options.name

        if(type=="ARTIST"){

            const data = await pickSongFromArtist(id, name)

            if(data==null){
                throw new Error("Oops! This album cannot be used.")
            }

            if(!data.mysterySong.song.preview){
                const song = await spotifyApi.getTrack(data.mysterySong.song.id)
                if(song.body.preview_url){
                    data.mysterySong.song.preview = song.body.preview_url
                }else{
                    throw new Error("Oops! This album cannot be used.")
                }
            }

            return {
                song: data.mysterySong,
                songChoices: data.searchOptions,
                player1Stage: 0,
                player2Stage: 0,
                player1: user1,
                player2: user2
            }

        }else if(type=="PLAYLIST"){

            const data = await pickSongFromPlaylist(id)

            if(data==null){
                throw new Error("Oops! This album cannot be used.")
            }

            if(!data.mysterySong.song.preview){
                const song = await spotifyApi.getTrack(data.mysterySong.song.id)
                if(song.body.preview_url){
                    data.mysterySong.song.preview = song.body.preview_url
                }else{
                    throw new Error("Oops! This album cannot be used.")
                }
            }

            return {
                song: data.mysterySong,
                songChoices: data.searchOptions,
                player1Stage: 0,
                player2Stage: 0,
                player1: user1,
                player2: user2
            }

        }else if(type=="ALBUM"){

            const data = await pickSongFromAlbum(id)

            if(data==null){
                throw new Error("Oops! This album cannot be used.")
            }

            if(!data.mysterySong.song.preview){
                console.log("Trying to load song preview directly")
                const song = await spotifyApi.getTrack(data.mysterySong.song.id)
                console.log(song.body)
                if(song.body.preview_url){
                    data.mysterySong.song.preview = song.body.preview_url
                }else{
                    throw new Error("Oops! This album cannot be used.")
                }
            }

            return {
                song: data.mysterySong,
                songChoices: data.searchOptions,
                player1Stage: 0,
                player2Stage: 0,
                player1: user1,
                player2: user2
            }

        }else {
            throw new Error("Unknown game type")
        }
    },
    async processMove(state: Spotify_GameState, userId, move, gameId) {

        const action = move.actions[0]

        // example action
        // {
        //     type: "guess" OR "skip",
        //     guess: "songId"
        // }

        async function gameFinished(){
            let winner = -1

            if(state.player1Stage>state.player2Stage){
                winner = state.player1
            }

            if(state.player1Stage>state.player1Stage){
                winner = state.player2
            }

            const waitingOn = userId==state.player1?state.player2:state.player1
            const result = await updateGame(gameId, state, waitingOn, winner)

            return {
                status: GameMoveStatus.ACCEPTED,
                state: state,
                game: result
            }
        }

        async function switchPlayer(){
            const waitingOn = userId==state.player1?state.player2:state.player1
            const result = await updateGame(gameId, state, waitingOn, 0)

            return {
                status: GameMoveStatus.ACCEPTED,
                state: state,
                game: result
            }
        }

        async function updateStage(){
            const result = await updateGame(gameId, state, userId, 0)

            return {
                status: GameMoveStatus.ACCEPTED,
                state: state,
                game: result
            }
        }

        if(action.type=="skip"){
            if(userId==state.player1){
                if(state.player1Stage<4){
                    state.player1Stage=state.player1Stage+1
                    updateStage()
                }else if(state.player1Stage==4){
                    state.player1Stage=-1
                    // player 1 fails
                    gameFinished()
                }
            }
            if(userId==state.player2){
                if(state.player2Stage<4){
                    state.player2Stage=state.player2Stage+1
                    updateStage()
                }else if(state.player2Stage==4){
                    state.player2Stage=-1
                    // player 2 fails

                    switchPlayer()
                }
            }
        }

        if(action.type=="guess"){
            if(userId==state.player1){
                if(action.guess==state.song.id){
                    // guessed correctly
                    gameFinished()
                }else{
                    if(state.player1Stage<4){
                        state.player1Stage=state.player1+1
                        updateStage()
                    }else {
                        // player 1 fails
                        gameFinished()
                    }
                }
            }
            if(userId==state.player2){
                if(action.guess==state.song.id){
                    // guessed correctly
                    switchPlayer()
                }else{
                    if(state.player1Stage<4){
                        state.player1Stage=state.player1+1
                        updateStage()
                    }else {
                        // player 1 fails
                       switchPlayer()
                    }
                }
            }
        }

        return {
            status: GameMoveStatus.ACCEPTED,
            state: state,
            game: null
        }

    },
}