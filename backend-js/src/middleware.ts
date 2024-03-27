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
            console.log(err)
            return res.status(499).send()
        }

        res.locals.userId = user.id

        next()
    })
}

export function userDetails(req: Request, res: Response, next: NextFunction){
    if(!res.locals.userId){
        throw new Error("UserDetails middleware used without previous authenticateToken middleware")
    }

    console.log(res.locals.userId)

    prisma.user.findUnique({
        where: {
            id: res.locals.userId
        }
    }).then((first) => {
        if(first==null){
            throw new Error("Supplied userId does not exist in database")
        }

        res.locals.user = first
        next()
    })

}