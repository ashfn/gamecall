"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchProfiles = exports.setDisplayName = exports.setUsername = exports.setAvatar = exports.getProfile = exports.getAvatar = void 0;
const __1 = require("..");
const status_1 = require("../status");
const util_1 = require("../util");
async function getAvatar(userId) {
    const avatar = await __1.prisma.profileImage.findFirst({
        where: {
            userId: userId
        }
    });
    if (avatar == null) {
        return (0, status_1.clientError)("User not found");
    }
    return (0, status_1.success)(avatar);
}
exports.getAvatar = getAvatar;
async function getProfile(userId) {
    const userProfile = await __1.prisma.user.findFirst({
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
}
exports.getProfile = getProfile;
/**
 * avatar should be in bytes
 */
async function setAvatar(userId, avatar) {
    await __1.prisma.profileImage.upsert({
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
}
exports.setAvatar = setAvatar;
async function setUsername(userId, username, updateCooldown = true) {
    if (updateCooldown) {
        await __1.prisma.user.update({
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
        await __1.prisma.user.update({
            where: {
                id: userId
            },
            data: {
                username: username
            }
        });
    }
}
exports.setUsername = setUsername;
async function setDisplayName(userId, displayName) {
    await __1.prisma.user.update({
        where: {
            id: userId
        },
        data: {
            displayName: displayName
        }
    });
}
exports.setDisplayName = setDisplayName;
async function searchProfiles(search) {
    search = search.replace(/[^\p{L}\p{N}]+/gu, '');
    console.log(`Searching for profiles with query ${search}`);
    const profiles = await __1.prisma.user.findMany({
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
}
exports.searchProfiles = searchProfiles;
