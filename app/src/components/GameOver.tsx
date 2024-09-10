import { AnimatePresence, MotiView,  } from "moti";
import { Component, forwardRef, useImperativeHandle, useReducer, useRef, useState } from "react";
import { Dimensions, Modal, Pressable, StyleSheet, Text, TextInput, TouchableWithoutFeedback, View } from "react-native";
import { Image } from "expo-image";
import { prefix } from "../../util/config";
import { FlatList, Gesture, GestureDetector } from "react-native-gesture-handler";
import { opacity } from "react-native-reanimated/lib/typescript/reanimated2/Colors";
import { Easing } from "react-native-reanimated";
import { authFetch } from "../../util/auth";
import { useGamesStore } from "../../util/games";
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { router } from "expo-router";
import AntDesign from '@expo/vector-icons/AntDesign';
import Entypo from '@expo/vector-icons/Entypo';

/**
 *
 * @param  props Requires title, description, onsubmit(value), defaultvalue
 * Optional props: blur and setBlur
 */



export const GameOver = forwardRef((props, ref) => {

    const [visible, setVisible] = useState(false)
    const [userId, setUserId] = useState(null)

    const addGame = useGamesStore((state) => state.addGame)

    const [result, setResult] = useState(null)

    const [closeCallback, setCloseCallback] = useState(null)

    const openModal = (userid, newResult, closeCallBack) => {
        // result must be "won" "lost" or "drawn"
        if(newResult!="won" && newResult!="lost" && newResult!="drawn"){
            throw new Error("Incorrect result inputted into GameOver openModal")
        }
        setCloseCallback(closeCallBack)
        setResult(newResult)
        setUserId(userid)
        setVisible(true)
        if(props.setBlur) setTimeout(() => props.setBlur(15), 60)
    }

    const closeModal = () => {
      setVisible(false)
      setResult(null)
      setUserId(null)
      if(props.setBlur) setTimeout(() => props.setBlur(0), 60)
      closeCallback()
    }

    const [motiKey, setMotiKey] = useState(0)

    useImperativeHandle(ref, () => ({
        openModal,
        closeModal
    }));

    const [selectedGame, setSetSelectedGame] = useState(1)

    const screenWidth = Dimensions.get('window').width;

    const imageWidth = (screenWidth/2)-10

    const [working, setWorking] = useState(false)

    const closeButton = Gesture.Tap()
      .runOnJS(true)
      .onStart(() => {
        closeModal()
      })
    
    
    
    return (
      <AnimatePresence>
        {visible &&
          <View className="absolute top-0 right-0 bottom-0 left-0 z-50">
              <MotiView
                    key={motiKey}
                    style={{
                      flex: 1,
                      alignItems: "center",
                    }}
                    from={{
                      marginTop: 500,
                      // opacity: 0
                    }}
                    animate={{
                      marginTop: 0,
                      // opacity: 1
                    }}
                    exit={{
                      // opacity: 0,
                      marginTop: 300
                    }}
                    transition={{
                      type: "timing",
                      easing: Easing.sin,
                      duration: 125
                    }}
                    exitTransition={{
                      type: "timing",
                      easing: Easing.sin,
                      duration: 200
                    }}
                    // transition={{
                    //   opacity: {
                    //     type: "timing",
                    //     duration: 250
                    //   }
                    // }}
                  >
                  <View className="w-full h-[45%]">
                      <Pressable className="w-full h-full" onPress={closeModal }></Pressable>
                  </View>
                  <View className="w-full h-[55%]">
                      <View className="rounded-[16px] w-full h-full bg-bg4">
                          <View className="h-full w-full">
                            <View className="h-[15%]">
                              <Text className="py-2 text-2xl font-bold text-center mt-2">
                              {result === "won" ? (
                                <Text className="text-winner-gold">You won!</Text>
                              ) : result === "lost" ? (
                                <Text className="text-loser-red">You lost!</Text>
                              ) : result === "drawn" ? (
                                <Text className="text-pastel-2">Drawn!</Text>
                              ) : (
                                <Text className="text-gray-500">Unknown result</Text>
                              )}
                              </Text>
                            </View>
                            <View className="h-[55%] flex flex-row justify-center">
                              <View className="self-center">
                                <View className="absolute bg-bg4 opacity-80 z-10 w-full h-full">
                                </View>
                                <View className="absolute z-20 w-full top-[25%]">
                                  <View className="flex flex-row justify-center items-center w-full">
                                    {result=="won" &&
                                      <FontAwesome6 name="crown" size={screenWidth*0.2} color="#e0b546" />                                  
                                    }
                                    {result=="drawn" &&
                                      <FontAwesome6 name="handshake-simple" size={screenWidth*0.2} color="#abf0ff" />
                                    }
                                    {result=="lost" &&
                                      <Entypo name="emoji-sad" size={screenWidth*0.2} color="#cf554c" />
                                    }
                                  </View> 
                                </View>
                                <MotiView
                                  from={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exitTransition={{
                                    type: "timing",
                                    duration: 150,
                                  }}
                                  transition={{
                                    type: "timing",
                                    duration: 150,
                                  }}
                                  style={{
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                <Image
                                  className="rounded-full bg-bg4"
                                  height={screenWidth * 0.5}
                                  width={screenWidth * 0.5}
                                  source={`${prefix}/profile/${userId}/avatar`}
                                  cachePolicy="disk"
                                />
                                </MotiView>
                              </View>
                            </View>
                            <View className="h-[30%]">
                              <View className="flex flex-row self-center items-center m-auto">
                                <View className="w-[85%]">
                                  <GestureDetector gesture={closeButton}>
                                    <View className="bg-bg2 rounded-lg py-4 px-2">
                                      <Text className="text-[#ffffff] m-auto font-bold">Continue</Text>
                                    </View>
                                  </GestureDetector>
                                </View>
                              </View>
                            </View>
                          </View>
                            {/* <Text className="basis-[10%] py-2 text-2xl font-bold text-center mt-2 text-minty-3">You won!</Text>
                            <View className="w-full basis-[50%] flex flex-row justify-center bg-pastel-2">

                            </View>
                            <View className="w-full mt-2 basis-[40%] bg-pastel-1">
                              <View className="flex flex-row self-center">
                                <View className="w-[85%] self-center">
                                  <GestureDetector gesture={closeButton}>
                                    <View className="bg-bg2 rounded-lg py-4 px-2">
                                      <Text className="text-[#ffffff] m-auto font-bold">Continue {result}</Text>
                                    </View>
                                  </GestureDetector>
                                </View>
                              </View>
                            </View> */}

                        
                      </View>
                  </View>
              </MotiView>
          </View>
        }
      </AnimatePresence>
    )
})