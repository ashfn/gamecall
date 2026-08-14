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
exports.searchProfiles = exports.setDisplayName = exports.setUsername = exports.setAvatar = exports.getProfile = exports.getAvatar = void 0;
const __1 = require("..");
const status_1 = require("../status");
const util_1 = require("../util");
function getAvatar(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const avatar = yield __1.prisma.profileImage.findFirst({
            where: {
                userId: userId
            }
        });
        if (avatar == null) {
            return (0, status_1.clientError)("User not found");
        }
        return (0, status_1.success)(avatar);
    });
}
exports.getAvatar = getAvatar;
function getProfile(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const userProfile = yield __1.prisma.user.findFirst({
            where: {
                id: userId
            },
            select: {
                username: true,
                displayName: true,
                accountCreated: true,
                id: true
            }
        });
        return userProfile;
    });
}
exports.getProfile = getProfile;
/**
 * avatar should be in bytes
 */
function setAvatar(userId, avatar) {
    return __awaiter(this, void 0, void 0, function* () {
        yield __1.prisma.profileImage.upsert({
            where: {
                userId: userId
            },
            update: {
                avatar: avatar
            },
            create: {
                userId: userId,
                avatar: avatar
            }
        });
    });
}
exports.setAvatar = setAvatar;
function setUsername(userId_1, username_1) {
    return __awaiter(this, arguments, void 0, function* (userId, username, updateCooldown = true) {
        if (updateCooldown) {
            yield __1.prisma.user.update({
                where: {
                    id: userId
                },
                data: {
                    username: username,
                    usernameLastChanged: (0, util_1.getTimeEpoch)()
                }
            });
        }
        else {
            yield __1.prisma.user.update({
                where: {
                    id: userId
                },
                data: {
                    username: username
                }
            });
        }
    });
}
exports.setUsername = setUsername;
function setDisplayName(userId, displayName) {
    return __awaiter(this, void 0, void 0, function* () {
        yield __1.prisma.user.update({
            where: {
                id: userId
            },
            data: {
                displayName: displayName
            }
        });
    });
}
exports.setDisplayName = setDisplayName;
function searchProfiles(search) {
    return __awaiter(this, void 0, void 0, function* () {
        search = search.replace(/[^\p{L}\p{N}]+/gu, '');
        console.log(`Searching for profiles with query ${search}`);
        const profiles = yield __1.prisma.user.findMany({
            take: 10,
            where: {
                OR: [
                    { username: {
                            contains: search,
                            mode: 'insensitive'
                        } },
                    { displayName: {
                            contains: search,
                            mode: 'insensitive'
                        } }
                ]
            },
            select: {
                username: true,
                displayName: true,
                id: true
            },
            orderBy: {
                _relevance: {
                    fields: ['username', 'displayName'],
                    search: 'database',
                    sort: 'asc'
                },
            }
        });
        return profiles;
    });
}
exports.searchProfiles = searchProfiles;
