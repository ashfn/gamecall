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

    const openModal = (userid, result) => {
        // result must be "won" "lost" or "drawn"
        if(result!="won" && result!="lost" && result!="drawn"){
            throw new Error("Incorrect result inputted into GameOver openModal")
        }
        setResult(result)
        setUserId(userid)
        setVisible(true)
        if(props.setBlur) setTimeout(() => props.setBlur(15), 60)
    }

    const closeModal = () => {
      setVisible(false)
      if(props.setBlur) setTimeout(() => props.setBlur(0), 60)
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
                      opacity: 0
                    }}
                    animate={{
                      marginTop: 0,
                      opacity: 1
                    }}
                    exit={{
                      opacity: 0,
                      marginTop: 1000
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
                  <View className="w-full h-[25%]">
                      <Pressable className="w-full h-full" onPress={closeModal }></Pressable>
                  </View>
                  <View className="w-full h-[75%]">
                      <View className="bg-bg4 rounded-[16px] w-full h-full">
                          <Text className="py-2 text-xl text-minty-4 font-bold text-center">
                              {result=="won" &&
                                  "You won!"
                              }
                              {result=="lost" &&
                                  "You lost!"
                              }
                              {result=="drawn" &&
                                  "Draw!"
                              }
                          </Text>
                          <View className="w-full h-[70%]">
                            <View className="flex flex-row self-center">
                              <Image className="rounded-full bg-minty-3" height={screenWidth*0.5} width={screenWidth*0.5} source={`${prefix}/profile/${userId}/avatar`} cachePolicy="disk" />
                            </View>
                          </View>
                          <View className="w-full h-[30%] mx-4 mt-2">
                              <View className="flex flex-row">
                                <View className="basis-[100%] self-center mr-2">
                                  <GestureDetector gesture={closeButton}>
                                    <View className="bg-bg2 rounded-lg py-4 px-2">
                                      <Text className="text-[#ffffff] m-auto font-bold">Continue</Text>
                                    </View>
                                  </GestureDetector>
                                </View>
                              </View>
                          </View>
                      </View>
                  </View>
              </MotiView>
          </View>
        }
      </AnimatePresence>
    )
})