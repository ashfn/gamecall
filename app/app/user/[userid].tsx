import { router, useLocalSearchParams } from "expo-router";
import { View } from "moti";
import { ActivityIndicator, Pressable, SafeAreaView, Text } from "react-native";
import { FontAwesome5 } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../../util/auth";
import { prefix } from "../../util/config";


export default function Route() {
    const local = useLocalSearchParams()

    const userId = local.userid

    const [userData, setUserData] = useState(null)

    useEffect(() => {
        let mounted = true;
        authFetch(`${prefix}/profile/${userId}`, {})
            .then((res) => res.json())
            .then((data) => {
                if(data.status==1){
                    console.log(data.data)
                    setUserData(data.data)
                }else{
                    router.back()
                }
            }).catch((err) => {
                console.error(err)
                router.back()
            })
        return () => mounted = false;
    }, [])


    
    return (
        <View className="bg-bg h-full">
            <SafeAreaView>
                <View className="p-2 h-full">
                    <View className="flex flex-row mb-4">
                        <Pressable className="basis-1/3 self-center pl-4" onPressIn={() => router.back()}><FontAwesome5 name="arrow-left" size={25} color="#96e396" /></Pressable>
                        <Text className="basis-1/3 text-minty-4 text-l text-center font-bold"></Text>
                    </View>
                    {userData==undefined ? (
                        <View>
                            <ActivityIndicator className="mt-8" size="large" color="#96e396" animating={true}/>
                        </View>
                    ) : (
                        <View>
                            <Text className="text-minty-4"></Text>
                        </View>
                    )}

                </View>
            </SafeAreaView>
        </View>
    )
}