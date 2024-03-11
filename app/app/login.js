import { Text, View } from 'react-native';
import { AuthHeader } from '../src/components/AuthHeader';


export default function Page() {
    return(
        <View>
            <AuthHeader />
            <View>
                <Text>Log in</Text>
            </View>
        </View>
    )
}
