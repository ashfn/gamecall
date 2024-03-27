import { prisma } from ".."

export async function getAvatar(userId: number){
    const avatar = await prisma.profileImage.findFirst({
        where: {
            userId: userId
        }
    })

    if(avatar==null){
        return {
            "status":0,
            "message":"User not found"
        }
    }

    return {
        "status":1,
        "data":avatar
    }
}