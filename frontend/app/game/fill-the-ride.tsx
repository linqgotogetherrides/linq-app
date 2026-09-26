import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import GameStage from '@/src/components/game/GameStage';
import GameHUD from '@/src/components/game/GameHUD';
import PrimaryButton from '@/src/components/PrimaryButton';
import { useApp } from '@/src/context/AppContext';
import {
  MILESTONE_PLAN_RUPEES,
  MILESTONE_WINS,
  useGame,
} from '@/src/context/GameContext';
import { useWallet } from '@/src/context/WalletContext';
import { GAME_CONFIG } from '@/src/lib/game/constants';
import { PlayerCar } from '@/src/components/game/GameArt';
import type { GameEvent, GameState } from '@/src/lib/game/types';
import { colors, font, radius, shadow, spacing } from '@/src/theme/tokens';

type Phase = 'start' | 'tutorial' | 'playing' | 'won' | 'lost' | 'outOfLives';

const SWIPE_THRESHOLD = 26;

export default function FillTheRide() {
  const router = useRouter();
  const { user } = useApp();
  const { balance } = useWallet();
  const game = useGame();

  const [phase, setPhase] = useState<Phase>('start');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [result, setResult] = useState<{ rewarded: boolean; milestoneReached: boolean }>({
    rewarded: false,
    milestoneReached: false,
  });
  const [hud, setHud] = useState({ time: GAME_CONFIG.durationMs, seats: 0 });
  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState<{ won: boolean; seats: number; score: number } | null>(null);
  const startedAt = useRef(0);
  const controlRef = useRef<((delta: -1 | 1) => void) | null>(null);

  const begin = useCallback(async () => {
    if (!user) {
      router.push('/onboarding');
      return;
    }
    setBusy(true);
    const started = await game.startRun();
    setBusy(false);

    if (!started.ok) {
      if (started.reason === 'out_of_lives') {
        setPhase('outOfLives');
        return;
      }
      return;
    }
    setSessionId(started.sessionId ?? null);
    setSeed(Math.floor(Math.random() * 2 ** 31));
    setHud({ time: GAME_CONFIG.durationMs, seats: 0 });
    setLastRun(null);
    startedAt.current = Date.now();
    setPhase('playing');
  }, [game, router, user]);

  // First-time tutorial only.
  useEffect(() => {
    if (game.showTutorial) setPhase('tutorial');
  }, [game.showTutorial]);

  const finish = useCallback(
    async (state: GameState) => {
      // Defensive: only a real win or loss should ever settle a run.
      if (state.phase !== 'won' && state.phase !== 'lost') return;

      const durationMs = Date.now() - startedAt.current;
      const won = state.phase === 'won';
      setLastRun({ won, seats: state.seats, score: Math.round(state.score) });

      if (sessionId) {
        const settled = await game.settleRun({
          sessionId,
          result: won ? 'WIN' : 'LOSS',
          score: state.score,
          passengers: state.seats,
          durationMs,
        });
        setResult(settled);
      }
      setPhase(won ? 'won' : 'lost');
    },
    [game, sessionId],
  );

  const onEvent = useCallback((event: GameEvent) => {
    if (event.type === 'tick') return;
    if (event.type === 'pickup') {
      setHud((h) => ({ ...h, seats: event.seats }));
    }
  }, []);

  // The engine owns the clock. Using wall-clock here desynced the HUD from the
  // game whenever the app was briefly backgrounded.
  const onTime = useCallback((remainingMs: number) => {
    setHud((h) => (Math.abs(h.time - remainingMs) > 100 ? { ...h, time: remainingMs } : h));
  }, []);

  /**
   * Leave the game without bouncing the player back into it.
   * replace() drops the game screen, so Back from the next screen goes
   * somewhere useful instead of straight back here.
   */
  const exitGame = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  // Swipe controls.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > SWIPE_THRESHOLD && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
      onPanResponderMove: (_e, g) => {
        if (g.dx > SWIPE_THRESHOLD * 2.5) {
          controlRef.current?.(1);
          g.dx = 0;
        } else if (g.dx < -SWIPE_THRESHOLD * 2.5) {
          controlRef.current?.(-1);
          g.dx = 0;
        }
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dx > SWIPE_THRESHOLD) controlRef.current?.(1);
        else if (g.dx < -SWIPE_THRESHOLD) controlRef.current?.(-1);
      },
    }),
  ).current;

  // The countdown is driven by the engine via onTime; this only covers the
  // brief window between starting and the first frame.
  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => {
      setHud((h) => (h.time <= 0 ? h : h));
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  if (!user) {
    return (
      <SafeAreaView style={styles.screen} testID="game-screen">
        <View style={styles.center}>
          <Ionicons name="game-controller-outline" size={44} color={colors.primary} />
          <Text style={styles.startTitle}>Fill the Ride</Text>
          <PrimaryButton title="Sign in to play" onPress={() => router.push('/onboarding')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} testID="game-screen" edges={['top']}>
      <View {...pan.panHandlers} style={styles.flex}>
        {phase === 'playing' || phase === 'won' || phase === 'lost' ? (
          <>
            <GameHUD
              lives={game.lives ?? 0}
              timeRemainingMs={hud.time}
              seats={hud.seats}
              wins={game.wins}
              targetWins={MILESTONE_WINS}
              onPause={() => setPhase('start')}
            />
            <GameStage
              seed={seed}
              running={phase === 'playing'}
              onEvent={onEvent}
              onFinish={finish}
              controlRef={controlRef}
              onTime={onTime}
            />
          </>
        ) : (
          <View style={styles.screenBody}>
            <View style={styles.menuBar}>
              <Pressable
                style={styles.menuBack}
                onPress={exitGame}
                hitSlop={12}
                testID="game-back-button"
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
              </Pressable>
              <Text style={styles.menuTitle}>Fill the Ride</Text>
              <View style={{ width: 40 }} />
            </View>
            {phase === 'start' && (
              <StartScreen
                lives={game.lives}
                wins={game.wins}
                balance={balance}
                busy={busy}
                onStart={() => void begin()}
                onRefer={() => router.replace('/referral')}
              />
            )}
            {phase === 'tutorial' && (
              <TutorialScreen
                onDone={async () => {
                  await game.markTutorialSeen();
                  setPhase('start');
                }}
              />
            )}
            {phase === 'outOfLives' && (
              <OutOfLivesScreen
                wins={game.wins}
                onRefer={() => router.replace('/referral')}
                onClose={() => router.back()}
              />
            )}
          </View>
        )}

        {(phase === 'won' || phase === 'lost') && (
          <ResultOverlay
            won={phase === 'won'}
            rewarded={result.rewarded}
            milestoneReached={result.milestoneReached}
            wins={game.wins}
            lastRun={lastRun}
            onAgain={() => void begin()}
            onRefer={() => router.replace('/referral')}
            onClose={() => router.replace('/referral')}
            onMilestone={() => router.push('/game/milestone')}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */

function StartScreen({
  lives,
  wins,
  balance,
  busy,
  onStart,
  onRefer,
}: {
  lives: number | null;
  wins: number;
  balance: number;
  busy: boolean;
  onStart: () => void;
  onRefer: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.panel} showsVerticalScrollIndicator={false}>
      <View style={styles.heroWrap}>
        <PlayerCar size={96} />
      </View>

      <Text style={styles.startTitle}>FILL THE RIDE</Text>
      <Text style={styles.startSub}>
        Can you fill all {GAME_CONFIG.seatsRequired} seats? Collect passengers, avoid
        traffic, and beat the clock.
      </Text>

      <View style={styles.statRow}>
        <StatBox
          label="Lives"
          value={lives == null ? '—' : `${lives}`}
          icon="heart"
          tint={colors.error}
        />
        <StatBox label="Wins" value={`${wins}/${MILESTONE_WINS}`} icon="trophy" tint={colors.warning} />
        <StatBox label="Wallet" value={`₹${Math.round(balance)}`} icon="wallet" tint={colors.primary} />
      </View>

      <PrimaryButton
        title={busy ? 'Starting…' : 'START GAME'}
        icon="play"
        onPress={onStart}
        loading={busy}
        disabled={busy || lives === 0 || lives == null}
        testID="game-start-button"
      />

      <View style={styles.earnNote}>
        <Ionicons name="cash-outline" size={15} color={colors.success} />
        <Text style={styles.earnText}>Every win earns ₹5 LinQ credit</Text>
      </View>

      {lives === 0 ? (
        <>
          <Text style={styles.earnText}>You have used all your lives this week.</Text>
          <PrimaryButton
            title="REFER A FRIEND"
            icon="gift"
            variant="secondary"
            onPress={onRefer}
            testID="game-refer-button"
          />
        </>
      ) : null}

      {lives == null ? (
        <Text style={styles.earnText} testID="game-lives-unknown">
          We could not load your lives. Check your connection and try again.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function TutorialScreen({ onDone }: { onDone: () => void }) {
  const steps = [
    { icon: 'swap-horizontal', title: 'Switch lanes', body: 'Swipe left or right to move between the three lanes.' },
    { icon: 'people', title: 'Collect passengers', body: `Drive through all ${GAME_CONFIG.seatsRequired} passengers to fill your car.` },
    { icon: 'warning', title: 'Avoid obstacles', body: 'Cabs, autos and full buses cost you time. Beat the clock.' },
  ];
  return (
    <ScrollView contentContainerStyle={styles.panel} showsVerticalScrollIndicator={false}>
      <Text style={styles.startTitle}>HOW TO PLAY</Text>
      <Text style={styles.startSub}>
        Fill the seats in your car within the time and reach the destination.
      </Text>
      {steps.map((step, i) => (
        <View key={step.title} style={styles.tutorialStep}>
          <View style={styles.tutorialIcon}>
            <Ionicons name={step.icon as never} size={20} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.tutorialTitle}>{i + 1}. {step.title}</Text>
            <Text style={styles.tutorialBody}>{step.body}</Text>
          </View>
        </View>
      ))}
      <PrimaryButton title="LET&apos;S RIDE" icon="car" onPress={onDone} testID="game-tutorial-done" />
    </ScrollView>
  );
}

function OutOfLivesScreen({
  wins,
  onRefer,
  onClose,
}: {
  wins: number;
  onRefer: () => void;
  onClose: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.panel} showsVerticalScrollIndicator={false}>
      <View style={styles.heroWrap}>
        <Ionicons name="heart-dislike" size={54} color={colors.error} />
      </View>
      <Text style={styles.startTitle}>Out of Lives</Text>
      <Text style={styles.startSub}>
        Want another chance to fill the ride? Refer a friend and earn one free life.
      </Text>
      <View style={styles.rewardBox}>
        <Ionicons name="gift" size={22} color={colors.primary} />
        <Text style={styles.rewardText}>Refer a friend → +1 Life</Text>
      </View>
      <Text style={styles.footnote}>
        Lives refill to 3 every 7 days. You have {wins} win{MILESTONE_WINS - wins > 1 ? 's' : ''} so far.
      </Text>
      <PrimaryButton title="REFER A FRIEND" icon="gift" onPress={onRefer} testID="game-outoflives-refer" />
      <Pressable style={styles.linkBtn} onPress={onClose}>
        <Text style={styles.linkText}>Not now</Text>
      </Pressable>
    </ScrollView>
  );
}

function ResultOverlay({
  won,
  rewarded,
  milestoneReached,
  wins,
  lastRun,
  onAgain,
  onRefer,
  onClose,
  onMilestone,
}: {
  won: boolean;
  rewarded: boolean;
  milestoneReached: boolean;
  wins: number;
  lastRun: { won: boolean; seats: number; score: number } | null;
  onAgain: () => void;
  onRefer: () => void;
  onClose: () => void;
  onMilestone: () => void;
}) {
  return (
    <View style={styles.overlay} testID="game-result">
      <LinearGradient
        colors={won ? ['#ECFDF5', '#FFFFFF'] : ['#FEF2F2', '#FFFFFF']}
        style={styles.resultCard}
      >
        <Ionicons
          name={won ? 'trophy' : 'time'}
          size={52}
          color={won ? colors.success : colors.error}
        />
        <Text style={styles.resultTitle}>{won ? 'RIDE FILLED!' : "Time's Up!"}</Text>
        <Text style={styles.resultSub}>
          {won
            ? 'You filled every seat in time.'
            : `You collected ${lastRun?.seats ?? 0} of ${GAME_CONFIG.seatsRequired} passengers.`}
        </Text>

        {won ? (
          <>
            <View style={styles.rewardBox}>
              <Ionicons name="cash" size={22} color={colors.success} />
              <Text style={[styles.rewardText, { color: colors.success }]}>
                {rewarded ? '+₹5 LinQ Credit' : '₹5 credit pending'}
              </Text>
            </View>
            <Text style={styles.scoreLine}>Score {lastRun?.score ?? 0}</Text>
          </>
        ) : (
          <Text style={styles.encourageText}>
            You were close. Watch the open lane and keep going.
          </Text>
        )}

        <Text style={styles.winsLine} testID="game-wins-line">
          Wins: {wins} / {MILESTONE_WINS}
        </Text>

        {milestoneReached ? (
          <Pressable
            style={styles.milestone}
            testID="game-milestone"
            onPress={onMilestone}
          >
            <Ionicons name="trophy" size={20} color={colors.warning} />
            <View style={styles.flex}>
              <Text style={styles.milestoneText}>
                10 RIDES FILLED! Annual plan unlocked at ₹{MILESTONE_PLAN_RUPEES}/year
              </Text>
              <Text style={styles.milestoneLink}>Tap to view your reward</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.warning} />
          </Pressable>
        ) : null}

        <View style={{ width: '100%', gap: spacing.sm, marginTop: spacing.md }}>
          <PrimaryButton
            title={won ? 'PLAY AGAIN' : 'TRY AGAIN'}
            icon="refresh"
            onPress={onAgain}
            testID="game-again-button"
          />
          <PrimaryButton
            title="REFER A FRIEND"
            icon="gift"
            variant="secondary"
            onPress={onRefer}
            testID="game-result-refer"
          />
          <Pressable style={styles.linkBtn} onPress={onClose}>
            <Text style={styles.linkText}>Back to referral & rewards</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}

function StatBox({
  label,
  value,
  icon,
  tint,
}: {
  label: string;
  value: string;
  icon: string;
  tint: string;
}) {
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon as never} size={16} color={tint} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0E1620' },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, backgroundColor: colors.background },
  screenBody: { flex: 1, backgroundColor: colors.background },
  menuBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  menuBack: { width: 40, alignItems: 'flex-start' },
  menuTitle: {
    fontSize: font.size.xl,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
  },
  panel: { padding: spacing.xl, paddingBottom: 60, paddingTop: spacing.xl, alignItems: 'stretch' },
  heroWrap: { alignItems: 'center', marginVertical: spacing.lg },
  startTitle: {
    fontSize: font.size.display,
    color: colors.textPrimary,
    fontWeight: font.weight.bold,
    textAlign: 'center',
    letterSpacing: 1,
  },
  startSub: {
    fontSize: font.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  statBox: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  statLabel: { fontSize: font.size.xs, color: colors.textSecondary },
  earnNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginVertical: spacing.md,
  },
  earnText: { fontSize: font.size.sm, color: colors.success, fontWeight: font.weight.medium },
  tutorialStep: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  tutorialIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tutorialTitle: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  tutorialBody: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
  rewardBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginVertical: spacing.md,
  },
  rewardText: { fontSize: font.size.base, color: colors.primary, fontWeight: font.weight.medium },
  footnote: { fontSize: font.size.xs, color: colors.textTertiary, textAlign: 'center', marginBottom: spacing.lg },
  linkBtn: { alignItems: 'center', paddingVertical: spacing.md },
  linkText: { fontSize: font.size.sm, color: colors.textSecondary, fontWeight: font.weight.medium },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14,22,32,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  resultCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.lg,
  },
  resultTitle: { fontSize: font.size['2xl'], color: colors.textPrimary, fontWeight: font.weight.bold, marginTop: spacing.sm },
  resultSub: { fontSize: font.size.sm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs, lineHeight: 19 },
  scoreLine: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  encourageText: { fontSize: font.size.sm, color: colors.textSecondary, textAlign: 'center', marginVertical: spacing.md, lineHeight: 19 },
  winsLine: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, marginTop: spacing.sm },
  milestone: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  milestoneText: { fontSize: font.size.xs, color: colors.textSecondary, fontWeight: font.weight.medium },
  milestoneLink: { fontSize: 9, color: colors.warning, marginTop: 2, fontWeight: font.weight.medium },
});
