import { View } from 'react-native';
import { Link, router } from "expo-router"
import { Pressable, Text, Button } from 'react-native';



export default function Page() {

    const link = " text-2xl text-minty-4 text-center basis-1/2"
    const border = " border-2 rounded-lg border-[#ffffff] border-solid"
    return(
        <View>
            <Text className="text-2xl text-minty-4 text-center">Welcome to GameCall</Text>
            <View className="mt-24 flex flex-row ">
                <Link push href="/register" className={link+border}>Register</Link>
                <Link push href="/login" className={link+border}>Login</Link>
            </View>
            
        </View>
    )
}
