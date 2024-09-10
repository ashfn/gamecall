import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

export const ProgressBar = ({ percent, time }) => {

    // Create a shared value that will hold the progress
    const animatedProgress = useSharedValue(0);

    useEffect(() => {
        console.log(`PERCENT: ${percent}`);
        // Update the shared value with timing
        animatedProgress.value = withTiming(percent, {
            duration: percent == 0 ? 0 : time,
            easing: Easing.linear
        });
    }, [percent]); 

    // Create an animated style for the progress bar
    const animatedStyle = useAnimatedStyle(() => {
      return {
        width: `${animatedProgress.value}%`,
      };
    });

    return (
        <View style={styles.container}>
            {/* Static Segments */}
            <View style={styles.segmentsContainer}>
                <View style={[styles.segment, styles.segment1]} />
                <View style={[styles.segment, styles.segment2]} />
                <View style={[styles.segment, styles.segment3]} />
                <View style={[styles.segment, styles.segment4]} />
                <View style={[styles.segment, styles.segment5]} />
            </View>

            {/* Overlaying Progress Bar */}
            <Animated.View style={[styles.progressBar, animatedStyle]} />
        </View>
    );
};


const styles = StyleSheet.create({
    container: {
      position: 'relative',
      flexDirection: 'row',
      height: 10
    },
    segmentsContainer: {
      flexDirection: 'row',
      width: '100%',
      height: '100%',
      flexGrow: 1,
    },
    segment: {
      borderRightWidth: 2,
      borderTopWidth: 2,
      borderBottomWidth: 2,
      borderColor: '#78cc78', // border-minty-3
    },
    segment1: {
      flexBasis: '4.5%',
      flexGrow: 1,
      borderLeftWidth: 2,
      borderTopLeftRadius: 8,
      borderBottomLeftRadius: 8,
    },
    segment2: {
      flexBasis: '9%',
      flexGrow: 1
    },
    segment3: {
      flexBasis: '13.6%',
      flexGrow: 1
    },
    segment4: {
      flexBasis: '27%',
      flexGrow: 1
    },
    segment5: {
      flexBasis: '45%',
      flexGrow: 1,
      borderTopRightRadius: 8,
      borderBottomRightRadius: 8,
    },
    progressBar: {
      position: 'absolute',
      height: '100%',
      backgroundColor: 'rgba(120, 204, 120, 0.8)',
      borderTopLeftRadius: 8,
      borderBottomLeftRadius: 8,
    },
  });