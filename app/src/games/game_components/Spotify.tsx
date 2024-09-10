import { forwardRef, memo, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Text, View, Button, TouchableOpacity, FlatList, ActivityIndicator, TextInput, ScrollView, Pressable } from "react-native";
import { Audio, InterruptionModeIOS } from 'expo-av';
import { ProgressBar } from '../../components/ProgressBar';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Gesture, GestureDetector, TouchableWithoutFeedback } from "react-native-gesture-handler";
import { Image } from "expo-image"
import { AnimatePresence, MotiView } from "moti";
import { Easing } from "react-native-reanimated";


function sortObjectsBySearchTermFrequency(list: any[], searchTerm: string): any[] {
  // Normalize the search term to lowercase
  const normalizedSearchTerm = searchTerm.toLowerCase();

  // Helper function to count occurrences of the normalized search term in each object
  function countTermOccurrences(obj: any, term: string): number {
    let count = 0;
    // Convert fields to lowercase and count occurrences of the term
    const fields = [
      obj.name ? obj.name.toLowerCase() : '',
      obj.album ? obj.album.toLowerCase() : '',
      obj.artists ? obj.artists.join(" ").toLowerCase() : ''
    ];
    for (const field of fields) {
      if (field.includes(term)) {
        count++;
      }
    }
    return count;
  }

  // Precompute term occurrences and store them in an array of objects
  const termCounts = list.map(obj => ({
    obj,
    count: countTermOccurrences(obj, normalizedSearchTerm)
  }));

  // Sort based on the precomputed counts in descending order
  termCounts.sort((a, b) => b.count - a.count);

  // Extract and return the sorted objects
  return termCounts.map(entry => entry.obj);
}


