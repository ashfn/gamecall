import AsyncStorage from '@react-native-async-storage/async-storage';


import { prefix } from "./config"
import { router } from 'expo-router'

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
    await AsyncStorage.removeItem("accessToken")
    await AsyncStorage.removeItem("refreshToken")
    await AsyncStorage.removeItem("account-details")

    if(clearRefreshToken){
        await fetch(`${prefix}/logout`)
    }
}

export async function refreshAccessToken(){

    const refreshToken = await AsyncStorage.getItem("refreshToken")

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
            console.log("Already tried once...")
            logout(true)
            if(router!=null){
                router.replace("/")
            }
            throw new Error("Refresh token invalid, could not refresh access token")
        }
        console.log("Token expired :( Trying to refresh")
        try{
            await refreshAccessToken()
                
            options["authfetchalreadydone"]=true

            return await authFetch(url, options)
        } catch(err) {
            console.log("Encountered error refreshing token")
            throw new Error("Refresh token invalid, could not refresh access token")
        }


    }
    return response
}