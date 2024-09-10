import { AnimatePresence, MotiView,  } from "moti";
import { Component, forwardRef, useImperativeHandle, useReducer, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, Modal, Pressable, StyleSheet, Text, TextInput, TouchableWithoutFeedback, View } from "react-native";
import { Image } from "expo-image";
import { prefix } from "../../util/config";
import { FlatList, Gesture, GestureDetector } from "react-native-gesture-handler";
import { opacity } from "react-native-reanimated/lib/typescript/reanimated2/Colors";
import { Easing } from "react-native-reanimated";
import { authFetch } from "../../util/auth";
import { useGamesStore } from "../../util/games";
import { useSpotifySearchStore } from "../../util/searchbar";
import * as Haptics from 'expo-haptics';
import { FontAwesome } from '@expo/vector-icons';

/**
 * 
 * @param  props Requires title, description, onsubmit(value), defaultvalue
 * Optional props: blur and setBlur
 */


function nFormatter(num, digits) {
    const lookup = [
      { value: 1, symbol: "" },
      { value: 1e3, symbol: "k" },
      { value: 1e6, symbol: "M" },
      { value: 1e9, symbol: "G" },
      { value: 1e12, symbol: "T" },
      { value: 1e15, symbol: "P" },
      { value: 1e18, symbol: "E" }
    ];
    const regexp = /\.0+$|(?<=\.[0-9]*[1-9])0+$/;
    const item = lookup.findLast(item => num >= item.value);
    return item ? (num / item.value).toFixed(digits).replace(regexp, "").concat(item.symbol) : "0";
  }
  