const Spotify = forwardRef((props, ref) => {
    const player1 = props.player1
    const player2 = props.player2
    const [game, setGame] = useState(props.game)
    const sendMove = props.sendMove
    const account = props.account
    const setPreventLeave = props.setPreventLeave
    const setLoading = props.setLoading
    const gameOverRef = props.gameOverRef
    const [sending, setSending] = useState(false)
    const screenWidth = Dimensions.get('window').width;
    const height = (screenWidth/3)-16
    
    const [gameState, setGameState] = useState(null)

    const [position, setPosition] = useState(0); // State to store the current position in milliseconds
    const [percent, setPercent] = useState(0)

    const [stage, setStage] = useState(2)
    const [playing, setPlaying] = useState(false)
    const [done, setDone] = useState(false)
    const [selectedItem, selectItem] = useState(null)
    const [sound, setSound] = useState<Audio.SoundObject>(null)

    const [searchResults, setSearchResults] = useState([])

    const [waiting, setWaiting] = useState(false)
    const [search, setSearch] = useState("")
    const [lastSearchChange, setLastSearchChange] = useState(null)
    const searchBarRef = useRef(null)



    useEffect(() => {
      setLastSearchChange(new Date().getTime())
      // setWaiting(true)
      if(gameState!=null){
        setSearchResults(sortObjectsBySearchTermFrequency(gameState.songChoices, search))
      }
    }, [search, gameState])

    const durations = [1000, 2000, 3000, 6000, 10000]

    // stages: start at 0
    // 0 is 1s = Perfect
    // 1 is 2s = Great
    // 2 is 3s = Good
    // 3 is 6s = Fair
    // 4 is 10s = Average
    
    useEffect(() => {
        setGameState(JSON.parse(game.gameStateJson))
    }, [game])

    useEffect(() => {
      if(gameState!=null){
        Audio.Sound.createAsync(
          { uri: gameState.song.song.preview }
        ).then((soundObject) => {
          setSound(soundObject)
        })
      }
    }, [gameState])

    const setAudioMode = async () => {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          interruptionModeIOS: InterruptionModeIOS.DuckOthers,
          playsInSilentModeIOS: true,
        });
      };

    const playSound = async () => {
      try {

        if(playing) return


        setPlaying(true)
        // startCounter(durations[stage])
        const start = gameState.song.start * 1000
        
        let total = 0
        for(let x=0; x<=stage; x++){
          total+=durations[x]
        }
        console.log(total)

        console.log(`setPercent ${percent}`)

        setPercent(0)
        await setAudioMode()
        setPercent(((total)/22000) * 100)
        // Load the sound file
        console.log(`Starting ${gameState.song.song.preview} at ${gameState.song.start}s`)

        sound.sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.isPlaying) {
            setPosition(status.positionMillis); // Update position state with the current playback position
          }
        });

        // Set the start position (in seconds)
        await sound.sound.setPositionAsync(gameState.song.start * 1000);
      
        // Play the sound
        await sound.sound.playAsync();
  
        // Stop the sound after a specific duration (in milliseconds)
        setTimeout(async () => {
          await sound.sound.stopAsync();
          setPlaying(false)
          console.log('Stopped sound after specific duration');
        }, durations[stage]);
      } catch (error) {
        console.log('Error playing sound:', error);
      }
    };

    const guessSelected = Gesture.Tap()
      .runOnJS(true)
      .onBegin(() => {

      })

    const cancelSelect = Gesture.Tap()
      .runOnJS(true)
      .onBegin(() => selectItem(null))



    const renderItem = ({ item }) => {

      const select = Gesture.Tap()
          .runOnJS(true)
          .onStart(() => {
              selectItem({
                  type: item.type,
                  name: item.name,
                  id: item.id
              })
          })
      
      return (
          <GestureDetector gesture={select}>
              <View className={`flex flex-row mb-2 rounded-xl p-[5px] ${selectedItem!=null && selectedItem.id==item.id?"bg-minty-3/75":""}`}>
                  <View className="">
                      <Image 
                          source={(item.img!=undefined?item.img:"https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/eb777e7a-7d3c-487e-865a-fc83920564a1/d7kpm65-437b2b46-06cd-4a86-9041-cc8c3737c6f0.jpg/v1/fill/w_800,h_800,q_75,strp/no_album_art__no_cover___placeholder_picture_by_cmdrobot_d7kpm65-fullview.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9ODAwIiwicGF0aCI6IlwvZlwvZWI3NzdlN2EtN2QzYy00ODdlLTg2NWEtZmM4MzkyMDU2NGExXC9kN2twbTY1LTQzN2IyYjQ2LTA2Y2QtNGE4Ni05MDQxLWNjOGMzNzM3YzZmMC5qcGciLCJ3aWR0aCI6Ijw9ODAwIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmltYWdlLm9wZXJhdGlvbnMiXX0.8yjX5CrFjxVH06LB59TpJLu6doZb0wz8fGQq4tM64mg")}
                          style={{
                              width: 75,
                              height: 75,
                              borderRadius: "10%"
                          }}
                      />
                  </View>
                  <View className="ml-2 w-[75%]">
                      <Text className="text-md text-white font-bold flex" numberOfLines={1}>{item.name}</Text>
                      {item.album &&
                          <Text className="text-md text-neutral-600" numberOfLines={1}>{item.album}</Text>
                      }
                      {item.artists &&
                          <Text className="text-md text-neutral-600" numberOfLines={1}>{item.artists.join(", ")}</Text>
                      }
                  </View>
              </View>
          </GestureDetector>
      )
    }

    if(gameState==null) return


    return (
      <AnimatePresence>
        <View>
          {/* {!done && */}

            <View>
              <View className="flex flex-col h-full w-full">
                <View className="basis-[15%]">
                  <View className="flex flex-row items-center justify-center mb-4">
                    {playing &&
                      <FontAwesome name="pause-circle" size={screenWidth/5} color="#737373" />
                    }
                    {!playing &&
                      <TouchableOpacity onPressIn={() => playSound()}>
                        <FontAwesome name="play-circle" size={screenWidth/5} color="#78cc78" />
                      </TouchableOpacity>        
                    }
                  </View>
                  <ProgressBar percent={percent} time={durations[stage]} />
                </View>
                <View className="basis-[6%] flex flex-row items-center">
                  <View className="basis-[75%]">
                    <View className="bg-bg2 rounded-md py-2 px-4">
                      <View className="flex flex-row">
                        <View className="self-center">
                          {waiting &&
                              <ActivityIndicator />
                          }
                          {!waiting &&
                              <FontAwesome name="search" size={20} color="#ffffff" />
                          }                      
                        </View>
                        <ScrollView scrollEnabled={false}>
                          <TextInput
                            className="mx-2 text-xl leading-[24px] text-[#ffffff] w-[90%]"
                            keyboardAppearance="dark"
                            enterKeyHint="done"
                            ref={searchBarRef}
                            onChangeText={(text) => setSearch(text)}
                            placeholderTextColor={"#ffffff"}
                            placeholder={`Search`}
                            textAlignVertical="top"
                            maxLength={20}
                          />
                        </ScrollView>
                      </View>
                    </View>
                  </View>
                  <View className="basis-[25%] ">
                    <TouchableOpacity className="grow bg-loser-red my-1 rounded-lg ml-2">
                      <Text className="text-bg2 font-bold m-auto py-2">Skip</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <MotiView 
                  style={{
                    padding: "2px",
                    margin: "2px",
                    flexShrink: 1
                  }}
                  from={{
                    flexBasis: selectedItem ? '79%' : '63%',
                  }}
                  animate={{
                    flexBasis: selectedItem ? '63%' : '79%',
                  }}
                  transition={{
                    type: 'timing',
                    duration: 125,  // Adjust this value for smoother or quicker animations
                  }}
                  exitTransition={{
                    type: 'timing',
                    duratirwon: 50
                  }}
                >
                  <FlatList
                        onScrollBeginDrag={() => searchBarRef.current.blur()}
                        data={searchResults}
                        renderItem={renderItem}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={{paddingBottom: 30, paddingTop: 10}}
                    />
                </MotiView>
                
                { selectedItem!=null &&
                  <MotiView className="basis-[16%]"
                    from={{
                      flexBasis: "0%",
                      opacity: 0
                    }}
                    animate={{
                      flexBasis: "16%",
                      opacity: 1
                    }}
                    exit={{
                      opacity: 0,
                      flexBasis: "0%"
                    }}
                    transition={{
                      type: "timing",
                      easing: Easing.sin,
                      duration: 125
                    }}
                    exitTransition={{
                      type: 'timing',
                      duration: 50
                    }}
                  >
                    <View className="flex flex-row items-center justify-center space-x-2 pt-4">
                        <View className="basis-[30%]">
                            <GestureDetector gesture={cancelSelect}>
                                <View className="bg-bg2 rounded-lg py-4">
                                    <Text className="text-[#ffffff] m-auto font-bold">Cancel</Text>
                                </View>
                            </GestureDetector>
                        </View>
                        <View className="basis-[65%]">
                            <GestureDetector gesture={guessSelected}>
                                <View className="w-[100%] bg-minty-3 rounded-lg py-4 ">
                                <Text className="text-bg m-auto font-bold">Guess</Text>
                                </View>
                            </GestureDetector>
                        </View>
                    </View>
                  </MotiView>
                            
                }
              
              </View>

            </View>

        </View>
      </AnimatePresence>
    )
})
        
export default Spotify