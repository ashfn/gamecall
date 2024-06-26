import { Role, User } from "@prisma/client";
import { authenticateToken } from "../middleware"
import { getAvatar, getProfile, searchProfiles, setAvatar, setDisplayName, setUsername } from "./profile"
import { Request, Response } from 'express';
import { prisma } from "..";
import { getTimeEpoch } from "../util";
import { ActionStatus, clientError, getResultString, success, userError } from "../status";
import { validDisplayName, validUsername } from "../account/validation";
import { ENGLISH } from "../language";
import { getAllConnections } from "../friends/friends";


export function getAvatarRoute(req: Request, res: Response){

    console.log(`Avatar requested`)

    const target = parseInt(req.params.userId, 10)
    if(Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)){
        return res.send(JSON.stringify(clientError("Invalid userId")))
    }
    getAvatar(parseInt(req.params.userId)).then((response) => {
        if(response.status==ActionStatus.SUCCESS){
            res.set('Content-Type', 'image/png');
            res.send(Buffer.from(response.data.avatar));
        }else{
            return res.send(JSON.stringify(response))
        }
    })
}

export function setAvatarRoute(req: Request, res: Response){
    const user:User = res.locals.user
    const target = parseInt(req.params.userId, 10)

    if(Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)){
        return res.send(JSON.stringify(clientError("Invalid userId")))
    }

    // Avatar must be added as JSON Body
    if(!req.body.avatar){
        return res.send(JSON.stringify(clientError("Avatar not present in request body")))
    }

    // Target user id must be valid
    if(target==undefined) return res.send(JSON.stringify(clientError("Invalid userId")))

    if(user.id!=target && user.role!=Role.ADMIN){
        return res.send(JSON.stringify(clientError("You do not have access to that resource")))
    }

    setAvatar(target, Buffer.from(req.body.avatar, "base64")).then(() => {
        return res.send(JSON.stringify(success()))
    })
}

export function setUsernameRoute(req: Request, res: Response){
    const requestUser:User = res.locals.user
    const target = parseInt(req.params.userId)

    if(Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)){
        return res.send(JSON.stringify(clientError("Invalid userId")))
    }

    // Username must be added as JSON Body
    if(!req.body.username){
        return res.send(JSON.stringify(clientError("Username not present in request body")))
    }

    // Target user id must be valid
    if(target==undefined) return res.send(JSON.stringify(clientError("Invalid userID")))

    // If they are editing their own avatar
    if(requestUser.id!=target && requestUser.role!=Role.ADMIN){
        return res.send(JSON.stringify(clientError("You do not have access to that resource")))
    }

    if(!validUsername(req.body.username)){
        return res.send(JSON.stringify(userError(ENGLISH.USERNAME_REQUREMENTS)))
    }

    prisma.user.findFirst({
        where: {
            username: req.body.username
        }
    }).then((searchUser) => {

        if(searchUser!=null){
            return res.send(JSON.stringify(userError(ENGLISH.USERNAME_TAKEN)))
        }

        prisma.user.findFirst({
            where: {
                id: target
            }
        }).then((user) => {
            if(user==null){
                return res.send(JSON.stringify(clientError("User not found")))
            }
    
            if((user.usernameLastChanged+86400)<getTimeEpoch()){
                setUsername(target, req.body.username).then(() => {
                    res.send(JSON.stringify(success()))
                })
            }else{
                return res.send(JSON.stringify(userError(ENGLISH.USERNAME_CHANGE_COOLDOWN)))
            }
        })
    })


}

export function setDisplayNameRoute(req: Request, res: Response){
    const requestUser:User = res.locals.user
    const target = parseInt(req.params.userId)

    if(Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)){
        return res.send(JSON.stringify(clientError("Invalid userId")))
    }

    // Displayname must be added as JSON Body
    if(!req.body.displayname){
        return res.send(JSON.stringify(clientError("Display name not present in request body")))
    }

    // Target user id must be valid
    if(target==undefined) return res.send(JSON.stringify(clientError("Invalid userID")))

    // If they are editing their own avatar
    if(requestUser.id!=target && requestUser.role!=Role.ADMIN){
        return res.send(JSON.stringify(clientError("You do not have access to that resource")))
    }

    if(req.body.displayname=="unallowed"){
        return res.send(JSON.stringify(userError("unallowed")))
    }

    if(!validDisplayName(req.body.displayname)){
        return res.send(JSON.stringify(userError(ENGLISH.DISPLAYNAME_REQUIREMENTS)))
    }

    setDisplayName(target, req.body.displayname).then(() => {
        return res.send(JSON.stringify(success()))
    })
}

export function getProfileRoute(req: Request, res: Response){

    const target = parseInt(req.params.userId)

    if(Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)){
        return res.send(JSON.stringify(clientError("Invalid userId")))
    }

    getProfile(target).then((searchResults) => {
        res.send(JSON.stringify(success(searchResults)))
    })

}

export function searchProfilesRoute(req: Request, res: Response){

    if(!req.body.search){
        return res.send(JSON.stringify(clientError("Search Query not present")))
    }


    searchProfiles(req.body.search).then((searchResults) => {
        res.send(JSON.stringify(success(searchResults)))
    })

}