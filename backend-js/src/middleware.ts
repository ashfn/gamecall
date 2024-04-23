import { NextFunction, Request, Response } from "express";

import jwt from "jsonwebtoken"
import { prisma } from ".";

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
    const token = req.header('authorization')

    if (token == null) return res.status(499).send()

    const secret = process.env.JWT_SECRET

    if(!secret){
        console.error("No JWT secret provided so cancelling JWT creation")
        return res.status(499).send()
    }

    jwt.verify(token, secret, (err: any, user: any) => {
        if (err){
            return res.status(499).send()
        }

        res.locals.userId = user.id

        next()
    })
}

export function userDetails(req: Request, res: Response, next: NextFunction){
    if(!res.locals.userId){
        console.error("UserDetails middleware used without previous authenticateToken middleware")
        return res.status(499).send()
    }

    prisma.user.findUnique({
        where: {
            id: res.locals.userId
        }
    }).then((first) => {
        if(first==null){
            console.error("Supplied userId does not exist in database (Normally this happens when a user's account is deleted but their JWT is still valid")
            return res.status(499).send()
        }

        res.locals.user = first
        next()
    })

}

export function userFullContext(req: Request, res: Response, next: NextFunction){
    if(!res.locals.userId){
        console.error("UserDetails middleware used without previous authenticateToken middleware")
        return res.status(499).send()
    }

    prisma.user.findUnique({
        where: {
            id: res.locals.userId
        },
        include: {
            requestsReceived: true,
            requestsSent: true
        }
    }).then((first) => {
        if(first==null){
            console.error("Supplied userId does not exist in database (Normally this happens when a user's account is deleted but their JWT is still valid")
            return res.status(499).send()
        }

        res.locals.user = first
        next()
    })

}