import { Pressable, View, Text, ScrollView, TextInput } from "react-native";
import { ConfirmModal, InputModal } from "../../src/components/InputModal";
import { InfoModal } from "../../src/components/TextModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { FontAwesome5 } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch, getAccountDetails } from "../../util/auth";
import { router, SplashScreen } from "expo-router"
import { prefix } from "../../util/config";
import { Image } from 'expo-image';
import { FontAwesome } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import * as Haptics from 'expo-haptics';
import {MotiView} from 'moti'
import { Easing } from "react-native-reanimated";

export default function friendsPage(){


    const [account, setAccount] = useState(null)
    const infoModal = useRef(null)
    const confirmModal = useRef(null)
    const [searchOpen, setSearchOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const searchBarRef = useRef(null)

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

    function deleteRequest(userId, displayName){
        confirmModal.current.openModal(`Are you sure you want to delete your friend request from ${displayName}`, () => {
            authFetch(`${prefix}/denyFriendRequest/${userId}`, {
                headers: {
                    "Content-Type": "application/json",
                  },
                method: "POST"})
            .then((response) => {
                return response.json()
            }).then((json) => {
                console.log(json)
            })
        }, () => {
            console.log("Keep Request")
        }, "Delete")
    } 

    function openSearch(){
        setSearchOpen(true)
        if(!searchBarRef.current.isFocused()){
            searchBarRef.current.focus()
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }

    function closeSearch(){
        setSearchOpen(false)
        if(searchBarRef.current.isFocused()){
            searchBarRef.current.blur()
        }
        setSearchQuery("")

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }

    return (
        <View className="bg-bg h-full">
            {/* <Stack.Screen options={{animation: "slide_from_bottom"}}/> */}
            <InfoModal ref={infoModal} />
            <ConfirmModal ref={confirmModal} />
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
                                            <View className="flex flex-row">
                                                <MotiView className="bg-bg2 rounded-lg py-2 px-4 mr-2" animate={{ flexBasis: searchOpen ? "80%" : "100%" }}        
                                                    transition={{
                                                        type: 'timing',
                                                        duration: 180,
                                                        easing: Easing.linear,
                                                    }}
                                                >
                                                    <Pressable className=" flex flex-row" onPress={() => {
                                                        if(!searchOpen){
                                                            openSearch()
                                                        }
                                                    }}>
                                                        <View className="self-center">
                                                            <FontAwesome name="search" size={20} color="#ffffff" />
                                                        </View>
                                                        <TextInput className="mx-2 text-xl leading-[24px] text-[#ffffff]" value={searchQuery} onChangeText={(t) => setSearchQuery(t)} keyboardAppearance="dark" enterKeyHint="search" ref={searchBarRef} placeholderTextColor={"#ffffff"} placeholder="Search" textAlignVertical="top" maxLength={20} onBlur={closeSearch} onFocus={openSearch}/>
                                                    </Pressable>
                                                </MotiView>
                                                {searchOpen &&
                                                    <Pressable className="" onPress={closeSearch}>
                                                        <Text className="text-minty-4 m-auto py-2">Cancel</Text>
                                                    </Pressable>
                                                }
                                            </View>
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
                                                                        <Pressable className="basis-[40%] rounded-md bg-bg2 px-4 py-2 mr-2" onPress={() => deleteRequest(x.requestOriginId, x.requestOrigin.displayName)}>
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