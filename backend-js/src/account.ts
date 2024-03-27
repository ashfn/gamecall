import { User } from "@prisma/client";
import { prisma } from "."
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import crypto from "crypto"
import { getBase64Profile } from "./profile/generate";

function createJwt(user: User){
    const secret = process.env.JWT_SECRET
    if(!secret){
        console.error("No JWT secret provided so cancelling JWT creation")
        return null
    }
    return jwt.sign({
        "id":user.id,
        "role":user.role
    }, secret, {expiresIn: '5m'})
}

async function updateRefresh(account: User): Promise<string>{
    const newToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = await bcrypt.hash(newToken, 10)
    await prisma.user.update({
        where: {
            id: account.id
        },
        data: {
            refreshToken: tokenHash
        }
    })
    return newToken+"G"+account.id
}

export async function refreshToken(refreshToken: string){

    console.log(refreshToken)

    if(refreshToken==undefined || refreshToken==null){
        return {
            "status":0,
            "message":"Invalid refresh token"
        }
    }

    if(!refreshToken.includes("G")){
        return {
            "status":0,
            "message":"Invalid refresh token"
        }
    }

    const parts = refreshToken.split("G")

    if(parts.length!=2 || parts[0] == null || parts[1]==""){
        return {
            "status":0,
            "message":"Invalid refresh token"
        }
    }

    const token = refreshToken.split("G")[0]
    const userId = parseInt(refreshToken.split("G")[1])

    const user = await prisma.user.findFirst({
        where: {
            id: userId
        }
    })

    if(user==null){
        return {
            "status":0,
            "message":"Invalid refresh token"
        }
    }

    const match = await bcrypt.compare(token, user.refreshToken)

    if(!match){
        return {
            "status":0,
            "message":"Invalid refresh token"
        }
    }

    const accessToken = createJwt(user)

    return {
        "status":1,
        "data":accessToken
    }

}

export async function register(username: string, email: string, password: string){

    if(username==null || email==null || password==null){
        return {
            "status":0,
            "message":"missing parameter(s)"
        }
    }

    const isValidUsername = /^[a-zA-Z0-9.]{1,10}$/.test(username);
    const isValidEmail = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/.test(email);
    const isValidPassword = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/.test(password);

    if(!isValidUsername){
        return {
            "status":0,
            "message":"Your username must be between 1 and 10 letters, numbers or full stops"
        }
    }

    if(!isValidEmail){
        return {
            "status":0,
            "message":"The entered email is invalid"
        }
    }

    if(!isValidPassword){
        return {
            "status":0,
            "message":"Your password must contain 8 characters and at least one uppercase, one lowercase and one number"
        }
    }

    const checkIdentical = await prisma.user.findFirst({
        where: {
            OR: [
                {username: {
                    equals: username,
                    mode: "insensitive"
                }},
                {email: {
                    equals: email,
                    mode: "insensitive"
                }},
            ]
        }
    })

    const hashedPassword = await bcrypt.hash(password, 10)

    if(checkIdentical!=null){
        if(checkIdentical.email.toUpperCase()==email.toUpperCase()){
            return {
                "status":0,
                "message":"That email has already been used"
            }
        }
        if(checkIdentical.username.toUpperCase()==username.toUpperCase()){
            return {
                "status":0,
                "message":"That username has already been used"
            }
        }

    }

    const user = await prisma.user.create({
        data: {
            username: username,
            email: email,
            password: hashedPassword,
            displayName: username,
            role: "USER",
            profileImage: {
                create: {
                   avatar: Buffer.from(await getBase64Profile(username), 'base64')
                }
            }
        }
    })

    return {
        "status":1
    }
}

export async function login(usernameOrEmail: string, password: string){
    if(usernameOrEmail==null || password==null){
        return {
            "status":0,
            "message":"missing parameter(s)"
        }
    }

    const account = await prisma.user.findFirst({
        where: {
            OR: [
                {username: {
                    equals: usernameOrEmail,
                    mode: "insensitive"
                }},
                {email: {
                    equals: usernameOrEmail,
                    mode: "insensitive"
                }},
            ]
        }
    })

    if(account==null){
        if(usernameOrEmail.includes("@")){
            return {
                "status":0,
                "message":"No account found with that email address"
            }
        }else{
            return {
                "status":0,
                "message":"No account found with that username"
            }  
        }
    }

    const match = await bcrypt.compare(password, account.password)

    if(!match){
        return {
            "status":0,
            "message":"Invalid password"
        }
    }


    const refreshToken = await updateRefresh(account)

    return {
        "status":1,
        "data":refreshToken
    }

}

export async function logout(userId: number){
    await prisma.user.update({
        where: {
            id: userId
        },
        data: {
            refreshToken: "none"
        }
    })

    return {
        "status":1
    }

}