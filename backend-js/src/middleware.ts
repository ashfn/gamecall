import { NextFunction, Request, Response } from "express";

import jwt from "jsonwebtoken"
import { prisma } from ".";
import { clientError } from "./status";
import { ensureAccountGameUser, GamePrincipal, principalFromAccount, publicGameUser } from "./game/gameIdentity";

const authenticatedUserSelect = {
    id: true,
    username: true,
    email: true,
    role: true,
    displayName: true,
    usernameLastChanged: true,
    accountCreated: true,
    lastOnline: true,
} as const

function databaseUnavailable(res: Response, error: unknown) {
    console.error("Could not load authenticated user", error)
    if (!res.headersSent) {
        return res.status(503).send(clientError("Rainfrog is temporarily busy. Please try again."))
    }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
    const token = req.header('authorization')

    if (token == null) return res.status(499).send()

    const secret = process.env.JWT_SECRET

    if(!secret){
        console.error("No JWT secret provided so cancelling JWT creation")
        return res.status(499).send()
    }

    jwt.verify(token.replace(/^Bearer\s+/i, ""), secret, (err: any, user: any) => {
        if (err){
            return res.status(499).send()
        }

        res.locals.userId = user.id

        next()
    })
}

/** Accepts either a normal Rainfrog account JWT or a restricted anonymous-game JWT. */
export function authenticateGameToken(req: Request, res: Response, next: NextFunction) {
    const token = req.header("authorization");
    const secret = process.env.JWT_SECRET;
    if (!token || !secret) return res.status(499).send();
    try {
        const decoded = jwt.verify(token.replace(/^Bearer\s+/i, ""), secret) as {
            id?: unknown;
            kind?: unknown;
            gameUserId?: unknown;
        };
        if (decoded.kind === "ANONYMOUS") {
            const gameUserId = Number(decoded.gameUserId);
            if (!Number.isInteger(gameUserId) || gameUserId <= 0) return res.status(499).send();
            res.locals.anonymousGameUserId = gameUserId;
            return next();
        }
        const userId = Number(decoded.id);
        if (!Number.isInteger(userId) || userId <= 0) return res.status(499).send();
        res.locals.userId = userId;
        return next();
    } catch {
        return res.status(499).send();
    }
}

export async function gamePrincipalDetails(_req: Request, res: Response, next: NextFunction) {
    try {
        if (res.locals.anonymousGameUserId) {
            const gameUser = await publicGameUser(Number(res.locals.anonymousGameUserId));
            if (!gameUser || !gameUser.anonymous) return res.status(499).send();
            const principal: GamePrincipal = {
                kind: "ANONYMOUS",
                gameUserId: gameUser.id,
                accountUserId: null,
            };
            res.locals.gamePrincipal = principal;
            res.locals.gameUserId = principal.gameUserId;
            return next();
        }
        const accountId = Number(res.locals.userId);
        if (!Number.isInteger(accountId) || accountId <= 0) return res.status(499).send();
        const user = await prisma.user.findUnique({ where: { id: accountId }, select: authenticatedUserSelect });
        if (!user) return res.status(499).send();
        const gameUser = await ensureAccountGameUser(user.id);
        res.locals.user = user;
        res.locals.gameUserId = gameUser.id;
        res.locals.gamePrincipal = principalFromAccount(user, gameUser.id);
        return next();
    } catch (error) {
        return databaseUnavailable(res, error);
    }
}

export async function userDetails(req: Request, res: Response, next: NextFunction){
    if(!res.locals.userId){
        console.error("UserDetails middleware used without previous authenticateToken middleware")
        return res.status(499).send()
    }

    try {
        const first = await prisma.user.findUnique({
            where: {
                id: res.locals.userId
            },
            select: authenticatedUserSelect,
        })
        if(first==null){
            console.error("Supplied userId does not exist in database (Normally this happens when a user's account is deleted but their JWT is still valid")
            return res.status(499).send()
        }

        res.locals.user = first
        next()
    } catch (error) {
        return databaseUnavailable(res, error)
    }

}

export async function userFullContext(req: Request, res: Response, next: NextFunction){
    if(!res.locals.userId){
        console.error("UserDetails middleware used without previous authenticateToken middleware")
        return res.status(499).send()
    }

    try {
        const first = await prisma.user.findUnique({
            where: {
                id: res.locals.userId
            },
            select: {
                ...authenticatedUserSelect,
                requestsReceived: true,
                requestsSent: true
            }
        })
        if(first==null){
            console.error("Supplied userId does not exist in database (Normally this happens when a user's account is deleted but their JWT is still valid")
            return res.status(499).send()
        }

        res.locals.user = first
        next()
    } catch (error) {
        return databaseUnavailable(res, error)
    }

}
