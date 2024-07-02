import { Slot } from 'expo-router';

import { View, Text } from 'react-native';

// import * as StatusBar from "expo-status-bar"
import { StatusBar } from 'expo-status-bar';

import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function HomeLayout() {

    return(
        <>
            <StatusBar style={"light"} />
            <SafeAreaProvider>
                <GestureHandlerRootView>
                    <View className="bg-bg h-full">
                        {/* For some f*cking reason we need to have two??!? */}
                        <Stack
                                screenOptions={{
                                    headerShown: false,
                                    headerTintColor: '#fff',
                                    headerTitleStyle: {
                                    fontWeight: 'bold',
                                    },
                                }}
                            />
                    </View>
                </GestureHandlerRootView>
            </SafeAreaProvider>
        </>
    );
}
