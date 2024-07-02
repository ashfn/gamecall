import { ActivityIndicator, RefreshControl, View, FlatList } from 'react-native';
import { Link, router} from "expo-router"
import { Pressable, Text, SafeAreaView } from 'react-native';
import { logout, useAccountDetailsStore } from '../util/auth';
import { FontAwesome5 } from '@expo/vector-icons';

import { Image } from 'expo-image';

import { prefix } from '../util/config';
import { useConnectionsStore, useFriendRequestsStore, useProfileCache } from '../util/friendshipStatus';
import { useCallback, useEffect, useState } from 'react';
import { setStatusBarStyle } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useGamesStore } from '../util/games';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';

SplashScreen.preventAutoHideAsync();

function FriendView(props){

    const openProfile = Gesture.Tap()
        .runOnJS(true)
        .onStart(() => {
                router.push(`/user/${props.user.id}`)
        })

    return (
        <GestureDetector gesture={openProfile}>
            <View className="rounded-lg mb-4">
                <View className="flex flex-row gap-1">
                    <View className="basis-1/6 self-center">
                        <Image className="rounded-full bg-minty-3" height={60} width={60} source={`${prefix}/profile/${props.user.id}/avatar`} cachePolicy="disk" />
                    </View>
                    <View className="basis-3/6">
                        <Text className="text-lg text-[#ffffff] bg-pastel-2">
                            {props.user.displayName}
                        </Text>
                        <Text className="text-sm text-[#686a6e] bg-pastel-3">
                            Sent you tic tac toe
                        </Text>
                    </View>
                    <View className="basis-2/6 justify-center">

                    </View>
                </View>
            </View>
        </GestureDetector>
    )
}

export default function Page() {
    const account = useAccountDetailsStore((state) => state.account)
    const updateAccount = useAccountDetailsStore((state) => state.update)
    const freshConnections = useConnectionsStore((state) => state.fresh)
    const updateRequests = useFriendRequestsStore((state) => state.update)

    const prefetchProfile = useProfileCache((state) => state.update)

    const friends = useConnectionsStore((state) => state.friends)
    const requestsSent = useConnectionsStore((state) => state.requestsSent)
    const requestsReceived = useConnectionsStore((state) => state.requestsReceived)

    const requestCount = useFriendRequestsStore((state) => {
        if(state.requests==null || state.localAccepted==null){
            return 0
        }else{
            return state.requests.length-state.localAccepted.length
        }
    })

    const lastUpdated = useAccountDetailsStore((state) => state.lastUpdated)
    const [appIsReady, setAppIsReady] = useState(false);

    const [loadingGames, setLoadingGames] = useState(false)

    const games = useGamesStore((state) => state.games)

    const getGames = useGamesStore((state) => state.get)
    const forceReloadGames = useGamesStore((state) => state.forceUpdate)

    setStatusBarStyle("light", true)

    const [friendProfiles, setFriendProfiles] = useState([])

    useEffect(() => {
        if(friends!=null && requestsSent!=null && requestsReceived!=null){
            if(friendProfiles.length==0){
                const prefetch = [...new Set([...friends, ...requestsSent, ...requestsReceived])]

                prefetch.forEach((id, index) => {
                    setTimeout(() => {
                        console.log(`Prefetching ${id}`)
                        prefetchProfile(id)
                            .catch((err) => {
                                console.log(`Profile prefetch ${id} error: ${err}`)
                            })
                            .then((response) => {
                                setFriendProfiles([...friendProfiles, response])
                            })
                    }, index * 10)
                })
            }
        }

    }, [friends, requestsSent, requestsReceived])

    const onReloadGames = useCallback(() => {
        console.log("Force reloading games")
        setLoadingGames(true);
        Promise.all([
            freshConnections(),
            forceReloadGames()
        ]).then(() => {
            setLoadingGames(false);
        })
      }, []);

    useEffect(() => {
        const loadData = async () => {
            await Promise.all([
                updateAccount(),
                freshConnections(),
                updateRequests(),
                getGames()
            ]);
        };

        loadData()
            .then(() => {
                console.log("Setting app ready");
                setAppIsReady(true);
            })
            .catch((error) => {
                console.error("Error loading data:", error);
                // Optionally handle the error
            });
    }, [freshConnections, updateAccount, updateRequests]);


    const link = " text-2xl text-minty-4 text-center basis-1/2"
    const border = " border-2 rounded-lg border-[#ffffff] border-solid"

    const onLayoutRootView = useCallback(async () => {
        if (appIsReady) {
          await SplashScreen.hideAsync();
        }
      }, [appIsReady]);

    if (!appIsReady) {
        return null;
    }



    return(

        <View className="bg-bg h-full" onLayout={onLayoutRootView}>
            <SafeAreaView>
                <View className="">
                    {(lastUpdated==0) &&
                        <>
                        </>
                    }
                    {(account==null && lastUpdated!=0) && 
                        <>
                            <Text className="text-2xl text-minty-4 text-center">Welcome to GameCall</Text>
                            <View className="mt-24 flex flex-row ">
                                <Link push href="/register" className={link+border}>Register</Link>
                                <Link push href="/login" className={link+border}>Login</Link>
                            </View>
                        </>
                    }
                    {account && 
                        <View className="">
                            <View className="flex flex-row p-2">
                                <Pressable className="basis-1/3 self-center pl-4"onPressIn={() => router.push("/friends")}>
                                    <View className="w-[35px]">
                                        <FontAwesome5 name="user-friends" size={22} color="#96e396">
                                        </FontAwesome5>
                                        {requestCount>=9?(
                                            <Text className="text-xs text-minty-4 font-bold absolute top-[-8px] right-[-10px]">9+</Text>
                                        ):(
                                            <Text className="text-xs text-minty-4 font-bold absolute top-[-8px] right-[-1px]">{requestCount==0?"":requestCount}</Text>
                                        )}
                                        
                                        {/* <View className="rounded-full p-1 bg-bg absolute top-[70%] right-0">View> */}
                                    </View>
                                </Pressable>
                                <Text className="basis-1/3 text-minty-4 text-xl font-bold text-center">rainfrog</Text>
                                <Pressable className="basis-1/3 pr-2" onPressIn={() => router.push("settings")}>
                                    <Image className="self-end rounded-full bg-minty-3" height={30} width={30} source={`${prefix}/profile/${account.id}/avatar`} cachePolicy={"disk"} />
                                </Pressable>
                            </View>
                            <View className="">

                                <ScrollView className="bg-minty-4 h-full"
                                        showsVerticalScrollIndicator={false}
                                        refreshControl={
                                            <RefreshControl className="mt-[-26px] p-0" refreshing={loadingGames} onRefresh={onReloadGames}>
                                                <ActivityIndicator className="mb-[-10px] p-0" size="large" color="#96e396" animating={loadingGames}/>
                                            </RefreshControl>
                                        }>
                                        <View className="h-full m-0 bg-bg pl-4 pt-4">
                                            {/* <Text className="text-2xl text-minty-3">{JSON.stringify(Array.from({ length: 1 }, () => [...friendProfiles]).flat())}</Text> */}
                                            <View className="">
                                                {Array.from({ length: 10 }, () => [...friendProfiles]).flat().map((x, i) =>
                                                    <FriendView key={i} user={x} />
                                                )}
                                                
                                            </View>
                                        </View>
                                </ScrollView>
                            </View>
                        </View>
                    }

                    
                </View>
            </SafeAreaView>
        </View>
    )
}
