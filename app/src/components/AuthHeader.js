import { View } from "react-native"
import { Link } from "expo-router"

export function AuthHeader(){
    return(
        <View >
            <Link push href="/" className="text-l text-minty-3 text-center">Go Back</Link>
        </View>
    )
}