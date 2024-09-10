import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';

function shuffleArray(array) {
  for (var i = array.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = array[i];
      array[i] = array[j];
      array[j] = temp;
  }
}
export const EmojiFlyButton = () => {
  const emojis = ['▶️'].flatMap(item => Array(10).fill(item));;
  shuffleArray(emojis)
  const animations = useRef(emojis.map(() => new Animated.Value(0))).current;

  const handlePress = () => {
    animations.forEach((anim, index) => {
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
        delay: index * (50), // Delay each emoji slightly
      }).start();
    });
  };

  const renderEmojis = () => {
    return emojis.map((emoji, index) => {
      const animatedStyle = {
        opacity: animations[index],
        transform: [
          {
            translateX: animations[index].interpolate({
              inputRange: [0, 1],
              outputRange: [0, (Math.random() - 0.5) * 400], // Random horizontal movement
            }),
          },
          {
            translateY: animations[index].interpolate({
              inputRange: [0, 1],
              outputRange: [0, (Math.random() - 0.5) * 400], // Random vertical movement
            }),
          },
          {
            scale: animations[index].interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0], // Shrink the emoji as it moves away
            }),
          },
          {
            rotate: animations[index].interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', `${Math.random() * 720 - 360}deg`], // Random rotation
            }),
          },
        ],
      };

      return (
        <Animated.Text
          key={index}
          style={[styles.emoji, animatedStyle]}
        >
          {emoji}
        </Animated.Text>
      );
    });
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handlePress} style={styles.button}>
        <Text style={styles.buttonText}>Press Me</Text>
      </TouchableOpacity>
      {renderEmojis()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#ff6347',
    padding: 15,
    borderRadius: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  emoji: {
    position: 'absolute',
    fontSize: 30,
  },
});

export default EmojiFlyButton;
