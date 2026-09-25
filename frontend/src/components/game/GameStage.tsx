import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import {
  Barricade,
  CityBackdrop,
  CrowdedBus,
  DestinationGate,
  GAME_COLORS,
  OverpricedAuto,
  OverpricedCab,
  Passenger,
  PlayerCar,
  PollutionHaze,
  RoadSurface,
  TrafficBike,
  TrafficCar,
} from './GameArt';
import { GAME_CONFIG } from '@/src/lib/game/constants';
import { createInitialState, moveLane, tick, FIXED_STEP_MS } from '@/src/lib/game/engine';
import type { GameEvent, GameState, RoadEntity } from '@/src/lib/game/types';

const ROAD_INSET = 46;
const PLAYER_Y_FROM_BOTTOM = 96;
const SCALE = 0.12;
const LANE_SPRING = { damping: 18, stiffness: 190, mass: 0.6 };

type Props = {
  seed: number;
  running: boolean;
  onEvent?: (event: GameEvent) => void;
  onFinish?: (state: GameState) => void;
  /** Exposed so the parent can drive lane changes from its own swipe handler. */
  controlRef?: React.MutableRefObject<((delta: -1 | 1) => void) | null>;
};

export default function GameStage({ seed, running, onEvent, onFinish, controlRef }: Props) {
  const { width, height } = useWindowDimensions();
  const roadWidth = Math.min(width - ROAD_INSET * 2, 460);
  const roadHeight = Math.max(360, height - 250);
  const laneWidth = roadWidth / GAME_CONFIG.lanes;
  const playerY = roadHeight - PLAYER_Y_FROM_BOTTOM;

  // Engine state lives in a ref: it changes 60x/second and must never be React
  // state, or the whole tree would re-render every frame.
  const engine = useRef<ReturnType<typeof createInitialState> | null>(null);
  if (engine.current === null) {
    engine.current = createInitialState(seed, GAME_CONFIG.seatsRequired);
  }

  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const accumulatorRef = useRef(0);
  const finishedRef = useRef(false);

  // Structural list of entities, refreshed only when the set changes.
  const [entities, setEntities] = useState<RoadEntity[]>(engine.current.state.entities);

  const scroll = useSharedValue(0);
  const lane = useSharedValue(engine.current.state.lanePosition);
  const shake = useSharedValue(0);
  const [pollution, setPollution] = useState(0);

  const applyDelta = useCallback((delta: -1 | 1) => {
    const next = moveLane(engine.current!.state, delta);
    if (next === engine.current!.state) return;
    engine.current!.state = next;
    lane.value = withSpring(next.lanePosition, LANE_SPRING);
    void Haptics.selectionAsync();
  }, [lane]);

  useEffect(() => {
    if (controlRef) controlRef.current = applyDelta;
  }, [applyDelta, controlRef]);

  // Main loop -------------------------------------------------------------
  useEffect(() => {
    if (!running) return;
    finishedRef.current = false;
    lastRef.current = 0;
    accumulatorRef.current = 0;

    const loop = (now: number) => {
      if (!lastRef.current) lastRef.current = now;
      // Clamp dt so a backgrounded tab does not fast-forward the simulation.
      const frame = Math.min(100, now - lastRef.current);
      lastRef.current = now;
      accumulatorRef.current += frame;

      const store = engine.current!;
      let state = store.state;
      let structuralChange = false;

      while (accumulatorRef.current >= FIXED_STEP_MS) {
        const result = tick(state, store.spawner, FIXED_STEP_MS);
        state = result.state;
        accumulatorRef.current -= FIXED_STEP_MS;
        if (result.events.length) {
          for (const event of result.events) {
            onEvent?.(event);
            if (event.type === 'hit') {
              shake.value = withTiming(1, { duration: 60 }, () => {
                shake.value = withTiming(0, { duration: 260 });
              });
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            } else if (event.type === 'pickup') {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } else if (event.type === 'win') {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          }
        }
        if (state.entities !== result.state.entities) structuralChange = true;
        if (state.phase !== 'running') {
          store.state = state;
          break;
        }
      }

      store.state = state;
      scroll.value = state.distance;
      if (structuralChange || state.entities.length !== entities.length) {
        setEntities(state.entities.slice());
      }
      if (Math.abs(state.pollution - pollution) > 0.05) {
        setPollution(state.pollution);
      }

      if (state.phase !== 'running' && !finishedRef.current) {
        finishedRef.current = true;
        onFinish?.(state);
        return;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // Intentionally not depending on `entities`: it is updated inside the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, onEvent, onFinish, scroll, shake]);

  const playerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: lane.value * laneWidth },
      { translateY: 3 * Math.sin(shake.value * 30) },
    ],
  }));

  const roadStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value * (shake.value > 0.5 ? 5 : -5) }],
  }));

  return (
    <View style={styles.stage} testID="game-stage">
      <CityBackdrop width={width} height={height * 0.5} />

      <Animated.View
        style={[
          roadStyle,
          {
            width: roadWidth,
            height: roadHeight,
            borderRadius: 22,
            overflow: 'hidden',
            marginTop: -18,
          },
        ]}
      >
        <RoadSurface width={roadWidth} height={roadHeight} lanes={GAME_CONFIG.lanes} />

        {entities.map((entity) => (
          <EntityView
            key={entity.id}
            entity={entity}
            scroll={scroll}
            laneWidth={laneWidth}
            playerY={playerY}
          />
        ))}

        <Animated.View
          style={[
            styles.player,
            { top: playerY - 62, width: laneWidth, left: 0 },
            playerStyle,
          ]}
        >
          <View style={styles.laneBox}>
            <PlayerCar size={78} />
          </View>
        </Animated.View>

        <PollutionHaze
          width={roadWidth}
          height={roadHeight}
          intensity={pollution}
        />
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ */

const EntityView = memo(function EntityView({
  entity,
  scroll,
  laneWidth,
  playerY,
}: {
  entity: RoadEntity;
  scroll: SharedValue<number>;
  laneWidth: number;
  playerY: number;
}) {
  const style = useAnimatedStyle(() => {
    const delta = entity.z - scroll.value;
    return {
      transform: [
        // Anchor at the top of the entity's lane, then centre inside the lane.
        { translateX: entity.lane * laneWidth },
        { translateY: playerY - delta * SCALE },
      ],
      opacity: entity.cleared ? 0 : 1,
    };
  });

  return (
    <Animated.View style={[styles.entity, style]} pointerEvents="none">
      <View style={[styles.laneBox, { width: laneWidth }]}>
        <EntityArt entity={entity} drift={entity.drift ?? 0} />
      </View>
    </Animated.View>
  );
});

function EntityArt({ entity, drift }: { entity: RoadEntity; drift: number }) {
  switch (entity.kind) {
    case 'passenger':
      return (
        <View style={{ transform: [{ translateX: -23 }] }}>
          <Passenger size={46} tone={entity.lane} />
        </View>
      );
    case 'expensive_cab':
      return <View style={{ transform: [{ translateX: -32 }] }}><OverpricedCab /></View>;
    case 'expensive_auto':
      return <View style={{ transform: [{ translateX: -29 }] }}><OverpricedAuto /></View>;
    case 'crowded_bus':
      return <View style={{ transform: [{ translateX: -36 }] }}><CrowdedBus /></View>;
    case 'traffic_car':
      return <View style={{ transform: [{ translateX: -29 }] }}><TrafficCar /></View>;
    case 'traffic_bike':
      return <View style={{ transform: [{ translateX: -20 }] }}><TrafficBike /></View>;
    case 'barricade':
      return <View style={{ transform: [{ translateX: -32 }] }}><Barricade /></View>;
    case 'finish':
      return (
        <View style={{ transform: [{ translateX: -110 }], marginTop: -50 }}>
          <DestinationGate />
        </View>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  entity: { position: 'absolute', top: 0, left: 0 },
  laneBox: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  player: { position: 'absolute', left: 0 },
});

export { SCALE, GAME_COLORS };
