import * as SecureStore from 'expo-secure-store'

import { prefix } from "./config"
import { compressObject, decompressObject } from './compress'

import { router } from 'expo-router'

async function getFreshAccountDetails(){
    try{
        const details = await authFetch(`${prefix}/account`, {}, router)
        const response =  await details.json()
        return response
    }catch (err) {
        return null
    }
}

export async function getAccountDetails(forceNew=false){
    const account = await SecureStore.getItemAsync("account-details")
    console.log(account)
    if(account==null || forceNew){
        const details = await getFreshAccountDetails(router)

        if(details==null){
            return null
        }

        await SecureStore.setItemAsync("account-details", JSON.stringify(details))
    }else {
        const decompressed = JSON.parse(account)
        console.log(decompressed)
        return decompressed
    }
}

export async function login(usernameOrEmail, password){
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
        await SecureStore.deleteItemAsync("accessToken")
        await SecureStore.deleteItemAsync("refreshToken")
        await SecureStore.setItemAsync("refreshToken", json.data)
        await refreshAccessToken()
        return ""
    }else{
        return json.message
    }

}

export async function signup(username, email, password){
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

    
    if(json.status==1){
        return ""
    }else{
        return json.message
    }
}

export async function logout(clearRefreshToken=true){
    await SecureStore.deleteItemAsync("accessToken")
    await SecureStore.deleteItemAsync("refreshToken")

    if(clearRefreshToken){
        await fetch(`${prefix}/logout`)
    }
}

export async function refreshAccessToken(){

    const refreshToken = await SecureStore.getItemAsync("refreshToken")

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
        await SecureStore.deleteItemAsync("accessToken")
        await SecureStore.setItemAsync("accessToken", json.data)
        return true
    }else{
        throw new Error(json.message)
    }

}

export async function authFetch(url, options){

    const accessToken = await SecureStore.getItemAsync("accessToken")

    if(options["headers"]==undefined){
        options["headers"]={"Authorization":accessToken}
    }else{
        options["headers"]["Authorization"]=accessToken
    }

    const response = await fetch(url, options)
    if(response.status==499){
        if(options["authfetchalreadydone"]){
            console.log("Already tried once...")
            logout(false)
            if(router!=null){
                router.replace("/")
            }
            throw new Error("Refresh token invalid, could not refresh access token")
        }
        console.log("Token expired :( Trying to refresh")
        await refreshAccessToken()

        options["authfetchalreadydone"]=true

        return await authFetch(url, options)
    }
    return response
}