import { View } from 'react-native';
import { Link, router, Stack } from "expo-router"
import { Pressable, Text, Button, SafeAreaView } from 'react-native';
import { useRef, useState } from 'react';
import { getAccountDetails, logout } from '../util/auth';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';

import {Buffer} from "buffer"
import { prefix } from '../util/config';
import Counter, { InputModal } from '../src/components/InputModal';
import { ErrorModal, InfoModal } from '../src/components/TextModal';



export default function Page() {

    const [account, setAccount] = useState(null)

    const testRef = useRef(null)

    if(!account){
        getAccountDetails()
        .then((accountJson) => {
            if(accountJson==null){
                console.log("accountJson is null.... uh oh")
            }else{
                console.log(accountJson)
                setAccount(accountJson)
            }

        })
        
    }


    const link = " text-2xl text-minty-4 text-center basis-1/2"
    const border = " border-2 rounded-lg border-[#ffffff] border-solid"

    return(
        <View className="bg-bg h-full">
            <SafeAreaView>
                <View className="p-2">
                    {!account && 
                        <>
                            <Text className="text-2xl text-minty-4 text-center">Welcome to GameCall</Text>
                            <View className="mt-24 flex flex-row ">
                                <Link push href="/register" className={link+border}>Register</Link>
                                <Link push href="/login" className={link+border}>Login</Link>
                            </View>
                        </>
                    }
                    {account && 
                        <>
                            <View className="flex flex-row">
                                <View className="basis-1/3 self-center pl-4"><Feather name="user-plus" size={25} color="#96e396" /></View>
                                <Text className="basis-1/3 text-minty-4 text-xl font-bold text-center">GAMECALL</Text>
                                <Pressable className="basis-1/3 pr-2" onPressIn={() => router.push("settings")}><Image className="self-end rounded-full bg-minty-3" height={30} width={30} source={`${prefix}/profile/${account.id}/avatar`} cachePolicy={"disk"} /></Pressable>
                            </View>
                            <Text className="text-2xl text-minty-4 text-center">You're logged in :) </Text>
                            <Pressable onPressIn={() => {
                                logout().then(() => router.replace("/"))
                                
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
                            <ErrorModal ref={testRef} />
                        </>
                    }

                    
                </View>
            </SafeAreaView>
        </View>
    )
}
