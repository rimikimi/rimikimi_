import React, { useEffect } from "react";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { IconSpinnerArc } from "./icons";

/** Shared indeterminate spinner — 640ms linear rotation, cancelled on unmount. */
export function Spinner({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  const rot = useSharedValue(0);
  useEffect(() => {
    rot.value = withRepeat(withTiming(360, { duration: 640, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(rot);
  }, [rot]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <IconSpinnerArc size={size} color={color} />
    </Animated.View>
  );
}
