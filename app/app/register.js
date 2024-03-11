import { Text, TextInput, View } from 'react-native';
import { AuthHeader } from '../src/components/AuthHeader';



export default function Page() {
    return(
        <View>
            <View className="grid content-center">
                <Text className="text-2xl text-minty-4 text-center  mb-32">Create an account</Text>
                <View className="ml-8 mr-8  border-solid border-minty-4 border-[1px] rounded-lg p-2 text-minty-4 mb-8">
                    <Text className="text-l text-minty-4 text-center absolute top-[-14] left-[10%] bg-bg p-1">Username</Text>
                    <TextInput className="text-2xl text-minty-4 w-[75%]" keyboardAppearance="dark" />
                </View>
                <View className="ml-8 mr-8 border-solid border-minty-4 border-[1px] rounded-lg p-2 text-minty-4 mb-8">
                    <Text className="text-l text-minty-4 text-center absolute top-[-14] left-[10%] bg-bg p-1">Password</Text>
                    <TextInput className="text-2xl text-minty-4 w-[75%]" keyboardAppearance="dark" />
                </View>
            </View>
            <AuthHeader />
        </View>
    )
}
