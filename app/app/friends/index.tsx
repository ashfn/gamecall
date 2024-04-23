import { Pressable, View, Text, ScrollView } from "react-native";
import { InputModal } from "../../src/components/InputModal";
import { InfoModal } from "../../src/components/TextModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { FontAwesome5 } from '@expo/vector-icons';
import { useEffect, useRef, useState } from "react";
import { authFetch, getAccountDetails } from "../../util/auth";
import { router } from "expo-router"
import { prefix } from "../../util/config";
import { Image } from 'expo-image';
import { FontAwesome } from '@expo/vector-icons';

export default function friendsPage(){


    const [account, setAccount] = useState(null)
    const infoModal = useRef(null)

    const [requests, setRequests] = useState(null)

    if(!account){
        reloadAccount()
        reloadRequests()
    }



    function reloadAccount(forceNew=false){
        getAccountDetails(forceNew)
        .then((accountJson) => {
            setAccount(accountJson)
        })
    }

    function reloadRequests(){
        authFetch(`${prefix}/friendRequests`, {}).then((result) => result.json())
        .then((res) => {
            if(res.status==1){
                console.log(res.data)
                setRequests(res.data)
            }
        })

        authFetch(`${prefix}/connections`, {}).then((result) => result.json())
        .then((res) => {
            if(res.status==1){
                console.log(res.data)
            }
        })
    }



    return (
        <View className="bg-bg h-full">
            {/* <Stack.Screen options={{animation: "slide_from_bottom"}}/> */}
            <InfoModal ref={infoModal} />
            <SafeAreaView>
                <View className="">
                    {account && 

                        <>

                            <View className="p-2 h-full">
                                <View className="flex flex-row mb-4">
                                    <Pressable className="basis-1/3 self-center pl-4" onPressIn={() => router.back()}><FontAwesome5 name="arrow-left" size={25} color="#96e396" /></Pressable>
                                    <Text className="basis-1/3 text-minty-4 text-l text-center font-bold">Friends</Text>
                                </View>
                                <View className="h-full">
                                    {(requests) &&
                                        <View>
                                            <Pressable className="flex flex-row bg-bg2 rounded-lg">
                                                <View className="self-center">
                                                    <FontAwesome name="search" size={24} color="#ffffff" />
                                                </View>
                                                <Text className="text-[#ffffff]">Find friends</Text>
                                            </Pressable>
                                            <ScrollView className="h-full">

                                                <View>
                                                    {requests.map((x, i) =>
                                                        <View className="rounded-lg" key={i}>
                                                            <View className="flex flex-row">
                                                                <View className="basis-1/4 self-center">
                                                                    <Image className="rounded-full bg-minty-3" height={80} width={80} source={`${prefix}/profile/${x.requestOriginId}/avatar`} cachePolicy={"disk"} />
                                                                </View>
                                                                <View className="basis-3/4">
                                                                    <Text className="ml-2 text-xl text-[#ffffff]">
                                                                        {x.requestOrigin.displayName+"\n"}
                                                                        <Text className="text-xs text-[#686a6e]">@{x.requestOrigin.username}</Text>
                                                                    </Text>
                                                                    
                                                                    <View className="flex flex-row ml-2 mr-4"> 
                                                                        <Pressable className="basis-[40%] rounded-md bg-bg2 px-4 py-2 mr-2">
                                                                            <Text className="text-center text-[#ffffff] text-l">Delete</Text>
                                                                        </Pressable>
                                                                        <Pressable className="basis-[60%] rounded-md bg-minty-4 px-4 py-2">
                                                                            <Text className="text-center text-bg text-l">Confirm</Text>
                                                                        </Pressable>
                                                                    </View>
                                                                </View>
                                                            </View>

                                                            
                                                        </View>
                                                    )}
                                                    
                                                </View>
                                            </ScrollView>
                                        </View>
                                        }



                                </View>
                            </View>

                        </>
                    }
                </View>
            </SafeAreaView>
        </View>
    )
}