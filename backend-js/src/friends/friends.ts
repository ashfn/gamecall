import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { prisma } from "..";
import { FriendRequest, FriendRequestStatus, Friendship } from "@prisma/client";

export function areFriends(friendship: Friendship, users: number[]){
    return ((friendship.user1==users[0] && friendship.user2==users[1]) ||(friendship.user1==users[1] && friendship.user2==users[0]))
}

export async function createFriendship(user1: number, user2: number){
    try{
        return await prisma.friendship.create({
            data: {
                user1: user1,
                user2: user2
            }
        })
    } catch(err){
        if(!(err instanceof PrismaClientKnownRequestError)){
            console.error(err)
        }
        return null
    }
}

export async function removeFriendship(user1: number, user2: number){
    await prisma.friendship.deleteMany({
        where: {
            OR: [
                {
                    user1: user1,
                    user2: user2
                },
                {
                    user1: user2,
                    user2: user1
                }
            ]
        }
    })
}

export async function getFriends(userId: number){
    const friends = await prisma.friendship.findMany({
        where: {
            OR: [
                {
                    user1: userId
                },
                {
                    user2: userId
                }
            ]
        }
    })

    return friends
}

export async function getFriendRequestsReceived(userId: number){
    const requests = await prisma.friendRequest.findMany({
        where: {
            AND: {
                requestDestinationId: userId,
                status: FriendRequestStatus.PENDING
            }
        },
        include: {
            requestOrigin: {
                select: {
                    displayName: true,
                    username: true
                }
            }
        }
    })

    return requests
}

export async function createFriendRequest(from: number, to: number){
    try{
        return await prisma.friendRequest.create({
            data: {
                requestOrigin: {
                    connect: {
                        id: from
                    }
                },
                requestDestination:{
                    connect: {
                        id: to
                    }
                }
            }
        })
    } catch(err){
        if(!(err instanceof PrismaClientKnownRequestError)){
            console.error(err)
        }
        return null
    }

}

// Gets all users you are:
// - friends with
// - received a request
// - sent a request
export async function getAllConnections(userId: number){

    interface Relation {
        id: number,
        status: string
    }

    // store relations
    const relations: Relation[] = []

    async function getRelationsAndProcess(){

        const requests = await prisma.friendRequest.findMany({
            where: {
                OR: [
                    {
                        requestDestinationId: userId,
                        status: FriendRequestStatus.PENDING
                    },
                    {
                        requestOriginId: userId,
                        status: FriendRequestStatus.PENDING
                    }
                ]
            }
        })

        requests.forEach((reqeust) => {
            if(reqeust.requestOriginId==userId){
                relations.push({
                    id: reqeust.requestDestinationId,
                    status: "REQUEST_SENT"
                })
            }else if(reqeust.requestDestinationId==userId){
                relations.push({
                    id: reqeust.requestOriginId,
                    status: "REQUEST_RECEIVED"
                })
            }
        })
    }
    
    async function getFriendsAndProcess(){
        const friends = await getFriends(userId)
        friends.forEach((friend) => {
            if(friend.user1==userId){
                relations.push({
                    id: friend.user2,
                    status: "FRIEND"
                })
            }

            if(friend.user2==userId){
                relations.push({
                    id: friend.user1,
                    status: "FRIEND"
                })
            }
        })
    }

    await Promise.all([getRelationsAndProcess(), getFriendsAndProcess()])

    return relations
}