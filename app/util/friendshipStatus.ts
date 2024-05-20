// Friendship status must be one of:
// FRIEND, REQUEST_SENT, REQUEST_RECEIVED, NONE

import AsyncStorage from "@react-native-async-storage/async-storage"
import { authFetch } from "./auth"
import { prefix } from "./config"
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export enum FriendshpStatus {
    FRIEND,
    REQUEST_SENT,
    REQUEST_RECEIVED,
    NONE
}

// export async function setStatus(userId: number, status: FriendshpStatus){
//     if(status==FriendshpStatus.NONE){

//     }
//     await AsyncStorage.setItem(`userstatus-${userId}`, status.toString())
// }

// export async function getStatus(userId: number): Promise<FriendshpStatus>{
//     const status = await AsyncStorage.getItem(`userstatus-${userId}`)
//     if(status==null){
//         return FriendshpStatus.NONE
//     }else{
//         return FriendshpStatus[status]
//     }
// }

export const useFriendRequestsStore = create(
    (set, get) => ({
        requests: null,
        lastUpdated: new Date().getTime(),
        fresh: async () => {
            set({requests: await getRequests(), lastUpdated: new Date().getTime()})
        },
        update: async () => {
            console.log("Updating friend requests store")
            const data = get()
            set({lastUpdated: new Date().getTime()})
            console.log(new Date().getTime()-data.lastUpdated)
            if(new Date().getTime()-data.lastUpdated>5000){
                set({requests: await getRequests() })
            }
        },
        clear: () => {
            set({requests: null})
        }
    })
)

async function getRequests(){
    const res = await authFetch(`${prefix}/friendRequests`, {})
    const resJson = await res.json()
    if(resJson.status==1){
        return resJson.data
    }else{
        throw new Error("Error fetching friend requests")
    }
}

export const useConnectionsStore = create(
    (set, get) => ({
        requestsSent: null,
        requestsReceived: null,
        friends: null,
        lastUpdated: new Date().getTime(),
        lookup: (id: number) => {
            const data = get()
            console.log(data)
            if(data.requestsSent.includes(id)){
                return 1
            }
            else if(data.requestsReceived.includes(id)){
                return 2
            }
            else if(data.friends.includes(id)){
                return 3
            }
            else {
                return 4
            }
        },
        fresh: async () => {
            const connections = await getAllRelations()
            set({
                requestsSent: connections.requestsSent,
                requestsReceived: connections.requestsReceived,
                friends: connections.friends,
                lastUpdated: new Date().getTime()
            })
        },
        update: async () => {
            console.log("Updating connections store")
            const data = get()
            if(new Date().getTime()-data.lastUpdated>15000){
                set({lastUpdated: new Date().getTime()})
                const connections = await getAllRelations()
                console.log(connections)
                set({
                    requestsSent: connections.requestsSent,
                    requestsReceived: connections.requestsReceived,
                    friends: connections.friends
                })
            }
        },
        clear: () => {
            set({
                requestsSent: null,
                requestsReceived: null,
                friends: null
            })
        }
    })
)

async function getAllRelations(){
    const allConnectionsRes = await authFetch(`${prefix}/connections`, {})
    const allConnectionsJson = await allConnectionsRes.json()
    console.log(`Fetched relations with code ${allConnectionsJson.status}`)
    
    if(allConnectionsJson.status==1){
        const connections = allConnectionsJson.data
        return connections
    }else{
        throw new Error("Error fetching connections")
    }
}