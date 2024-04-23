import { Slot } from 'expo-router';

import { View, Text } from 'react-native';

// import * as StatusBar from "expo-status-bar"
import { StatusBar } from 'expo-status-bar';

import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router/stack';

export default function HomeLayout() {

    return(
        <>

            <SafeAreaProvider>
                
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
            </SafeAreaProvider>
        </>
    );
}
