import { Component, forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Modal, Pressable, Text, TextInput, TouchableWithoutFeedback, View } from "react-native";

/**
 * 
 * @param  props Requires title, description, onsubmit(value), defaultvalue
 * Optional props: blur and setBlur
 */



export const InputModal = forwardRef((props, ref) => {

    const inputRef = useRef(null)
    const [modalVisible, setModalVisible] = useState(false)
    const [value, setValue] = useState(props.defaultvalue)

    const openModal = () => {
        setModalVisible(true)
        if(props.setBlur) setTimeout(() => props.setBlur(15), 60)
        setTimeout(() => inputRef.current.focus(), 85)
    }

    const closeModal = () => {
        setModalVisible(false)
        if(props.setBlur) setTimeout(() => props.setBlur(0), 60)
    }

    useImperativeHandle(ref, () => ({
        openModal,
        closeModal
    }));

    return (
        <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        >
            <TouchableWithoutFeedback onPress={closeModal}>
                <View className="h-full w-full">
                    <TouchableWithoutFeedback>
                        <View className="flex items-center mt-40">
                            <View className="bg-bg2 rounded-[8px] w-[70%] flex items-center p-2">
                                <Text className="text-xl text-[#ffffff] text-center">{props.title}</Text>
                                <Text className="text-s text-[#ffffff] text-center mb-2">{props.description}</Text>
                                <TextInput ref={inputRef} onChangeText={(v) => setValue(v)} defaultValue={props.defaultvalue} className="pl-1 pb-1 pr-1 rounded-lg text-2xl text-[#ffffff] bg-bg3 w-full" keyboardAppearance="dark" selectionColor="#ffffff" onSubmitEditing={() => props.onsubmit(value)} enterKeyHint="done" maxLength={15} />
                                <Pressable className="rounded-full bg-minty-4 px-12 py-2 mt-4" onPress={() => props.onsubmit(value)}>
                                    <Text className="text-xl">Save</Text>
                                </Pressable>
                                <Pressable className="mt-2" onPress={() => closeModal()}>
                                    <Text className="text-xs text-[#9ca3af]">Cancel</Text>
                                </Pressable>
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    )

})

export const ConfirmModal = forwardRef((props, ref) => {
    const [modalVisible, setModalVisible] = useState(false)
    const [description, setDescription] = useState("default description")
    const [onConfirm, setOnConfirm] = useState(() => () => {console.log("AA")})
    const [onCancel, setOnCancel] = useState(() => () => {console.log("BB")})
    const [confirmMessage, setConfirmMessage] = useState(null)


    const openModal = (description, onConfirmParam=null, onCancelParam=null, confirmMessage="Confirm") => {
        if(modalVisible){
            closeModal()
        }

        if(onConfirmParam!=null){
            setOnConfirm(() => () => {onConfirmParam()})
        }

        if(onCancelParam!=null){
            setOnCancel(() => () => {onCancelParam()})
        }

        setConfirmMessage(confirmMessage)

        setDescription(description)
        setTimeout(() => {setModalVisible(true)}, 50)

    }

    const closeModal = (cancel=true) => {
        setModalVisible(false)
        if(cancel){
            onCancel()
        }

        if(props.setBlur) setTimeout(() => props.setBlur(0), 60)

    }

    useImperativeHandle(ref, () => ({
        openModal
    }));

    function confirm(){
        closeModal(false)
        onConfirm()
    }

    return (
        <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        >
            <TouchableWithoutFeedback onPress={closeModal}>
                <View className="h-full w-full">
                    <TouchableWithoutFeedback>
                        <View className="flex items-center mt-40">
                            <View className="bg-bg2 rounded-[8px] w-[70%] flex items-center p-2">
                                <Text className="text-xl text-[#ffffff] text-center">Confirm</Text>
                                <Text className="text-s text-[#ffffff] text-center">{description}</Text>
                                <Pressable className="rounded-full bg-minty-4 px-12 py-2 mt-4" onPress={() => confirm()}>
                                    <Text className="text-xl">{confirmMessage}</Text>
                                </Pressable>
                                <Pressable className="mt-2" onPress={() => closeModal()}>
                                    <Text className="text-xs text-[#9ca3af]">Cancel</Text>
                                </Pressable>

                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    )

})