import { Text, TextInput, View } from 'react-native';
import { AuthHeader } from '../src/components/AuthHeader';

export default function Page() {
    return(
        <View>

            <View className="grid content-center">
                <View>
                    <Text className="text-2xl text-minty-4 text-center">Create an account</Text>
                    <TextInput className="bg-[] text-minty-4 w-[50%] " placeholder="Username" keyboardAppearance="dark" />
                </View>
            </View>
            <AuthHeader />
        </View>
    )
}
