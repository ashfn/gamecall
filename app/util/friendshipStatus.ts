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


export const useProfileCache = create(
    (set, get) => ({
        profiles: new Map(),
        getProfile: async (userid: number) => {
            console.log(`GET PROFILE ${userid}`)
            const profiles = get().profiles
            if(profiles.has(userid)){
                return profiles.get(userid)
            }else{
                const res = await authFetch(`${prefix}/profile/${userid}`, {})
                const res2 = await res.json()
                if(res2.status==1){
                    set({
                        profiles: new Map(profiles).set(userid, res2.data)
                    })
                    return res2.data
                }else{
                    console.log(res2.error)
                }
            }
        },
        update: async (userid: number) => {
            const profiles = get().profiles



            const res = await authFetch(`${prefix}/profile/${userid}`, {})
            const res2 = await res.json()

            console.log(res2)

            if(res2.status==1){
                set({
                    profiles: new Map(profiles).set(userid, res2.data)
                })
                return res2.data
            }else{
                throw new Error(res2)
            }
        },
        clear: () => {
            set({
                profiles: new Map()
            })
        }
    })
)

export const useFriendRequestsStore = create(
    (set, get) => ({
        requests: null,
        localAccepted: [],
        localDeclined: [],
        lastUpdated: 1,
        localAccept: (userid: number) => {
            let localAccepted = get().localAccepted
            if(!localAccepted.includes(userid)){
                localAccepted.push(userid)
            }
            set({localAccepted: localAccepted})
        },
        localDecline: (userid: number) => {
            let localDeclined = get().localDeclined
            if(!localDeclined.includes(userid)){
                localDeclined.push(userid)
            }
            set({localDeclined: localDeclined})
        },
        fresh: async () => {
            const requests = await getRequests()
            set({requests: requests, lastUpdated: new Date().getTime(), localAccepted: [], localDeclined: []})
        },
        update: async () => {
            const data = get()
            set({lastUpdated: new Date().getTime()})
            if(new Date().getTime()-data.lastUpdated>5000){
                const requests = await getRequests()
                set({requests: requests, localAccepted: [], localDeclined: []})
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
        lastUpdated: 1,
        forceChange: (id: number, newStatus: number) => {
            const data = get()
            let requestsSent = data.requestsSent
            let requestsReceived = data.requestsReceived
            let friends = data.friends
            
            requestsSent=requestsSent.filter((x) => x!=id)
            requestsReceived=requestsReceived.filter((x) => x!=id)
            friends=friends.filter((x) => x!=id)

            if(newStatus==1){
                requestsSent.push(id)
            }
            if(newStatus==2){
                requestsReceived.push(id)
            }
            if(newStatus==3){
                friends.push(id)
            }

            set({
                friends: friends,
                requestsSent: requestsSent,
                requestsReceived: requestsReceived
            })

        },
        lookup: (id: number) => {
            const data = get()
            if(data.requestsSent==null || data.requestsReceived==null || data.friends==null){
                return 0
            }
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
            console.log(`Received fresh connections: ${JSON.stringify(connections)}`)
            set({
                requestsSent: connections.requestsSent,
                requestsReceived: connections.requestsReceived,
                friends: connections.friends,
                lastUpdated: new Date().getTime()
            })

            console.log(`Data dump: ${JSON.stringify(get())}`)
        },
        update: async () => {
            const data = get()
            if(new Date().getTime()-data.lastUpdated>15000){
                set({lastUpdated: new Date().getTime()})
                const connections = await getAllRelations()
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
    if(allConnectionsJson.status==1){
        const connections = allConnectionsJson.data
        return connections
    }else{
        throw new Error("Error fetching connections")
    }
}