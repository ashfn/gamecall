import { Role, User } from "@prisma/client";
import { prisma } from ".."
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import crypto from "crypto"
import { getBase64Profile } from "../profile/generate";
import { ENGLISH } from "../language";
import { clientError, success, userError } from "../status";
import { validEmail, validPassword, validUsername } from "./validation";

function createJwt(user: User){
    const secret = process.env.JWT_SECRET
    if(!secret){
        console.error("No JWT secret provided so cancelling JWT creation")
        return null
    }
    return jwt.sign({
        "id":user.id,
        "role":user.role
    }, secret, {expiresIn: '1m'})
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
        return clientError("Invalid refresh token")
    }

    if(!refreshToken.includes("G")){
        return clientError("Invalid refresh token")
    }

    const parts = refreshToken.split("G")

    if(parts.length!=2 || parts[0] == null || parts[1]==""){
        return clientError("Invalid refresh token")
    }

    const token = refreshToken.split("G")[0]
    const userId = parseInt(refreshToken.split("G")[1])

    const user = await prisma.user.findFirst({
        where: {
            id: userId
        }
    })

    if(user==null){
        return clientError("Invalid refresh token")
    }

    const match = await bcrypt.compare(token, user.refreshToken)

    if(!match){
        return clientError("Invalid refresh token")
    }

    await prisma.user.update({
        where: {
            id: user.id
        },
        data: {
            lastOnline: new Date()
        }
    })

    console.log(`Refreshed token for ${user.id}`)

    const accessToken = createJwt(user)

    return success(accessToken)

}

export async function register(username: string, email: string, password: string){

    if(username==null || email==null || password==null){
        return clientError("Missing parameters")
    }

    const isValidUsername = validUsername(username);
    const isValidEmail = validEmail(email)
    const isValidPassword = validPassword(password)

    if(!isValidUsername){
        return userError(ENGLISH.USERNAME_REQUREMENTS)
    }

    if(!isValidEmail){
        return userError(ENGLISH.INVALID_EMAIL)
    }

    if(!isValidPassword){
        return userError(ENGLISH.PASSWORD_REQUIREMENTS)
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
            return userError(ENGLISH.EMAIL_TAKEN)
        }
        if(checkIdentical.username.toUpperCase()==username.toUpperCase()){
            return userError(ENGLISH.USERNAME_TAKEN)
        }

    }

    const user = await prisma.user.create({
        data: {
            username: username,
            email: email,
            password: hashedPassword,
            displayName: username,
            role: Role.USER,
            profileImage: {
                create: {
                   avatar: Buffer.from(await getBase64Profile(username), 'base64')
                }
            }
        }
    })

    return success()
}

export async function login(usernameOrEmail: string, password: string){
    if(usernameOrEmail==null || password==null){
        return clientError("Missing parameters")
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
            return userError(ENGLISH.NO_ACCOUNT_WITH_EMAIL)
        }else{
            return userError(ENGLISH.NO_ACCOUNT_WITH_USERNAME)
        }
    }

    const match = await bcrypt.compare(password, account.password)

    if(!match){
        return userError(ENGLISH.INCORRECT_PASSWORD)
    }


    const refreshToken = await updateRefresh(account)

    return success(refreshToken)
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

    return success()
}