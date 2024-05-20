import { create } from "zustand";
import { authFetch } from "./auth";
import { prefix } from "./config";
import { resetWarningCache } from "prop-types";

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
                        search(data.query).then((res) => {
                        console.log(res)
                        set({results: res, waiting: false})
                    })
                }
            }, 800)
        },
        clearSearch: () => {
            set({
                query: null,
                waiting: false,
                results: []
            })
        }
    })
)

async function search(query){
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