import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { View } from "moti";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, RefreshControl, Alert } from "react-native";
import { FontAwesome5 } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch, useAccountDetailsStore } from "../../util/auth";
import { prefix } from "../../util/config";
import { Image } from "expo-image";
import { useConnectionsStore, useProfileCache } from "../../util/friendshipStatus";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useGamesStore } from "../../util/games";
import { UNSTABLE_usePreventRemove } from "@react-navigation/native";
import { HoldItem } from "react-native-hold-menu";
import AntDesign from '@expo/vector-icons/AntDesign';
import GameLoader from "../../src/games/GameLoader";
export default function Route() {
    
    const navigation = useNavigation()
    
    const local = useLocalSearchParams()

    const gameId = parseInt(local.gameid)
    const account = useAccountDetailsStore((state) => state.account)
    const updateAccount = useAccountDetailsStore((state) => state.update)
    const getProfile = useProfileCache((state) => state.getProfile)

    const [game, setGame] = useState(null)
    const getGameById = useGamesStore((state) => state.getGameById)

    const [opponent, setOpponent] = useState(null)

    useEffect(() => {
        if(game!=null){
            if(game.player1==account.id){
                getProfile(game.player2.id).then((profile) => {
                    setOpponent(profile)
                })
            }else{
                getProfile(game.player1.id).then((profile) => {
                    setOpponent(profile)
                })
            }    
        }
    }, [game])

    useEffect(() => {
        let mounted = true;

        setGame(getGameById(gameId))
        updateAccount()

        return () => mounted = false;
    }, [])
    
    UNSTABLE_usePreventRemove(true, ({ data }) => {
        Alert.alert(
            'Discard changes?',
            'You have unsaved changes. Discard them and leave the screen?',
            [
              { text: "Don't leave", style: 'cancel', onPress: () => {} },
              {
                text: 'Discard',
                style: 'destructive',
                onPress: () => navigation.dispatch(data.action),
              },
            ]
          );
    })

    const endGame = Gesture.Tap()
        .runOnJS(true)
        .enabled(true)
        .onStart(() => {
            Alert.alert(
                'End game',
                'Are you sure you want to end the game?',
                [
                  { text: "Continue", style: 'cancel', onPress: () => {} },
                  {
                    text: 'End',
                    style: 'destructive',
                    onPress: () => {},
                  },
                ]
              );
        })



    // 0 is player 1
    // 1 is player 2


    return (
        <View className="bg-bg h-full">
            <SafeAreaView>
                <View className="p-2 h-full">
                    <View className="flex flex-row mb-4">
                        <Pressable className="basis-1/3 self-center pl-4" onPressIn={() => router.back()}><FontAwesome5 name="arrow-left" size={25} color="#96e396" /></Pressable>
                        <View className="basis-1/3 ">
                            {opponent!=null &&
                                <View className="flex flex-row items-center self-center">
                                    <Image key={opponent.id} className="rounded-full align-middle" height={25} width={25} source={`${prefix}/profile/${opponent.id}/avatar`} cachePolicy={"disk"}  />                            
                                    <Text className="ml-1 text-[#ffffff] text-lg ">{opponent.displayName}</Text>
                                </View>                                    
                            }
                        </View>

                        <View className="basis-1/3 self-end">
                            <GestureDetector gesture={endGame}>
                                <View className="w-[35px] h-[35px] bg-bg2 rounded-md self-end mr-[10%] flex items-center justify-center">
                                    <AntDesign name="close" size={20} color="red" />
                                </View>
                            </GestureDetector>
                        </View>
                    </View>
                    <Text className="text-minty-3">
                        {game!=null &&
                            <GameLoader gameData={game} account={account} />
                        }
                    </Text>
                </View>
            </SafeAreaView>
        </View>
    )
}