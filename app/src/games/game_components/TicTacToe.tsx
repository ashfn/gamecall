import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Dimensions, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useAccountDetailsStore } from "../../../util/auth";
import Feather from '@expo/vector-icons/Feather';
import AntDesign from '@expo/vector-icons/AntDesign';
import { Image } from "expo-image";
import { prefix } from "../../../util/config";
import { useGamesStore } from "../../../util/games";
import { router } from "expo-router";

// PLAYER 1 IS NOUGHTS
// PLAYER 2 IS CROSSES

function TicTacToeNode({game, x, y, potentialMove, setPotentialMove, myId}){
    const gameState = JSON.parse(game.gameStateJson)
    const board = gameState.board
    
    const nodeValue = board[y][x]
    
    const screenWidth = Dimensions.get('window').width;
    const height = (screenWidth/3)-16
    
    const gesture = Gesture.Tap()
    .runOnJS(true)
    .onBegin(() => {
        if(nodeValue==0){
            setPotentialMove({x: x, y: y})
        }
    })
    
    if(nodeValue==0 && game.waitingOn==myId){
        return (
            <GestureDetector gesture={gesture}>
                <View className="h-full w-full flex items-center justify-center">
                {(potentialMove!=null && potentialMove.x ==x && potentialMove.y == y && game.player1==myId) && 
                    // <Text className="text-minty-3">O</Text>
                    <AntDesign name="close" size={height-10} color="#565756" />
                }
                {(potentialMove!=null && potentialMove.x ==x && potentialMove.y == y && game.player2==myId) && 

                    <Feather name="circle" size={height-30} color="#565756" />
                    // <Text className="text-minty-3">X</Text>
                }
                </View>
            </GestureDetector>
        )
    }
    
    if(nodeValue==game.player1){
        return (
            <View className="h-full w-full flex items-center justify-center">
                <AntDesign name="close" size={height-10} color="#96e396" />
            </View>
        )
    }

    if(nodeValue==game.player2){
        return (
            <View className="h-full w-full flex items-center justify-center">
                <Feather name="circle" size={height-30} color="#96e396" />
            </View>
        )
    }
}

