/**
 * Fill the Ride — original LinQ vector art.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ THIS FILE IS THE ART SWAP POINT.                                      │
 * │ Every visual in the game is defined here. If you commission proper    │
 * │ illustration, replace the components below and nothing else in the    │
 * │ codebase has to change — the engine, screens and backend all reference │
 * │ entity kinds and colours, never raw artwork.                         │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * All shapes are drawn from scratch with react-native-svg. Nothing here is
 * derived from Subway Surfers, Temple Run, or any other existing game.
 *
 * Palette follows the LinQ brand tokens so the game sits inside the app.
 */
import React from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { colors } from '@/src/theme/tokens';

export const GAME_COLORS = {
  road: '#2B3440',
  roadLight: '#38424F',
  roadEdge: '#1E252E',
  laneMark: '#F2F5F9',
  carBody: '#10B981',
  carBodyDark: '#059669',
  carGlass: '#BFE9DC',
  tyre: '#11161C',
  chrome: '#C9D3DF',
  bus: '#F59E0B',
  busDark: '#D97706',
  cab: '#3B82F6',
  cabDark: '#1D4ED8',
  auto: '#EC4899',
  autoDark: '#BE185D',
  hazard: '#EF4444',
  hazardStripe: '#F8FAFC',
  passenger: '#38BDF8',
  passengerGlow: '#7DD3FC',
  destination: '#FACC15',
  building: '#1B2430',
  buildingLit: '#2A3646',
  windowLit: '#FCD34D',
};

/* ------------------------------------------------------------------ */
/* Player car                                                          */
/* ------------------------------------------------------------------ */

