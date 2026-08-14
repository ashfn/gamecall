import { Role, User } from "@prisma/client";
import { prisma } from ".."
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import crypto from "crypto"
import { ENGLISH } from "../language";
import { clientError, success, userError } from "../status";
import { validEmail, validPassword, validUsername } from "./validation";
import { ensureAccountGameUser } from "../game/gameIdentity";

function createJwt(user: Pick<User, "id">){
    const secret = process.env.JWT_SECRET
    if(!secret){
        console.error("No JWT secret provided so cancelling JWT creation")
        return null
    }
    return jwt.sign({
        "id":user.id
    }, secret, { expiresIn: (process.env.JWT_ACCESS_TTL ?? "2h") as jwt.SignOptions["expiresIn"] })
}

const REFRESH_SESSION_ID_BYTES = 16
const REFRESH_SESSION_SECRET_BYTES = 32

function refreshSessionLifetimeMs() {
    const configuredDays = Number(process.env.REFRESH_SESSION_DAYS ?? 56)
    const days = Number.isFinite(configuredDays)
        ? Math.max(7, Math.min(180, Math.floor(configuredDays)))
        : 56
    return days * 24 * 60 * 60 * 1000
}

function refreshSecretHash(secret: string) {
    return crypto.createHash("sha256").update(secret).digest("hex")
}

function parseRefreshSessionToken(value: string) {
    const [id, secret, ...extra] = value.split(".")
    if (extra.length || !/^[a-f0-9]{32}$/i.test(id ?? "") || !/^[a-f0-9]{64}$/i.test(secret ?? "")) return null
    return { id, secret }
}

async function createRefreshSession(account: User): Promise<string>{
    const id = crypto.randomBytes(REFRESH_SESSION_ID_BYTES).toString("hex")
    const secret = crypto.randomBytes(REFRESH_SESSION_SECRET_BYTES).toString("hex")
    const now = new Date()
    await prisma.$transaction([
        prisma.refreshSession.deleteMany({
            where: { userId: account.id, expiresAt: { lte: now } },
        }),
        prisma.refreshSession.create({
            data: {
                id,
                userId: account.id,
                tokenHash: refreshSecretHash(secret),
                expiresAt: new Date(now.getTime() + refreshSessionLifetimeMs()),
            },
        }),
    ])
    return `${id}.${secret}`
}

export async function upgradeLegacyRefreshToken(value: string): Promise<string | null> {
    if(parseRefreshSessionToken(value) || !value.includes("G")) return null
    const parts = value.split("G")
    if(parts.length !== 2 || !parts[0] || !parts[1]) return null
    const userId = Number(parts[1])
    if(!Number.isInteger(userId) || userId <= 0) return null
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if(!user || !(await bcrypt.compare(parts[0], user.refreshToken))) return null
    return createRefreshSession(user)
}

export async function refreshToken(refreshToken: string){

    if(refreshToken==undefined || refreshToken==null){
        return clientError("Invalid refresh token")
    }

    const sessionToken = parseRefreshSessionToken(refreshToken)
    if(sessionToken){
        const now = new Date()
        const session = await prisma.refreshSession.findUnique({
            where: { id: sessionToken.id },
            include: { user: { select: { id: true } } },
        })
        const suppliedHash = refreshSecretHash(sessionToken.secret)
        const validHash = session?.tokenHash.length === suppliedHash.length
            && crypto.timingSafeEqual(Buffer.from(session.tokenHash), Buffer.from(suppliedHash))
        if(!session || session.expiresAt <= now || !validHash){
            if(session?.expiresAt && session.expiresAt <= now) {
                await prisma.refreshSession.delete({ where: { id: session.id } }).catch(() => undefined)
            }
            return clientError("Invalid refresh token")
        }

        await prisma.$transaction([
            prisma.refreshSession.update({
                where: { id: session.id },
                data: {
                    lastUsedAt: now,
                    // Active installations remain signed in; an abandoned
                    // device naturally expires after the configured window.
                    expiresAt: new Date(now.getTime() + refreshSessionLifetimeMs()),
                },
            }),
            prisma.user.update({ where: { id: session.userId }, data: { lastOnline: now } }),
        ])
        return success(createJwt(session.user))
    }

    // Compatibility path for refresh tokens issued by the prototype. A fresh
    // login upgrades the device to an independent multi-device session.
    if(!refreshToken.includes("G")) return clientError("Invalid refresh token")

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

    await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                username: username,
                email: email,
                password: hashedPassword,
                displayName: username,
                role: Role.USER,
                // Avatars are optional in the MVP; the app renders an initial by default.
            }
        })
        await ensureAccountGameUser(user.id, tx)
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

    await ensureAccountGameUser(account.id)


    const refreshToken = await createRefreshSession(account)

    return success(refreshToken)
}

export async function logout(userId: number, refreshToken?: string){
    const sessionToken = refreshToken ? parseRefreshSessionToken(refreshToken) : null
    if(sessionToken){
        await prisma.refreshSession.deleteMany({ where: { id: sessionToken.id, userId } })
    } else {
        // Legacy clients did not send their refresh token on logout.
        await prisma.user.update({ where: { id: userId }, data: { refreshToken: "none" } })
    }

    return success()
}
