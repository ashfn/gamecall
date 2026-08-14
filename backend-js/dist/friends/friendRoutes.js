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
exports.getConnectionsRoute = exports.getFriendRequestsRoute = exports.removeFriendRoute = exports.acceptFriendRequestRoute = exports.denyFriendRequestRoute = exports.addFriendRequestRoute = void 0;
const __1 = require("..");
const client_1 = require("@prisma/client");
const status_1 = require("../status");
const friends_1 = require("./friends");
const pushNotifications_1 = require("../notifications/pushNotifications");
function addFriendRequestRoute(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = res.locals.user;
        const target = parseInt(req.params.userId, 10);
        if (Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)) {
            return res.send(JSON.stringify((0, status_1.clientError)("Invalid userId")));
        }
        // If they have already sent a friend request to that user
        let friendRequest = null;
        for (let x = 0; x < user.requestsSent.length; x++) {
            const request = user.requestsSent[x];
            if (request.requestDestinationId == target) {
                friendRequest = request;
                break;
            }
        }
        // rejected friend requests will get cleaned up by some cron job every few hours, but the users will not be notified
        // that their requests were rejected
        // accepted friend requests will immediately be deleted
        if (friendRequest) {
            return res.send(JSON.stringify((0, status_1.userError)("You already have sent a friend request to this user")));
        }
        // If they already friends with that user
        const friends = yield (0, friends_1.getFriends)(user.id);
        let friendship = null;
        for (let x = 0; x < friends.length; x++) {
            const friend = friends[x];
            if ((0, friends_1.areFriends)(friend, [user.id, target])) {
                friendship = friend;
                break;
            }
        }
        if (friendship) {
            return res.send(JSON.stringify((0, status_1.userError)("You are already friends with this user")));
        }
        const request = yield (0, friends_1.createFriendRequest)(user.id, target);
        if (request != null) {
            void (0, pushNotifications_1.notifyFriendRequest)(user.id, target);
            return res.send(JSON.stringify((0, status_1.success)()));
        }
        else {
            return res.send(JSON.stringify((0, status_1.clientError)("Couldn't process request. Try again later.")));
        }
    });
}
exports.addFriendRequestRoute = addFriendRequestRoute;
function denyFriendRequestRoute(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = res.locals.user;
        const target = parseInt(req.params.userId, 10);
        if (Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)) {
            return res.send(JSON.stringify((0, status_1.clientError)("Invalid userId")));
        }
        // check that the friend request exists
        const request = yield __1.prisma.friendRequest.findFirst({
            where: {
                requestDestinationId: user.id,
                requestOriginId: target
            }
        });
        if (request == null) {
            return res.send(JSON.stringify((0, status_1.clientError)("Friend request does not exist")));
        }
        if (request.status == client_1.FriendRequestStatus.ACCEPTED) {
            return res.send(JSON.stringify((0, status_1.userError)("You have already accepted this friend request")));
        }
        if (request.status == client_1.FriendRequestStatus.REJECTED) {
            return res.send(JSON.stringify((0, status_1.userError)("You have already rejected this friend request")));
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
        yield __1.prisma.friendRequest.delete({
            where: {
                requestOriginId_requestDestinationId: {
                    requestDestinationId: user.id,
                    requestOriginId: target
                }
            }
        });
        return res.send(JSON.stringify((0, status_1.success)()));
    });
}
exports.denyFriendRequestRoute = denyFriendRequestRoute;
function acceptFriendRequestRoute(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = res.locals.user;
        const target = parseInt(req.params.userId, 10);
        if (Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)) {
            return res.send(JSON.stringify((0, status_1.clientError)("Invalid userId")));
        }
        // check that the friend request exists
        const request = yield __1.prisma.friendRequest.findFirst({
            where: {
                requestDestinationId: user.id,
                requestOriginId: target
            }
        });
        if (request == null) {
            return res.send(JSON.stringify((0, status_1.clientError)("Friend request does not exist")));
        }
        if (request.status == client_1.FriendRequestStatus.ACCEPTED) {
            return res.send(JSON.stringify((0, status_1.userError)("You have already accepted this friend request")));
        }
        if (request.status == client_1.FriendRequestStatus.REJECTED) {
            return res.send(JSON.stringify((0, status_1.userError)("You have already rejected this friend request")));
        }
        yield __1.prisma.friendRequest.delete({
            where: {
                requestOriginId_requestDestinationId: {
                    requestDestinationId: user.id,
                    requestOriginId: target
                }
            }
        });
        yield __1.prisma.friendship.create({
            data: {
                user1: user.id,
                user2: target
            }
        });
        return res.send(JSON.stringify((0, status_1.success)()));
    });
}
exports.acceptFriendRequestRoute = acceptFriendRequestRoute;
function removeFriendRoute(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = res.locals.user;
        const target = parseInt(req.params.userId, 10);
        if (Number.isNaN(Number(req.params.userId)) || Number.isNaN(target)) {
            return res.send(JSON.stringify((0, status_1.clientError)("Invalid userId")));
        }
        const friendship = yield __1.prisma.friendship.findFirst({
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
        });
        if (friendship == null) {
            return res.send(JSON.stringify((0, status_1.clientError)("You are already not friends with this user")));
        }
        // set any games to CANCELLED
        yield __1.prisma.game.updateMany({
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
                status: client_1.GameStatus.CANCELLED
            }
        });
        // delete the friendship
        yield __1.prisma.friendship.delete({
            where: {
                user1_user2: {
                    user1: friendship.user1,
                    user2: friendship.user2
                }
            }
        });
        // delete any requests
        yield __1.prisma.friendRequest.deleteMany({
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
        });
        return res.send(JSON.stringify((0, status_1.success)()));
    });
}
exports.removeFriendRoute = removeFriendRoute;
function getFriendRequestsRoute(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = res.locals.user;
        const requests = yield (0, friends_1.getFriendRequestsReceived)(user.id);
        return res.send(JSON.stringify((0, status_1.success)(requests)));
    });
}
exports.getFriendRequestsRoute = getFriendRequestsRoute;
function getConnectionsRoute(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const requestUser = res.locals.user;
        const connections = yield (0, friends_1.getAllConnections)(requestUser.id);
        if (req.query.profiles === "1" && connections.friends.length) {
            const friendProfiles = yield __1.prisma.user.findMany({
                where: { id: { in: connections.friends } },
                select: { id: true, username: true, displayName: true, accountCreated: true },
            });
            return res.send((0, status_1.success)(Object.assign(Object.assign({}, connections), { friendProfiles })));
        }
        return res.send((0, status_1.success)(connections));
    });
}
exports.getConnectionsRoute = getConnectionsRoute;
