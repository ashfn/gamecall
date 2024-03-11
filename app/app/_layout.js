import { Slot } from 'expo-router';

import { View, Text } from 'react-native';

// import * as StatusBar from "expo-status-bar"
import { StatusBar } from 'expo-status-bar';

import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

export default function HomeLayout() {

    return(
        <>
            <StatusBar style="light" />
            <SafeAreaProvider>
                
                <View className="bg-bg h-full">
                    {/* For some f*cking reason we need to have two??!? */}
                    <SafeAreaView>
                        <Slot />
                    </SafeAreaView>
                </View>
            </SafeAreaProvider>
        </>
    );
}
