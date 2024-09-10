import { Modal, TextInput, TouchableWithoutFeedback, View } from 'react-native';
import { Link, router, Stack, useFocusEffect, useRouter } from "expo-router"
import { Pressable, Text, Button, SafeAreaView } from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { authFetch, getAccountDetails, logout, useAccountDetailsStore } from '../util/auth';
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
import { InputModal } from '../src/components/InputModal';
import { InfoModal } from '../src/components/TextModal';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import * as FileSystem from 'expo-file-system'

import * as Updates from 'expo-updates'
import { GameOver } from '../src/components/GameOver';

function getFolderPath(filePath) {
    // Ensure the path is a string
    if (typeof filePath !== 'string') {
        throw new TypeError('The path should be a string.');
    }

    // Normalize path to handle different OS path separators
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Find the last occurrence of '/' in the path
    const lastSlashIndex = normalizedPath.lastIndexOf('/');

    // If there is no '/' in the path, return an empty string (indicating it's a root path or a file without folders)
    if (lastSlashIndex === -1) {
        return '';
    }

    // Extract the folder path
    return normalizedPath.substring(0, lastSlashIndex);
}

export default function Page() {


    const account = useAccountDetailsStore((state) => state.account)
    const updateAccount = useAccountDetailsStore((state) => state.fresh)
    console.log(account)

    const [modalVisible, setModalVisible] = useState(false);
    const [key, setKey] = useState(0)

    const [blur, setBlur] = useState(0)
    const displaynameModalRef = useRef(null)
    const infoModal = useRef(null)
    
    const gameoverref = useRef(null)

    if(!account){
        updateAccount()
    }

    async function updateDisplayname(displayname){
        displaynameModalRef.current.closeModal()
        const setDisplaynameResult = await authFetch(`${prefix}/profile/${account.id}/displayname`, {
            headers: {
                "Content-Type": "application/json",
              },
            method: "POST",
            body: JSON.stringify({"displayname": displayname} )
        })

        const setDisplaynameResultJson = await setDisplaynameResult.json()

        if(setDisplaynameResultJson.status==1){
            updateAccount()
        }else{
            if(setDisplaynameResultJson.status==-1){
                infoModal.current.openModal("Error", setDisplaynameResultJson.error, "OK")
            }else{
                console.error(setDisplaynameResultJson.error)
            }

        }

    }

    async function pickImage(){
        let result = await  ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            selectionLimit: 1,
            allowsEditing:true,
            aspect:[1,1],
            quality:0.5,
            base64: true,
            exif: false
        
        })
        if(!result.canceled){
            const base64 = result.assets[0].base64
            authFetch(`${prefix}/profile/${account.id}/avatar`, {
                headers: {
                    "Content-Type": "application/json",
                  },
                method: "POST",
                body: JSON.stringify({"avatar": base64})
            }).then((response) => {
                return response.json()
            }).then((json) => {
                // console.log(json)
                Promise.all([Image.clearDiskCache(), Image.clearMemoryCache()]).then(() => {   
                    setKey(key+1)
                })
            })
        }
    }

    useEffect(() => {
        if(account!=null){
            Image.getCachePathAsync(`${prefix}/profile/${account.id}/avatar`).then((rpath) => {
                FileSystem.getInfoAsync(getFolderPath(rpath)).then((x) => {
                    console.log(x)
                })

                // console.log()
            })
        }
    }, [account])

    return(
        <View className="bg-bg h-full">
            {account && 
                <>
                    <InputModal ref={displaynameModalRef} title={"Edit name"} description={"This is how you appear to other users"} defaultvalue={account.displayName} onsubmit={updateDisplayname} setBlur={setBlur} />
                    <InfoModal ref={infoModal} />
                </>
            }
            <SafeAreaView>
                <GameOver ref={gameoverref} />
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
                                            <Image key={key} className="rounded-full" height={125} width={125} source={`${prefix}/profile/${account.id}/avatar`} cachePolicy={"disk"}  />
                                            <View className="rounded-full p-1 bg-bg absolute top-[70%] right-0"><MaterialIcons  name="photo-camera" size={24} color="#ffffff" /></View>
                                        </View>
                                    </Pressable>
                                    <Pressable onPressIn={() => displaynameModalRef.current.openModal()}>
                                        <View className="flex flex-row mt-2 p-2 rounded-lg bg-bg2 items-center">
                                            <Text className="text-[#ffffff] pastel-2 text-2xl mr-2">{account.displayName}</Text>
                                            <FontAwesome name="pencil" size={18} color="#ffffff" />
                                        </View>
                                    </Pressable>
                                </View>
                                <Pressable className="mt-10" onPressIn={() => {
                                    // gameoverref.current.openModal(7, "won")
                                    logout()
                                        .then(() => {
                                            console.log("logout success")
                                            Updates.reloadAsync()
                                        })
                                        .catch((err) => {
                                            console.error(err)
                                        })
                                    
                                    // testRef.current.openModal("Test", "haha testing this", "cool")
                                    // console.log(testRef)
                                    // testRef.current.openModal()
                                }} >
                                    <View className={"bg-minty-4 border-solid border-minty-4 border-[1px] rounded-lg ml-8 mr-8 h-14 "}>
                                        <View className="m-auto flex flex-row">
                                            <Text className="text-bg text-center text-xl ">Log out</Text>

                                            {/* <Counter ref={testRef} /> */}
                                        </View>
                                    </View>
                                    
                                </Pressable>
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
