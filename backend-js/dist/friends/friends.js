"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllConnections = exports.createFriendRequest = exports.getFriendRequestsReceived = exports.areUserIdsFriends = exports.getFriends = exports.removeFriendship = exports.createFriendship = exports.areFriends = void 0;
const library_1 = require("@prisma/client/runtime/library");
const __1 = require("..");
const client_1 = require("@prisma/client");
function areFriends(friendship, users) {
    return ((friendship.user1 == users[0] && friendship.user2 == users[1]) || (friendship.user1 == users[1] && friendship.user2 == users[0]));
}
exports.areFriends = areFriends;
async function createFriendship(user1, user2) {
    try {
        return await __1.prisma.friendship.create({
            data: {
                user1: user1,
                user2: user2
            }
        });
    }
    catch (err) {
        if (!(err instanceof library_1.PrismaClientKnownRequestError)) {
            console.error(err);
        }
        return null;
    }
}
exports.createFriendship = createFriendship;
async function removeFriendship(user1, user2) {
    await __1.prisma.friendship.deleteMany({
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
    });
}
exports.removeFriendship = removeFriendship;
async function getFriends(userId) {
    const friends = await __1.prisma.friendship.findMany({
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
    });
    return friends;
}
exports.getFriends = getFriends;
async function areUserIdsFriends(userId, targetId) {
    const friendship = await __1.prisma.friendship.findFirst({
        where: {
            OR: [
                { user1: userId, user2: targetId },
                { user1: targetId, user2: userId },
            ],
        },
        select: { user1: true },
    });
    return friendship !== null;
}
exports.areUserIdsFriends = areUserIdsFriends;
async function getFriendRequestsReceived(userId) {
    const requests = await __1.prisma.friendRequest.findMany({
        where: {
            AND: {
                requestDestinationId: userId,
                status: client_1.FriendRequestStatus.PENDING
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
    });
    return requests;
}
exports.getFriendRequestsReceived = getFriendRequestsReceived;
async function createFriendRequest(from, to) {
    try {
        return await __1.prisma.friendRequest.create({
            data: {
                requestOrigin: {
                    connect: {
                        id: from
                    }
                },
                requestDestination: {
                    connect: {
                        id: to
                    }
                }
            }
        });
    }
    catch (err) {
        if (!(err instanceof library_1.PrismaClientKnownRequestError)) {
            console.error(err);
        }
        return null;
    }
}
exports.createFriendRequest = createFriendRequest;
// Gets all users you are:
// - friends with
// - received a request
// - sent a request
async function getAllConnections(userId) {
    const requestsSent = [];
    const requestsReceived = [];
    const friends = [];
    const requests = await __1.prisma.friendRequest.findMany({
        where: {
            OR: [
                {
                    requestDestinationId: userId,
                    status: client_1.FriendRequestStatus.PENDING
                },
                {
                    requestOriginId: userId,
                    status: client_1.FriendRequestStatus.PENDING
                }
            ]
        }
    });
    requests.forEach((reqeust) => {
        if (reqeust.requestOriginId == userId) {
            requestsSent.push(reqeust.requestDestinationId);
        }
        else if (reqeust.requestDestinationId == userId) {
            requestsReceived.push(reqeust.requestOriginId);
        }
    });
    const foundFriends = await getFriends(userId);
    foundFriends.forEach((friend) => {
        if (friend.user1 == userId) {
            friends.push(friend.user2);
        }
        if (friend.user2 == userId) {
            friends.push(friend.user1);
        }
    });
    return {
        friends: friends,
        requestsSent: requestsSent,
        requestsReceived: requestsReceived
    };
}
exports.getAllConnections = getAllConnections;
