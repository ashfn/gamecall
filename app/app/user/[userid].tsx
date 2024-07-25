import { router, useLocalSearchParams } from "expo-router";
import { View } from "moti";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, RefreshControl } from "react-native";
import { FontAwesome5 } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch, useAccountDetailsStore } from "../../util/auth";
import { prefix } from "../../util/config";
import { Image } from "expo-image";
import { useConnectionsStore, useProfileCache } from "../../util/friendshipStatus";
import { Gesture, GestureDetector } from "react-native-gesture-handler";


export default function Route() {
    const local = useLocalSearchParams()

    const userId = parseInt(local.userid)
    const account = useAccountDetailsStore((state) => state.account)

    const [userData, setUserData] = useState(null)
    const lookup = useConnectionsStore((state) => state.lookup)
    const [status, setStatus] = useState(-1)
    

    const getProfile = useProfileCache((state) => state.getProfile)
    const forceRefresh = useProfileCache((state) => state.update)

    useEffect(() => {
        const lookupStatus = lookup(userId)
        setStatus(lookupStatus)
        if(account.id==userId){
            setStatus(-1)
        }
    }, [])

    const forceChangeStatus = useConnectionsStore((store) => store.forceChange)

    useEffect(() => {
        let mounted = true;

        getProfile(userId).then((data) => {
            setUserData(data)
        })

        return () => mounted = false;
    }, [])

    const addButton = Gesture.Tap()
        .runOnJS(true)
        .onStart(() => {
            add()
        })

    const acceptButton = Gesture.Tap()
        .runOnJS(true)
        .onStart(() => {
            accept()
        })

    const removeButton = Gesture.Tap()
        .runOnJS(true)
        .onStart(() => {
            remove()
        })

    const [working, setWorking] = useState(false)

    const onRefresh = useCallback(() => {
        setWorking(true);
        forceRefresh(userId).then(() => {
            getProfile(userId).then((data) => {
                console.log(data)
                setUserData(data)
                setWorking(false);
            })

        })
      }, []);

    function add(){
        console.log(`Sending friend request to ${userId}`)
        setWorking(true)
        authFetch(`${prefix}/friendRequest/${userId}`, {
            method: "POST",
            })
            .then((res) => res.json())
            .then((res) => {
                if(res.status==1){
                    setStatus(1)
                    forceChangeStatus(userId, 1)
                    setWorking(false)
                }
            })
    }

    function accept(){
        console.log(`DEBUG ${status}`)
        console.log(`Accepting friend request from ${userId}`)
        setWorking(true)
        authFetch(`${prefix}/acceptFriendRequest/${userId}`, {
            method: "POST",
            })
            .then((res) => res.json())
            .then((res) => {
                setWorking(false)
                if(res.status==1){
                    setStatus(3)
                    forceChangeStatus(userId, 3)
                }

            })
    }

    function remove(){
        console.log(`DEBUG ${status}`)
        console.log(`Removing friend ${userId}`)
        setWorking(true)
        authFetch(`${prefix}/removeFriend/${userId}`, {
            method: "POST",
            })
            .then((res) => res.json())
            .then((res) => {
                setWorking(false)
                if(res.status==1){
                    setStatus(4)
                    forceChangeStatus(userId, 4)
                }

            })
    }
    
    return (
        <View className="bg-bg h-full">
            <SafeAreaView>
                <View className="p-2 h-full">
                    <View className="flex flex-row mb-4">
                        <Pressable className="basis-1/3 self-center pl-4" onPressIn={() => router.back()}><FontAwesome5 name="arrow-left" size={25} color="#96e396" /></Pressable>
                        <Text className="basis-1/3 text-minty-4 text-l text-center font-bold">{userData!=undefined?userData.username:""}</Text>
                    </View>
                    {userData==undefined ? (
                        <View>
                            <ActivityIndicator className="mt-8" size="large" color="#96e396" animating={true}/>
                        </View>
                    ) : (
                        <ScrollView className="h-full" refreshControl={
                            <RefreshControl className="mt-[-25px] p-0" refreshing={working} onRefresh={onRefresh}>
                                <ActivityIndicator className="mb-[-10px] p-0" size="large" color="#96e396" animating={working}/>
                            </RefreshControl>
                          }>
                            <View>
                                <View className="flex flex-row ml-4 mt-4">
                                    <View className="basis-1/4">
                                        <Image className="self-center rounded-full bg-minty-3" height={100} width={100} source={`${prefix}/profile/${userId}/avatar`} cachePolicy="disk" />
                                    </View>
                                    <View className="basis-3/4 pl-4">
                                        <Text className="text-[#ffffff] text-2xl">{userData.displayName}</Text>
                                        <Text className="text-base text-[#686a6e] mt-[-6px] pt-0">{"@"+userData.username}</Text>
                                        <View className="h-[60px] mt-[10px]">
                                            {status==4 &&
                                                <GestureDetector gesture={addButton}>
                                                    <View className="w-full rounded-md bg-minty-4 h-[60%] justify-center flex flex-row ">
                                                        <Text className="m-auto text-center text-bg text-l">Add</Text>
                                                        <ActivityIndicator className="absolute top-[25%] right-[15%] " size="small" color="#0a0a0a" animating={working}/>   
                                                    </View>
                                                </GestureDetector>
                                            }
                                            {status==1 &&
                                                <Pressable className="w-full rounded-md bg-zinc-800 h-[60%] justify-center">
                                                    <Text className="text-center text-bg text-l">Requested</Text>
                                                </Pressable>
                                            }
                                            {status==2 &&
                                                <GestureDetector gesture={acceptButton}>
                                                    <View className="w-full rounded-md bg-minty-4 h-[60%] justify-center flex flex-row ">
                                                        <Text className="m-auto text-center text-bg text-l">Accept</Text>
                                                        <ActivityIndicator className="absolute top-[25%] right-[5%] " size="small" color="#0a0a0a" animating={working}/>   
                                                    </View>
                                                </GestureDetector>
                                            }
                                            {status==3 &&
                                                <GestureDetector gesture={removeButton}>
                                                    <View className="w-full rounded-md bg-red-500 h-[60%] justify-center flex flex-row ">
                                                        <Text className="m-auto text-center text-bg text-l">Remove</Text>
                                                        <ActivityIndicator className="absolute top-[25%] right-[5%] " size="small" color="#0a0a0a" animating={working}/>   
                                                    </View>
                                                </GestureDetector>
                                            }
                                        </View>
                                    </View>
                                    
                                </View>

                            </View>
                        </ScrollView>
                    )}

                </View>
            </SafeAreaView>
        </View>
    )
}