export const SpotifyGamePicker = forwardRef((props, ref) => {

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
      selectItem(null)
      if(props.setBlur) setTimeout(() => props.setBlur(0), 60)
    }

    const [motiKey, setMotiKey] = useState(0)

    useImperativeHandle(ref, () => ({
        openModal,
        closeModal
    }));
    const [selectedItem, selectItem] = useState(null)

    const screenWidth = Dimensions.get('window').width;

    const imageWidth = (screenWidth/2)-10

    const renderItem = ({ item }) => {

        const select = Gesture.Tap()
            .runOnJS(true)
            .onStart(() => {
                selectItem({
                    type: item.type,
                    name: item.name,
                    id: item.id
                })
            })

        return (
            <GestureDetector gesture={select}>
                <View className={`flex flex-row mb-2 rounded-xl p-[5px] ${selectedItem!=null && selectedItem.id==item.id?"bg-minty-3/75":""}`}>
                    <View className="">
                        <Image 
                            source={(item.image!=undefined?item.image.url:"https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/eb777e7a-7d3c-487e-865a-fc83920564a1/d7kpm65-437b2b46-06cd-4a86-9041-cc8c3737c6f0.jpg/v1/fill/w_800,h_800,q_75,strp/no_album_art__no_cover___placeholder_picture_by_cmdrobot_d7kpm65-fullview.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9ODAwIiwicGF0aCI6IlwvZlwvZWI3NzdlN2EtN2QzYy00ODdlLTg2NWEtZmM4MzkyMDU2NGExXC9kN2twbTY1LTQzN2IyYjQ2LTA2Y2QtNGE4Ni05MDQxLWNjOGMzNzM3YzZmMC5qcGciLCJ3aWR0aCI6Ijw9ODAwIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmltYWdlLm9wZXJhdGlvbnMiXX0.8yjX5CrFjxVH06LB59TpJLu6doZb0wz8fGQq4tM64mg")}
                            style={{
                                width: 75,
                                height: 75,
                                borderRadius: "10%"
                            }}
                        />
                    </View>
                    <View className="ml-2 w-[75%]">
                        <Text className="text-md text-white font-bold flex" numberOfLines={1}>{item.name}</Text>
                        {item.followers &&
                            <Text className="text-md text-neutral-600">{nFormatter(item.followers.total, 2)} followers</Text>
                        }
                        {item.artists &&
                            <Text className="text-md text-neutral-600">{item.artists.join(", ")}</Text>
                        }
                        {item.creator &&
                            <Text className="text-md text-neutral-600">by {item.creator}</Text>
                        }
                        {(item.tracks && item.tracks>3) &&
                            <Text className="text-md text-neutral-600">{item.tracks} track{item.tracks>1?"s":""}</Text>
                        }
                        {(item.tracks && item.tracks<3) &&
                            <Text className="text-md text-loser-red">{item.tracks} track{item.tracks>1?"s":""} (More than 3 needed)</Text>
                        }
                    </View>
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
        if(selectedItem==null){
            return
        }
        closeModal()
        setWorking(true)
        console.log(`sendGame ${JSON.stringify(selectedItem)}`)
        authFetch(`${prefix}/newGame`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                "user": userId,
                "game": "SPOTIFY",
                options: {
                    type: selectedItem.type,
                    name: selectedItem.name,
                    id: selectedItem.id
                }
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
      
    const searchBarRef = useRef(null)

    const results = useSpotifySearchStore((state) => state.results)
    const waiting = useSpotifySearchStore((state) => state.waiting)
    const searchType = useSpotifySearchStore((state) => state.searchType)
    const setSearchType = useSpotifySearchStore((state) => state.setSearchType)
    const setSearch = useSpotifySearchStore((state) => state.setSearch) 
    const clearSearch = useSpotifySearchStore((state) => state.clearSearch)

    const [searchOpen, setSearchOpen] = useState(false)

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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }

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
                            <View className="w-full h-[80%] p-2">
                                <Text className="py-2 text-xl text-minty-4 font-bold text-center">Find a game</Text>
                                <View className="flex flex-row mb-2 mx-2">
                                    <GestureDetector gesture={openSearchGesture}>
                                        <MotiView className="shrink bg-bg2 rounded-lg py-2 px-4" style={{ flexBasis: "100%" }}        
                                        >
                                            <View className=" flex flex-row">
        
                                                <View className="self-center">
                                                    {waiting &&
                                                        <ActivityIndicator />
                                                    }
                                                    {!waiting &&
                                                        <FontAwesome name="search" size={20} color="#ffffff" />
                                                    }
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
                                </View>
                                <View className="flex flex-row space-x-2 px-2">
                                    <Pressable className={`basis-1/3 shrink flex items-center justify-center p-1 rounded-xl border-minty-3 border-[1px] ${searchType=='ARTIST'?'bg-minty-3':''}`} onPress={() => setSearchType("ARTIST")}>
                                        <Text className={`font-bold text-minty-3 ${searchType=='ARTIST'?'text-bg4':''}`}>Artists</Text>
                                    </Pressable>
                                    <Pressable className={`basis-1/3 shrink flex items-center justify-center p-1 rounded-xl border-minty-3 border-[1px] ${searchType=='PLAYLIST'?'bg-minty-3':''}`} onPress={() => setSearchType("PLAYLIST")}>
                                        <Text className={`font-bold text-minty-3 ${searchType=='PLAYLIST'?'text-bg4':''}`}>Playlists</Text>
                                    </Pressable>
                                    <Pressable className={`basis-1/3 shrink flex items-center justify-center p-1 rounded-xl border-minty-3 border-[1px] ${searchType=='ALBUM'?'bg-minty-3':''}`} onPress={() => setSearchType("ALBUM")}>
                                        <Text className={`font-bold text-minty-3 ${searchType=='ALBUM'?'text-bg4':''}`}>Albums</Text>
                                    </Pressable>
                                </View>
                                <View className="mt-2">
                                    <FlatList
                                        data={results}
                                        renderItem={renderItem}
                                        keyExtractor={(item) => item.id}
                                        contentContainerStyle={{ paddingBottom: 150 }}
                                    />
                                </View>
                            </View>
                            <View className="w-full h-[20%] pt-2 bg-bg4">
                                <View className="flex flex-row items-center justify-center space-x-2">
                                    <View className="basis-[30%] shrink">
                                        <GestureDetector gesture={closeButton}>
                                            <View className="bg-bg2 rounded-lg py-4">
                                                <Text className="text-[#ffffff] m-auto font-bold">Cancel</Text>
                                            </View>
                                        </GestureDetector>
                                    </View>
                                    <View className="basis-[60%] shrink">
                                        <GestureDetector gesture={sendGame}>
                                            <View className="w-[100%] bg-minty-3 rounded-lg py-4 ">
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