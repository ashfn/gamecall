import { Pressable, View, Text, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { ConfirmModal, InputModal } from "../../src/components/InputModal";
import { InfoModal } from "../../src/components/TextModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { FontAwesome5 } from '@expo/vector-icons';
import { useCallback, useRef, useState } from "react";
import { authFetch, getAccountDetails, useAccountDetailsStore } from "../../util/auth";
import { router, SplashScreen } from "expo-router"
import { prefix } from "../../util/config";
import { Image } from 'expo-image';
import { FontAwesome } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import * as Haptics from 'expo-haptics';
import {MotiView} from 'moti'
import { Easing } from "react-native-reanimated";
import { useConnectionsStore, useFriendRequestsStore } from "../../util/friendshipStatus";
import { useFriendSearchStore } from "../../util/searchbar";
import { MotiPressable } from "moti/interactions";

export default function friendsPage(){


    const infoModal = useRef(null)
    const confirmModal = useRef(null)
    const [searchOpen, setSearchOpen] = useState(false)
    const searchBarRef = useRef(null)

    const account = useAccountDetailsStore((state) => state.account)
    const updateAccount = useAccountDetailsStore((state) => state.fresh)

    const requests = useFriendRequestsStore((state) => state.requests)
    const updateRequests = useFriendRequestsStore((state) => state.update)

    const lookup = useConnectionsStore((state) => state.lookup)
    const updateConnections = useConnectionsStore((state) => state.update)
    const waiting = useFriendSearchStore((state) => state.waiting)
    const setSearch = useFriendSearchStore((state) => state.setSearch)
    const clearSearch = useFriendSearchStore((state) => state.clearSearch)
    const results = useFriendSearchStore((state) => state.results)

    updateRequests()
    updateConnections()


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

    function openUser(id){
        router.push(`/user/${id}`)
    }

    function closeSearch(){
        searchBarRef.current.clear()
        setSearchOpen(false)
        if(searchBarRef.current.isFocused()){
            searchBarRef.current.blur()
        }
        clearSearch()

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }

    return (
        <View className="bg-bg h-full">
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
                                        <View>
                                            <View className="flex flex-row mb-2">
                                                <MotiView className="bg-bg2 rounded-lg py-2 px-4 mr-2" animate={{ flexBasis: searchOpen ? "80%" : "100%" }}        
                                                    transition={{
                                                        type: 'timing',
                                                        duration: 120,
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
                                                        <TextInput className="mx-2 text-xl leading-[24px] text-[#ffffff]" onChangeText={(t) => setSearch(t)} keyboardAppearance="dark" enterKeyHint="search" ref={searchBarRef} placeholderTextColor={"#ffffff"} placeholder="Search" textAlignVertical="top" maxLength={20} onBlur={closeSearch} onFocus={openSearch}/>
                                                        
                                                    </Pressable>
                                                </MotiView>
                                                {searchOpen &&
                                                    <Pressable className="" onPress={closeSearch}>
                                                        <Text className="text-minty-4 m-auto py-2">Cancel</Text>
                                                    </Pressable>
                                                }
                                            </View>
                                            {searchOpen &&
                                                <ScrollView className="h-full">
                                                    {waiting ? (
                                                        <ActivityIndicator className="mt-8" size="large" color="#96e396" animating={waiting}/>
                                                    ) : (
                                                        <View>
                                                            {results.map((x, i) =>
                                                                <View className="rounded-lg" key={i}>
                                                                    <View className="flex flex-row">
                                                                        <View className="basis-1/6 self-center">
                                                                            <Image className="rounded-full bg-minty-3" height={60} width={60} source={`${prefix}/profile/${x.id}/avatar`} cachePolicy="disk" />
                                                                        </View>
                                                                        <View className="basis-3/6">
                                                                            <Text className="ml-2 text-xl text-[#ffffff]">
                                                                                {x.displayName+"\n"}
                                                                                <Text className="text-xs text-[#686a6e]">@{x.username}</Text>
                                                                            </Text>
                                                                        </View>
                                                                        <View className="basis-2/6 justify-center">
                                                                            <Pressable className="w-full rounded-md bg-minty-4 h-[60%] justify-center">
                                                                                <Text className="text-center text-bg text-l">{lookup(x.id)}</Text>
                                                                            </Pressable>
                                                                        </View>
                                                                    </View>
                                                                </View>
                                                        )}
                                                        </View>
                                                    )}
                                                    
                                                </ScrollView>
                                            } 
                                            {(requests && !searchOpen) &&
                                                <ScrollView className="h-full">

                                                    <View>
                                                        {requests.map((x, i) =>
                                                            <View className="rounded-lg" key={i}>
                                                                <View className="flex flex-row">
                                                                    <Pressable className="basis-1/4 self-center" onPress={() => openUser(x.requestOriginId)}>
                                                                        <Image className="rounded-full bg-minty-3" height={80} width={80} source={`${prefix}/profile/${x.requestOriginId}/avatar`} cachePolicy="disk" />
                                                                    </Pressable>
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
                                            }
                                        </View>
                                        



                                </View>
                            </View>

                        </>
                    }
                </View>
            </SafeAreaView>
        </View>
    )
}