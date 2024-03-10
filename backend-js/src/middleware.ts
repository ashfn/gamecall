import { NextFunction, Request, Response } from "express";

import jwt from "jsonwebtoken"

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
    console.log(req.body)

    const token = req.header('authorization')

    if (token == null) return res.status(401).send()

    const secret = process.env.JWT_SECRET

    if(!secret){
        console.error("No JWT secret provided so cancelling JWT creation")
        return res.status(403).send()
    }

    jwt.verify(token, secret, (err: any, user: any) => {
        console.log(err)
        if (err) return res.status(403).send()

        res.locals.user = user

        next()
    })
}