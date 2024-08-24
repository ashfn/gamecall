import AsyncStorage from '@react-native-async-storage/async-storage';


import { prefix } from "./config"
import { router } from 'expo-router'
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useFriendRequestsStore, useProfileCache } from './friendshipStatus';
import { useGamesStore } from './games';

export const useAccountDetailsStore = create(
    (set, get) => ({
        account: null,
        lastUpdated: 0,
        fresh: async () => {
            try{
                const acc = await getAccount()
                console.log("Updating account details store fresh")
                set({account: acc, lastUpdated: new Date().getTime()})
            }catch (err) {
                throw(err)
            }
        },
        update: async () => {
            const data = get()
            try{
                if(new Date().getTime()-data.lastUpdated>20000 || data.account==null){
                    const acc = await getAccount()
                    console.log("Updating account details store fresh")
                    set({account: acc, lastUpdated: new Date().getTime()})
                }
            }catch (err) {
                throw(err)
            }
        },
        get: async () => {
            const data = get()
            if(data.account==null){
                const acc = await getAccount()
                console.log("Updating account details store fresh")
                set({account: acc, lastUpdated: new Date().getTime()})
                return acc
            }else{
                return data.account
            }
        },
        logout: async () => {
            set({account: null, lastUpdated: 0})
        }
    })
)

async function getAccount(){
    const details = await authFetch(`${prefix}/account`, {})
    const response = await details.json()
    if(response.status==1){
        return response.data
    }else{
        throw new Error("Error fetching account")
    }  
}

async function getFreshAccountDetails(){
    try{
        const details = await authFetch(`${prefix}/account`, {})
        const response =  await details.json()
        return response
    }catch (err) {
        console.log(err)
        return 0
    }
}

export async function getAccountDetails(forceNew:boolean=false){
    const account = await AsyncStorage.getItem("account-details")
    console.log(`stored acc ${account}`)
    if(account==null || forceNew){
        console.log("Fetching fresh account details")
        const details = await getFreshAccountDetails()

        if(details==null){
            return 0
        }

        await AsyncStorage.setItem("account-details", JSON.stringify(details))
        return details
    }else {
        const decompressed = JSON.parse(account)
        return decompressed
    }
}

export async function login(usernameOrEmail: string, password: string){
    const response = await fetch(`${prefix}/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
          },
        body: JSON.stringify({
            "account":usernameOrEmail,
            "password":password
        })
    })

    if(response.status!=200){
        throw new Error(`login request failed with error code ${response.status}`)
    }

    const json = await response.json()
    


    if(json.status==1){
        await AsyncStorage.removeItem("accessToken")
        await AsyncStorage.removeItem("refreshToken")
        await AsyncStorage.setItem("refreshToken", json.data)
        await refreshAccessToken()
    }

    return json

}

export async function signup(username: string, email: string, password: string){
    const response = await fetch(`${prefix}/account`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
          },
        body: JSON.stringify({
            "username":username,
            "email":email,
            "password":password
        })
    })

    if(response.status!=200){
        throw new Error(`register request failed with error code ${response.status}`)
    }

    const json = await response.json()

    return json
}

export async function logout(clearRefreshToken:boolean=true){

    console.log(`CLEARING CACHED DATA`)

    await useAccountDetailsStore.getState().logout()
    useProfileCache.getState().clear()
    useFriendRequestsStore.getState().clear()
    useGamesStore.getState().clear()

    await AsyncStorage.removeItem("accessToken")
    await AsyncStorage.removeItem("refreshToken")
    await AsyncStorage.removeItem("account-details")

    if(clearRefreshToken){
        await fetch(`${prefix}/logout`)
    }
}

export async function refreshAccessToken(){

    const refreshToken = await AsyncStorage.getItem("refreshToken")

    console.log(`RTOKEN: ${refreshToken}`)

    const response = await fetch(`${prefix}/refresh`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
          },
        body: JSON.stringify({
            "refreshToken":refreshToken
        })
    })

    const json = await response.json()

    if(json.status==1){
        await AsyncStorage.removeItem("accessToken")
        await AsyncStorage.setItem("accessToken", json.data)
        return true
    }else{
        console.log(`Error /refresh: ${JSON.stringify(json)}`)
        throw new Error(json.message)
    }

}

export async function authFetch(url:string, options:any){

    const accessToken = await AsyncStorage.getItem("accessToken")

    if(options["headers"]==undefined){
        options["headers"]={"Authorization":accessToken}
    }else{
        options["headers"]["Authorization"]=accessToken
    }

    const response = await fetch(url, options)
    if(response.status==499){
        if(options["authfetchalreadydone"]){
            // console.log("Already tried once...")
            logout(true)
            if(router!=null){
                router.replace("/")
            }
            throw new Error("Refresh token invalid, could not refresh access token")
        }
        // console.log("Token expired :( Trying to refresh")
        try{
            await refreshAccessToken()
                
            options["authfetchalreadydone"]=true

            return await authFetch(url, options)
        } catch(err) {
            // console.log("Encountered error refreshing token")
            console.log(err.toString())
            throw new Error("Refresh token invalid due to err, could not refresh access token")
        }


    }
    return response
}