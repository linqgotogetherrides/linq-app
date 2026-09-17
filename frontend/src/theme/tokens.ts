// LinQ Rides – Design Tokens
export const colors = {
  // Brand
  primary: '#2453C8',
  primaryDark: '#173D9D',
  primaryLight: '#EEF4FF',
  primaryMuted: '#DCE7FF',

  // Text
  textPrimary: '#172033',
  textSecondary: '#637596',
  textTertiary: '#8995AA',
  textInverse: '#FFFFFF',

  // Surfaces
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSecondary: '#F7F9FC',
  surfaceTertiary: '#EEF4FF',
  surfaceInverse: '#172033',

  // Borders
  border: '#E8ECF3',
  borderStrong: '#D1D9E6',
  divider: '#EDF0F5',

  // Semantic
  success: '#10B981',
  successLight: '#E6F7F0',
  warning: '#F59E0B',
  warningLight: '#FFF6E5',
  error: '#EF4444',
  errorLight: '#FDECEC',
  info: '#3B82F6',
  infoLight: '#E6F0FF',

  // Extras
  female: '#EC4899',
  femaleLight: '#FCE7F3',
  yellow: '#FACC15',
  eco: '#10B981',
  overlay: 'rgba(23,32,51,0.5)',
  cardShadow: 'rgba(23,32,51,0.06)',
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  pill: 999,
};

// Font weights capped at 500 per design system.
export const font = {
  // sizes
  size: {
    xxs: 10,
    xs: 11,
    sm: 12,
    md: 13,
    base: 14,
    lg: 15,
    xl: 17,
    '2xl': 20,
    '3xl': 24,
    '4xl': 28,
    display: 32,
  },
  // weights (system font behaviour; iOS uses SF, Android Roboto)
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '500' as const, // cap
    bold: '500' as const, // cap
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
};

export const shadow = {
  none: {},
  sm: {
    shadowColor: '#172033',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#172033',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#172033',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },
};

export const layout = {
  screenPadding: 20,
  tabBarHeight: 72,
  headerHeight: 56,
  minTapTarget: 44,
};
