import { create } from "zustand";
import { authFetch } from "./auth";
import { prefix } from "./config";
import { resetWarningCache } from "prop-types";

export const useSpotifySearchStore = create(
    (set, get) => ({
        results: [],
        lastEdited: new Date().getTime(),
        waiting: false,
        searchQuery: null,
        searchType: "ARTIST",
        setSearch: (searchQuery: string) => {
            set({searchQuery: searchQuery, lastEdited: new Date().getTime(), waiting: true})
            setTimeout(() => {
                const data = get()
                if (new Date().getTime()-data.lastEdited>800 && data.searchQuery!=null){
                    if(data.searchQuery!=""){
                        searchSpotify(data.searchQuery, data.searchType).then((res) => {
                            set({results: res, waiting: false})
                        })
                    }else{
                        set({waiting: false})
                    }

                }
            }, 800)
        },
        setSearchType: (searchType: string) => {
            const data = get()
            console.log(`setting search type ${searchType}`)
            set({
                searchType: searchType
            })
            if(data.searchQuery!=null && data.searchQuery!=""){
                data.setSearch(data.searchQuery)
            }
            
        },
        clearSearch: () => {

        }
    })
)

export const useFriendSearchStore = create(
    (set, get) => ({
        results: [],
        lastEdited: new Date().getTime(),
        waiting: false,
        query: null,
        setSearch: (searchQuery) => {
            set({query: searchQuery, lastEdited: new Date().getTime(), waiting: true})
            setTimeout(() => {
                const data = get()
                if (new Date().getTime()-data.lastEdited>800 && data.query!=null && data.query!=""){
                    searchUsers(data.query).then((res) => {
                        console.log(res)
                        set({results: res, waiting: false})
                    })
                }
            }, 800)
        },
        clearSearch: () => {
            set({
                // query: null,
                waiting: false,
                // results: []
            })
        }
    })
)

async function searchSpotify(query: string, type: string){
    const result = await authFetch(`${prefix}/spotify/${type.toLowerCase()}?${type.toLocaleLowerCase()}=${query}`, {})
    const resJson = await result.json()
    return resJson
}

async function searchUsers(query){
    console.log(`Searching \"${query}\"`)
    const res = await authFetch(`${prefix}/searchProfiles`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
          },
        body: JSON.stringify({"search": query})
    })
    const resJson = await res.json()
    console.log(resJson)
    if(resJson.status==1){
        return resJson.data
    }else{
        throw new Error("Error fetching friend requests")
    }
}