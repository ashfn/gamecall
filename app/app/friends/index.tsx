import { Pressable, View, Text, ScrollView, TextInput, ActivityIndicator, RefreshControl, TouchableWithoutFeedback, Animated } from "react-native";
import { ConfirmModal, InputModal } from "../../src/components/InputModal";
import { ErrorModal, InfoModal } from "../../src/components/TextModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { FontAwesome5 } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch, getAccountDetails, useAccountDetailsStore } from "../../util/auth";
import { router } from "expo-router"
import { prefix } from "../../util/config";
import { Image } from 'expo-image';
import { FontAwesome } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import * as Haptics from 'expo-haptics';
import {MotiView} from 'moti'
import { Easing, runOnJS } from "react-native-reanimated";
import { useConnectionsStore, useFriendRequestsStore } from "../../util/friendshipStatus";
import { useFriendSearchStore } from "../../util/searchbar";
import { MotiPressable } from "moti/interactions";

import { Gesture, GestureDetector } from "react-native-gesture-handler"

const forSlideFromLeft = ({ current, next, layouts: { screen } }: slideProps) => {
    const progress = Animated.add(
      current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
      next
        ? next.progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          })
        : 0
    );
  
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [-screen.width, 0],
    });
  
    return {
      cardStyle: {
        transform: [{ translateX }],
      },
    };
  };

function openUserProfile(userId){
    router.push(`/user/${userId}`)
}

function SearchResult(props){
    const openProfile = Gesture.Tap()
        .runOnJS(true)
        .onStart(() => {
            openUserProfile(props.user.id)
        })
    
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

    const [status, setStatus] = useState(-1)
    // let status = 

    useEffect(() => {
        setStatus(props.lookup(props.user.id))
        if(props.selfid==props.user.id){
            setStatus(-1)
        }
    }, [])

    const forceChangeStatus = useConnectionsStore((store) => store.forceChange)
    
    const [working, setWorking] = useState(false)

    function add(){
        console.log(`Sending friend request to ${props.user.id}`)
        setWorking(true)
        authFetch(`${prefix}/friendRequest/${props.user.id}`, {
            method: "POST",
            })
            .then((res) => res.json())
            .then((res) => {
                if(res.status==1){
                    setStatus(1)
                    forceChangeStatus(props.user.id, 1)
                    setWorking(false)
                }
                if(res.status==-1){
                    props.errorModal.current.openModal("Error", res.error, "OK")
                }

            })
    }

    function accept(){
        console.log(`DEBUG ${status}`)
        console.log(`Accepting friend request from ${props.user.id}`)
        setWorking(true)
        authFetch(`${prefix}/acceptFriendRequest/${props.user.id}`, {
            method: "POST",
            })
            .then((res) => res.json())
            .then((res) => {
                setWorking(false)
                if(res.status==1){
                    setStatus(3)
                    forceChangeStatus(props.user.id, 3)
                }
                if(res.status==-1){
                    props.errorModal.current.openModal("Error", res.error, "OK")
                }

            })
    }

    function remove(){
        console.log(`DEBUG ${status}`)
        console.log(`Removing friend ${props.user.id}`)
        setWorking(true)
        authFetch(`${prefix}/removeFriend/${props.user.id}`, {
            method: "POST",
            })
            .then((res) => res.json())
            .then((res) => {
                setWorking(false)
                if(res.status==1){
                    setStatus(4)
                    forceChangeStatus(props.user.id, 4)
                }
                if(res.status==-1){
                    props.errorModal.current.openModal("Error", res.error, "OK")
                }

            })
    }

    return (
        <GestureDetector gesture={openProfile}>

            <View className="rounded-lg mb-2">
                <View className="flex flex-row">
                    <View className="basis-1/6 self-center">
                        <Image className="rounded-full bg-minty-3" height={60} width={60} source={`${prefix}/profile/${props.user.id}/avatar`} cachePolicy="disk" />
                    </View>
                    <View className="basis-3/6">
                        <Text className="ml-2 text-xl text-[#ffffff]">
                            {props.user.displayName+"\n"}
                            <Text className="text-xs text-[#686a6e]">@{props.user.username}</Text>
                        </Text>
                    </View>
                    <View className="basis-2/6 justify-center">

                    
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
        </GestureDetector>
    )
}

