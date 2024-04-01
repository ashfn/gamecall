import { Modal, TextInput, TouchableWithoutFeedback, View } from 'react-native';
import { Link, router, Stack, useFocusEffect, useRouter } from "expo-router"
import { Pressable, Text, Button, SafeAreaView } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { authFetch, getAccountDetails, logout } from '../util/auth';
import { FontAwesome5 } from '@expo/vector-icons';
import { FontAwesome6 } from '@expo/vector-icons';

import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';

import {Buffer} from "buffer"
import { prefix } from '../util/config';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import tailwindConfig from '../tailwind.config';
import { BlurView } from 'expo-blur';

export default function Page() {

    const [account, setAccount] = useState(null)

    const [modalVisible, setModalVisible] = useState(false);

    const [blur, setBlur] = useState(0)

    const usernameRef = useRef(null)

    function openModal(){
        setModalVisible(true)
        setBlur(5)
        setTimeout(() => setBlur(10), 30)
        setTimeout(() => setBlur(15), 60)
        setTimeout(() => usernameRef.current.focus(), 85)
    }

    function closeModal(){
        setModalVisible(false)
        setBlur(10)
        setTimeout(() => setBlur(5), 30)
        setTimeout(() => setBlur(0), 60)
    }

    if(!account){
        getAccountDetails()
        .then((accountJson) => {
            console.log(accountJson)
            setAccount(accountJson)
        })
        
    }

    async function pickImage(){
        let result = await  ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            selectionLimit: 1,
            allowsEditing:true,
            aspect:[1,1],
            quality:0.5,
            base64: true
        
        })
        if(!result.canceled){
            const base64 = result.assets[0].base64
            authFetch(`${prefix}/avatar/${account.id}`, {
                headers: {
                    "Content-Type": "application/json",
                  },
                method: "POST",
                body: JSON.stringify({"avatar": base64})
            }).then((response) => {
                return response.json()
            }).then((json) => {
                console.log(json)
                Promise.all([Image.clearDiskCache(), Image.clearMemoryCache()]).then(() => {
                    setAccount(null)
                })
            })
        }
    }

    return(
        <View className="bg-bg h-full">
            {account && 
                <Modal
                    animationType="slide"
                    transparent={true}
                    visible={modalVisible}
                    >
                    <TouchableWithoutFeedback onPress={closeModal}>
                        <View className="h-full w-full">
                            <TouchableWithoutFeedback>
                                <View className="flex items-center mt-40">
                                    <View className="bg-bg2 rounded-[8px] w-[70%] flex items-center p-2">
                                        <Text className="text-xl text-[#ffffff] text-center">Edit name</Text>
                                        <Text className="text-xs text-[#ffffff] text-center mb-2">This is how you appear to other users</Text>
                                        <TextInput ref={usernameRef} defaultValue={account.displayName} className="pl-1 pb-1 pr-1 rounded-lg text-2xl text-[#ffffff] bg-bg3 w-full" keyboardAppearance="dark" selectionColor="#ffffff" onSubmitEditing={()=> submit()} enterKeyHint="done" maxLength={15} />
                                        <Pressable className="rounded-full bg-[#ffffff] px-12 py-2 mt-4">
                                            <Text className="text-xl">Save</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            </TouchableWithoutFeedback>
                        </View>
                    </TouchableWithoutFeedback>
                </Modal>
            }
            <SafeAreaView>
                <View className="">
                    {account && 

                        <>

                            <View className="p-2 h-full">
                                <View className="flex flex-row mb-4">
                                    <Pressable className="basis-1/3 self-center pl-4" onPressIn={() => router.back()}><FontAwesome5 name="arrow-left" size={25} color="#96e396" /></Pressable>
                                    <Text className="basis-1/3 text-minty-4 text-l text-center font-bold">Profile</Text>
                                </View>
                                <View className="flex justify-center items-center">
                                    <Pressable onPressIn={()=> pickImage()}>
                                        <View className="">
                                            <Image className="rounded-full bg-minty-3" height={125} width={125} source={`${prefix}/avatar/${account.id}`} cachePolicy={"disk"}  />
                                            <View className="rounded-full p-1 bg-bg absolute top-[70%] right-0"><MaterialIcons  name="photo-camera" size={24} color="#ffffff" /></View>
                                        </View>
                                    </Pressable>
                                        <Pressable onPressIn={() => openModal()}>
                                            <View className="flex flex-row mt-2 p-2 rounded-lg bg-bg2 items-center">
                                                <Text className="text-pastel-2 text-2xl mr-2">{account.displayName}</Text>
                                                <FontAwesome6 name="edit" size={24} color={tailwindConfig.theme.extend.colors.pastel["2"]} />
                                            </View>
                                        </Pressable>
                                </View>
                            </View>
                            
                        </>
                    }

                    
                </View>
            </SafeAreaView>
            {blur!=0 &&
                <BlurView
                    className="absolute top-0 bottom-0 left-0 right-0"
                    intensity={blur}
                    
                />
            }

        </View>
    )
}
