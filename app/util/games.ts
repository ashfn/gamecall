import { create } from "zustand";
import { authFetch } from "./auth";
import { prefix } from "./config";

const games = {
    "TIC_TAC_TOE": "Tic Tac Toe",
    "SPOTIFY": "Spotify"
}

export function getGameName(gameId: string){
    return games[gameId]
}

export const useGamesStore = create(
    (set, get) => ({
        games: null,
        lastUpdated: 1,
        addGame: (game) => {
            const games = get().games
            set({
                games: [...games, game]
            })
        },
        getGameByUser: (user1: number, user2: number) => {
            const games = get().games
            let rgame = null
            if(games!=null){
                games.forEach((game) => {
                    console.log(`${game.player1} ${game.player2} ${user1} ${user2}`)
                    if((game.player1==user1 && game.player2 == user2) || (game.player1==user2 && game.player2 == user1)){
                        rgame=game
                    }
                })
            }

            return rgame
        },
        getGameById: (gameId: number) => {
            const games = get().games
            let rgame = null
            if(games!=null){
                games.forEach((game) => {
                    if(game.id==gameId){
                        rgame=game
                    }
                })
            }

            return rgame  
        },
        removeGameById: (gameId: number) => {
            const games = get().games
            if(games!=null){
                const newList = games.filter(game => game.id !== gameId);
                set({games: newList})
            }
        },
        get: async () => {
            const data = get()
            if(new Date().getTime()-data.lastUpdated>15000 || data.games==null){
                set({lastUpdated: new Date().getTime()})
                const res = await authFetch(`${prefix}/games`, {

                })
                const res2 = await res.json()
                if(res2.status==1){
                    const games = res2.data
                    set({
                        games: games
                    })
                }else{
                    console.log(res2.error)
                }
            }
        },
        manuallyUpdate: (gameId: number, game: any) => {
            let games = get().games
            for(let i=0;i<games.length;i++){
                if(games[i].id==gameId){
                    games[i]=game
                }
            }
            set({games: games})
            console.log(`NEWGAMES ${JSON.stringify(get().games)}`)
        },
        forceUpdate: async () => {
            const res = await authFetch(`${prefix}/games`, {

            })
            const res2 = await res.json()
            if(res2.status==1){
                const games = res2.data
                console.log(`got games ${JSON.stringify(games)}`)
                set({
                    games: games
                })
            }else{
                console.log(res2.error)
            }
        },
        clear: () => {
            set({
                games: null,
                lastUpdated: 1
            })
        }
    })
)

export const gamesConfig = [
    {
        id: "TIC_TAC_TOE", name: "Tic Tac Toe", component: () => import('../src/games/game_components/TicTacToe')
    },
    {
        id: "SPOTIFY", name: "Spotify", component: () => import('../src/games/game_components/Spotify')
    }
]