function FriendRequest(props){

    const tap = Gesture.Tap()
        .runOnJS(true)
        .onStart(() => {
            openUserProfile(props.request.requestOriginId)
        })

    const [working, setWorking] = useState(false)

    const accepted = useFriendRequestsStore((state) => state.localAccepted.includes(props.request.requestOriginId))
    const localAccept = useFriendRequestsStore((state) => state.localAccept)
    const declined = useFriendRequestsStore((state) => state.localDeclined.includes(props.request.requestOriginId))
    const localDecline = useFriendRequestsStore((state) => state.localDecline)
    const forceChangeStatus = useConnectionsStore((store) => store.forceChange)

    const deleteGesture = Gesture.Tap()
        .runOnJS(true)
        .onStart(() => {
            deleteRequest()
        })

    const acceptGesture = Gesture.Tap()
        .runOnJS(true)
        .onStart(() => {
            accept()    
        })

    function accept(){
        console.log(`Accepting friend request from ${props.request.requestOriginId}`)
        setWorking(true)
        authFetch(`${prefix}/acceptFriendRequest/${props.request.requestOriginId}`, {
            method: "POST",
            })
            .then((res) => res.json())
            .then((res) => {
                setWorking(false)
                if(res.status==1){
                    forceChangeStatus(props.request.requestOriginId, 3)
                    localAccept(props.request.requestOriginId)
                }
                if(res.status==-1){
                    props.errorModal.current.openModal("Error", res.error, "OK")
                }

            })
    }

    function deleteRequest(){
        setWorking(true)
        authFetch(`${prefix}/denyFriendRequest/${props.request.requestOriginId}`, {
            headers: {
                "Content-Type": "application/json",
              },
            method: "POST"})
        .then((res) => {
            return res.json()
        }).then((res) => {
            setWorking(false)
            if(res.status==1){
                forceChangeStatus(props.request.requestOriginId, 4)
                localDecline(props.request.requestOriginId)
            }
            if(res.status==-1){
                props.errorModal.current.openModal("Error", res.error, "OK")
            }

        })
    }
    
    return (
        <GestureDetector gesture={tap}>

            <View className="rounded-lg" key={props.request.requestOriginId}>
                <View className="flex flex-row">
                    <View className="basis-1/4 self-center">
                        <Image className="rounded-full bg-minty-3" height={80} width={80} source={`${prefix}/profile/${props.request.requestOriginId}/avatar`} cachePolicy="disk" />
                    </View>
                    <View className="basis-3/4">
                        <Text className="ml-2 text-xl text-[#ffffff]">
                            {props.request.requestOrigin.displayName+"\n"}
                            <Text className="text-xs text-[#686a6e]">@{props.request.requestOrigin.username}</Text>
                        </Text>
                        
                        <View className="flex flex-row ml-2 mr-4"> 
                            {(!accepted && !declined) &&
                                <GestureDetector gesture={deleteGesture}>
                                    <Pressable className="basis-[40%] rounded-md bg-bg2 px-4 py-2 mr-2">
                                        <Text className="text-center text-[#ffffff] text-l">Delete</Text>
                                    </Pressable>
                                </GestureDetector>
                            }

                            {(!accepted && !declined) &&     
                                <GestureDetector gesture={acceptGesture}>
                                    <Pressable className="basis-[60%] rounded-md bg-minty-4 px-4 py-2 flex flex-row">
                                        <Text className="text-center text-bg text-l m-auto">Accept</Text>
                                        <ActivityIndicator className="absolute top-[25%] right-[15%] " size="small" color="#0a0a0a" animating={working}/>   
                                    </Pressable>
                                </GestureDetector>
                            }

                            {(accepted) && 
                                <View className="basis-[100%] rounded-md bg-bg2 px-4 py-2">
                                    <Text className="text-center text-[#ffffff] text-l">Accepted</Text>
                                </View>
                            }

                            {(declined) &&
                                <View className="basis-[100%] rounded-md bg-bg2 px-4 py-2">
                                    <Text className="text-center text-[#ffffff] text-l">Declined</Text>
                                </View>
                            }
                        </View>
                    </View>
                </View>
            </View>
        </GestureDetector>
    )
}