const TicTacToe = forwardRef((props, ref) => {
    const player1 = props.player1
    const player2 = props.player2
    const [game, setGame] = useState(props.game)
    const sendMove = props.sendMove
    const account = props.account
    const setPreventLeave = props.setPreventLeave
    const setLoading = props.setLoading
    const [sending, setSending] = useState(false)

    const screenWidth = Dimensions.get('window').width;
    const height = (screenWidth/3)-16
    
    const [potentialMove, setPotentialMove] = useState(null)

    const [working, setWorking] = useState(false)

    const manualUpdate = useGamesStore((state) => state.manuallyUpdate)
    const update = useGamesStore((state) => state.forceUpdate)

    useEffect(() => {
        setPreventLeave(potentialMove!=null)
    }, [potentialMove])

    const cancel = Gesture.Tap()
        .runOnJS(true)
        .onBegin(() => {
            setPotentialMove(null)
        })

    const send = Gesture.Tap()
        .runOnJS(true)
        .onBegin(() => {
            if(potentialMove!=null){
                console.log(`Sending move ${potentialMove}`)
                setLoading(true)
                sendMove([[potentialMove.y, potentialMove.x]]).then((res) => {
                    console.log(JSON.stringify(res))
                    if(res.status==1){
                        // manualUpdate(res.data.game.id, res.data.game)
                        setGame(res.data.game)
                        setPotentialMove(null)
                        update().then(() => {
                            router.back()
                        })
                    }
                    setLoading(false)
                })
            }
        })
    

    return (
        <View className="p-0">
            <View className="flex flex-row">
            <View className="basis-1/3 w-full border-r-2 border-b-2 border-minty-4" style={{
                height: height
            }}>
            <TicTacToeNode game={game} x={0} y={0} potentialMove={potentialMove} setPotentialMove={setPotentialMove} myId={account.id}/>
            </View>
            <View className="basis-1/3 w-full border-x-2 border-b-2  border-minty-4" style={{
                height: height
            }}>
            <TicTacToeNode game={game} x={1} y={0} potentialMove={potentialMove} setPotentialMove={setPotentialMove} myId={account.id}/>
            </View>
            <View className="basis-1/3 w-full border-l-2 border-b-2  border-minty-4" style={{
                height: height
            }}>
            <TicTacToeNode game={game} x={2} y={0} potentialMove={potentialMove} setPotentialMove={setPotentialMove} myId={account.id}/>
            </View>
            </View>
            <View className="flex flex-row">
            <View className="basis-1/3 w-full border-y-2 border-r-2 border-minty-4" style={{
                height: height
            }}>
            <TicTacToeNode game={game} x={0} y={1} potentialMove={potentialMove} setPotentialMove={setPotentialMove} myId={account.id}/>
            </View>
            <View className="basis-1/3 w-full border-y-2 border-y-minty-4 border-x-2 border-x-minty-4" style={{
                height: height
            }}>
            <TicTacToeNode game={game} x={1} y={1} potentialMove={potentialMove} setPotentialMove={setPotentialMove} myId={account.id}/>
            </View>
            <View className="basis-1/3 w-full border-y-2 border-l-2 border-minty-4" style={{
                height: height
            }}>
            <TicTacToeNode game={game} x={2} y={1} potentialMove={potentialMove} setPotentialMove={setPotentialMove} myId={account.id}/>
            </View>
            </View>
            <View className="flex flex-row">
            <View className="basis-1/3 w-full border-r-2 border-t-2 border-minty-4" style={{
                height: height
            }}>
            <TicTacToeNode game={game} x={0} y={2} potentialMove={potentialMove} setPotentialMove={setPotentialMove} myId={account.id}/>
            </View>
            <View className="basis-1/3 w-full border-x-2 border-t-2  border-minty-4" style={{
                height: height
            }}>
            <TicTacToeNode game={game} x={1} y={2} potentialMove={potentialMove} setPotentialMove={setPotentialMove} myId={account.id}/>
            </View>
            <View className="basis-1/3 w-full border-l-2 border-t-2  border-minty-4" style={{
                height: height
            }}>
            <TicTacToeNode game={game} x={2} y={2} potentialMove={potentialMove} setPotentialMove={setPotentialMove} myId={account.id}/>
            </View>
            </View>
            {/* shows what players are what, cant be bothered to add this in a good looking way for now */}
            {/* <View className="flex flex-row">
                <View className="basis-1/2 flex flex-row items-center justify-left">
                <Image key={player1.id} className="rounded-full" height={20} width={20} source={`${prefix}/profile/${player1.id}/avatar`} cachePolicy={"disk"}  />
                <Text className="text-[#ffffff] ml-2">{player1.displayName}</Text>
                <AntDesign name="close" size={20} color="#ffffff" />
                </View>
                <View className="basis-1/2 flex flex-row items-center justify-right">
                <Image key={player2.id} className="rounded-full" height={20} width={20} source={`${prefix}/profile/${player2.id}/avatar`} cachePolicy={"disk"}  />
                <Text className="text-[#ffffff] ml-2">{player2.displayName}</Text>
                <Feather name="circle" size={16} color="#ffffff" />
                </View>
                </View> */}
                {/* 
                    DEBUGGING DATA
                    <Text className="text-minty-3">Player1: {JSON.stringify(player1)}</Text>
                    <Text className="text-minty-3">Player2: {JSON.stringify(player2)}</Text>
                    <Text className="text-minty-3">game: {JSON.stringify(game)}</Text> */}
            <View>
                {potentialMove!=null && 
                    <View className="flex flex-row">
                        <GestureDetector gesture={send}>
                            <View className="bg-minty-4 rounded-lg px-6 py-2">
                                <Text className="text-bg text-lg">Send</Text>
                            </View>
                        </GestureDetector>
                    </View>
                }
            </View>
                
        </View>
    )
})
        
export default TicTacToe