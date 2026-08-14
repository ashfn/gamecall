"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllConnections = exports.createFriendRequest = exports.getFriendRequestsReceived = exports.areUserIdsFriends = exports.getFriends = exports.removeFriendship = exports.createFriendship = exports.areFriends = void 0;
const library_1 = require("@prisma/client/runtime/library");
const __1 = require("..");
const client_1 = require("@prisma/client");
function areFriends(friendship, users) {
    return ((friendship.user1 == users[0] && friendship.user2 == users[1]) || (friendship.user1 == users[1] && friendship.user2 == users[0]));
}
exports.areFriends = areFriends;
function createFriendship(user1, user2) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield __1.prisma.friendship.create({
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
    });
}
exports.createFriendship = createFriendship;
function removeFriendship(user1, user2) {
    return __awaiter(this, void 0, void 0, function* () {
        yield __1.prisma.friendship.deleteMany({
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
    });
}
exports.removeFriendship = removeFriendship;
function getFriends(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const friends = yield __1.prisma.friendship.findMany({
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
    });
}
exports.getFriends = getFriends;
function areUserIdsFriends(userId, targetId) {
    return __awaiter(this, void 0, void 0, function* () {
        const friendship = yield __1.prisma.friendship.findFirst({
            where: {
                OR: [
                    { user1: userId, user2: targetId },
                    { user1: targetId, user2: userId },
                ],
            },
            select: { user1: true },
        });
        return friendship !== null;
    });
}
exports.areUserIdsFriends = areUserIdsFriends;
function getFriendRequestsReceived(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const requests = yield __1.prisma.friendRequest.findMany({
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
    });
}
exports.getFriendRequestsReceived = getFriendRequestsReceived;
function createFriendRequest(from, to) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield __1.prisma.friendRequest.create({
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
    });
}
exports.createFriendRequest = createFriendRequest;
// Gets all users you are:
// - friends with
// - received a request
// - sent a request
function getAllConnections(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const requestsSent = [];
        const requestsReceived = [];
        const friends = [];
        const requests = yield __1.prisma.friendRequest.findMany({
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
        const foundFriends = yield getFriends(userId);
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
    });
}
exports.getAllConnections = getAllConnections;
