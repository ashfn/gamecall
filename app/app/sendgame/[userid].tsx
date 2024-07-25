import { router, useLocalSearchParams } from "expo-router";
import { Dimensions, FlatList, Pressable, SafeAreaView, Text, View } from "react-native";
import { useAccountDetailsStore } from "../../util/auth";
import { useEffect, useState } from "react";
import { useConnectionsStore, useProfileCache } from "../../util/friendshipStatus";
import { FontAwesome5 } from '@expo/vector-icons';
import { Image } from "expo-image";
import { prefix } from "../../util/config";

export default function Route(){
    const local = useLocalSearchParams()

    const userId = parseInt(local.userid)
    const account = useAccountDetailsStore((state) => state.account)

    const [userData, setUserData] = useState(null)
    const lookup = useConnectionsStore((state) => state.lookup)
    const [status, setStatus] = useState(-1)
    

    const getProfile = useProfileCache((state) => state.getProfile)
    const forceRefresh = useProfileCache((state) => state.update)

    useEffect(() => {
        const lookupStatus = lookup(userId)
        setStatus(lookupStatus)
        if(account.id==userId){
            setStatus(-1)
        }
    }, [])

    useEffect(() => {
        let mounted = true;

        getProfile(userId).then((data) => {
            setUserData(data)
        })

        return () => mounted = false;
    }, [])

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
    },{
        id: 11,
        name: "TIC_TAC_TOE"
    }]

    const screenWidth = Dimensions.get('window').width;

    const renderItem = ({ item }) => (
        <View style={{
          justifyContent: "center",
          alignItems: "center",
          margin: 2,
          marginTop: 10
        }}>
          <Image 
            style={{
                height: screenWidth-20,
                width: (screenWidth-20)/2
            }}
            cachePolicy="memory"
            source={{ uri: `${prefix}/assets/${item.name}/banner.png` }}
          />  
          <Text className="text-minty-3">{item.id}</Text>
        </View>
      );

    return (
        <View className="bg-bg h-full">
            <SafeAreaView>
                <View className="p-2 h-full">
                    <View className="flex flex-row mb-4 items-center">
                        <Pressable className="basis-1/3 self-center pl-4" onPressIn={() => router.back()}><FontAwesome5 name="arrow-left" size={25} color="#96e396" /></Pressable>
                        <Text className="basis-1/3 text-minty-4 text-l text-center font-bold">Send a game</Text>
                        <View className="basis-1/3"></View>
                    </View>
                    <View>
                        <FlatList
                            data={games}
                            renderItem={renderItem}
                            keyExtractor={(item) => item.id}
                        />
                    </View>
                </View>

            </SafeAreaView>
        </View>
    )
}