import { Component, forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Modal, Pressable, Text, TextInput, TouchableWithoutFeedback, View } from "react-native";

/**
 * 
 * @param  props none
 * Optional props: blur and setBlu
 */



export const InfoModal = forwardRef((props, ref) => {
    const [modalVisible, setModalVisible] = useState(false)
    const [title, setTitle] = useState("default title")
    const [description, setDescription] = useState("default description")
    const [closeMessage, setCloseMessage] = useState("OK")

    const [onClose, setOnClose] = useState(null)

    const setOnModalClose = (onClose) => {
        setOnClose(onClose)
    }

    const openModal = (title, description, closeMessage="OK") => {
        if(modalVisible){
            closeModal()
        }
        setCloseMessage(closeMessage)
        setTitle(title)
        setDescription(description)
        setModalVisible(true)
        if(props.setBlur) setTimeout(() => props.setBlur(15), 60)
    }

    const closeModal = () => {
        setModalVisible(false)
        if(props.setBlur) setTimeout(() => props.setBlur(0), 60)
        if(onClose){
            onClose()
        }
    }

    useImperativeHandle(ref, () => ({
        openModal, closeModal, setOnModalClose
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
                                <Text className="text-xl text-[#ffffff] text-center">{title}</Text>
                                <Text className="text-s text-[#ffffff] text-center">{description}</Text>
                                <Pressable className="rounded-full bg-[#ffffff] px-12 py-2 mt-4" onPress={closeModal}>
                                    <Text className="text-xl">{closeMessage}</Text>
                                </Pressable>
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    )

})

export const ErrorModal = forwardRef((props, ref) => {
    const [modalVisible, setModalVisible] = useState(false)
    const [title, setTitle] = useState("default title")
    const [description, setDescription] = useState("default description")
    const [closeMessage, setCloseMessage] = useState("OK")


    const openModal = (title, description, closeMessage="OK") => {
        if(modalVisible){
            closeModal()
        }
        setCloseMessage(closeMessage)
        setTitle(title)
        setDescription(description)
        setModalVisible(true)
        if(props.setBlur) setTimeout(() => props.setBlur(15), 60)
    }

    const closeModal = () => {
        setModalVisible(false)
        if(props.setBlur) setTimeout(() => props.setBlur(0), 60)
    }

    useImperativeHandle(ref, () => ({
        openModal
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
                                <Text className="text-xl text-[#ffffff] text-center">{title}</Text>
                                <Text className="text-s text-[#ffffff] text-center">{description}</Text>
                                <Pressable className="rounded-full bg-red-400 px-12 py-2 mt-4" onPress={closeModal}>
                                    <Text className="text-xl">{closeMessage}</Text>
                                </Pressable>
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    )

})