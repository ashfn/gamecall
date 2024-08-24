import { Text, TextInput, View, Button, Pressable, ActivityIndicator, SafeAreaView } from 'react-native';
import { AuthHeader } from '../src/components/AuthHeader';
import { useState, useRef } from "react"
import { MaterialIcons } from '@expo/vector-icons';
import { validateCredentials } from '../util/accountValidation';
import { AntDesign } from '@expo/vector-icons';
import { router } from 'expo-router';

import { login, signup, authFetch, getAccountDetails, useAccountDetailsStore } from "../util/auth"

export default function Page() {

    const [err, setErr] = useState("")
    const [waiting, setWaiting] = useState(false)
    const [errorMessages, setErrorMessages] = useState([])

    const accountRef = useRef(null)
    const passwordRef = useRef(null)

    const [account, setAccount] = useState(null)
    const [password, setPassword] = useState(null)

    const refresh = useAccountDetailsStore((state) => state.fresh)

    function submit(){
        accountRef.current.blur()
        passwordRef.current.blur()
        setWaiting(true)
        setErrorMessages([])
        if(account==null || password==null){
            setErrorMessages(["Missing fields"])
            // setTimeout(() => setWaiting(false), 200)
            return
        }
        login(account, password).then((response) => {
            setWaiting(false)
            switch (response.status) {
                case -1: {
                    setErrorMessages([response.error])
                    break
                }
                case 0: {
                    console.error(response.error)
                    break
                }
                case 1: {
                    refresh()
                        .then(() => setTimeout(() => {}, 100))
                        .then(() => router.navigate("."))
                }
            }
        })
    }

    return(
        <View className="bg-bg h-full">
            <SafeAreaView>
                <View>
                    <View className="pl-6 flex justify-between mb-24 ">
                        <Pressable onPressIn={() => router.back()}>
                            <AntDesign name="left" size={30} color="#96e396"/>
                        </Pressable>
                        <Text className="text-2xl text-minty-4 text-center ">Log in</Text>
                        
                    </View>
                    <View className="grid content-center mb-32">
                        <View className="ml-8 mr-8  border-solid border-minty-4 border-[1px] rounded-lg p-2 text-minty-4 mb-8">
                            <Text className="text-l text-minty-4 text-center absolute top-[-14] left-[10%] bg-bg p-1">Username or email</Text>
                            <TextInput ref={accountRef} onChangeText={(v)=> setAccount(v)} className="text-2xl text-minty-4" keyboardAppearance="dark" selectionColor="#96e396" onSubmitEditing={()=> passwordRef.current.focus()} autoCapitalize="none" autocomplete="username" enterKeyHint="next" />
                        </View>
                        <View className="ml-8 mr-8 border-solid border-minty-4 border-[1px] rounded-lg p-2 text-minty-4 mb-8">
                            <Text className="text-l text-minty-4 text-center absolute top-[-14] left-[10%] bg-bg p-1">Password</Text>
                            <TextInput ref={passwordRef} onChangeText={(v)=> setPassword(v)} className="text-2xl text-minty-4" keyboardAppearance="dark" selectionColor="#96e396" onSubmitEditing={()=> submit()} secureTextEntry={true} autocomplete="new-password" enterKeyHint="done" passwordRules="minlength: 8; required: lower; required: upper; required: digit; required: [#];"/>
                        </View>
                        <Pressable onPressIn={() => submit()} onPressOut={() => setWaiting(false)} >
                            <View className={(waiting?"bg-minty-3":"bg-minty-4")+" border-solid border-minty-4 border-[1px] rounded-lg ml-8 mr-8 h-14 "}>
                                <View className="m-auto flex flex-row">
                                    <Text className="text-bg text-center text-xl ">Log in</Text>
                                    <ActivityIndicator color="#0a0a0a" animating={waiting}/>
                                </View>
                            </View>
                        </Pressable>
                        <View className="ml-8 mr-8 mt-4">
                            {errorMessages.map(msg => (
                                <View className="flex flex-row" key={msg}>
                                    <MaterialIcons name="error-outline" size={18} color="#ef4444" />
                                    <Text className="ml-1 text-red-500">{msg}</Text>
                                </View>
                            ))}


                        </View>
                    </View>
                </View>
            </SafeAreaView>
        </View>
    )
}
