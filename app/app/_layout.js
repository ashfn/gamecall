import { Slot } from 'expo-router';

import { View, Text } from 'react-native';

import {StatusBar} from "expo-status-bar"

import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

export default function HomeLayout() {


  return(
        <SafeAreaProvider>
            
            <View className="bg-[#0a0a0a] h-full">
                {/* For some f*cking reason we need to have two??!? */}
                <StatusBar style="light"/>
                <StatusBar style="light"/>
                <SafeAreaView>
                    <Slot />
                </SafeAreaView>
            </View>
        </SafeAreaProvider>
  );
}
