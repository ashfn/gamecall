import * as SecureStore from 'expo-secure-store'

import { prefix } from "./config"

export async function getAccountDetails(){
    try{
        const details = await authFetch(`${prefix}/account`, {})
        return details
    }catch (err) {
        return null
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

export async function logout(){
    await SecureStore.deleteItemAsync("accessToken")
    await SecureStore.deleteItemAsync("refreshToken")

    await fetch(`${prefix}/logout`)
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
            throw new Error("Refresh token invalid, could not refresh access token")
        }
        console.log("Token expired :( Trying to refresh")
        await refreshAccessToken()

        options["authfetchalreadydone"]=true

        return await authFetch(url, options)
    }
    return response
}