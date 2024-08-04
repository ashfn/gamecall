import React, { Suspense, useState, useEffect, forwardRef, useRef, useImperativeHandle } from 'react';
import { View, Text, Button, ActivityIndicator } from 'react-native';
import { gamesConfig } from '../../util/games';
import { useProfileCache } from '../../util/friendshipStatus';
import { authFetch } from '../../util/auth';
import { prefix } from '../../util/config';

const GameLoader = forwardRef((props, ref) => {

    const gameData = props.gameData
    const account = props.account

    const getProfile = useProfileCache((state) => state.getProfile)

    const [GameComponent, setGameComponent] = useState(null);

    const [player1, setPlayer1] = useState(null)
    const [player2, setPlayer2] = useState(null)

    const preventLeaveRef = useRef(null)

    const [ready, setReady] = useState(false)

    useEffect(() => {
        if(GameComponent!=null && player1!=null && player2!=null && account!=null){
            setReady(true)
        }
    }, [GameComponent, player1, player2, account])

    useEffect(() => {
        const gameConfig = gamesConfig.find(game => game.id === gameData.type);

        if (gameConfig) {
            gameConfig.component().then(module => {
                setGameComponent(() => module.default);
            });
        }
    }, [gameData.type]);

    useEffect(() => {
        getProfile(gameData.player1).then((data) => {
            setPlayer1(data)
        })
    }, [player1])

    useEffect(() => {
        getProfile(gameData.player2).then((data) => {
            setPlayer2(data)
        })
    }, [player2])

    const sendMove = async function(moves){
        const res = await authFetch(`${prefix}/updateGame`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              "gameId": gameData.id,
              "moves": moves
            })
        })
        const json = await res.json()
        return json
    }

    useImperativeHandle(ref, () => ({
        preventLeaveRef
    }))

    return (
        <>
            {ready &&
                <GameComponent
                    player1={player1}
                    player2={player2}
                    game={gameData}
                    sendMove={sendMove}
                    account={account}
                    ref={preventLeaveRef}
                />
            }
            {!ready && 
                <View className=" flex items-center justify-center">
                    <ActivityIndicator animating={true} color={"#78cc78"} size={"large"} />
                </View>
            }
        </>
    );
});

export default GameLoader;