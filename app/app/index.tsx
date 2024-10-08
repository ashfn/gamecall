import { ActivityIndicator, RefreshControl, View, FlatList, TouchableOpacity, Dimensions } from 'react-native';
import { Link, router} from "expo-router"
import { Pressable, Text, SafeAreaView } from 'react-native';
import { authFetch, logout, useAccountDetailsStore } from '../util/auth';
import { FontAwesome5 } from '@expo/vector-icons';

import { Image } from 'expo-image';

import { prefix } from '../util/config';
import { useConnectionsStore, useFriendRequestsStore, useProfileCache } from '../util/friendshipStatus';
import { useCallback, useEffect, useRef, useState } from 'react';
import { setStatusBarStyle } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { getGameName, useGamesStore } from '../util/games';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { GamePicker } from '../src/components/GamePicker';
import { timeAgo } from '../util/time';

SplashScreen.preventAutoHideAsync();

import { LogBox } from 'react-native';
import { GameOver } from '../src/components/GameOver';
import { SpotifyGamePicker } from '../src/components/SpotifyGamePicker';
LogBox.ignoreLogs(['Warning: ...']); // Ignore log notification by message
LogBox.ignoreAllLogs()

function FriendView(props){

    const [enabled, setEnabled] = useState(true);
    const timeoutRef = useRef(null);

    const openProfile = Gesture.Tap()
        .runOnJS(true)
        .enabled(enabled)
        .onStart(() => {
            setEnabled(false)
            timeoutRef.current = setTimeout(() => {
                setEnabled(true);
              }, 400);
            router.push(`/user/${props.user.id}`)
        })

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            }
        };
        }, []);
    
    const [isPressed, setIsPressed] = useState(false);

    const getGame = useGamesStore((state) => state.getGameByUser)
    const removeGame = useGamesStore((state) => state.removeGameById)

    const game = getGame(props.myid, props.user.id)

    

    async function finishGame(){
        console.log("Finishing game...")
        const res = await authFetch(`${prefix}/finishGame`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              "gameId": game.id
            })
          })
        const json = await res.json()
        if(json.status==1){
            props.reloadGames()
        }
    }

    const open = Gesture.Tap()
        .runOnJS(true)
        .enabled(enabled)
        .onStart(() => {

            // if no current game - open game picker
            if(game==null){
                props.gamepicker.current.openModal(props.user.id)
            }

            // if there is a game - open the game
            if(game!=null){
                if(game.status=="ENDED_UNOPENED"){
                    if(game.winner==props.myid){
                        props.gameOverRef.current.openModal(props.myid, "won", () => {finishGame()})
                    }else if(game.winner==-1){
                        props.gameOverRef.current.openModal(props.myid, "drawn", () => {finishGame()})
                    }else{
                        props.gameOverRef.current.openModal(props.myid, "lost", () => {finishGame()})
                    }
                }else{
                    if(game.waitingOn==props.myid){
                        router.push(`/game/${game.id}`)
                    }
                }
            }

            // setEnabled(false)
            // timeoutRef.current = setTimeout(() => {
            //     setEnabled(true);
            // }, 400);
            // router.push(`/sendgame/${props.user.id}`)

        })

    return (
        <TouchableOpacity
            onPressIn={() => setIsPressed(true)}
            onPressOut={() => setIsPressed(false)}
            className={`rounded-md ${isPressed?"bg-bg4":"bg-bg"} pb-2`}>
            <GestureDetector gesture={open}>
                <View className="py-2 pl-2">
                    <View className="flex flex-row gap-2">
                        <View className="basis-1/6 self-center">
                            <Image className="rounded-full bg-minty-3" height={60} width={60} source={`${prefix}/profile/${props.user.id}/avatar`} cachePolicy="disk" />
                        </View>
                        <View className="basis-3/6">
                            <Text className="text-lg text-[#ffffff]">
                                {props.user.displayName}
                            </Text>
                            {(game==null) && 
                                <Text className="text-sm text-[#686a6e] ">
                                    Send {props.user.username} a game 
                                </Text>
                            }
                            {(game!=null && game.waitingOn!=props.myid) && 
                                <Text className="text-sm text-[#686a6e] ">
                                    Sent {getGameName(game.type)} ∙ <Text className="">{timeAgo(new Date(game.lastActivity))}</Text>
                                </Text>
                            }
                            {(game!=null && game.waitingOn==props.myid) && 
                                <Text className="text-sm text-pastel-2 font-bold ">
                                    {getGameName(game.type)} ∙ <Text className="">{timeAgo(new Date(game.lastActivity))}</Text>
                                </Text>
                            }

                        </View>
                        <View className="basis-2/6 justify-center">

                        </View>
                    </View>
                </View>
            </GestureDetector>
        </TouchableOpacity>
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
    const gamePickerRef = useRef(null)
    const [loadingGames, setLoadingGames] = useState(false)

    const games = useGamesStore((state) => state.games)

    const gameOverRef = useRef(null)

    const getGames = useGamesStore((state) => state.get)
    const forceReloadGames = useGamesStore((state) => state.forceUpdate)

    setStatusBarStyle("light", true)

    const [friendProfiles, setFriendProfiles] = useState([])
    const getProfile = useProfileCache((state) => state.getProfile)

    const screenHeight = Dimensions.get('window').height;

    useEffect(() => {
        if(friends!=null && requestsSent!=null && requestsReceived!=null){
            if(friendProfiles.length==0){
                const prefetch = [...new Set([...friends, ...requestsSent, ...requestsReceived])]

                prefetch.forEach((id, index) => {
                    setTimeout(() => {
                        prefetchProfile(id)
                            .catch((err) => {
                                console.log(`Profile prefetch ${id} error: ${err}`)
                            })
                            .then((response) => {
                                console.log(`Prefetch ${id} res ${JSON.stringify(response)}`)
                            })
                    }, index * 10)
                })

                let tempFriendProfiles = []
                friends.forEach((id, index) => {
                    getProfile(id).then((profile) => {
                        tempFriendProfiles.push(profile)
                    })
                })
                setFriendProfiles(tempFriendProfiles)
                
            }
        }


    }, [friends, requestsSent, requestsReceived, games])

    const onReloadGames = useCallback(() => {
        setLoadingGames(true);
        Promise.all([
            freshConnections(),
            forceReloadGames()
        ]).then(() => {
            setLoadingGames(false);
        }).catch((err) => {
            console.log(err)
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
                setAppIsReady(true);
            })
            .catch((error) => {
                console.error("Error loading data:", error);
                console.log(`${JSON.stringify(account)} ${JSON.stringify(lastUpdated)}`)
                setAppIsReady(true)
                // Optionally handle the error
            });
    }, [freshConnections, updateAccount, updateRequests, account==null]);


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
            <GameOver ref={gameOverRef} />
            <SafeAreaView>
                
                {/* <GamePicker ref={gamePickerRef} /> */}
                <SpotifyGamePicker ref={gamePickerRef} />

                <View className="">
                    {(lastUpdated==0) &&
                        <>
                        </>
                    }
                    {(account==null ) && 
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
                            <View className="bg-minty-4">

                                <ScrollView className=" pb-[100px] h-full"
                                        showsVerticalScrollIndicator={false}
                                        refreshControl={
                                            <RefreshControl className="mt-[-26px] p-0" refreshing={loadingGames} onRefresh={onReloadGames} colors={["#42b342"]}>
                                                <ActivityIndicator className="mb-[-10px] p-0" size="large" color="#96e396" animating={false}/>
                                            </RefreshControl>
                                        }>
                                        <View className="h-full m-0 bg-bg px-1 pt-2 pb-[200px]">
                                            {/* <Text className="text-2xl text-minty-3">{JSON.stringify(Array.from({ length: 1 }, () => [...friendProfiles]).flat())}</Text> */}
                                            <View className="">
                                                {friendProfiles.map((x, i) =>
                                                    <FriendView key={i} user={x} myid={account.id} gamepicker={gamePickerRef} gameOverRef={gameOverRef} reloadGames={onReloadGames} />
                                                )}
                                                {(76*friendProfiles.length<screenHeight-105) &&
                                                    <View style={{
                                                        height: (screenHeight-275)-(76*friendProfiles.length)
                                                    }}>
    
                                                    </View> 
                                                }

                                                
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
