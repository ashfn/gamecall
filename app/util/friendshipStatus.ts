// Friendship status must be one of:
// FRIEND, REQUEST_SENT, REQUEST_RECEIVED, NONE

import AsyncStorage from "@react-native-async-storage/async-storage"

export enum FriendshpStatus {
    FRIEND,
    REQUEST_SENT,
    REQUEST_RECEIVED,
    NONE
}

export async function setStatus(userId: number, status: FriendshpStatus){
    await AsyncStorage.setItem(`userstatus-${userId}`, status.toString())
}

export async function getStatus(userId: number): Promise<FriendshpStatus>{
    const status = await AsyncStorage.getItem(`userstatus-${userId}`)
    if(status==null){
        return FriendshpStatus.NONE
    }else{
        return FriendshpStatus[status]
    }
}