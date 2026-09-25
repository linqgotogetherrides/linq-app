import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { RouteGeometry } from '@/src/lib/routing/osrm';
import { colors, font, radius, spacing } from '@/src/theme/tokens';

/**
 * Side-by-side route preview.
 *
 * Draws the rider's route and the searcher's route on one canvas so the overlap
 * is visible instead of being described as a number. Deliberately SVG rather
 * than a map WebView: a list of cards would otherwise spin up one WebView per
 * ride, which is far too heavy for a scrolling list.
 *
 * Coordinates arrive as GeoJSON [lon, lat]; they are projected to the viewBox
 * with a cos(lat) correction so the shape does not look stretched.
 */

const YOU = colors.primary;
const RIDER = '#F97316';

type Props = {
  userRoute?: RouteGeometry;
  driverRoute?: RouteGeometry;
  width?: number;
  height?: number;
  matchLabel?: string;
};

function toPath(
  geometry: RouteGeometry | undefined,
  project: (lon: number, lat: number) => [number, number],
): string {
  if (!geometry?.coordinates?.length) return '';
  const points = geometry.coordinates
    .slice(0, 400)
    .map((coord) => project(coord[0], coord[1]));
  if (!points.length) return '';
  return points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
}

export default function RouteMatchPreview({
  userRoute,
  driverRoute,
  width = 300,
  height = 116,
  matchLabel,
}: Props) {
  const hasBoth = Boolean(userRoute?.coordinates?.length && driverRoute?.coordinates?.length);

  const { userPath, riderPath } = useMemo(() => {
    const all: number[] = [];
    for (const geometry of [userRoute, driverRoute]) {
      for (const coord of geometry?.coordinates ?? []) {
        all.push(coord[0], coord[1]);
      }
    }
    if (all.length < 4) return { userPath: '', riderPath: '' };

    const lons = all.filter((_, i) => i % 2 === 0);
    const lats = all.filter((_, i) => i % 2 === 1);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const midLat = (minLat + maxLat) / 2;
    const lonScale = Math.cos((midLat * Math.PI) / 180) || 1;

    const pad = 16;
    const spanX = Math.max((maxLon - minLon) * lonScale, 1e-6);
    const spanY = Math.max(maxLat - minLat, 1e-6);
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);

    const project = (lon: number, lat: number): [number, number] => {
      const x = pad + (lon - minLon) * lonScale * scale;
      // Latitude grows northwards; SVG y grows downwards.
      const y = height - pad - (lat - minLat) * scale;
      return [x, y];
    };

    return {
      userPath: toPath(userRoute, project),
      riderPath: toPath(driverRoute, project),
    };
  }, [userRoute, driverRoute, width, height]);

  if (!hasBoth) {
    return (
      <View style={[styles.empty, { height, width }]}>
        <Text style={styles.emptyText}>Route preview unavailable</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID="route-match-preview">
      <Svg width={width} height={height}>
        {/* Rider's route underneath */}
        {riderPath ? (
          <Path
            d={riderPath}
            stroke={RIDER}
            strokeWidth={7}
            strokeOpacity={0.28}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : null}
        {riderPath ? (
          <Path
            d={riderPath}
            stroke={RIDER}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : null}
        {/* Searcher's route on top so the shared stretch reads clearly */}
        {userPath ? (
          <Path
            d={userPath}
            stroke={YOU}
            strokeWidth={3}
            strokeDasharray="7 5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : null}
      </Svg>

      <View style={styles.legend}>
        <LegendDot color={YOU} label="Your route" dashed />
        <LegendDot color={RIDER} label="Their route" />
        {matchLabel ? <Text style={styles.match}>{matchLabel}</Text> : null}
      </View>
    </View>
  );
}

function LegendDot({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendSwatch,
          { backgroundColor: dashed ? 'transparent' : color, borderColor: color },
          dashed && { borderWidth: 2, borderStyle: 'dashed' },
        ]}
      />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  empty: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: font.size.xs, color: colors.textTertiary },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 14, height: 3, borderRadius: 2 },
  legendText: { fontSize: 9, color: colors.textSecondary },
  match: { marginLeft: 'auto', fontSize: 9, color: colors.textTertiary },
});
