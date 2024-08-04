import { Slot } from 'expo-router';

import { View, Text } from 'react-native';

// import * as StatusBar from "expo-status-bar"
import { StatusBar } from 'expo-status-bar';

import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { HoldMenuProvider } from 'react-native-hold-menu';


export default function HomeLayout() {

    return(
        <>
            <HoldMenuProvider theme={"dark"}  safeAreaInsets={{
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
            }}>
                <SafeAreaProvider>
                    <GestureHandlerRootView>
                            <View className="bg-bg h-full">
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
            </HoldMenuProvider>
        </>
    );
}
