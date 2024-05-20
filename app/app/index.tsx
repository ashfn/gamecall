import { View } from 'react-native';
import { Link, router} from "expo-router"
import { Pressable, Text, SafeAreaView } from 'react-native';
import { logout, useAccountDetailsStore } from '../util/auth';
import { FontAwesome5 } from '@expo/vector-icons';

import { Image } from 'expo-image';

import { prefix } from '../util/config';


export default function Page() {


    const account = useAccountDetailsStore((state) => state.account)
    const updateAccount = useAccountDetailsStore((state) => state.update)
    const lastUpdated = useAccountDetailsStore((state) => state.lastUpdated)

    updateAccount()


    const link = " text-2xl text-minty-4 text-center basis-1/2"
    const border = " border-2 rounded-lg border-[#ffffff] border-solid"

    return(

        <View className="bg-bg h-full">
            <SafeAreaView>
                <View className="p-2">
                    {(lastUpdated==0) &&
                        <>
                        </>
                    }
                    {(account==null && lastUpdated!=0) && 
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
                                <Pressable className="basis-1/3 self-center pl-4"onPressIn={() => router.push("/friends")}>
                                    <View className="w-[35px]">
                                        <FontAwesome5 name="user-friends" size={22} color="#96e396">
                                        </FontAwesome5>
                                        <Text className="text-xs text-minty-4 font-bold absolute top-[-8px] right-0">5</Text>
                                        {/* <View className="rounded-full p-1 bg-bg absolute top-[70%] right-0">View> */}
                                    </View>
                                </Pressable>
                                <Text className="basis-1/3 text-minty-4 text-xl font-bold text-center">GAMECALL</Text>
                                <Pressable className="basis-1/3 pr-2" onPressIn={() => router.push("settings")}>
                                    <Image className="self-end rounded-full bg-minty-3" height={30} width={30} source={`${prefix}/profile/${account.id}/avatar`} cachePolicy={"disk"} />
                                </Pressable>
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
                        </>
                    }

                    
                </View>
            </SafeAreaView>
        </View>
    )
}