export function PlayerCar({ size = 78 }: { size?: number }) {
  const w = size;
  const h = size * 1.55;
  return (
    <Svg width={w} height={h} viewBox="0 0 60 93">
      <Defs>
        <LinearGradient id="linqBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#34D399" />
          <Stop offset="0.55" stopColor={GAME_COLORS.carBody} />
          <Stop offset="1" stopColor={GAME_COLORS.carBodyDark} />
        </LinearGradient>
      </Defs>

      {/* shadow */}
      <Ellipse cx="30" cy="88" rx="23" ry="5" fill="rgba(0,0,0,0.28)" />

      {/* tyres */}
      <Rect x="4" y="22" width="7" height="15" rx="3" fill={GAME_COLORS.tyre} />
      <Rect x="49" y="22" width="7" height="15" rx="3" fill={GAME_COLORS.tyre} />
      <Rect x="4" y="60" width="7" height="15" rx="3" fill={GAME_COLORS.tyre} />
      <Rect x="49" y="60" width="7" height="15" rx="3" fill={GAME_COLORS.tyre} />

      {/* body */}
      <Path
        d="M30 2 C18 2 10 12 9 26 L7 70 C6 84 16 91 30 91 C44 91 54 84 53 70 L51 26 C50 12 42 2 30 2 Z"
        fill="url(#linqBody)"
        stroke={GAME_COLORS.carBodyDark}
        strokeWidth="1.5"
      />

      {/* windscreen */}
      <Path d="M17 20 C20 13 25 11 30 11 C35 11 40 13 43 20 L44 33 L16 33 Z" fill={GAME_COLORS.carGlass} />
      {/* rear window */}
      <Path d="M17 68 L43 68 L41 79 C38 83 34 84 30 84 C26 84 22 83 19 79 Z" fill={GAME_COLORS.carGlass} opacity="0.75" />

      {/* roof panel + mirrors */}
      <Rect x="16" y="36" width="28" height="28" rx="7" fill={GAME_COLORS.carBodyDark} opacity="0.28" />
      <Rect x="2" y="34" width="8" height="4" rx="2" fill={GAME_COLORS.carBodyDark} />
      <Rect x="50" y="34" width="8" height="4" rx="2" fill={GAME_COLORS.carBodyDark} />

      {/* headlights */}
      <Rect x="12" y="82" width="9" height="5" rx="2.5" fill="#FDE68A" />
      <Rect x="39" y="82" width="9" height="5" rx="2.5" fill="#FDE68A" />

      {/* plate */}
      <Rect x="22" y="84.5" width="16" height="5" rx="1.5" fill="#FFFFFF" />
      <SvgText x="30" y="88.6" fill={GAME_COLORS.carBodyDark} fontSize="3.4" fontWeight="bold" textAnchor="middle">
        LinQ
      </SvgText>
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Passengers                                                          */
/* ------------------------------------------------------------------ */

export function Passenger({ size = 46, tone = 0 }: { size?: number; tone?: number }) {
  const shirts = ['#38BDF8', '#A78BFA', '#FB923C', '#F472B6', '#34D399'];
  const shirt = shirts[tone % shirts.length];
  return (
    <Svg width={size} height={size * 1.25} viewBox="0 0 40 50">
      {/* glow ring */}
      <Circle cx="20" cy="34" r="17" fill={GAME_COLORS.passengerGlow} opacity="0.22" />
      <Ellipse cx="20" cy="46" rx="11" ry="3" fill="rgba(0,0,0,0.25)" />

      {/* legs */}
      <Rect x="15" y="34" width="4" height="12" rx="2" fill="#334155" />
      <Rect x="21" y="34" width="4" height="12" rx="2" fill="#334155" />
      {/* body */}
      <Path d="M12 20 C12 16 20 16 20 16 C20 16 28 16 28 20 L29 35 L11 35 Z" fill={shirt} />
      {/* arms */}
      <Rect x="8" y="21" width="4" height="12" rx="2" fill={shirt} />
      <Rect x="28" y="21" width="4" height="12" rx="2" fill={shirt} />
      {/* head */}
      <Circle cx="20" cy="12" r="8" fill="#FCD9B6" />
      <Path d="M12 11 C12 5 28 5 28 11 C28 8 24 6 20 6 C16 6 12 8 12 11 Z" fill="#1F2937" />
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Obstacles                                                           */
/* ------------------------------------------------------------------ */

function BaseVehicle({
  body,
  bodyDark,
  w = 64,
  h = 96,
  glass = GAME_COLORS.carGlass,
  label,
  labelColor = '#FFFFFF',
  labelBg = 'rgba(0,0,0,0.35)',
}: {
  body: string;
  bodyDark: string;
  w?: number;
  h?: number;
  glass?: string;
  label?: string;
  labelColor?: string;
  labelBg?: string;
}) {
  return (
    <Svg width={w} height={h} viewBox="0 0 60 90">
      <Ellipse cx="30" cy="85" rx="22" ry="5" fill="rgba(0,0,0,0.28)" />
      <Rect x="4" y="20" width="7" height="15" rx="3" fill={GAME_COLORS.tyre} />
      <Rect x="49" y="20" width="7" height="15" rx="3" fill={GAME_COLORS.tyre} />
      <Rect x="4" y="58" width="7" height="15" rx="3" fill={GAME_COLORS.tyre} />
      <Rect x="49" y="58" width="7" height="15" rx="3" fill={GAME_COLORS.tyre} />
      <Path
        d="M30 3 C19 3 11 12 10 26 L8 69 C7 83 16 87 30 87 C44 87 53 83 52 69 L50 26 C49 12 41 3 30 3 Z"
        fill={body}
        stroke={bodyDark}
        strokeWidth="1.5"
      />
      <Path d="M17 21 C20 14 25 12 30 12 C35 12 40 14 43 21 L44 34 L16 34 Z" fill={glass} />
      <Path d="M17 64 L43 64 L41 76 C38 80 34 81 30 81 C26 81 22 80 19 76 Z" fill={glass} opacity="0.7" />
      <Rect x="13" y="78" width="8" height="4" rx="2" fill="#FEE2A0" />
      <Rect x="39" y="78" width="8" height="4" rx="2" fill="#FEE2A0" />
      {label ? (
        <G>
          <Rect x="8" y="40" width="44" height="18" rx="6" fill={labelBg} />
          <Rect
            x="8"
            y="40"
            width="44"
            height="18"
            rx="6"
            fill="none"
            stroke={labelColor}
            strokeWidth="1"
            opacity="0.4"
          />
          <SvgText
            x="30"
            y="53.5"
            fill={labelColor}
            fontSize="12"
            fontWeight="bold"
            textAnchor="middle"
          >
            {label}
          </SvgText>
        </G>
      ) : null}
    </Svg>
  );
}

export const OverpricedCab = () => (
  <BaseVehicle body={GAME_COLORS.cab} bodyDark={GAME_COLORS.cabDark} label="450" />
);

export const OverpricedAuto = () => (
  <BaseVehicle body={GAME_COLORS.auto} bodyDark={GAME_COLORS.autoDark} w={58} h={80} label="350" />
);

export const CrowdedBus = () => (
  <Svg width={72} height={118} viewBox="0 0 66 108">
    <Ellipse cx="33" cy="102" rx="27" ry="6" fill="rgba(0,0,0,0.3)" />
    <Rect x="3" y="26" width="8" height="18" rx="3" fill={GAME_COLORS.tyre} />
    <Rect x="55" y="26" width="8" height="18" rx="3" fill={GAME_COLORS.tyre} />
    <Rect x="3" y="70" width="8" height="18" rx="3" fill={GAME_COLORS.tyre} />
    <Rect x="55" y="70" width="8" height="18" rx="3" fill={GAME_COLORS.tyre} />
    <Rect x="3" y="4" width="60" height="100" rx="11" fill={GAME_COLORS.bus} stroke={GAME_COLORS.busDark} strokeWidth="2" />
    {/* windows with passengers crammed in — the "FULL" joke */}
    <Rect x="9" y="14" width="48" height="26" rx="5" fill="#1F2937" />
    {[14, 23, 32, 41, 50].map((cx, i) => (
      <Circle key={i} cx={cx} cy={25} r={4.6} fill={['#38BDF8', '#F472B6', '#A78BFA', '#FB923C', '#34D399'][i]} />
    ))}
    <Rect x="9" y="46" width="48" height="20" rx="5" fill="#1F2937" />
    <Rect x="9" y="72" width="48" height="18" rx="5" fill="#1F2937" />
    <Rect x="12" y="96" width="12" height="5" rx="2.5" fill="#FDE68A" />
    <Rect x="42" y="96" width="12" height="5" rx="2.5" fill="#FDE68A" />
    <G>
      <Rect x="14" y="92" width="38" height="16" rx="5" fill={GAME_COLORS.hazard} />
      <SvgText
        x="33"
        y="104.5"
        fill="#FFFFFF"
        fontSize="12"
        fontWeight="bold"
        textAnchor="middle"
      >
        FULL
      </SvgText>
    </G>
  </Svg>
);

export const TrafficCar = () => (
  <BaseVehicle body="#64748B" bodyDark="#475569" w={58} h={88} />
);

export const TrafficBike = () => (
  <Svg width={40} height={62} viewBox="0 0 40 62">
    <Ellipse cx="20" cy="58" rx="14" ry="3" fill="rgba(0,0,0,0.25)" />
    <Circle cx="9" cy="16" r="7" fill="none" stroke={GAME_COLORS.tyre} strokeWidth="3" />
    <Circle cx="31" cy="50" r="7" fill="none" stroke={GAME_COLORS.tyre} strokeWidth="3" />
    <Rect x="17" y="16" width="6" height="34" rx="3" fill="#0EA5E9" />
    <Path d="M12 14 L28 14 L26 8 L14 8 Z" fill="#0EA5E9" />
    <Circle cx="20" cy="9" r="5" fill="#FCD9B6" />
    <Rect x="15" y="6" width="10" height="3" rx="1.5" fill="#1F2937" />
  </Svg>
);

export const Barricade = () => (
  <Svg width={64} height={58} viewBox="0 0 64 58">
    <Ellipse cx="32" cy="53" rx="24" ry="4" fill="rgba(0,0,0,0.25)" />
    <Rect x="26" y="22" width="12" height="32" rx="3" fill="#64748B" />
    <Rect x="4" y="8" width="56" height="20" rx="5" fill={GAME_COLORS.hazard} />
    {[0, 1, 2, 3, 4].map((i) => (
      <Path
        key={i}
        d={`M${8 + i * 12} 8 l7 20 l-7 0 z`}
        fill={GAME_COLORS.hazardStripe}
      />
    ))}
    <Rect x="4" y="8" width="56" height="20" rx="5" fill="none" stroke="#B91C1C" strokeWidth="1.5" />
    {/* hazard lamp */}
    <Circle cx="32" cy="18" r="4" fill="#FDE047" />
  </Svg>
);

export const DestinationGate = () => (
  <Svg width={220} height={70} viewBox="0 0 220 70">
    <Rect x="6" y="14" width="10" height="56" rx="4" fill="#475569" />
    <Rect x="204" y="14" width="10" height="56" rx="4" fill="#475569" />
    <Rect x="4" y="6" width="212" height="26" rx="8" fill={GAME_COLORS.destination} />
    <G>
      <Rect x="14" y="12" width="192" height="14" rx="4" fill="#1F2937" opacity="0.18" />
      <SvgText
        x="110"
        y="24"
        fill="#3F2D00"
        fontSize="15"
        fontWeight="bold"
        textAnchor="middle"
      >
        DESTINATION
      </SvgText>
    </G>
  </Svg>
);

/* ------------------------------------------------------------------ */
/* City backdrop                                                       */
/* ------------------------------------------------------------------ */

export function CityBackdrop({ width, height }: { width: number; height: number }) {
  const buildings = useMemoBuildings(width);
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Rect x="0" y="0" width={width} height={height} fill="#0E1620" />
      {buildings.map((b, i) => (
        <G key={i}>
          <Rect
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={3}
            fill={i % 2 === 0 ? GAME_COLORS.building : GAME_COLORS.buildingLit}
          />
          {b.lights.map((l, j) => (
            <Rect
              key={j}
              x={b.x + 4 + (j % 3) * 9}
              y={b.y + 6 + Math.floor(j / 3) * 12}
              width={5}
              height={7}
              rx={1}
              fill={GAME_COLORS.windowLit}
              opacity={0.25 + ((i + j) % 4) * 0.16}
            />
          ))}
        </G>
      ))}
    </Svg>
  );
}

// Deterministic skyline so the backdrop does not flicker between renders.
function useMemoBuildings(width: number) {
  return React.useMemo(() => {
    const out: { x: number; y: number; w: number; h: number; lights: number[] }[] = [];
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    let x = -6;
    while (x < width + 10) {
      const w = 20 + Math.floor(rand() * 26);
      const h = 34 + Math.floor(rand() * 92);
      out.push({ x, y: 0, w, h, lights: Array.from({ length: 8 }, () => rand()) });
      x += w + 3;
    }
    return out;
  }, [width]);
}

/* ------------------------------------------------------------------ */
/* Road surface                                                        */
/* ------------------------------------------------------------------ */

export function RoadSurface({ width, height, lanes }: { width: number; height: number; lanes: number }) {
  const laneWidth = width / lanes;
  const dashes = Math.ceil(height / 64) + 1;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Rect x="0" y="0" width={width} height={height} fill={GAME_COLORS.road} />
      {/* subtle centre sheen */}
      <Rect x="0" y="0" width={width} height={height} fill={GAME_COLORS.roadLight} opacity="0.35" />
      {/* kerbs */}
      <Rect x="0" y="0" width={7} height={height} fill={GAME_COLORS.roadEdge} />
      <Rect x={width - 7} y="0" width={7} height={height} fill={GAME_COLORS.roadEdge} />
      {/* lane dashes */}
      {Array.from({ length: lanes - 1 }).map((_, i) => (
        <G key={i}>
          {Array.from({ length: dashes }).map((__, j) => (
            <Rect
              key={j}
              x={laneWidth * (i + 1) - 3}
              y={j * 64}
              width={6}
              height={32}
              rx={3}
              fill={GAME_COLORS.laneMark}
              opacity={0.5}
            />
          ))}
        </G>
      ))}
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Air pollution haze                                                   */
/* ------------------------------------------------------------------ */

export function PollutionHaze({ width, height, intensity }: { width: number; height: number; intensity: number }) {
  if (intensity <= 0.01) return null;
  return (
    <Svg pointerEvents="none" width={width} height={height} style={{ position: 'absolute' }}>
      <Defs>
        <LinearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#94A3B8" stopOpacity={0.5 * intensity} />
          <Stop offset="0.5" stopColor="#64748B" stopOpacity={0.32 * intensity} />
          <Stop offset="1" stopColor="#475569" stopOpacity={0.42 * intensity} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#haze)" />
      {[
        { cx: width * 0.28, cy: height * 0.35, r: 46 },
        { cx: width * 0.7, cy: height * 0.55, r: 34 },
        { cx: width * 0.45, cy: height * 0.78, r: 40 },
      ].map((c, i) => (
        <Circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill="#94A3B8" opacity={0.13 * intensity} />
      ))}
      <Svg
        x={width / 2 - 16}
        y={height * 0.18}
        width={32}
        height={32}
        viewBox="0 0 32 32"
      >
        <Circle cx="16" cy="16" r="9" fill="none" stroke="#E2E8F0" strokeWidth="2.4" opacity={0.7 * intensity} />
        <Circle cx="16" cy="16" r="3" fill="#E2E8F0" opacity={0.5 * intensity} />
      </Svg>
    </Svg>
  );
}

export { colors as appColors };
