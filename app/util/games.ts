import { create } from "zustand";
import { authFetch } from "./auth";
import { prefix } from "./config";

export const useGamesStore = create(
    (set, get) => ({
        games: null,
        lastUpdated: 1,
        getGameByUser: (user1: number, user2: number) => {
            const games = get().games
            games.forEach((game) => {
                if((game.player1==user1 && game.player2 == user2) || (game.player1==user2 && game.player2 == user1)){
                    return game
                }
            })
            return null
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
        forceUpdate: async () => {
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
        },
        clear: () => {
            set({
                games: null,
                lastUpdated: 1
            })
        }
    })
)