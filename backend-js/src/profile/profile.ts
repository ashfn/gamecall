import { prisma } from ".."
import { clientError, success } from "../status"
import { getTimeEpoch } from "../util"

export async function getAvatar(userId: number){
    const avatar = await prisma.profileImage.findFirst({
        where: {
            userId: userId
        }
    })

    if(avatar==null){
        return clientError("User not found")
    }
    
    return success(avatar)
}

export async function getProfile(userId: number){

    const userProfile = await prisma.user.findFirst({
        where: {
            id: userId
        },
        select: {
            username: true,
            displayName: true,
            accountCreated: true
        }
    })

    return userProfile
}

/**
 * avatar should be in bytes
 */
export async function setAvatar(userId: number, avatar: Buffer){
    await prisma.profileImage.update({
        where: {
            userId: userId
        },
        data: {
            avatar: avatar
        }
    })
}

export async function setUsername(userId: number, username: string, updateCooldown: boolean = true){
    if(updateCooldown){
        await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                username: username,
                usernameLastChanged: getTimeEpoch()
            }
        })
    }else{
        await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                username: username
            }
        })
    }

}

export async function setDisplayName(userId: number, displayName: string){
    await prisma.user.update({
        where: {
            id: userId
        },
        data: {
            displayName: displayName
        }
    })
}

export async function searchProfiles(search: string){

    search = search.replace(/[^\p{L}\p{N}]+/gu, '');

    console.log(`Searching for profiles with query ${search}`)

    const profiles = await prisma.user.findMany({
        take: 10,
        where: {
            OR: [
                { username: { contains: search }},
                { displayName: { contains: search }}
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
    })

    return profiles
}