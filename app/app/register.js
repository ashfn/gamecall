import { Text, TextInput, View, Button, Pressable, ActivityIndicator, SafeAreaView } from 'react-native';
import { AuthHeader } from '../src/components/AuthHeader';
import { useState, useEffect, useRef } from "react"
import { MaterialIcons } from '@expo/vector-icons';
import { validateCredentials } from '../util/accountValidation';
import { AntDesign } from '@expo/vector-icons';
import { router } from 'expo-router';

import { login, signup } from "../util/auth"

export default function Page() {

    const [err, setErr] = useState("")
    const [waiting, setWaiting] = useState(false)
    const [errorMessages, setErrorMessages] = useState([])

    const usernameRef = useRef(null)
    const emailRef = useRef(null)
    const passwordRef = useRef(null)

    const [username, setUsername] = useState(null)
    const [email, setEmail] = useState(null)
    const [password, setPassword] = useState(null)

    function submit(){
        setWaiting(true)
        const errors = validateCredentials(email, password, username)

        if(errors.length==0){
            signup(username, email, password).then((response) => {
                if(response==""){
                    // successful signup, let's log in
                    setWaiting(false)
                }else{
                    setErrorMessages([response])
                    setWaiting(false)
                }
            })
        }else{
            setTimeout(() => {
                setErrorMessages(errors)
                setWaiting(false)
            }, 250)
            
        }
    }

    return(
        <View className="bg-bg h-full">
            <SafeAreaView>
                <View>
                    
                    <View className="mb-32">
                        <View className="pl-6 flex justify-between mb-24 ">
                            <Pressable onPressIn={() => router.back()}>
                                <AntDesign name="left" size={30} color="#96e396"/>
                            </Pressable>
                            <Text className="text-2xl text-minty-4 text-center ">Create account</Text>
                            
                        </View>

                        <View className="ml-8 mr-8  border-solid border-minty-4 border-[1px] rounded-lg p-2 text-minty-4 mb-8">
                            <Text className="text-l text-minty-4 text-center absolute top-[-14] left-[10%] bg-bg p-1">Username</Text>
                            <TextInput ref={usernameRef} onChangeText={(v)=> setUsername(v)} className="text-2xl text-minty-4" keyboardAppearance="dark" selectionColor="#96e396" onSubmitEditing={()=> emailRef.current.focus()} autoCapitalize="none" autocomplete="username" enterKeyHint="next" maxLength={10} />
                        </View>
                        <View className="ml-8 mr-8  border-solid border-minty-4 border-[1px] rounded-lg p-2 text-minty-4 mb-8">
                            <Text className="text-l text-minty-4 text-center absolute top-[-14] left-[10%] bg-bg p-1">Email</Text>
                            <TextInput ref={emailRef} onChangeText={(v)=> setEmail(v)} className="text-2xl text-minty-4" keyboardAppearance="dark" selectionColor="#96e396" onSubmitEditing={()=> passwordRef.current.focus()} autocomplete="email" enterKeyHint="next" />
                        </View>
                        <View className="ml-8 mr-8 border-solid border-minty-4 border-[1px] rounded-lg p-2 text-minty-4 mb-8">
                            <Text className="text-l text-minty-4 text-center absolute top-[-14] left-[10%] bg-bg p-1">Password</Text>
                            <TextInput ref={passwordRef} onChangeText={(v)=> setPassword(v)} className="text-2xl text-minty-4" keyboardAppearance="dark" selectionColor="#96e396" onSubmitEditing={()=> submit()} secureTextEntry={true} autocomplete="new-password" enterKeyHint="done" passwordRules="minlength: 8; required: lower; required: upper; required: digit; required: [#];"/>
                        </View>
                        <Pressable onPressIn={() => submit()} >
                            <View className={(waiting?"bg-minty-3":"bg-minty-4")+" border-solid border-minty-4 border-[1px] rounded-lg ml-8 mr-8 h-14 "}>
                                <View className="m-auto flex flex-row">
                                    <Text className="text-bg text-center text-xl ">Create account </Text>
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
