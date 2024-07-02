import { Request, Response } from "express";
import { prisma } from "..";
import { FriendRequest, FriendRequestStatus, Friendship, GameStatus, User } from "@prisma/client";
import { clientError, success, userError } from "../status";
import { areFriends, createFriendRequest, createFriendship, getAllConnections, getFriendRequestsReceived, getFriends } from "./friends";

export async function addFriendRequestRoute(req: Request, res: Response){
    const user = res.locals.user
    const target = parseInt(req.params.userId, 10)

    if(Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)){
        return res.send(JSON.stringify(clientError("Invalid userId")))
    }

    // If they have already sent a friend request to that user
    let friendRequest:FriendRequest|null = null
    for(let x=0; x<user.requestsSent.length; x++){
        const request = user.requestsSent[x]
        if(request.requestDestinationId==target){
            friendRequest = request
            break
        }
    }

    // rejected friend requests will get cleaned up by some cron job every few hours, but the users will not be notified
    // that their requests were rejected
    // accepted friend requests will immediately be deleted
    if(friendRequest){
        return res.send(JSON.stringify(userError("You already have sent a friend request to this user")))
    }

    // If they already friends with that user
    const friends = await getFriends(user.id)
    let friendship:Friendship|null = null
    for(let x=0; x<friends.length; x++){
        const friend = friends[x]
        if(areFriends(friend, [user.id, target])){
            friendship = friend
            break
        }
    }

    if(friendship){
        return res.send(JSON.stringify(userError("You are already friends with this user")))
    }

    const request = await createFriendRequest(user.id, target)

    if(request!=null){
        return res.send(JSON.stringify(success()))
    }else{
        return res.send(JSON.stringify(clientError("Couldn't process request. Try again later.")))
    }
}

export async function denyFriendRequestRoute(req: Request, res: Response){
    const user = res.locals.user
    const target = parseInt(req.params.userId, 10)

    if(Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)){
        return res.send(JSON.stringify(clientError("Invalid userId")))
    }

    // check that the friend request exists
    const request = await prisma.friendRequest.findFirst({
        where: {
            requestDestinationId: user.id,
            requestOriginId: target
        }
    })

    if(request==null){
        return res.send(JSON.stringify(clientError("Friend request does not exist")))
    }

    if(request.status==FriendRequestStatus.ACCEPTED){
        return res.send(JSON.stringify(userError("You have already accepted this friend request")))
    }

    if(request.status==FriendRequestStatus.REJECTED){
        return res.send(JSON.stringify(userError("You have already rejected this friend request")))
    }

    // Update the status, it will be auto removed by the system
    // this is to prevent someone spamming requests at someone that 
    // keeps rejecting them.
    // await prisma.friendRequest.update({
    //     where: {
    //         requestOriginId_requestDestinationId: {
    //             requestDestinationId: user.id,
    //             requestOriginId: target
    //         }
    //     },
    //     data: {
    //         status: FriendRequestStatus.REJECTED
    //     }
    // })

    // screw that let's just delete it
    // and if spamming requests becomes a problem i'll fix it in the future

    await prisma.friendRequest.delete({
        where: {
            requestOriginId_requestDestinationId: {
                requestDestinationId: user.id,
                requestOriginId: target
            }
        }
    })

    return res.send(JSON.stringify(success()))

}

export async function acceptFriendRequestRoute(req: Request, res: Response){
    const user = res.locals.user
    const target = parseInt(req.params.userId, 10)

    if(Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)){
        return res.send(JSON.stringify(clientError("Invalid userId")))
    }

    // check that the friend request exists
    const request = await prisma.friendRequest.findFirst({
        where: {
            requestDestinationId: user.id,
            requestOriginId: target
        }
    })

    if(request==null){
        return res.send(JSON.stringify(clientError("Friend request does not exist")))
    }

    if(request.status==FriendRequestStatus.ACCEPTED){
        return res.send(JSON.stringify(userError("You have already accepted this friend request")))
    }

    if(request.status==FriendRequestStatus.REJECTED){
        return res.send(JSON.stringify(userError("You have already rejected this friend request")))
    }

    await prisma.friendRequest.delete({
        where: {
            requestOriginId_requestDestinationId: {
                requestDestinationId: user.id,
                requestOriginId: target
            }
        }
    })

    await prisma.friendship.create({
        data: {
            user1: user.id,
            user2: target
        }
    })

    return res.send(JSON.stringify(success()))

}

export async function removeFriendRoute(req: Request, res: Response){
    const user = res.locals.user
    const target = parseInt(req.params.userId, 10)

    if(Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)){
        return res.send(JSON.stringify(clientError("Invalid userId")))
    }

    const friendship = await prisma.friendship.findFirst({
        where: {
            OR: [
                {
                    user1: user.id,
                    user2: target
                },
                {
                    user1: target,
                    user2: user.id
                }
            ]
        }
    })

    if(friendship==null){
        return res.send(JSON.stringify(clientError("You are already not friends with this user")))
    }

    // set any games to CANCELLED
    await prisma.game.updateMany({
        where: {
            OR: [
                {
                    player1: user.id,
                    player2: target
                },
                {
                    player1: target,
                    player2: user.id
                }
            ]
        },
        data: {
            status: GameStatus.CANCELLED
        }
    })

    // delete the friendship
    await prisma.friendship.delete({
        where: {
            user1_user2: {
                user1: friendship.user1,
                user2: friendship.user2
            }
        }
    })

    // delete any requests
    await prisma.friendRequest.deleteMany({
        where: {
            OR: [
                {
                    requestDestinationId: user.id,
                    requestOriginId: target
                },
                {
                    requestDestinationId: target,
                    requestOriginId: user.id
                }
            ]
        }
    })

    return res.send(JSON.stringify(success()))
}

export async function getFriendRequestsRoute(req: Request, res: Response){
    const user = res.locals.user

    const requests = await getFriendRequestsReceived(user.id)


    return res.send(JSON.stringify(success(requests)))

}

export function getConnectionsRoute(req: Request, res: Response){
    const requestUser:User = res.locals.user

    getAllConnections(requestUser.id).then((connections) => {
        return res.send(success(connections))
    })

}