export default function friendsPage(){


    const infoModal = useRef(null)
    const confirmModal = useRef(null)
    const errorModal = useRef(null)
    const [searchOpen, setSearchOpen] = useState(false)
    const searchBarRef = useRef(null)

    const account = useAccountDetailsStore((state) => state.account)
    const updateAccount = useAccountDetailsStore((state) => state.fresh)

    const requests = useFriendRequestsStore((state) => state.requests)
    const updateRequests = useFriendRequestsStore((state) => state.update)
    const updateRequestsForce = useFriendRequestsStore((state) => state.fresh)

    const lookup = useConnectionsStore((state) => state.lookup)
    const connections = useConnectionsStore((state) => state.friends)
    const updateConnections = useConnectionsStore((state) => state.update)
    const waiting = useFriendSearchStore((state) => state.waiting)
    const setSearch = useFriendSearchStore((state) => state.setSearch)
    const clearSearch = useFriendSearchStore((state) => state.clearSearch)
    const results = useFriendSearchStore((state) => state.results)

    useEffect(() => {
        const updateRequestsT = async () => {
            await updateRequests()
        }

        updateRequestsT()
    }, [])

    useEffect(() => {
        const updateConnectionsT = async () => {
            await updateConnections()
        }

        updateConnectionsT()
    }, [])


    function openSearch(){
        setSearchOpen(true)
        if(!searchBarRef.current.isFocused()){
            searchBarRef.current.focus()
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
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

    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(() => {
      setRefreshing(true);
      updateRequestsForce().then(() => {
        setRefreshing(false);
      })
    }, []);
  

    const openSearchGesture = Gesture.Tap()
        .runOnJS(true)
        .onStart(() => {
            if(!searchOpen){
                openSearch()
            }else{
                if(!searchBarRef.current.isFocused()){
                    searchBarRef.current.focus()
                }
            }

            
        })

    return (
        <View className="bg-bg h-full">
            <InfoModal ref={infoModal} />
            <ConfirmModal ref={confirmModal} />
            <ErrorModal ref={errorModal} />
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
                                                <GestureDetector gesture={openSearchGesture}>
                                                    <MotiView className="bg-bg2 rounded-lg py-2 px-4 mr-2" animate={{ flexBasis: searchOpen ? "80%" : "100%" }}        
                                                        transition={{
                                                            type: 'timing',
                                                            duration: 120,
                                                            easing: Easing.linear,
                                                        }}
                                                    >
                                                        <View className=" flex flex-row">
                    
                                                            <View className="self-center">
                                                                <FontAwesome name="search" size={20} color="#ffffff" />
                                                            </View>
                                                            <TextInput 
                                                                className="mx-2 text-xl leading-[24px] text-[#ffffff] w-[90%]" 
                                                                onChangeText={(t) => setSearch(t)} 
                                                                keyboardAppearance="dark" 
                                                                enterKeyHint="search" 
                                                                ref={searchBarRef} 
                                                                placeholderTextColor={"#ffffff"} 
                                                                placeholder="Search" 
                                                                textAlignVertical="top" 
                                                                maxLength={20} 
                                                                onFocus={openSearch}
                                                            />
                                                            
                                                        </View>
                                                    </MotiView>
                                                </GestureDetector>
                                                {searchOpen &&
                                                    <Pressable className="grow" onPress={closeSearch}>
                                                        <Text className="text-minty-4 m-auto py-2">Cancel</Text>
                                                    </Pressable>
                                                }
                                            </View>
                                            {searchOpen &&
                                                <TouchableWithoutFeedback>
                                                    <ScrollView className="h-full">
                                                        {waiting ? (
                                                            <ActivityIndicator className="mt-8" size="large" color="#96e396" animating={waiting}/>
                                                        ) : (
                                                            <View>
                                                                {results.map((x, i) =>
                                                                    <SearchResult user={x} lookup={lookup} key={i} errorModal={errorModal} selfid={account.id} />
                                                                )}
                                                            </View>
                                                        )}
                                                        
                                                    </ScrollView>
                                                </TouchableWithoutFeedback>
                                            }
                                            {((requests!=null) && !searchOpen) &&
                                                <ScrollView className="h-full" refreshControl={
                                                    <RefreshControl className="mt-[-25px] p-0" refreshing={refreshing} onRefresh={onRefresh}>
                                                        <ActivityIndicator className="mb-[-10px] p-0" size="large" color="#96e396" animating={refreshing}/>
                                                    </RefreshControl>
                                                  }>

                                                    <View>
                                                        {requests.map((x, i) =>
                                                            <FriendRequest key={i} request={x} confirmModal={confirmModal} />
                                                        )}
                                                        
                                                    </View>
                                                </ScrollView>
                                            }
                                            {requests==null &&
                                                <ActivityIndicator className="" size="large" color="#96e396" animating={true}/>
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