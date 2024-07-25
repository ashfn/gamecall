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



export const GamePicker = forwardRef((props, ref) => {

    const [visible, setVisible] = useState(false)    
    const [userId, setUserId] = useState(null)

    const addGame = useGamesStore((state) => state.addGame)


    const openModal = (userid) => {
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

    console.log(`Modal Visible: ${visible}`)

    const games = [{
      id: 1,
      name: "TIC_TAC_TOE"
  },{
      id: 2,
      name: "TIC_TAC_TOE"
  },{
      id: 3,
      name: "TIC_TAC_TOE"
  },{
      id: 4,
      name: "TIC_TAC_TOE"
  },{
      id: 5,
      name: "TIC_TAC_TOE"
  },{
      id: 6,
      name: "TIC_TAC_TOE"
  },{
      id: 7,
      name: "TIC_TAC_TOE"
  },{
      id: 8,
      name: "TIC_TAC_TOE"
  },{
      id: 9,
      name: "TIC_TAC_TOE"
  },{
      id: 10,
      name: "TIC_TAC_TOE"
  }]

    const [selectedGame, setSetSelectedGame] = useState(1)

    const screenWidth = Dimensions.get('window').width;

    const imageWidth = (screenWidth/2)-10

    const renderItem = ({ item }) => {

      const select = Gesture.Tap()
        .runOnJS(true)
        .onStart(() => {
          setSetSelectedGame(item.id)
        })

      return (
        <GestureDetector gesture={select}>
          <View style={{
            justifyContent: "center",
            alignItems: "center",
            margin: 2,
            marginTop: 10,
            borderColor: selectedGame==item.id? "#4fab4f" : "#ffffff",
            borderWidth: selectedGame==item.id? 3 : 0,
            borderStyle: selectedGame==item.id ? "solid" : "solid",
            borderRadius: 5
          }}>
            <Image 
              style={{
                width: selectedGame==item.id?imageWidth-6:imageWidth,
                height: selectedGame==item.id?(imageWidth/2)-6:imageWidth/2,
                borderRadius: "10%"
              }}
              cachePolicy="memory"
              source={{ uri: `${prefix}/assets/${item.name}/banner.png` }}
            />  
          </View>
        </GestureDetector>
      )
    }
      
      const [working, setWorking] = useState(false)

      const closeButton = Gesture.Tap()
        .runOnJS(true)
        .onStart(() => {
          closeModal()
        })
  
      const sendGame = Gesture.Tap()
        .runOnJS(true)
        .onStart(() => {
          closeModal()
          setWorking(true)
          console.log(`sendGame`)
          authFetch(`${prefix}/newGame`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              "user": userId,
              "game": games[selectedGame].name
            })
          })
            .then((res) => res.json())
            .then((json) => {
              if(json.status==1){
                addGame(json.data)
              }
              setWorking(false)
              console.log(`Game send response: ${JSON.stringify(json)}`)
            })
            .catch((err) => {
              setWorking(false)
              console.log(err)
            })

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
                            <Text className="py-2 text-xl text-minty-4 font-bold text-center">Choose game</Text>
                            <View className="w-full h-[70%]">
                                <FlatList
                                    data={games}
                                    renderItem={renderItem}
                                    keyExtractor={(item) => item.id}
                                    numColumns={2}
                                    columnWrapperStyle={{
                                    justifyContent: "space-around"
                                    }}
                                    contentContainerStyle={{ paddingBottom: 150 }}
                                />
                            </View>
                            <View className="w-full h-[30%] mx-4 mt-2">
                                <View className="flex flex-row">
                                  <View className="basis-[30%] self-center mr-2">
                                    <GestureDetector gesture={closeButton}>
                                      <View className="bg-bg2 rounded-lg py-4 px-2">
                                        <Text className="text-[#ffffff] m-auto font-bold">Cancel</Text>
                                      </View>
                                    </GestureDetector>
                                  </View>
                                  <View className="basis-[70%] self-center">
                                    <GestureDetector gesture={sendGame}>
                                      <View className="w-[85%] bg-minty-3 rounded-lg py-4 ">
                                        <Text className="text-bg m-auto font-bold">Send</Text>
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