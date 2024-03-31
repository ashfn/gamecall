import { TextInput, View } from 'react-native';
import { Link, router, Stack, useFocusEffect, useRouter } from "expo-router"
import { Pressable, Text, Button, SafeAreaView } from 'react-native';
import { useState } from 'react';
import { authFetch, getAccountDetails, logout } from '../util/auth';
import { FontAwesome5 } from '@expo/vector-icons';

import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';

import {Buffer} from "buffer"
import { prefix } from '../util/config';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';


export default function Page() {

    const [account, setAccount] = useState(null)

    const [reloadKey, setReloadKey] = useState(0);


    const reloadPage = () => {
      // Increment the key to trigger a re-render
      setReloadKey(reloadKey + 1);
    };

    if(!account){
        getAccountDetails()
        .then((response) => response.json())
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

            <SafeAreaView>
                <View className="p-2">
                    {account && 
                        <>
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
                                <View className="ml-4 mt-6 mr-4 w-full rounded-md">
                                    <Pressable>
                                        <Text className="text-[#ffffff] text-xs">Display name</Text>
                                        <TextInput className="text-2xl text-[#ffffff] border-[1px] border-[#ffffff] border-solid pl-2" value={account.displayName} />
                                    </Pressable>
                                </View>
                            </View>
                            
                        </>
                    }

                    
                </View>
            </SafeAreaView>
        </View>
    )
}
