import * as SecureStore from 'expo-secure-store'

export async function login(usernameOrEmail, password){
    const response = await fetch("http://192.168.68.111:3000/login", {
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
        await SecureStore.setItemAsync("refreshToken", json.data)
        return ""
    }else{
        return json.data
    }

}

export async function signup(username, email, password){
    const response = await fetch("http://192.168.68.111:3000/account", {
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

export async function refreshAccessToken(){

    const refreshToken = await SecureStore.getItemAsync("refreshToken")

    const response = await fetch("http://192.168.68.111:3000/refresh", {
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
        accessToken = await refreshAccessToken()

        options["authfetchalreadydone"]=true

        return await authFetch(url, options)
    }
    return response
}

// authFetch("http://192.168.68.111:3000/debug", {}).then((res) => {
//     console.log(res.status)
//     console.log("2")
// } )