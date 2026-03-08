import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Image,
  Share,
  Platform,
  Modal,
  Animated,
  Easing,
  Vibration,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { createUsersForActor, rewardCatalog } from './src/data/seed';
import { createPromise } from './src/logic/betting';
import TopNav from './src/components/TopNav';
import { auth, db } from './src/lib/firebase';
import { judgeProof } from './src/lib/aiJudge';
import { generateVictoryPoster } from './src/lib/aiPoster';
import {
  buildPredictiveNudge,
  computeTrueOddsFromLastTen,
  generateBookieComment,
  summarizeDisputeEvidence,
  synthesizeBet,
} from './src/lib/aiPlatform';
import {
  computeUserHistoryStats,
  generateUserRecap,
  predictPassOddsFromHistory,
} from './src/lib/aiInsights';

const DEFAULT_BET = '100';
const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000;

function resolveActorName(user) {
  if (user?.displayName) return user.displayName;
  if (user?.email) return user.email;
  return 'You';
}

function withSelfCoins(userList, coins) {
  return userList.map((u) => (u.isSelf ? { ...u, coins } : u));
}

function parseDeadlineToMs(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : NaN;
}

function buildReferralCode(name, uid) {
  const base = (name || 'player').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5) || 'PLAYER';
  const tail = (uid || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || '0000';
  return `${base}${tail}`;
}

function formatDeadlineInput(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatDate(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'N/A';
  return new Date(ms).toLocaleString();
}

function formatTimeRemaining(deadlineMs, nowMs) {
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) return 'N/A';
  const diff = deadlineMs - nowMs;
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h left`;
  }
  return `${hours}h ${minutes}m left`;
}

function computeStreak(bets, userId) {
  const mine = (bets || [])
    .filter((b) => b.ownerId === userId && b.status === 'SETTLED')
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  let streak = 0;
  for (const bet of mine) {
    if (bet.aiVerdict === 'PASS') {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

function getBetTag(text) {
  const value = (text || '').toLowerCase();
  if (value.includes('gym') || value.includes('run') || value.includes('workout')) return 'Fitness';
  if (value.includes('wake') || value.includes('sleep') || value.includes('morning')) return 'Wake Up';
  if (value.includes('study') || value.includes('read') || value.includes('learn')) return 'Learning';
  if (value.includes('build') || value.includes('code') || value.includes('ship')) return 'Build';
  return 'Challenge';
}

function getInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function toHandle(name) {
  const handle = (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return `@${handle || 'player'}`;
}

function inferBetType(bet, selfId) {
  if (bet?.betType === 'CALL_OUT' || bet?.betType === 'COMMITMENT') return bet.betType;
  return bet?.ownerId === selfId ? 'COMMITMENT' : 'CALL_OUT';
}

function cleanBetCardTitle(text) {
  const value = (text || '').trim();
  return value.replace(/^User will submit proof by .*?Goal:\s*/i, '').trim();
}

function DeadlineRingAvatar({ initials, progress, onPress }) {
  const size = 42;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, progress));
  const dashOffset = circumference * (1 - pct);
  return (
    <Pressable onPress={onPress} style={styles.ringWrap}>
      <Svg width={size} height={size} style={styles.ringSvg}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#3D3D3D" strokeWidth={stroke} fill="transparent" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#F0F0F0"
          strokeWidth={stroke}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
          fill="transparent"
        />
      </Svg>
      <View style={styles.ownerBadge}>
        <Text style={styles.ownerBadgeText}>{initials}</Text>
      </View>
    </Pressable>
  );
}

function LiquidPoolBar({ ratio, majorityYes }) {
  const animated = useRef(new Animated.Value(Math.max(0, Math.min(1, ratio)))).current;
  useEffect(() => {
    Animated.timing(animated, {
      toValue: Math.max(0, Math.min(1, ratio)),
      duration: 500,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [animated, ratio]);

  const width = animated.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.poolTrack}>
      <Animated.View
        style={[
          styles.poolLiquidFill,
          majorityYes ? styles.poolLiquidYes : styles.poolLiquidNo,
          { width },
        ]}
      />
    </View>
  );
}

function normalizeBet(docSnap) {
  const payload = docSnap.data() || {};
  return {
    id: docSnap.id,
    text: payload.text || '',
    deadlineISO: payload.deadlineISO || '',
    actorId: payload.actorId || payload.ownerId,
    ownerId: payload.ownerId,
    ownerName: payload.ownerName || 'Unknown',
    betType: payload.betType === 'CALL_OUT' || payload.betType === 'COMMITMENT' ? payload.betType : 'CALL_OUT',
    status: payload.status || 'OPEN',
    proofNote: payload.proofNote || '',
    proofImageUri: payload.proofImageUri || '',
    victoryPosterUri: payload.victoryPosterUri || '',
    victoryPosterStyle: payload.victoryPosterStyle || '',
    victoryPosterProvider: payload.victoryPosterProvider || '',
    victoryPosterError: payload.victoryPosterError || '',
    trueOdds: Number.isFinite(payload.trueOdds) ? payload.trueOdds : null,
    riskLabel: payload.riskLabel || '',
    aiBookieComment: payload.aiBookieComment || '',
    aiDisputeSummary: payload.aiDisputeSummary || '',
    aiDisputeProvider: payload.aiDisputeProvider || '',
    proofVideoUri: payload.proofVideoUri || '',
    secretGesture: payload.secretGesture || '',
    ownerStake: Number.isFinite(payload.ownerStake) ? payload.ownerStake : 0,
    ownerStakeMultiplier: Number.isFinite(payload.ownerStakeMultiplier) ? payload.ownerStakeMultiplier : 1.8,
    nudgeSentAtMs: Number.isFinite(payload.nudgeSentAtMs) ? payload.nudgeSentAtMs : 0,
    aiVerdict: payload.aiVerdict || 'PENDING',
    aiReason: payload.aiReason || '',
    aiConfidence: Number.isFinite(payload.aiConfidence) ? payload.aiConfidence : null,
    aiProvider: payload.aiProvider || 'unknown',
    ownerFollowThroughOdds: Number.isFinite(payload.ownerFollowThroughOdds)
      ? payload.ownerFollowThroughOdds
      : null,
    reviewStatus: payload.reviewStatus || 'NOT_STARTED',
    proofDeadlineAtMs: Number.isFinite(payload.proofDeadlineAtMs) ? payload.proofDeadlineAtMs : 0,
    proofSubmittedAtMs: Number.isFinite(payload.proofSubmittedAtMs) ? payload.proofSubmittedAtMs : 0,
    disputeWindowEndsAtMs: Number.isFinite(payload.disputeWindowEndsAtMs) ? payload.disputeWindowEndsAtMs : 0,
    poolYes: Number.isFinite(payload.poolYes) ? payload.poolYes : 0,
    poolNo: Number.isFinite(payload.poolNo) ? payload.poolNo : 0,
    poolTotal: Number.isFinite(payload.poolTotal)
      ? payload.poolTotal
      : (Number.isFinite(payload.poolYes) ? payload.poolYes : 0) +
        (Number.isFinite(payload.poolNo) ? payload.poolNo : 0),
    predictorCount: Number.isFinite(payload.predictorCount) ? payload.predictorCount : 0,
    createdAtISO: payload.createdAtISO || new Date(0).toISOString(),
    createdAtMs: Number.isFinite(payload.createdAtMs) ? payload.createdAtMs : 0,
  };
}

function normalizePrediction(docSnap) {
  const payload = docSnap.data() || {};
  return {
    id: docSnap.id,
    userId: payload.userId || docSnap.id,
    userName: payload.userName || 'Unknown',
    side: payload.side || 'YES',
    amount: Number.isFinite(payload.amount) ? payload.amount : 0,
    createdAtMs: Number.isFinite(payload.createdAtMs) ? payload.createdAtMs : 0,
  };
}

function normalizeDispute(docSnap) {
  const payload = docSnap.data() || {};
  return {
    id: docSnap.id,
    userId: payload.userId || docSnap.id,
    userName: payload.userName || 'Unknown',
    reason: payload.reason || 'Dispute requested',
    status: payload.status || 'OPEN',
    createdAtMs: Number.isFinite(payload.createdAtMs) ? payload.createdAtMs : 0,
  };
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [nameInput, setNameInput] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [users, setUsers] = useState([]);
  const [bets, setBets] = useState([]);
  const [predictionsByBet, setPredictionsByBet] = useState({});
  const [disputesByBet, setDisputesByBet] = useState({});
  const [commentsByBet, setCommentsByBet] = useState({});
  const [reactionsByBet, setReactionsByBet] = useState({});
  const [tab, setTab] = useState('Home');
  const [homeFeedFilter, setHomeFeedFilter] = useState('All');
  const [commitmentsView, setCommitmentsView] = useState('My Commitments');
  const [leaderboardMode, setLeaderboardMode] = useState('The Committed');
  const [leaderboardRange, setLeaderboardRange] = useState('All Time');
  const [profileSection, setProfileSection] = useState('Overview');
  const [showCreateBetModal, setShowCreateBetModal] = useState(false);
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [aiPreviewLoading, setAiPreviewLoading] = useState(false);
  const [aiPreview, setAiPreview] = useState(null);
  const [selectedVoteByBet, setSelectedVoteByBet] = useState({});
  const [votingByBet, setVotingByBet] = useState({});
  const [voteVisualByBet, setVoteVisualByBet] = useState({});
  const [showCoinBurst, setShowCoinBurst] = useState(false);
  const [selfMeta, setSelfMeta] = useState({
    plan: 'free',
    aiCredits: 8,
    referralCode: '',
    referralCount: 0,
    referredBy: '',
  });
  const [referralInput, setReferralInput] = useState('');
  const [betKind, setBetKind] = useState('CALL_OUT');
  const [betText, setBetText] = useState('');
  const [deadline, setDeadline] = useState('');
  const [deadlineDate, setDeadlineDate] = useState(() => new Date(Date.now() + 60 * 60 * 1000));
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [deadlinePickerMode, setDeadlinePickerMode] = useState('date');
  const [stakeAmount, setStakeAmount] = useState('0');
  const [proof, setProof] = useState({});
  const [proofImageByBet, setProofImageByBet] = useState({});
  const [betAmount, setBetAmount] = useState(DEFAULT_BET);
  const [friendEmail, setFriendEmail] = useState('');
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [commentDraftByBet, setCommentDraftByBet] = useState({});
  const [recapByUser, setRecapByUser] = useState({});
  const [recapProviderByUser, setRecapProviderByUser] = useState({});
  const [recapLoadingByUser, setRecapLoadingByUser] = useState({});
  const [predictionChoiceByBet, setPredictionChoiceByBet] = useState({});
  const [showSocialSheet, setShowSocialSheet] = useState(false);
  const [profileOverlayUserId, setProfileOverlayUserId] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());
  const [message, setMessage] = useState('');
  const scanAnim = useRef(new Animated.Value(0)).current;
  const shutterAnim = useRef(new Animated.Value(0)).current;
  const coinBurstAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(scanAnim, {
        toValue: 1,
        duration: 1300,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [scanAnim]);

  useEffect(() => {
    let unsubscribeProfile = () => {};
    let unsubscribeBets = () => {};
    let unsubscribeFriends = () => {};
    let unsubscribeIncoming = () => {};
    let unsubscribeNotifications = () => {};
    const predictionUnsubscribers = {};
    const disputeUnsubscribers = {};
    const commentUnsubscribers = {};
    const reactionUnsubscribers = {};

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile();
      unsubscribeBets();
      unsubscribeFriends();
      unsubscribeIncoming();
      unsubscribeNotifications();
      Object.values(predictionUnsubscribers).forEach((fn) => fn());
      Object.values(disputeUnsubscribers).forEach((fn) => fn());
      Object.values(commentUnsubscribers).forEach((fn) => fn());
      Object.values(reactionUnsubscribers).forEach((fn) => fn());

      setAuthUser(nextUser);
      setBets([]);
      setPredictionsByBet({});
      setDisputesByBet({});
      setCommentsByBet({});
      setReactionsByBet({});
      setFriends([]);
      setIncomingRequests([]);
      setNotifications([]);
      setProof({});
      setProofImageByBet({});
      setRecapByUser({});
      setRecapProviderByUser({});
      setRecapLoadingByUser({});
      setSelfMeta({
        plan: 'free',
        aiCredits: 8,
        referralCode: '',
        referralCount: 0,
        referredBy: '',
      });
      setReferralInput('');
      setMessage('');
      setAuthReady(true);

      if (!nextUser?.uid) {
        setUsers([]);
        return;
      }

      const userRef = doc(db, 'users', nextUser.uid);
      const actorName = resolveActorName(nextUser);
      setUsers(createUsersForActor(nextUser.uid, actorName));

      (async () => {
        const existing = await getDoc(userRef);
        if (!existing.exists()) {
          await setDoc(userRef, {
            uid: nextUser.uid,
            name: actorName,
            email: nextUser.email || '',
            coins: 1000,
            plan: 'free',
            aiCredits: 8,
            referralCode: buildReferralCode(actorName, nextUser.uid),
            referralCount: 0,
            referredBy: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      })().catch(() => {});

      unsubscribeProfile = onSnapshot(userRef, (snap) => {
        const data = snap.data() || {};
        const name = data.name || actorName;
        const coins = Number.isFinite(data.coins) ? data.coins : 1000;
        const plan = typeof data.plan === 'string' ? data.plan : 'free';
        const aiCredits = Number.isFinite(data.aiCredits) ? Math.max(0, data.aiCredits) : 8;
        const referralCode = typeof data.referralCode === 'string' ? data.referralCode : buildReferralCode(name, nextUser.uid);
        const referralCount = Number.isFinite(data.referralCount) ? Math.max(0, data.referralCount) : 0;
        const referredBy = typeof data.referredBy === 'string' ? data.referredBy : '';
        setSelfMeta({ plan, aiCredits, referralCode, referralCount, referredBy });
        if (!data.referralCode) {
          setDoc(
            userRef,
            { referralCode, updatedAt: serverTimestamp() },
            { merge: true }
          ).catch(() => {});
        }
        const baseUsers = createUsersForActor(nextUser.uid, name);
        setUsers(withSelfCoins(baseUsers, coins));
      });

      unsubscribeFriends = onSnapshot(collection(db, 'users', nextUser.uid, 'friends'), (snapshot) => {
        const nextFriends = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        setFriends(nextFriends);
      });

      unsubscribeIncoming = onSnapshot(
        collection(db, 'users', nextUser.uid, 'incoming_requests'),
        (snapshot) => {
          const nextRequests = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
          setIncomingRequests(nextRequests);
        }
      );

      unsubscribeNotifications = onSnapshot(
        query(collection(db, 'users', nextUser.uid, 'notifications')),
        (snapshot) => {
          const nextNotifications = snapshot.docs
            .map((d) => ({ id: d.id, ...(d.data() || {}) }))
            .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
          setNotifications(nextNotifications);
        }
      );

      unsubscribeBets = onSnapshot(query(collection(db, 'bets')), (snapshot) => {
        const loadedBets = snapshot.docs
          .map((d) => normalizeBet(d))
          .sort((a, b) => b.createdAtMs - a.createdAtMs);

        setBets(loadedBets);

        const activeIds = new Set(loadedBets.map((b) => b.id));

        Object.keys(predictionUnsubscribers).forEach((betId) => {
          if (!activeIds.has(betId)) {
            predictionUnsubscribers[betId]();
            delete predictionUnsubscribers[betId];
            setPredictionsByBet((prev) => {
              const next = { ...prev };
              delete next[betId];
              return next;
            });
          }
        });

        Object.keys(disputeUnsubscribers).forEach((betId) => {
          if (!activeIds.has(betId)) {
            disputeUnsubscribers[betId]();
            delete disputeUnsubscribers[betId];
            setDisputesByBet((prev) => {
              const next = { ...prev };
              delete next[betId];
              return next;
            });
          }
        });

        Object.keys(commentUnsubscribers).forEach((betId) => {
          if (!activeIds.has(betId)) {
            commentUnsubscribers[betId]();
            delete commentUnsubscribers[betId];
            setCommentsByBet((prev) => {
              const next = { ...prev };
              delete next[betId];
              return next;
            });
          }
        });

        Object.keys(reactionUnsubscribers).forEach((betId) => {
          if (!activeIds.has(betId)) {
            reactionUnsubscribers[betId]();
            delete reactionUnsubscribers[betId];
            setReactionsByBet((prev) => {
              const next = { ...prev };
              delete next[betId];
              return next;
            });
          }
        });

        loadedBets.forEach((bet) => {
          if (predictionUnsubscribers[bet.id]) {
            return;
          }

          predictionUnsubscribers[bet.id] = onSnapshot(
            collection(db, 'bets', bet.id, 'predictions'),
            (predictionsSnapshot) => {
              const predictions = predictionsSnapshot.docs
                .map((d) => normalizePrediction(d))
                .sort((a, b) => b.createdAtMs - a.createdAtMs);

              setPredictionsByBet((prev) => ({
                ...prev,
                [bet.id]: predictions,
              }));
            }
          );

          disputeUnsubscribers[bet.id] = onSnapshot(
            collection(db, 'bets', bet.id, 'disputes'),
            (disputesSnapshot) => {
              const disputes = disputesSnapshot.docs
                .map((d) => normalizeDispute(d))
                .sort((a, b) => b.createdAtMs - a.createdAtMs);

              setDisputesByBet((prev) => ({
                ...prev,
                [bet.id]: disputes,
              }));
            }
          );

          commentUnsubscribers[bet.id] = onSnapshot(
            collection(db, 'bets', bet.id, 'comments'),
            (commentsSnapshot) => {
              const comments = commentsSnapshot.docs
                .map((d) => ({ id: d.id, ...(d.data() || {}) }))
                .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));

              setCommentsByBet((prev) => ({
                ...prev,
                [bet.id]: comments,
              }));
            }
          );

          reactionUnsubscribers[bet.id] = onSnapshot(
            collection(db, 'bets', bet.id, 'reactions'),
            (reactionsSnapshot) => {
              const reactions = reactionsSnapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
              setReactionsByBet((prev) => ({
                ...prev,
                [bet.id]: reactions,
              }));
            }
          );
        });
      });
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProfile();
      unsubscribeBets();
      unsubscribeFriends();
      unsubscribeIncoming();
      unsubscribeNotifications();
      Object.values(predictionUnsubscribers).forEach((fn) => fn());
      Object.values(disputeUnsubscribers).forEach((fn) => fn());
      Object.values(commentUnsubscribers).forEach((fn) => fn());
      Object.values(reactionUnsubscribers).forEach((fn) => fn());
    };
  }, []);

  const selfId = authUser?.uid;
  const self = users.find((u) => u.id === selfId);
  const myBets = bets.filter((b) => b.ownerId === selfId);
  const friendIds = new Set(friends.map((f) => f.friendId || f.id));
  const friendFeedBets = bets.filter((b) => friendIds.has(b.ownerId));
  const homeFeedBets = useMemo(() => {
    const mineAndFriends = [...myBets, ...friendFeedBets];
    const deduped = Array.from(new Map(mineAndFriends.map((bet) => [bet.id, bet])).values());
    const merged = deduped
      .map((bet) => ({ ...bet, homeType: inferBetType(bet, selfId) }))
      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    if (homeFeedFilter === 'Call Outs') return merged.filter((bet) => bet.homeType === 'CALL_OUT');
    if (homeFeedFilter === 'Commitments') return merged.filter((bet) => bet.homeType === 'COMMITMENT');
    return merged;
  }, [friendFeedBets, myBets, homeFeedFilter, selfId]);
  const backingBets = useMemo(() => {
    if (!selfId) return [];
    return friendFeedBets.filter((bet) => bet.ownerId !== selfId);
  }, [friendFeedBets, selfId]);
  const commitmentsFeed = useMemo(
    () =>
      (commitmentsView === 'My Commitments' ? myBets : backingBets).filter(
        (bet) => inferBetType(bet, selfId) === 'COMMITMENT'
      ),
    [backingBets, commitmentsView, myBets, selfId]
  );
  const leaderboardWindowMs = useMemo(() => {
    if (leaderboardRange === 'This Week') return 7 * 24 * 60 * 60 * 1000;
    if (leaderboardRange === 'This Month') return 30 * 24 * 60 * 60 * 1000;
    return 0;
  }, [leaderboardRange]);
  const rangeBets = useMemo(() => {
    if (!leaderboardWindowMs) return bets;
    const cutoff = Date.now() - leaderboardWindowMs;
    return bets.filter((bet) => (bet.createdAtMs || 0) >= cutoff);
  }, [bets, leaderboardWindowMs]);
  const knownUserIds = useMemo(() => {
    const fromBets = bets.map((b) => b.ownerId).filter(Boolean);
    const fromFriends = friends.map((f) => f.friendId || f.id).filter(Boolean);
    return Array.from(new Set([...(selfId ? [selfId] : []), ...fromFriends, ...fromBets]));
  }, [bets, friends, selfId]);

  const ownerStatsByUser = useMemo(() => {
    const next = {};
    knownUserIds.forEach((userId) => {
      next[userId] = computeUserHistoryStats(bets, userId);
    });
    return next;
  }, [bets, knownUserIds]);

  const selfStats = useMemo(
    () => (selfId ? ownerStatsByUser[selfId] || computeUserHistoryStats(bets, selfId) : null),
    [bets, ownerStatsByUser, selfId]
  );
  const selfStreak = useMemo(() => (selfId ? computeStreak(bets, selfId) : 0), [bets, selfId]);
  const leaderboardRows = useMemo(() => {
    return knownUserIds
      .map((userId) => {
        const stats = ownerStatsByUser[userId] || computeUserHistoryStats(bets, userId);
        const rate = predictPassOddsFromHistory(stats);
        return {
          userId,
          name: getDisplayNameForUser(userId),
          rate,
          wins: stats.passCount,
          total: stats.totalBets,
          resolved: stats.resolvedCount,
        };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [knownUserIds, ownerStatsByUser]);
  const committedRows = useMemo(() => {
    return knownUserIds
      .map((userId) => {
        const stats = computeUserHistoryStats(rangeBets, userId);
        const rate = predictPassOddsFromHistory(stats);
        return {
          userId,
          name: getDisplayNameForUser(userId),
          score: Math.max(0, Math.min(100, Math.round(rate))),
          metricLabel: 'completion',
          subLabel: `${stats.totalBets} commitments`,
        };
      })
      .filter((row) => row.subLabel !== '0 commitments')
      .sort((a, b) => b.score - a.score);
  }, [knownUserIds, rangeBets]);
  const prophetRows = useMemo(() => {
    const rows = {};
    rangeBets.forEach((bet) => {
      if (bet.status !== 'SETTLED') return;
      const expectedSide = bet.aiVerdict === 'PASS' ? 'YES' : bet.aiVerdict === 'FAIL' ? 'NO' : '';
      if (!expectedSide) return;
      const predictions = predictionsByBet[bet.id] || [];
      predictions.forEach((prediction) => {
        const userId = prediction.userId;
        if (!userId) return;
        if (!rows[userId]) {
          rows[userId] = {
            userId,
            name: getDisplayNameForUser(userId),
            correct: 0,
            total: 0,
          };
        }
        rows[userId].total += 1;
        if (prediction.side === expectedSide) rows[userId].correct += 1;
      });
    });
    return Object.values(rows)
      .map((row) => ({
        userId: row.userId,
        name: row.name,
        score: row.total > 0 ? Math.max(0, Math.min(100, Math.round((row.correct / row.total) * 100))) : 0,
        metricLabel: 'accuracy',
        subLabel: `${row.total} predictions`,
      }))
      .filter((row) => row.subLabel !== '0 predictions')
      .sort((a, b) => b.score - a.score);
  }, [rangeBets, predictionsByBet]);
  const activeLeaderboardRows = leaderboardMode === 'The Committed' ? committedRows : prophetRows;
  const selfLeaderboardRow = activeLeaderboardRows.find((row) => row.userId === selfId) || null;
  const profileRate = Math.max(0, Math.min(100, Math.round(predictPassOddsFromHistory(selfStats || {}))));
  const profileNoVotes = useMemo(() => {
    return myBets.reduce((count, bet) => {
      const predictions = predictionsByBet[bet.id] || [];
      return count + predictions.filter((prediction) => prediction.side === 'NO').length;
    }, 0);
  }, [myBets, predictionsByBet]);
  const weeklyRoast = useMemo(() => {
    const total = selfStats?.totalBets || 0;
    const kept = selfStats?.passCount || 0;
    return `"You made ${total} commitments this week. Completed ${kept}. Friends bet against you ${profileNoVotes} times. Keep your streak alive before they start calling it a fluke."`;
  }, [profileNoVotes, selfStats]);
  const personalityTags = useMemo(() => {
    const mine = myBets || [];
    const tagCount = { Fitness: 0, 'Wake Up': 0, Learning: 0, Build: 0, Challenge: 0 };
    mine.forEach((bet) => {
      const tag = getBetTag(bet.text);
      tagCount[tag] = (tagCount[tag] || 0) + 1;
    });
    const mapped = [];
    if ((tagCount.Fitness || 0) >= 2) mapped.push('Gym Rat');
    if ((tagCount['Wake Up'] || 0) >= 2) mapped.push('Early Bird');
    if ((tagCount.Learning || 0) >= 2) mapped.push('Study Beast');
    if ((tagCount.Build || 0) >= 2) mapped.push('Builder');
    if ((selfStats?.failCount || 0) > 0 && (selfStats?.passCount || 0) >= (selfStats?.failCount || 0)) {
      mapped.push('Comeback Specialist');
    }
    if (mapped.length === 0) mapped.push('Consistency Starter');
    return mapped.slice(0, 3);
  }, [myBets, selfStats]);
  const selfRecap = selfId ? recapByUser[selfId] : '';
  const selfRecapLoading = selfId ? recapLoadingByUser[selfId] : false;

  const profileOverlayData = useMemo(() => {
    if (!profileOverlayUserId) return null;
    const stats = ownerStatsByUser[profileOverlayUserId] || computeUserHistoryStats(bets, profileOverlayUserId);
    const totalResolved = Math.max(1, stats.passCount + stats.failCount);
    const successRate = Math.round((stats.passCount / totalResolved) * 100);
    const recentProofs = bets
      .filter((b) => b.ownerId === profileOverlayUserId && (b.victoryPosterUri || b.proofImageUri))
      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
      .slice(0, 6);
    const fromFriend = friends.find((f) => (f.friendId || f.id) === profileOverlayUserId);
    const fromBet = bets.find((b) => b.ownerId === profileOverlayUserId && b.ownerName);
    const name =
      profileOverlayUserId === selfId
        ? resolveActorName(authUser)
        : fromFriend?.name || fromBet?.ownerName || profileOverlayUserId;
    return {
      userId: profileOverlayUserId,
      name,
      successRate,
      totalWins: stats.passCount,
      recentProofs,
    };
  }, [authUser, bets, friends, ownerStatsByUser, profileOverlayUserId, selfId]);

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setAuthError('Email and password are required.');
      return;
    }

    setAuthLoading(true);
    setAuthError('');

    try {
      if (authMode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const nextName = nameInput.trim();
        if (nextName) {
          await updateProfile(cred.user, { displayName: nextName });
          await setDoc(
            doc(db, 'users', cred.user.uid),
            {
              uid: cred.user.uid,
              name: nextName,
              email: cred.user.email || email.trim(),
              coins: 1000,
              plan: 'free',
              aiCredits: 8,
              referralCode: buildReferralCode(nextName, cred.user.uid),
              referralCount: 0,
              referredBy: '',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }

      setEmail('');
      setPassword('');
      setNameInput('');
    } catch (error) {
      setAuthError(error?.message || 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const createNotification = async (targetUserId, payload) => {
    if (!targetUserId) return;
    const now = Date.now();
    const id = `n_${now}_${Math.floor(Math.random() * 10000)}`;
    await setDoc(doc(db, 'users', targetUserId, 'notifications', id), {
      ...payload,
      actorId: selfId || authUser?.uid || 'system',
      createdAtMs: now,
      createdAt: serverTimestamp(),
    });
  };

  useEffect(() => {
    if (!selfId) return;
    const now = Date.now();
    const ownedOpen = bets.filter((b) => b.ownerId === selfId && b.status === 'OPEN');
    ownedOpen.forEach((bet) => {
      const msLeft = (bet.proofDeadlineAtMs || 0) - now;
      const withinTwoHours = msLeft > 0 && msLeft <= 2 * 60 * 60 * 1000;
      if (!withinTwoHours || bet.nudgeSentAtMs > 0) return;
      const againstCoins = Number.isFinite(bet.poolNo) ? bet.poolNo : 0;
      const friendCount = Number.isFinite(bet.predictorCount) ? bet.predictorCount : 0;
      const nudgeText = buildPredictiveNudge({
        userName: resolveActorName(authUser),
        hoursLeft: Math.max(1, Math.ceil(msLeft / (60 * 60 * 1000))),
        againstCoins,
        friendCount,
      });
      updateDoc(doc(db, 'bets', bet.id), {
        nudgeSentAtMs: now,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      createNotification(selfId, {
        type: 'PREDICTIVE_NUDGE',
        title: 'Deadline nudge',
        body: nudgeText,
        betId: bet.id,
      }).catch(() => {});
      setMessage(nudgeText);
    });
  }, [authUser, bets, selfId]);

  function getDisplayNameForUser(userId) {
    if (!userId) return 'Unknown';
    if (userId === selfId) return resolveActorName(authUser);
    const fromFriend = friends.find((f) => (f.friendId || f.id) === userId);
    if (fromFriend?.name) return fromFriend.name;
    const fromBet = bets.find((b) => b.ownerId === userId && b.ownerName);
    return fromBet?.ownerName || userId;
  }

  const generateRecapForUser = async (userId) => {
    const creditOk = await consumeAiCredit('AI recap');
    if (!creditOk) return;
    const stats = ownerStatsByUser[userId] || computeUserHistoryStats(bets, userId);
    const odds = predictPassOddsFromHistory(stats);
    const userName = getDisplayNameForUser(userId);

    setRecapLoadingByUser((prev) => ({ ...prev, [userId]: true }));
    try {
      const result = await generateUserRecap({ userName, stats, odds });
      setRecapByUser((prev) => ({ ...prev, [userId]: result.recap }));
      setRecapProviderByUser((prev) => ({ ...prev, [userId]: result.provider }));
    } catch {
      setRecapByUser((prev) => ({
        ...prev,
        [userId]: `${userName} has ${stats.passCount} PASS and ${stats.failCount} FAIL outcomes so far.`,
      }));
      setRecapProviderByUser((prev) => ({ ...prev, [userId]: 'fallback' }));
    } finally {
      setRecapLoadingByUser((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const sendFriendRequest = async () => {
    if (!selfId || !friendEmail.trim()) {
      setMessage('Enter a friend email.');
      return;
    }

    try {
      const targetQuery = query(
        collection(db, 'users'),
        where('email', '==', friendEmail.trim()),
        limit(1)
      );
      const found = await getDocs(targetQuery);
      if (found.empty) {
        setMessage('No user found with that email.');
        return;
      }

      const targetDoc = found.docs[0];
      const targetId = targetDoc.id;
      const targetData = targetDoc.data() || {};

      if (targetId === selfId) {
        setMessage('You cannot add yourself.');
        return;
      }

      await setDoc(doc(db, 'users', targetId, 'incoming_requests', selfId), {
        fromUserId: selfId,
        fromName: resolveActorName(authUser),
        fromEmail: authUser?.email || '',
        status: 'PENDING',
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
      });

      await createNotification(targetId, {
        type: 'FRIEND_REQUEST',
        title: 'New friend request',
        body: `${resolveActorName(authUser)} sent you a request`,
      });

      setFriendEmail('');
      setMessage(`Friend request sent to ${targetData.name || targetData.email || 'user'}.`);
    } catch (error) {
      setMessage(error?.message || 'Failed to send friend request.');
    }
  };

  const acceptFriendRequest = async (requestItem) => {
    if (!selfId || !requestItem?.id) return;
    try {
      const currentName = resolveActorName(authUser);
      await setDoc(doc(db, 'users', selfId, 'friends', requestItem.id), {
        friendId: requestItem.id,
        name: requestItem.fromName || requestItem.fromEmail || 'Friend',
        email: requestItem.fromEmail || '',
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'users', requestItem.id, 'friends', selfId), {
        friendId: selfId,
        name: currentName,
        email: authUser?.email || '',
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
      });

      await deleteDoc(doc(db, 'users', selfId, 'incoming_requests', requestItem.id));
      await createNotification(requestItem.id, {
        type: 'FRIEND_ACCEPTED',
        title: 'Friend request accepted',
        body: `${currentName} accepted your request`,
      });

      setMessage('Friend request accepted.');
    } catch (error) {
      setMessage(error?.message || 'Failed to accept friend request.');
    }
  };

  const rejectFriendRequest = async (requestItem) => {
    if (!selfId || !requestItem?.id) return;
    try {
      await deleteDoc(doc(db, 'users', selfId, 'incoming_requests', requestItem.id));
      setMessage('Friend request rejected.');
    } catch (error) {
      setMessage(error?.message || 'Failed to reject friend request.');
    }
  };

  const shareInvite = async () => {
    if (!selfId) return;
    try {
      const inviteLink = `https://betonme.app/invite?ref=${selfId}`;
      const referralCode = selfMeta.referralCode ? `\nReferral code: ${selfMeta.referralCode}` : '';
      await Share.share({
        message: `Join me on Betme: ${inviteLink}${referralCode}`,
      });
    } catch (error) {
      setMessage(error?.message || 'Failed to share invite.');
    }
  };

  const shareProfileSnapshot = async () => {
    try {
      await Share.share({
        message: `${resolveActorName(authUser)} on Betme\nCoins: ${self?.coins || 0}\nStreak: ${selfStreak}\nSuccess Rate: ${profileRate}%\nReferral: ${selfMeta.referralCode || 'N/A'}`,
      });
    } catch (error) {
      setMessage(error?.message || 'Failed to share profile snapshot.');
    }
  };

  const consumeAiCredit = async (featureName) => {
    if (!selfId) return false;
    if (selfMeta.plan === 'pro') return true;
    try {
      const userRef = doc(db, 'users', selfId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        const payload = snap.data() || {};
        const current = Number.isFinite(payload.aiCredits) ? payload.aiCredits : 0;
        if (current <= 0) {
          throw new Error(`No AI credits left for ${featureName}. Buy credits or upgrade to Pro.`);
        }
        tx.update(userRef, {
          aiCredits: current - 1,
          updatedAt: serverTimestamp(),
        });
      });
      return true;
    } catch (error) {
      setMessage(error?.message || 'Unable to use AI credit.');
      return false;
    }
  };

  const upgradeToPro = async () => {
    if (!selfId) return;
    try {
      await updateDoc(doc(db, 'users', selfId), {
        plan: 'pro',
        updatedAt: serverTimestamp(),
      });
      setMessage('Pro plan activated (demo flow).');
    } catch (error) {
      setMessage(error?.message || 'Failed to activate Pro.');
    }
  };

  const buyAiCreditPack = async () => {
    if (!selfId || !self) return;
    const coinCost = 200;
    const creditPack = 10;
    if ((self.coins || 0) < coinCost) {
      setMessage('Not enough coins to buy AI credit pack.');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', selfId), {
        coins: Math.max(0, (self.coins || 0) - coinCost),
        aiCredits: (selfMeta.aiCredits || 0) + creditPack,
        updatedAt: serverTimestamp(),
      });
      setMessage(`Bought ${creditPack} AI credits for ${coinCost} coins.`);
    } catch (error) {
      setMessage(error?.message || 'Failed to buy AI credits.');
    }
  };

  const applyReferralCode = async () => {
    const code = referralInput.trim().toUpperCase();
    if (!selfId || !code) {
      setMessage('Enter a referral code.');
      return;
    }
    if (selfMeta.referredBy) {
      setMessage('Referral already claimed on this account.');
      return;
    }
    if (code === selfMeta.referralCode) {
      setMessage('You cannot use your own referral code.');
      return;
    }
    try {
      const q = query(collection(db, 'users'), where('referralCode', '==', code), limit(1));
      const snaps = await getDocs(q);
      if (snaps.empty) {
        setMessage('Referral code not found.');
        return;
      }
      const owner = snaps.docs[0];
      if (owner.id === selfId) {
        setMessage('You cannot use your own referral code.');
        return;
      }
      await runTransaction(db, async (tx) => {
        const meRef = doc(db, 'users', selfId);
        const ownerRef = doc(db, 'users', owner.id);
        const meSnap = await tx.get(meRef);
        const ownerSnap = await tx.get(ownerRef);
        const me = meSnap.data() || {};
        const ownerPayload = ownerSnap.data() || {};
        if (me.referredBy) {
          throw new Error('Referral already claimed.');
        }
        tx.update(meRef, {
          referredBy: code,
          coins: (Number.isFinite(me.coins) ? me.coins : 0) + 150,
          updatedAt: serverTimestamp(),
        });
        tx.update(ownerRef, {
          referralCount: (Number.isFinite(ownerPayload.referralCount) ? ownerPayload.referralCount : 0) + 1,
          coins: (Number.isFinite(ownerPayload.coins) ? ownerPayload.coins : 0) + 150,
          updatedAt: serverTimestamp(),
        });
      });
      setReferralInput('');
      setMessage('Referral applied. Both users received 150 coins.');
    } catch (error) {
      setMessage(error?.message || 'Failed to apply referral code.');
    }
  };

  const shareVictoryPoster = async (bet) => {
    if (!bet?.victoryPosterUri) {
      setMessage('No victory poster available to share.');
      return;
    }

    try {
      await Share.share({
        message: `Bet On Me: "${bet.text}"\nMISSION ACCOMPLISHED`,
        url: bet.victoryPosterUri,
      });
    } catch (error) {
      setMessage(error?.message || 'Failed to share victory poster.');
    }
  };

  const pickProofImage = async (betId) => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setMessage('Camera permission denied.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        cameraType: ImagePicker.CameraType.back,
      });

      if (result.canceled || !result.assets?.length) return;
      const imageUri = result.assets[0].uri;

      setProofImageByBet((prev) => ({
        ...prev,
        [betId]: imageUri,
      }));
    } catch (error) {
      setMessage(error?.message || 'Failed to pick proof image.');
    }
  };

  const createNewBet = async () => {
    if (!authUser?.uid) {
      setMessage('Please log in first.');
      return false;
    }

    if (!betText.trim() || !deadline.trim()) {
      setMessage('Add both bet text and deadline.');
      return false;
    }

    const deadlineMs = parseDeadlineToMs(deadline.trim());
    if (!Number.isFinite(deadlineMs)) {
      setMessage('Invalid deadline. Use format: YYYY-MM-DD HH:mm');
      return false;
    }

    if (deadlineMs <= Date.now()) {
      setMessage('Deadline must be in the future.');
      return false;
    }

    try {
      const base = createPromise(betText.trim(), deadline.trim(), authUser.uid);
      const nowMs = Date.now();
      const trueOddsMeta = computeTrueOddsFromLastTen(bets, authUser.uid);
      const selfStats = computeUserHistoryStats(bets, authUser.uid);
      const selfOdds = trueOddsMeta.odds || predictPassOddsFromHistory(selfStats);
      const stake = Math.max(0, Number(stakeAmount) || 0);
      if (stake > (self?.coins || 0)) {
        setMessage('Stake exceeds your wallet balance.');
        return false;
      }

      const synthesis = await synthesizeBet({
        rawText: base.text,
        deadlineISO: base.deadlineISO,
        ownerName: resolveActorName(authUser),
        odds: selfOdds,
      });
      const bookie = await generateBookieComment({
        ownerName: resolveActorName(authUser),
        odds: selfOdds,
        passCount: trueOddsMeta.pass,
        failCount: trueOddsMeta.fail,
        yesPool: 0,
        noPool: 0,
      });
      await setDoc(doc(db, 'bets', base.id), {
        id: base.id,
        ownerId: authUser.uid,
        ownerName: resolveActorName(authUser),
        actorId: authUser.uid,
        betType: betKind,
        text: synthesis.formattedBet || base.text,
        deadlineISO: base.deadlineISO,
        status: 'OPEN',
        aiVerdict: 'PENDING',
        ownerFollowThroughOdds: selfOdds,
        trueOdds: selfOdds,
        riskLabel: synthesis.riskLabel || trueOddsMeta.riskLabel,
        aiBookieComment: bookie,
        aiDisputeSummary: '',
        aiDisputeProvider: '',
        secretGesture: '',
        ownerStake: stake,
        ownerStakeMultiplier: 1.8,
        nudgeSentAtMs: 0,
        reviewStatus: 'NOT_STARTED',
        proofNote: '',
        proofVideoUri: '',
        proofDeadlineAtMs: deadlineMs,
        proofSubmittedAtMs: 0,
        disputeWindowEndsAtMs: 0,
        poolYes: 0,
        poolNo: 0,
        poolTotal: 0,
        predictorCount: 0,
        createdAtISO: base.createdAtISO,
        createdAtMs: nowMs,
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'bets', base.id, 'comments', `c_bookie_${base.id}`), {
        userId: 'ai_bookie',
        userName: 'AI Bookie',
        text: bookie,
        createdAtMs: nowMs,
        createdAt: serverTimestamp(),
      });

      if (stake > 0 && selfId) {
        await updateDoc(doc(db, 'users', selfId), {
          coins: Math.max(0, (self?.coins || 0) - stake),
          updatedAt: serverTimestamp(),
        });
      }

      await Promise.all(
        friends.map((friend) =>
          createNotification(friend.friendId || friend.id, {
            type: 'NEW_BET',
            title: 'New bet posted',
            body: `${resolveActorName(authUser)}: ${base.text}`,
            betId: base.id,
          })
        )
      );

      setBetText('');
      setDeadline('');
      setDeadlineDate(new Date(Date.now() + 60 * 60 * 1000));
      setShowDeadlinePicker(false);
      setDeadlinePickerMode('date');
      setStakeAmount('0');
      setBetKind('CALL_OUT');
      setAiPreview(null);
      setMessage('Bet posted with AI synthesis.');
      return true;
    } catch (error) {
      setMessage(error?.message || 'Failed to create bet.');
      return false;
    }
  };

  const runAiDraftBet = async () => {
    if (!betText.trim()) {
      setMessage('Write a rough commitment first.');
      return;
    }
    const resolvedDeadline = deadline.trim() || formatDeadlineInput(deadlineDate);
    const deadlineMs = parseDeadlineToMs(resolvedDeadline);
    if (!Number.isFinite(deadlineMs)) {
      setMessage('Pick a valid deadline first.');
      return;
    }
    const creditOk = await consumeAiCredit('AI draft');
    if (!creditOk) return;
    setAiDraftLoading(true);
    try {
      const stats = computeUserHistoryStats(bets, authUser?.uid || '');
      const odds = predictPassOddsFromHistory(stats);
      const synthesis = await synthesizeBet({
        rawText: betText.trim(),
        deadlineISO: resolvedDeadline,
        ownerName: resolveActorName(authUser),
        odds,
      });
      setBetText(synthesis.formattedBet || betText.trim());
      setMessage(`AI draft ready (${synthesis.provider || 'fallback'}).`);
    } catch (error) {
      setMessage(error?.message || 'AI draft failed.');
    } finally {
      setAiDraftLoading(false);
    }
  };

  const runAiBetPreview = async () => {
    if (!betText.trim()) {
      setMessage('Add bet text first.');
      return;
    }
    const creditOk = await consumeAiCredit('AI preview');
    if (!creditOk) return;
    setAiPreviewLoading(true);
    try {
      const trueOddsMeta = computeTrueOddsFromLastTen(bets, authUser?.uid || '');
      const selfStatsSnapshot = computeUserHistoryStats(bets, authUser?.uid || '');
      const selfOdds = trueOddsMeta.odds || predictPassOddsFromHistory(selfStatsSnapshot);
      const bookie = await generateBookieComment({
        ownerName: resolveActorName(authUser),
        odds: selfOdds,
        passCount: trueOddsMeta.pass,
        failCount: trueOddsMeta.fail,
        yesPool: 0,
        noPool: 0,
      });
      setAiPreview({
        odds: Math.round(selfOdds),
        riskLabel: trueOddsMeta.riskLabel,
        bookie,
      });
    } catch (error) {
      setMessage(error?.message || 'AI preview failed.');
    } finally {
      setAiPreviewLoading(false);
    }
  };

  const openCreateBetModal = () => {
    if (!deadline.trim()) {
      setDeadline(formatDeadlineInput(deadlineDate));
    }
    setAiPreview(null);
    setShowCreateBetModal(true);
  };

  const placePrediction = async (betId, side) => {
    if (!authUser?.uid) {
      setMessage('Please log in first.');
      return false;
    }

    const targetBet = bets.find((b) => b.id === betId);
    if (targetBet?.ownerId === authUser.uid) {
      setMessage('You cannot predict on your own bet.');
      return false;
    }

    const amount = Number(betAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage('Enter a valid prediction amount.');
      return false;
    }

    try {
      await runTransaction(db, async (tx) => {
        const betRef = doc(db, 'bets', betId);
        const predictionRef = doc(db, 'bets', betId, 'predictions', authUser.uid);

        const [betSnap, predictionSnap] = await Promise.all([
          tx.get(betRef),
          tx.get(predictionRef),
        ]);

        if (!betSnap.exists()) {
          throw new Error('Bet not found.');
        }

        if (predictionSnap.exists()) {
          throw new Error('You already placed a prediction on this bet.');
        }

        const betData = betSnap.data() || {};
        if (betData.status !== 'OPEN') {
          throw new Error('Predictions are closed for this bet.');
        }

        const deadlineMs = Number.isFinite(betData.proofDeadlineAtMs) ? betData.proofDeadlineAtMs : 0;
        if (deadlineMs > 0 && Date.now() > deadlineMs) {
          throw new Error('Prediction window closed (deadline passed).');
        }

        const poolYes = Number.isFinite(betData.poolYes) ? betData.poolYes : 0;
        const poolNo = Number.isFinite(betData.poolNo) ? betData.poolNo : 0;
        const poolTotal = Number.isFinite(betData.poolTotal) ? betData.poolTotal : 0;
        const predictorCount = Number.isFinite(betData.predictorCount) ? betData.predictorCount : 0;

        tx.set(predictionRef, {
          userId: authUser.uid,
          userName: resolveActorName(authUser),
          side,
          amount,
          createdAtMs: Date.now(),
          createdAt: serverTimestamp(),
        });

        tx.update(betRef, {
          poolYes: side === 'YES' ? poolYes + amount : poolYes,
          poolNo: side === 'NO' ? poolNo + amount : poolNo,
          poolTotal: poolTotal + amount,
          predictorCount: predictorCount + 1,
          updatedAt: serverTimestamp(),
        });
      });

      setMessage(`You predicted ${side}.`);
      return true;
    } catch (error) {
      setMessage(error?.message || 'Failed to place prediction.');
      return false;
    }
  };

  const submitVoteWithFeedback = async (betId, side) => {
    const target = bets.find((bet) => bet.id === betId);
    const baseRatio = target?.poolTotal > 0 ? target.poolYes / target.poolTotal : 0.5;
    const nextRatio = side === 'YES'
      ? Math.min(0.92, baseRatio + 0.18)
      : Math.max(0.08, baseRatio - 0.18);
    setVoteVisualByBet((prev) => ({
      ...prev,
      [betId]: {
        ratio: nextRatio,
        glowYes: side === 'YES',
        flashNo: side === 'NO',
      },
    }));
    Vibration.vibrate(side === 'YES' ? 18 : 24);
    if (side === 'YES') {
      setShowCoinBurst(true);
      coinBurstAnim.setValue(0);
      Animated.sequence([
        Animated.timing(coinBurstAnim, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(coinBurstAnim, {
          toValue: 0,
          duration: 520,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => setShowCoinBurst(false));
    }
    setTimeout(() => {
      setVoteVisualByBet((prev) => {
        const next = { ...prev };
        delete next[betId];
        return next;
      });
    }, 900);

    setSelectedVoteByBet((prev) => ({ ...prev, [betId]: side }));
    setVotingByBet((prev) => ({ ...prev, [betId]: true }));
    const ok = await placePrediction(betId, side);
    setVotingByBet((prev) => ({ ...prev, [betId]: false }));
    if (ok) {
      setMessage(`Vote ${side} placed.`);
    }
  };

  const handlePredictionTap = (betId, side) => {
    setPredictionChoiceByBet((prev) => ({
      ...prev,
      [betId]: side,
    }));
  };

  const submitPredictionChoice = (betId) => {
    const side = predictionChoiceByBet[betId];
    if (!side) {
      setMessage('Select YES or NO first.');
      return;
    }
    setPredictionChoiceByBet((prev) => {
      const next = { ...prev };
      delete next[betId];
      return next;
    });
    placePrediction(betId, side);
  };

  const submitEvidenceWithShutter = (betId) => {
    Animated.sequence([
      Animated.timing(shutterAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(shutterAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
    submitProof(betId);
  };

  const submitProof = async (betId) => {
    if (!selfId) {
      return;
    }

    const note = proof[betId] || '';
    const imageUri = proofImageByBet[betId] || '';
    const target = bets.find((b) => b.id === betId);

    if (!target || target.status !== 'OPEN') {
      return;
    }

    if (target.ownerId !== selfId) {
      setMessage('Only the bet owner can submit proof.');
      return;
    }

    if (!imageUri) {
      setMessage('Proof photo is required for AI verification.');
      return;
    }

    if (target.proofSubmittedAtMs > 0) {
      setMessage('Proof already submitted once for this bet.');
      return;
    }

    if (target.proofDeadlineAtMs > 0 && Date.now() > target.proofDeadlineAtMs) {
      await updateDoc(doc(db, 'bets', betId), {
        status: 'EXPIRED',
        reviewStatus: 'AUTO_EXPIRED',
        updatedAt: serverTimestamp(),
      });
      setMessage('Proof deadline passed. Bet marked EXPIRED.');
      return;
    }

    try {
      const aiResult = await judgeProof({
        note,
        imageUri,
        videoUri: '',
        secretGesture: '',
        betText: target.text,
        deadlineISO: target.deadlineISO,
      });
      const posterStyle = Math.random() < 0.5 ? 'cinematic movie poster' : 'vintage comic book cover';
      const posterResult = await generateVictoryPoster({
        betText: target.text,
        proofNote: note,
        proofImageUri: imageUri,
        ownerName: target.ownerName,
        style: posterStyle,
      });
      const now = Date.now();

      // Avoid oversized document writes with data-URI payloads.
      const posterUriToStore =
        typeof posterResult.posterUri === 'string' && posterResult.posterUri.length <= 700000
          ? posterResult.posterUri
          : '';

      await updateDoc(doc(db, 'bets', betId), {
        status: 'SETTLED',
        aiVerdict: aiResult.verdict,
        aiReason: aiResult.reason,
        aiConfidence: aiResult.confidence,
        aiProvider: aiResult.provider,
        reviewStatus: 'AUTO_RESOLVED',
        proofNote: note,
        proofImageUri: imageUri || '',
        proofVideoUri: '',
        victoryPosterUri: posterUriToStore,
        victoryPosterStyle: posterResult.style || '',
        victoryPosterProvider: posterResult.provider || 'fallback',
        victoryPosterError:
          posterUriToStore ? posterResult.warning || '' : 'Poster too large to store. Generate again later.',
        proofSubmittedAtMs: now,
        disputeWindowEndsAtMs: now + DISPUTE_WINDOW_MS,
        updatedAt: serverTimestamp(),
      });

      const predictions = predictionsByBet[betId] || [];
      await Promise.all(
        predictions
          .filter((p) => p.userId && p.userId !== selfId)
          .map((p) =>
            createNotification(p.userId, {
              type: 'BET_VERDICT',
              title: 'Bet verdict posted',
              body: `${target.text} -> ${aiResult.verdict}`,
              betId,
            })
          )
      );


      const myPrediction = (predictionsByBet[betId] || []).find((p) => p.userId === selfId);
      const ownerStake = Number.isFinite(target.ownerStake) ? target.ownerStake : 0;
      const ownerStakeMultiplier = Number.isFinite(target.ownerStakeMultiplier) ? target.ownerStakeMultiplier : 1.8;
      if (selfId && self && myPrediction) {
        const winnerSide = aiResult.verdict === 'PASS' ? 'YES' : 'NO';
        const delta = myPrediction.side === winnerSide ? myPrediction.amount : -myPrediction.amount;
        const stakePayout = aiResult.verdict === 'PASS' ? Math.round(ownerStake * ownerStakeMultiplier) : 0;
        const nextCoins = Math.max(0, self.coins + delta + stakePayout);

        await updateDoc(doc(db, 'users', selfId), {
          coins: nextCoins,
          updatedAt: serverTimestamp(),
        });
      }

      const posterMsg = posterUriToStore
        ? ` Victory poster ready (${posterResult.provider}).`
        : ` Poster fallback used (${posterResult.provider}).`;
      setMessage(`AI verdict: ${aiResult.verdict} (${aiResult.provider}). Bet settled.${posterMsg}`);
    } catch (error) {
      setMessage(error?.message || 'Failed to submit proof.');
    }
  };

  const raiseDispute = async (betId) => {
    if (!selfId) return;

    const bet = bets.find((b) => b.id === betId);
    if (!bet || bet.status !== 'SETTLED') {
      setMessage('Disputes are only allowed after settlement.');
      return;
    }

    if (bet.disputeWindowEndsAtMs <= 0 || Date.now() > bet.disputeWindowEndsAtMs) {
      setMessage('Dispute window has closed.');
      return;
    }

    const myPrediction = (predictionsByBet[betId] || []).find((p) => p.userId === selfId);
    if (!myPrediction) {
      setMessage('Only predictors can raise disputes.');
      return;
    }

    try {
      const disputeRef = doc(db, 'bets', betId, 'disputes', selfId);
      const existing = await getDoc(disputeRef);
      if (existing.exists()) {
        setMessage('You already raised a dispute.');
        return;
      }

      await setDoc(disputeRef, {
        userId: selfId,
        userName: resolveActorName(authUser),
        reason: 'Manual review requested',
        status: 'OPEN',
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
      });

      const updatedDisputeCount = (disputesByBet[betId] || []).length + 1;
      const summary = await summarizeDisputeEvidence({
        betText: bet.text,
        verdict: bet.aiVerdict,
        aiReason: bet.aiReason,
        proofNote: bet.proofNote,
        disputeCount: updatedDisputeCount,
        predictionCount: (predictionsByBet[betId] || []).length,
      });
      await updateDoc(doc(db, 'bets', betId), {
        reviewStatus: 'AI_DISPUTE_SUMMARY',
        aiDisputeSummary: summary.summary,
        aiDisputeProvider: summary.provider,
        updatedAt: serverTimestamp(),
      });

      setMessage('Dispute raised. AI evidence summary generated.');
    } catch (error) {
      setMessage(error?.message || 'Failed to raise dispute.');
    }
  };

  const startManualReview = async (betId) => {
    const bet = bets.find((b) => b.id === betId);
    if (!bet || bet.ownerId !== selfId) return;

    const disputes = disputesByBet[betId] || [];
    if (disputes.length === 0) {
      setMessage('No disputes found for this bet.');
      return;
    }

    try {
      await updateDoc(doc(db, 'bets', betId), {
        status: 'UNDER_REVIEW',
        reviewStatus: 'PENDING_MANUAL_REVIEW',
        updatedAt: serverTimestamp(),
      });
      setMessage('Bet moved to manual review.');
    } catch (error) {
      setMessage(error?.message || 'Failed to start manual review.');
    }
  };

  const resolveManualReview = async (betId, verdict) => {
    const bet = bets.find((b) => b.id === betId);
    if (!bet || bet.ownerId !== selfId) return;

    try {
      await updateDoc(doc(db, 'bets', betId), {
        status: 'SETTLED',
        aiVerdict: verdict,
        reviewStatus: 'MANUAL_RESOLVED',
        updatedAt: serverTimestamp(),
      });
      setMessage(`Manual review resolved: ${verdict}.`);
    } catch (error) {
      setMessage(error?.message || 'Failed to resolve manual review.');
    }
  };

  const addComment = async (betId) => {
    const raw = commentDraftByBet[betId] || '';
    const text = raw.trim();
    if (!text || !selfId) return;

    try {
      const id = `c_${Date.now()}_${selfId.slice(0, 6)}`;
      await setDoc(doc(db, 'bets', betId, 'comments', id), {
        userId: selfId,
        userName: resolveActorName(authUser),
        text,
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
      });

      setCommentDraftByBet((prev) => ({ ...prev, [betId]: '' }));
    } catch (error) {
      setMessage(error?.message || 'Failed to add comment.');
    }
  };

  const setReaction = async (betId, emoji) => {
    if (!selfId) return;
    try {
      await setDoc(doc(db, 'bets', betId, 'reactions', selfId), {
        userId: selfId,
        userName: resolveActorName(authUser),
        emoji,
        updatedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      setMessage(error?.message || 'Failed to react.');
    }
  };

  const redeemReward = async (reward) => {
    if (!self || self.coins < reward.cost || !selfId) {
      setMessage('Not enough coins for that reward.');
      return;
    }

    const nextCoins = self.coins - reward.cost;

    try {
      await updateDoc(doc(db, 'users', selfId), {
        coins: nextCoins,
        updatedAt: serverTimestamp(),
      });

      setMessage(`${reward.label} redeemed.`);
    } catch (error) {
      setMessage(error?.message || 'Failed to redeem reward.');
    }
  };

  const openDeadlinePicker = () => {
    setDeadlinePickerMode('date');
    setShowDeadlinePicker(true);
  };

  const onDeadlineChange = (event, selectedDate) => {
    if (event?.type === 'dismissed') {
      setShowDeadlinePicker(false);
      setDeadlinePickerMode('date');
      return;
    }

    const picked = selectedDate || deadlineDate;
    if (Platform.OS === 'android') {
      if (deadlinePickerMode === 'date') {
        const mergedDate = new Date(deadlineDate);
        mergedDate.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
        setDeadlineDate(mergedDate);
        setDeadlinePickerMode('time');
        setShowDeadlinePicker(true);
        return;
      }

      const mergedTime = new Date(deadlineDate);
      mergedTime.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
      setDeadlineDate(mergedTime);
      setDeadline(formatDeadlineInput(mergedTime));
      setShowDeadlinePicker(false);
      setDeadlinePickerMode('date');
      return;
    }

    setDeadlineDate(picked);
    setDeadline(formatDeadlineInput(picked));
  };

  if (!authReady) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <View style={styles.centerWrap}>
          <Text style={styles.title}>Betme</Text>
          <Text style={styles.dimText}>Loading authentication...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!authUser) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Betme</Text>
          <Text style={styles.subtitle}>Create an account to tie bets and coins to your identity.</Text>

          <View style={styles.card}>
            <View style={styles.rowGap}>
              <Pressable
                style={[styles.smallBtn, authMode === 'login' && styles.activeBtn]}
                onPress={() => setAuthMode('login')}
              >
                <Text style={styles.smallBtnText}>Log In</Text>
              </Pressable>
              <Pressable
                style={[styles.smallBtn, authMode === 'signup' && styles.activeBtn]}
                onPress={() => setAuthMode('signup')}
              >
                <Text style={styles.smallBtnText}>Sign Up</Text>
              </Pressable>
            </View>

            {authMode === 'signup' && (
              <TextInput
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Display name"
                placeholderTextColor="#7F73A3"
                style={styles.input}
              />
            )}

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor="#7F73A3"
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#7F73A3"
              style={styles.input}
              secureTextEntry
            />

            <Pressable style={styles.primaryBtn} onPress={handleAuth} disabled={authLoading}>
              <Text style={styles.primaryBtnText}>
                {authLoading ? 'Please wait...' : authMode === 'signup' ? 'Create Account' : 'Log In'}
              </Text>
            </Pressable>

            {!!authError && <Text style={styles.errorText}>{authError}</Text>}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.appShell}>
        <ScrollView contentContainerStyle={styles.container}>
          {tab === 'Home' && (
            <View style={styles.homeTopRow}>
              <Text style={styles.brandTitle}>Betme</Text>
              <View style={styles.homeTopStats}>
                <View style={[styles.headerChip, styles.coinChipWrap]}>
                  <Text style={styles.headerChipText}>Coin {self?.coins || 0}</Text>
                  {showCoinBurst && (
                    <Animated.Text
                      style={[
                        styles.coinBurstText,
                        {
                          opacity: coinBurstAnim,
                          transform: [
                            {
                              translateY: coinBurstAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [8, -12],
                              }),
                            },
                          ],
                        },
                      ]}
                    >
                      +🪙
                    </Animated.Text>
                  )}
                </View>
                <View style={styles.headerChip}>
                  <Text style={styles.headerChipText}>Fire {selfStreak}</Text>
                </View>
              </View>
            </View>
          )}

          {tab !== 'Home' && tab !== 'Commitments' && tab !== 'Leaderboard' && tab !== 'Profile' && tab !== 'Notifications' && (
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.title}>Betme</Text>
                <Text style={styles.meta}>@{resolveActorName(authUser)}</Text>
                <Text style={styles.meta}>Coins: {self?.coins || 0}</Text>
              </View>
              <View style={styles.headerActions}>
                <View style={styles.streakPill}>
                  <Text style={styles.streakPillText}>Fire {selfStreak}</Text>
                </View>
                <Pressable style={styles.bellBtn} onPress={() => setShowSettingsSheet(true)}>
                  <Text style={styles.smallBtnText}>Bell</Text>
                </Pressable>
              </View>
            </View>
          )}

        {tab === 'Home' && (
          <View>
            <View style={styles.homeActionRow}>
              <Pressable style={styles.createBetBtn} onPress={openCreateBetModal}>
                <Text style={styles.createBetBtnText}>Create Bet</Text>
              </Pressable>
              <TextInput
                value={betAmount}
                onChangeText={setBetAmount}
                keyboardType="number-pad"
                placeholder="Vote amount"
                placeholderTextColor="#7F73A3"
                style={styles.homeAmountInput}
              />
            </View>
            <View style={styles.homeTabs}>
              {['All', 'Call Outs', 'Commitments'].map((filter) => {
                const selected = homeFeedFilter === filter;
                return (
                  <Pressable
                    key={filter}
                    style={[styles.homeTabBtn, selected && styles.homeTabBtnActive]}
                    onPress={() => setHomeFeedFilter(filter)}
                  >
                    <Text style={[styles.homeTabText, selected && styles.homeTabTextActive]}>{filter}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.mockFeedWrap}>
              {homeFeedBets.length === 0 && (
                <View style={styles.card}>
                  <Text style={styles.dimText}>No bets yet. Tap Commitments tab to post your first one.</Text>
                </View>
              )}

              {homeFeedBets.map((bet) => {
                const predictions = predictionsByBet[bet.id] || [];
                const myPrediction = predictions.find((p) => p.userId === selfId);
                const proofDeadlinePassed =
                  bet.proofDeadlineAtMs > 0 && Date.now() > bet.proofDeadlineAtMs;
                const yesBacker = predictions.find((prediction) => prediction.side === 'YES');
                const noBacker = predictions.find((prediction) => prediction.side === 'NO');
                const canVote =
                  bet.status === 'OPEN' &&
                  bet.ownerId !== selfId &&
                  !myPrediction &&
                  !proofDeadlinePassed;
                const selectedSide = selectedVoteByBet[bet.id];
                const voteLoading = !!votingByBet[bet.id];
                const voteVisual = voteVisualByBet[bet.id];
                const baseRatio = bet.poolTotal > 0 ? bet.poolYes / bet.poolTotal : 0.5;
                const ratio = Number.isFinite(voteVisual?.ratio) ? voteVisual.ratio : baseRatio;
                const oddsYes = Math.round(baseRatio * 100);
                const oddsNo = 100 - oddsYes;
                const statusTag = bet.status === 'OPEN' ? (myPrediction ? 'Voted' : 'Active') : 'Closed';
                const timeText = formatTimeRemaining(bet.proofDeadlineAtMs, nowMs);
                const category = getBetTag(bet.text);

                return (
                  <View key={bet.id} style={[styles.mockCard, voteVisual?.flashNo && styles.mockCardFlashNo]}>
                    <View style={styles.mockCardHeader}>
                      <View style={styles.mockAvatar}>
                        <Text style={styles.mockAvatarText}>{getInitials(bet.ownerName)}</Text>
                      </View>
                      <View style={styles.mockOwnerText}>
                        <Text style={styles.mockOwnerName}>{bet.ownerName}</Text>
                        <Text style={styles.mockOwnerHandle}>{toHandle(bet.ownerName)}</Text>
                      </View>
                      <View style={styles.mockTypePill}>
                        <Text style={styles.mockTypePillText}>
                          {bet.homeType === 'COMMITMENT' ? 'COMMITMENT' : 'CALL OUT'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.mockBetTitle}>{cleanBetCardTitle(bet.text)}</Text>

                    <View style={styles.mockTagsRow}>
                      <View style={styles.mockSoftTag}>
                        <Text style={styles.mockSoftTagText}>{category}</Text>
                      </View>
                      <View style={[styles.mockSoftTag, styles.mockStatusTag]}>
                        <Text style={styles.mockStatusTagText}>{statusTag}</Text>
                      </View>
                      <View style={styles.mockTimeWrap}>
                        <Text style={styles.mockTimeText}>{timeText}</Text>
                      </View>
                    </View>

                    <View style={styles.mockPoolGrid}>
                      <View style={[styles.mockPoolCard, styles.mockPoolYes]}>
                        <Text style={styles.mockPoolLabel}>YES POOL</Text>
                        <Text style={styles.mockPoolAmount}>Coin {bet.poolYes || 0}</Text>
                        <Text style={styles.mockPoolUser}>{yesBacker?.userName || 'No backers'}</Text>
                      </View>
                      <View style={[styles.mockPoolCard, styles.mockPoolNo]}>
                        <Text style={styles.mockPoolLabel}>NO POOL</Text>
                        <Text style={styles.mockPoolAmount}>Coin {bet.poolNo || 0}</Text>
                        <Text style={styles.mockPoolUser}>{noBacker?.userName || 'No backers'}</Text>
                      </View>
                    </View>
                    <View style={styles.voteLiquidTrack}>
                      <Animated.View
                        style={[
                          styles.voteLiquidFill,
                          {
                            width: `${(ratio * 100).toFixed(0)}%`,
                          },
                          voteVisual?.glowYes ? styles.voteLiquidFillYesGlow : styles.voteLiquidFillDefault,
                          voteVisual?.flashNo && styles.voteLiquidFillNo,
                        ]}
                      />
                    </View>
                    <Text style={styles.voteOddsText}>{`Odds now: YES ${oddsYes}% | NO ${oddsNo}%`}</Text>

                    {canVote && (
                      <View style={styles.mockActionRow}>
                        <Pressable
                          style={[
                            styles.mockVoteYesBtn,
                            selectedSide === 'YES' && styles.mockVoteYesBtnActive,
                            voteLoading && styles.mockVoteBtnDisabled,
                          ]}
                          onPress={() => submitVoteWithFeedback(bet.id, 'YES')}
                          disabled={voteLoading}
                        >
                          <Text style={styles.mockVoteYesText}>
                            {voteLoading && selectedSide === 'YES' ? 'Voting...' : selectedSide === 'YES' ? 'Selected' : 'Vote Yes'}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.mockVoteNoBtn,
                            selectedSide === 'NO' && styles.mockVoteNoBtnActive,
                            voteLoading && styles.mockVoteBtnDisabled,
                          ]}
                          onPress={() => submitVoteWithFeedback(bet.id, 'NO')}
                          disabled={voteLoading}
                        >
                          <Text style={styles.mockVoteNoText}>
                            {voteLoading && selectedSide === 'NO' ? 'Voting...' : selectedSide === 'NO' ? 'Selected' : 'Vote No'}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                    {!canVote && myPrediction && (
                      <Text style={styles.mockVoteMeta}>You voted {myPrediction.side} ({myPrediction.amount})</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}
        {tab === 'Commitments' && (
          <View>
            <Text style={styles.screenTitle}>Commitments</Text>
            <View style={styles.screenSegment}>
              {['My Commitments', 'Backing'].map((item) => {
                const active = commitmentsView === item;
                return (
                  <Pressable
                    key={item}
                    style={[styles.screenSegmentBtn, active && styles.screenSegmentBtnActive]}
                    onPress={() => setCommitmentsView(item)}
                  >
                    <Text style={[styles.screenSegmentText, active && styles.screenSegmentTextActive]}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.sectionRule} />

            {commitmentsFeed.length === 0 && (
              <View style={styles.card}>
                <Text style={styles.dimText}>No items yet in this section.</Text>
              </View>
            )}

            {commitmentsFeed.map((bet) => {
              const predictions = predictionsByBet[bet.id] || [];
              const myPrediction = predictions.find((prediction) => prediction.userId === selfId);
              const isOpen = bet.status === 'OPEN' && (bet.proofDeadlineAtMs <= 0 || nowMs <= bet.proofDeadlineAtMs);
              const canVote = commitmentsView === 'Backing' && isOpen && !myPrediction && bet.ownerId !== selfId;
              const selectedSide = selectedVoteByBet[bet.id];
              const voteLoading = !!votingByBet[bet.id];
              const voteVisual = voteVisualByBet[bet.id];
              const baseRatio = bet.poolTotal > 0 ? bet.poolYes / bet.poolTotal : 0.5;
              const ratio = Number.isFinite(voteVisual?.ratio) ? voteVisual.ratio : baseRatio;
              const oddsYes = Math.round(baseRatio * 100);
              const oddsNo = 100 - oddsYes;
              const statusText = bet.aiVerdict === 'PASS' ? 'Success' : isOpen ? 'Active' : 'Expired';
              const statusStyle =
                bet.aiVerdict === 'PASS'
                  ? styles.commitStatusSuccess
                  : isOpen
                    ? styles.commitStatusActive
                    : styles.commitStatusExpired;
              const timeText = isOpen ? formatTimeRemaining(bet.proofDeadlineAtMs, nowMs) : statusText;
              const visibleBackers = predictions.slice(0, 2);
              const backerProgress = Math.max(0.08, Math.min(1, visibleBackers.length / 2));

              return (
                <View key={`commit_${bet.id}`} style={[styles.commitCard, voteVisual?.flashNo && styles.mockCardFlashNo]}>
                  <View style={styles.mockCardHeader}>
                    <View style={styles.mockAvatar}>
                      <Text style={styles.mockAvatarText}>{getInitials(bet.ownerName)}</Text>
                    </View>
                    <View style={styles.mockOwnerText}>
                      <Text style={styles.commitOwnerName}>{bet.ownerName}</Text>
                      <Text style={styles.mockOwnerHandle}>{toHandle(bet.ownerName)}</Text>
                    </View>
                    <View style={styles.commitTypePill}>
                      <Text style={styles.commitTypePillText}>COMMITMENT</Text>
                    </View>
                  </View>

                  <Text style={styles.commitTitle}>{cleanBetCardTitle(bet.text)}</Text>

                  <View style={styles.commitMetaRow}>
                    <View style={styles.mockSoftTag}>
                      <Text style={styles.mockSoftTagText}>{getBetTag(bet.text)}</Text>
                    </View>
                    <View style={[styles.commitStatusPill, statusStyle]}>
                      <Text style={styles.commitStatusText}>{statusText}</Text>
                    </View>
                    <Text style={styles.commitTimeText}>{timeText}</Text>
                  </View>

                  <View style={styles.commitPoolWrap}>
                    <View style={styles.commitPoolTop}>
                      <Text style={styles.commitPoolBackers}>{`${visibleBackers.length}/2 backers`}</Text>
                      <Text style={styles.commitPoolTotal}>{`Coin ${bet.poolTotal || 0}`}</Text>
                    </View>
                    <View style={styles.commitPoolBar}>
                      <View style={[styles.commitPoolBarFill, { width: `${(backerProgress * 100).toFixed(0)}%` }]} />
                    </View>
                    <View style={styles.commitBackersList}>
                      {visibleBackers.map((prediction) => (
                        <Text key={`${bet.id}_${prediction.id}_backer`} style={styles.commitBackerItem}>
                          {prediction.userName} Coin {prediction.amount}
                        </Text>
                      ))}
                    </View>
                  </View>
                  <View style={styles.voteLiquidTrack}>
                    <Animated.View
                      style={[
                        styles.voteLiquidFill,
                        { width: `${(ratio * 100).toFixed(0)}%` },
                        voteVisual?.glowYes ? styles.voteLiquidFillYesGlow : styles.voteLiquidFillDefault,
                        voteVisual?.flashNo && styles.voteLiquidFillNo,
                      ]}
                    />
                  </View>
                  <Text style={styles.voteOddsText}>{`Odds now: YES ${oddsYes}% | NO ${oddsNo}%`}</Text>

                  {canVote && (
                    <View style={styles.mockActionRow}>
                      <Pressable
                        style={[
                          styles.mockVoteYesBtn,
                          selectedSide === 'YES' && styles.mockVoteYesBtnActive,
                          voteLoading && styles.mockVoteBtnDisabled,
                        ]}
                        onPress={() => submitVoteWithFeedback(bet.id, 'YES')}
                        disabled={voteLoading}
                      >
                        <Text style={styles.mockVoteYesText}>
                          {voteLoading && selectedSide === 'YES' ? 'Voting...' : selectedSide === 'YES' ? 'Selected' : 'Vote Yes'}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.mockVoteNoBtn,
                          selectedSide === 'NO' && styles.mockVoteNoBtnActive,
                          voteLoading && styles.mockVoteBtnDisabled,
                        ]}
                        onPress={() => submitVoteWithFeedback(bet.id, 'NO')}
                        disabled={voteLoading}
                      >
                        <Text style={styles.mockVoteNoText}>
                          {voteLoading && selectedSide === 'NO' ? 'Voting...' : selectedSide === 'NO' ? 'Selected' : 'Vote No'}
                        </Text>
                      </Pressable>
                    </View>
                  )}

                  {commitmentsView === 'My Commitments' && bet.ownerId === selfId && bet.status === 'OPEN' && (
                    <View style={styles.proofWrap}>
                      <TextInput
                        value={proof[bet.id] || ''}
                        onChangeText={(value) =>
                          setProof((prev) => ({
                            ...prev,
                            [bet.id]: value,
                          }))
                        }
                        placeholder="Proof note (optional)"
                        placeholderTextColor="#7F73A3"
                        style={styles.input}
                      />
                      {!!proofImageByBet[bet.id] && (
                        <Image source={{ uri: proofImageByBet[bet.id] }} style={styles.proofImage} />
                      )}
                      <Pressable style={styles.dropzone} onPress={() => pickProofImage(bet.id)}>
                        <Text style={styles.dropzoneText}>
                          {proofImageByBet[bet.id] ? 'Photo Added' : 'Capture Proof Photo'}
                        </Text>
                      </Pressable>
                      <Pressable style={styles.submitEvidenceBtn} onPress={() => submitEvidenceWithShutter(bet.id)}>
                        <Text style={styles.primaryBtnText}>Submit Evidence</Text>
                      </Pressable>
                    </View>
                  )}

                  {bet.aiVerdict === 'PASS' && (
                    <View style={styles.commitCompleteBanner}>
                      <Text style={styles.commitCompleteText}>Commitment Completed!</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {tab === 'Leaderboard' && (
          <View>
            <Text style={styles.screenTitle}>Leaderboard</Text>
            <View style={styles.screenSegment}>
              {['The Committed', 'The Prophets'].map((mode) => {
                const active = leaderboardMode === mode;
                return (
                  <Pressable
                    key={mode}
                    style={[styles.screenSegmentBtn, active && styles.screenSegmentBtnActive]}
                    onPress={() => setLeaderboardMode(mode)}
                  >
                    <Text style={[styles.screenSegmentText, active && styles.screenSegmentTextActive]}>{mode}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.lbRangeRow}>
              {['All Time', 'This Week', 'This Month'].map((item) => {
                const active = leaderboardRange === item;
                return (
                  <Pressable
                    key={item}
                    style={[styles.lbRangeChip, active && styles.lbRangeChipActive]}
                    onPress={() => setLeaderboardRange(item)}
                  >
                    <Text style={[styles.lbRangeText, active && styles.lbRangeTextActive]}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.sectionRule} />

            {activeLeaderboardRows.slice(0, 5).map((row, index) => (
              <View key={`lb_new_${row.userId}`} style={styles.lbCard}>
                <View style={styles.lbLeftGroup}>
                  <Text style={styles.lbMedal}>{index < 3 ? `${index + 1}` : `#${index + 1}`}</Text>
                  <View style={styles.mockAvatar}>
                    <Text style={styles.mockAvatarText}>{getInitials(row.name)}</Text>
                  </View>
                  <View style={styles.lbTextWrap}>
                    <Text style={styles.lbName} numberOfLines={1}>{row.name}</Text>
                    <Text style={styles.lbSub} numberOfLines={1}>{row.subLabel}</Text>
                  </View>
                </View>
                <View style={styles.lbRightGroup}>
                  <Text style={styles.lbScore}>{`${Math.round(row.score)}%`}</Text>
                  <Text style={styles.lbMetric}>{row.metricLabel}</Text>
                </View>
              </View>
            ))}

            <Text style={styles.lbYourPosLabel}>YOUR POSITION</Text>
            {selfLeaderboardRow ? (
              <View style={styles.lbSelfCard}>
                <View style={styles.lbLeftGroup}>
                  <Text style={styles.lbSelfRank}>
                    {`#${Math.max(
                      1,
                      activeLeaderboardRows.findIndex((row) => row.userId === selfId) + 1
                    )}`}
                  </Text>
                  <View style={styles.mockAvatar}>
                    <Text style={styles.mockAvatarText}>{getInitials(selfLeaderboardRow.name)}</Text>
                  </View>
                  <View style={styles.lbTextWrap}>
                    <Text style={styles.lbName} numberOfLines={1}>{selfLeaderboardRow.name}</Text>
                    <Text style={styles.lbSub} numberOfLines={1}>{selfLeaderboardRow.subLabel}</Text>
                  </View>
                </View>
                <View style={styles.lbRightGroup}>
                  <Text style={styles.lbScore}>{`${Math.round(selfLeaderboardRow.score)}%`}</Text>
                  <Text style={styles.lbMetric}>{selfLeaderboardRow.metricLabel}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.dimText}>No ranking data yet for your account.</Text>
              </View>
            )}
            {activeLeaderboardRows.length === 0 && (
              <View style={styles.card}>
                <Text style={styles.dimText}>No leaderboard data yet.</Text>
              </View>
            )}
          </View>
        )}

        {tab === 'Notifications' && (
          <View>
            <Text style={styles.screenTitle}>Notifications</Text>
            <View style={styles.sectionRule} />
            {notifications.length === 0 && (
              <View style={styles.card}>
                <Text style={styles.dimText}>No notifications yet.</Text>
              </View>
            )}
            {notifications.map((item) => (
              <View key={`notif_${item.id}`} style={styles.notificationCard}>
                <Text style={styles.notificationTitle}>{item.title || 'Notification'}</Text>
                <Text style={styles.notificationBody}>{item.body || 'No details.'}</Text>
              </View>
            ))}
          </View>
        )}

        {tab === 'Profile' && (
          <View>
            <View style={styles.profileHero}>
              <View style={styles.profileTopRight}>
                <Pressable style={styles.profileGearBtn} onPress={() => setShowSettingsSheet(true)}>
                  <Text style={styles.profileGearIcon}>S</Text>
                </Pressable>
              </View>
              <View style={styles.profileAvatarLarge}>
                <Text style={styles.profileAvatarLargeText}>{getInitials(resolveActorName(authUser))}</Text>
              </View>
              <Text style={styles.profileName}>{resolveActorName(authUser)}</Text>
              <Text style={styles.profileHandle}>{toHandle(resolveActorName(authUser))}</Text>

              <View style={styles.profilePillRow}>
                <View style={styles.profileMetricPill}>
                  <Text style={styles.profileMetricPillText}>Coin {self?.coins || 0}</Text>
                </View>
                <View style={styles.profileMetricPill}>
                  <Text style={styles.profileMetricPillText}>Fire {selfStreak}</Text>
                </View>
              </View>

              <View style={styles.profileBadgeRow}>
                {personalityTags.map((tag) => (
                  <View key={`pt_${tag}`} style={styles.profileBadge}>
                    <Text style={styles.profileBadgeText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.profileSectionTabs}>
              {['Overview', 'Friends'].map((item) => {
                const active = profileSection === item;
                return (
                  <Pressable
                    key={item}
                    style={[styles.profileSectionTabBtn, active && styles.profileSectionTabBtnActive]}
                    onPress={() => setProfileSection(item)}
                  >
                    <Text style={[styles.profileSectionTabText, active && styles.profileSectionTabTextActive]}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>

            {profileSection === 'Overview' && (
              <>
                <View style={styles.profileStatsGrid}>
                  <View style={styles.profileStatCard}>
                    <Text style={styles.profileStatValue}>{selfStats?.totalBets || 0}</Text>
                    <Text style={styles.profileStatLabel}>Made</Text>
                  </View>
                  <View style={styles.profileStatCard}>
                    <Text style={styles.profileStatValue}>{selfStats?.passCount || 0}</Text>
                    <Text style={styles.profileStatLabel}>Kept</Text>
                  </View>
                  <View style={styles.profileStatCard}>
                    <Text style={styles.profileStatValue}>{`${profileRate}%`}</Text>
                    <Text style={styles.profileStatLabel}>Rate</Text>
                  </View>
                  <View style={styles.profileStatCard}>
                    <Text style={styles.profileStatValue}>{friends.length}</Text>
                    <Text style={styles.profileStatLabel}>Friends</Text>
                  </View>
                </View>

                <View style={styles.profileRoastCard}>
                  <Text style={styles.profileRoastTitle}>Weekly Roast Report</Text>
                  <Text style={styles.profileRoastBody}>{weeklyRoast}</Text>
                  <Pressable
                    style={styles.profileAiBtn}
                    onPress={() => selfId && generateRecapForUser(selfId)}
                    disabled={!selfId || !!selfRecapLoading}
                  >
                    <Text style={styles.profileAiBtnText}>
                      {selfRecapLoading ? 'Generating AI Recap...' : 'Generate AI Recap'}
                    </Text>
                  </Pressable>
                  {!!selfRecap && <Text style={styles.profileAiRecapText}>{selfRecap}</Text>}
                </View>

                <View style={styles.monetizeCard}>
                  <Text style={styles.monetizeTitle}>Betme AI Access</Text>
                  <Text style={styles.monetizeMeta}>{`Plan: ${selfMeta.plan === 'pro' ? 'Pro' : 'Free'} | AI Credits: ${selfMeta.aiCredits}`}</Text>
                  <View style={styles.profileQuickRow}>
                    <Pressable style={styles.smallBtnAlt} onPress={upgradeToPro}>
                      <Text style={styles.smallBtnText}>Upgrade Pro</Text>
                    </Pressable>
                    <Pressable style={styles.smallBtn} onPress={buyAiCreditPack}>
                      <Text style={styles.smallBtnText}>Buy 10 Credits</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.monetizeHint}>Freemium model: free users spend AI credits, Pro gets unlimited AI features.</Text>
                </View>

                <View style={styles.referralCard}>
                  <Text style={styles.referralTitle}>Referral Loop</Text>
                  <Text style={styles.referralMeta}>{`Your code: ${selfMeta.referralCode || 'N/A'} | Referrals: ${selfMeta.referralCount || 0}`}</Text>
                  <TextInput
                    value={referralInput}
                    onChangeText={setReferralInput}
                    placeholder="Enter referral code"
                    placeholderTextColor="#7F73A3"
                    autoCapitalize="characters"
                    style={styles.input}
                  />
                  <View style={styles.profileQuickRow}>
                    <Pressable style={styles.smallBtn} onPress={applyReferralCode}>
                      <Text style={styles.smallBtnText}>Apply Code</Text>
                    </Pressable>
                    <Pressable style={styles.smallBtnAlt} onPress={shareProfileSnapshot}>
                      <Text style={styles.smallBtnText}>Share Snapshot</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.profileQuickRow}>
                  <Pressable style={styles.smallBtn} onPress={shareInvite}>
                    <Text style={styles.smallBtnText}>Share Invite</Text>
                  </Pressable>
                  <Pressable style={styles.smallBtnAlt} onPress={() => setShowSettingsSheet(true)}>
                    <Text style={styles.smallBtnText}>{`Friends ${incomingRequests.length}`}</Text>
                  </Pressable>
                </View>
              </>
            )}

            {profileSection === 'Friends' && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Friends</Text>
                <TextInput
                  value={friendEmail}
                  onChangeText={setFriendEmail}
                  placeholder="Friend email"
                  placeholderTextColor="#7F73A3"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.input}
                />
                <Pressable style={styles.primaryBtn} onPress={sendFriendRequest}>
                  <Text style={styles.primaryBtnText}>Send Request</Text>
                </Pressable>
                {friends.length === 0 && <Text style={styles.dimText}>No friends yet.</Text>}
                {friends.map((friend) => (
                  <Text key={`profile_friend_${friend.id}`} style={styles.betLine}>
                    {friend.name || friend.email || friend.id}
                  </Text>
                ))}
                <Text style={styles.cardTitle}>Incoming Requests</Text>
                {incomingRequests.length === 0 && <Text style={styles.dimText}>No incoming requests.</Text>}
                {incomingRequests.map((req) => (
                  <View key={`profile_req_${req.id}`} style={styles.requestRow}>
                    <Text style={styles.walletName}>{req.fromName || req.fromEmail || req.id}</Text>
                    <View style={styles.rowGap}>
                      <Pressable style={styles.smallBtn} onPress={() => acceptFriendRequest(req)}>
                        <Text style={styles.smallBtnText}>Accept</Text>
                      </Pressable>
                      <Pressable style={styles.smallBtnAlt} onPress={() => rejectFriendRequest(req)}>
                        <Text style={styles.smallBtnText}>Reject</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

          {!!message && (
            <View style={styles.toast}>
              <Text style={styles.toastText}>{message}</Text>
            </View>
          )}
        </ScrollView>
        <Modal visible={showCreateBetModal} transparent animationType="slide" onRequestClose={() => setShowCreateBetModal(false)}>
          <View style={styles.sheetBackdrop}>
            <Pressable style={styles.sheetBackdropTap} onPress={() => setShowCreateBetModal(false)} />
            <View style={styles.sheetPanel}>
              <Text style={styles.cardTitle}>Create Bet</Text>
              <View style={styles.betTypeTabs}>
                {[
                  { key: 'CALL_OUT', label: 'Call Out' },
                  { key: 'COMMITMENT', label: 'Commitment' },
                ].map((item) => {
                  const active = betKind === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      style={[styles.betTypeTabBtn, active && styles.betTypeTabBtnActive]}
                      onPress={() => setBetKind(item.key)}
                    >
                      <Text style={[styles.betTypeTabText, active && styles.betTypeTabTextActive]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={betText}
                onChangeText={setBetText}
                placeholder="I will run 5km before 7am"
                placeholderTextColor="#7F73A3"
                style={styles.input}
              />
              <TextInput
                value={stakeAmount}
                onChangeText={setStakeAmount}
                placeholder="Stake coins on yourself (optional)"
                placeholderTextColor="#7F73A3"
                keyboardType="number-pad"
                style={styles.input}
              />
              <Pressable style={styles.input} onPress={openDeadlinePicker}>
                <Text style={deadline ? styles.inputText : styles.inputPlaceholder}>
                  {deadline || 'Select deadline'}
                </Text>
              </Pressable>
              {showDeadlinePicker && (
                <DateTimePicker
                  value={deadlineDate}
                  mode={Platform.OS === 'ios' ? 'datetime' : deadlinePickerMode}
                  minimumDate={new Date()}
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={onDeadlineChange}
                />
              )}
              <View style={styles.createModalActions}>
                <Pressable style={styles.smallBtn} onPress={runAiDraftBet} disabled={aiDraftLoading}>
                  <Text style={styles.smallBtnText}>{aiDraftLoading ? 'AI Drafting...' : 'AI Draft'}</Text>
                </Pressable>
                <Pressable style={styles.smallBtnAlt} onPress={runAiBetPreview} disabled={aiPreviewLoading}>
                  <Text style={styles.smallBtnText}>{aiPreviewLoading ? 'Previewing...' : 'AI Preview'}</Text>
                </Pressable>
              </View>
              {!!aiPreview && (
                <View style={styles.aiPreviewCard}>
                  <Text style={styles.aiPreviewTitle}>{`AI Odds ${aiPreview.odds}%`}</Text>
                  <Text style={styles.aiPreviewMeta}>{`Risk ${aiPreview.riskLabel}`}</Text>
                  <Text style={styles.aiPreviewText}>{aiPreview.bookie}</Text>
                </View>
              )}
              <Pressable
                style={styles.primaryBtn}
                onPress={async () => {
                  const ok = await createNewBet();
                  if (ok) setShowCreateBetModal(false);
                }}
              >
                <Text style={styles.primaryBtnText}>Post Bet</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        <Modal visible={showSettingsSheet} transparent animationType="slide" onRequestClose={() => setShowSettingsSheet(false)}>
          <View style={styles.sheetBackdrop}>
            <Pressable style={styles.sheetBackdropTap} onPress={() => setShowSettingsSheet(false)} />
            <View style={styles.sheetPanel}>
              <Text style={styles.cardTitle}>Settings</Text>
              <View style={styles.settingsRow}>
                <Text style={styles.meta}>Streak label</Text>
                <Text style={styles.walletName}>Fire {selfStreak}</Text>
              </View>
              <View style={styles.settingsRow}>
                <Text style={styles.meta}>Plan</Text>
                <Text style={styles.walletName}>{selfMeta.plan === 'pro' ? 'Pro' : 'Free'}</Text>
              </View>
              <View style={styles.settingsRow}>
                <Text style={styles.meta}>AI Credits</Text>
                <Text style={styles.walletName}>{selfMeta.aiCredits}</Text>
              </View>
              <Pressable style={styles.smallBtnAlt} onPress={handleLogout}>
                <Text style={styles.smallBtnText}>Logout</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={() => setShowSettingsSheet(false)}>
                <Text style={styles.primaryBtnText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        <Modal visible={showSocialSheet} transparent animationType="slide" onRequestClose={() => setShowSocialSheet(false)}>
          <View style={styles.sheetBackdrop}>
            <Pressable style={styles.sheetBackdropTap} onPress={() => setShowSocialSheet(false)} />
            <View style={styles.sheetPanel}>
              <Text style={styles.cardTitle}>Social Center</Text>
              <Pressable style={styles.primaryBtn} onPress={shareInvite}>
                <Text style={styles.primaryBtnText}>Share Invite Link</Text>
              </Pressable>
              <TextInput
                value={friendEmail}
                onChangeText={setFriendEmail}
                placeholder="Friend email"
                placeholderTextColor="#7F73A3"
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
              <Pressable style={styles.primaryBtn} onPress={sendFriendRequest}>
                <Text style={styles.primaryBtnText}>Send Request</Text>
              </Pressable>
              <Text style={styles.meta}>Incoming Requests</Text>
              {incomingRequests.length === 0 && <Text style={styles.dimText}>No incoming requests.</Text>}
              {incomingRequests.slice(0, 4).map((req) => (
                <View key={`modal_req_${req.id}`} style={styles.requestRow}>
                  <Text style={styles.walletName}>{req.fromName || req.fromEmail || req.id}</Text>
                  <View style={styles.rowGap}>
                    <Pressable style={styles.smallBtn} onPress={() => acceptFriendRequest(req)}>
                      <Text style={styles.smallBtnText}>Accept</Text>
                    </Pressable>
                    <Pressable style={styles.smallBtnAlt} onPress={() => rejectFriendRequest(req)}>
                      <Text style={styles.smallBtnText}>Reject</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              <Text style={styles.meta}>Notifications</Text>
              {notifications.slice(0, 6).map((n) => (
                <View key={`modal_n_${n.id}`} style={styles.myBetRow}>
                  <Text style={styles.walletName}>{n.title || 'Notification'}</Text>
                  <Text style={styles.meta}>{n.body || ''}</Text>
                </View>
              ))}
            </View>
          </View>
        </Modal>
        <Modal
          visible={!!profileOverlayData}
          transparent
          animationType="slide"
          onRequestClose={() => setProfileOverlayUserId('')}
        >
          <View style={styles.sheetBackdrop}>
            <Pressable style={styles.sheetBackdropTap} onPress={() => setProfileOverlayUserId('')} />
            <View style={styles.sheetPanel}>
              <Text style={styles.cardTitle}>{profileOverlayData?.name || 'Profile'}</Text>
              <Text style={styles.meta}>Success Rate: {profileOverlayData?.successRate || 0}%</Text>
              <Text style={styles.meta}>Total Wins: {profileOverlayData?.totalWins || 0}</Text>
              <Text style={styles.meta}>Recent Proofs</Text>
              <View style={styles.overlayProofGrid}>
                {(profileOverlayData?.recentProofs || []).map((item) => (
                  <Image
                    key={`overlay_proof_${item.id}`}
                    source={{ uri: item.victoryPosterUri || item.proofImageUri }}
                    style={styles.overlayProofThumb}
                  />
                ))}
                {(profileOverlayData?.recentProofs || []).length === 0 && (
                  <Text style={styles.dimText}>No recent proofs.</Text>
                )}
              </View>
            </View>
          </View>
        </Modal>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shutterOverlay,
            {
              opacity: shutterAnim,
              transform: [
                {
                  scale: shutterAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1.08, 1],
                  }),
                },
              ],
            },
          ]}
        />
        <View style={styles.bottomNavDock}>
          <TopNav current={tab} onChange={setTab} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#050505',
  },
  appShell: {
    flex: 1,
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    padding: 16,
    paddingBottom: 110,
  },
  homeTopRow: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandTitle: {
    color: '#A447FF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  homeTopStats: {
    flexDirection: 'row',
    gap: 8,
  },
  headerChip: {
    borderRadius: 999,
    backgroundColor: '#2A2342',
    borderWidth: 1,
    borderColor: 'rgba(179, 118, 255, 0.35)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  headerChipText: {
    color: '#F5B942',
    fontWeight: '700',
    fontSize: 13,
  },
  homeTabs: {
    backgroundColor: '#26213B',
    borderRadius: 14,
    padding: 4,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 14,
  },
  homeActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  coinChipWrap: {
    position: 'relative',
    overflow: 'visible',
  },
  coinBurstText: {
    position: 'absolute',
    right: 6,
    top: -6,
    color: '#FFE27A',
    fontSize: 12,
    fontWeight: '800',
    textShadowColor: 'rgba(255, 226, 122, 0.65)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  coreLoopCard: {
    backgroundColor: '#1C1730',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(126,72,219,0.26)',
    padding: 10,
    marginBottom: 10,
  },
  coreLoopTitle: {
    color: '#EDE8FF',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  coreLoopText: {
    color: '#B8B1D1',
    fontSize: 12,
    marginBottom: 3,
  },
  createBetBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#8F4EF2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  createBetBtnText: {
    color: '#F2EFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  homeAmountInput: {
    minWidth: 110,
    backgroundColor: '#1C1730',
    borderWidth: 1,
    borderColor: 'rgba(126,72,219,0.4)',
    color: '#EFEAFF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
  },
  homeTabBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  homeTabBtnActive: {
    backgroundColor: '#A13BDA',
  },
  homeTabText: {
    color: '#7F7A8F',
    fontSize: 13,
    fontWeight: '700',
  },
  homeTabTextActive: {
    color: '#F4E9FF',
  },
  mockFeedWrap: {
    gap: 12,
  },
  mockCard: {
    backgroundColor: '#1C1730',
    borderColor: 'rgba(141, 75, 255, 0.26)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    shadowColor: '#6C2DD6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 6,
  },
  mockCardFlashNo: {
    borderColor: '#8D4DFF',
    shadowColor: '#8D4DFF',
    shadowOpacity: 0.45,
  },
  mockCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  mockAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#7D3BE4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  mockAvatarText: {
    color: '#EBDDFF',
    fontSize: 12,
    fontWeight: '800',
  },
  mockOwnerText: {
    flex: 1,
  },
  mockOwnerName: {
    color: '#F2F0F9',
    fontWeight: '700',
    fontSize: 16,
  },
  mockOwnerHandle: {
    color: '#88839B',
    fontSize: 13,
    marginTop: 1,
  },
  mockTypePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#AA4AF3',
  },
  mockTypePillText: {
    color: '#F5E9FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  mockBetTitle: {
    color: '#F4F0FF',
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    marginBottom: 12,
  },
  mockTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  mockSoftTag: {
    borderRadius: 999,
    backgroundColor: '#2C2640',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mockSoftTagText: {
    color: '#B6AFCA',
    fontWeight: '700',
    fontSize: 12,
  },
  mockStatusTag: {
    backgroundColor: '#1B4B3A',
  },
  mockStatusTagText: {
    color: '#40E281',
    fontWeight: '700',
    fontSize: 12,
  },
  mockTimeWrap: {
    marginLeft: 'auto',
  },
  mockTimeText: {
    color: '#C85B66',
    fontWeight: '700',
    fontSize: 12,
  },
  mockPoolGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  mockPoolCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 88,
  },
  mockPoolYes: {
    borderColor: 'rgba(136, 103, 247, 0.34)',
    backgroundColor: 'rgba(27, 30, 47, 0.7)',
  },
  mockPoolNo: {
    borderColor: 'rgba(130, 56, 79, 0.45)',
    backgroundColor: 'rgba(40, 24, 33, 0.7)',
  },
  mockPoolLabel: {
    color: '#857FB0',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 5,
  },
  mockPoolAmount: {
    color: '#F9C74A',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 4,
  },
  mockPoolUser: {
    color: '#7E7B96',
    fontSize: 12,
  },
  mockActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  mockVoteYesBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#1E5544',
    paddingVertical: 12,
    alignItems: 'center',
  },
  mockVoteYesBtnActive: {
    borderWidth: 1,
    borderColor: '#4BFE9E',
  },
  mockVoteNoBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#5D2432',
    paddingVertical: 12,
    alignItems: 'center',
  },
  mockVoteNoBtnActive: {
    borderWidth: 1,
    borderColor: '#FF545A',
  },
  mockVoteBtnDisabled: {
    opacity: 0.7,
  },
  voteLiquidTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(49, 54, 89, 0.75)',
    overflow: 'hidden',
    marginBottom: 12,
  },
  voteLiquidFill: {
    height: '100%',
    borderRadius: 999,
  },
  voteLiquidFillDefault: {
    backgroundColor: '#4FAAF8',
  },
  voteLiquidFillYesGlow: {
    backgroundColor: '#2AD67E',
    shadowColor: '#2AD67E',
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  voteLiquidFillNo: {
    backgroundColor: '#8D4DFF',
  },
  voteOddsText: {
    color: '#AFA8C8',
    fontSize: 11,
    marginBottom: 8,
  },
  mockVoteYesText: {
    color: '#4BFE9E',
    fontWeight: '800',
    fontSize: 15,
  },
  mockVoteNoText: {
    color: '#FF545A',
    fontWeight: '800',
    fontSize: 15,
  },
  mockVoteMeta: {
    color: '#9F9AB8',
    fontWeight: '600',
  },
  screenTitle: {
    color: '#F0F0F6',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 12,
  },
  screenSegment: {
    backgroundColor: '#2A263C',
    borderRadius: 14,
    padding: 4,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 10,
  },
  screenSegmentBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  screenSegmentBtnActive: {
    backgroundColor: '#A447E0',
  },
  screenSegmentText: {
    color: '#8A859B',
    fontSize: 14,
    fontWeight: '700',
  },
  screenSegmentTextActive: {
    color: '#F4ECFF',
  },
  sectionRule: {
    height: 1,
    backgroundColor: 'rgba(105, 86, 147, 0.4)',
    marginBottom: 12,
  },
  commitCard: {
    backgroundColor: '#1C1730',
    borderColor: 'rgba(141, 75, 255, 0.26)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  commitOwnerName: {
    color: '#F2F0F9',
    fontWeight: '700',
    fontSize: 18,
  },
  commitTypePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(49, 75, 171, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(84, 120, 255, 0.45)',
  },
  commitTypePillText: {
    color: '#3E6DDE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  commitTitle: {
    color: '#F4F0FF',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    marginBottom: 12,
  },
  commitMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  commitStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  commitStatusActive: {
    backgroundColor: 'rgba(30, 88, 63, 0.55)',
  },
  commitStatusSuccess: {
    backgroundColor: 'rgba(23, 121, 91, 0.55)',
  },
  commitStatusExpired: {
    backgroundColor: 'rgba(111, 34, 55, 0.55)',
  },
  commitStatusText: {
    color: '#4DF69E',
    fontWeight: '700',
    fontSize: 12,
  },
  commitTimeText: {
    marginLeft: 'auto',
    color: '#C75F6A',
    fontWeight: '700',
    fontSize: 12,
  },
  commitPoolWrap: {
    backgroundColor: '#262239',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  commitPoolTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  commitPoolBackers: {
    color: '#8F8AA8',
    fontSize: 12,
    fontWeight: '600',
  },
  commitPoolTotal: {
    color: '#F9C74A',
    fontSize: 19,
    fontWeight: '800',
  },
  commitPoolBar: {
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(50, 58, 93, 0.75)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  commitPoolBarFill: {
    height: '100%',
    backgroundColor: '#3CA5FF',
    borderRadius: 999,
  },
  commitBackersList: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  commitBackerItem: {
    color: '#D2CEE3',
    fontSize: 12,
    fontWeight: '600',
  },
  commitCompleteBanner: {
    borderRadius: 12,
    backgroundColor: '#2ACB85',
    paddingVertical: 12,
    alignItems: 'center',
  },
  commitCompleteText: {
    color: '#E9FFF3',
    fontSize: 16,
    fontWeight: '800',
  },
  lbRangeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  lbRangeChip: {
    borderRadius: 999,
    backgroundColor: '#2A263B',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  lbRangeChipActive: {
    backgroundColor: '#8F4EF2',
  },
  lbRangeText: {
    color: '#8D87A6',
    fontSize: 12,
    fontWeight: '700',
  },
  lbRangeTextActive: {
    color: '#F4ECFF',
  },
  lbCard: {
    backgroundColor: '#1F1A33',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(126, 72, 219, 0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lbLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  lbTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  lbMedal: {
    width: 26,
    color: '#CFA157',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  lbName: {
    color: '#F2F0F8',
    fontSize: 14,
    fontWeight: '700',
  },
  lbSub: {
    color: '#8D87A5',
    fontSize: 12,
    marginTop: 2,
  },
  lbRightGroup: {
    alignItems: 'flex-end',
    marginLeft: 8,
    minWidth: 74,
  },
  lbScore: {
    color: '#F3ECFF',
    fontSize: 20,
    fontWeight: '800',
  },
  lbMetric: {
    color: '#8E89A6',
    fontSize: 12,
    marginTop: 2,
  },
  lbYourPosLabel: {
    marginTop: 10,
    marginBottom: 10,
    color: '#7F7898',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.8,
  },
  lbSelfCard: {
    backgroundColor: '#241942',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(162, 83, 245, 0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lbSelfRank: {
    width: 26,
    color: '#A85AFF',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  profileHero: {
    backgroundColor: '#27183F',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(132, 84, 205, 0.32)',
  },
  profileTopRight: {
    alignItems: 'flex-end',
  },
  profileGearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileGearIcon: {
    color: '#D8CFEF',
    fontWeight: '800',
    fontSize: 12,
  },
  profileAvatarLarge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#8B41E8',
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarLargeText: {
    color: '#F2E8FF',
    fontSize: 28,
    fontWeight: '800',
  },
  profileName: {
    color: '#F5F1FF',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  profileHandle: {
    color: '#9D93B8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 10,
  },
  profilePillRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  profileMetricPill: {
    backgroundColor: '#31294A',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  profileMetricPillText: {
    color: '#F4BC4B',
    fontWeight: '700',
    fontSize: 12,
  },
  profileBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  profileBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(91, 54, 153, 0.45)',
  },
  profileBadgeText: {
    color: '#9E73E8',
    fontSize: 11,
    fontWeight: '700',
  },
  profileStatsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  profileStatCard: {
    flex: 1,
    backgroundColor: '#1F1B33',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(114, 72, 178, 0.25)',
    paddingVertical: 12,
    alignItems: 'center',
  },
  profileStatValue: {
    color: '#F2ECFF',
    fontSize: 20,
    fontWeight: '800',
  },
  profileStatLabel: {
    color: '#9F93BB',
    fontSize: 12,
    marginTop: 4,
  },
  profileRoastCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(211, 131, 69, 0.45)',
    backgroundColor: 'rgba(48, 34, 31, 0.45)',
    padding: 14,
    marginBottom: 12,
  },
  profileRoastTitle: {
    color: '#F7F0FF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  profileRoastBody: {
    color: '#ADA1C2',
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  profileQuickRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  profileAiBtn: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: '#2D2248',
    borderWidth: 1,
    borderColor: 'rgba(126,72,219,0.45)',
    paddingVertical: 9,
    alignItems: 'center',
  },
  profileAiBtnText: {
    color: '#D9CCFF',
    fontSize: 12,
    fontWeight: '700',
  },
  profileAiRecapText: {
    marginTop: 8,
    color: '#C4B7DB',
    fontSize: 12,
    lineHeight: 17,
  },
  monetizeCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(126,72,219,0.35)',
    backgroundColor: 'rgba(35, 28, 54, 0.78)',
    padding: 10,
    marginBottom: 10,
  },
  monetizeTitle: {
    color: '#EDE8FF',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  monetizeMeta: {
    color: '#BDB2D7',
    fontSize: 12,
    marginBottom: 8,
  },
  monetizeHint: {
    color: '#9E93BC',
    fontSize: 11,
    lineHeight: 16,
  },
  referralCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(87, 136, 228, 0.35)',
    backgroundColor: 'rgba(27, 37, 58, 0.65)',
    padding: 10,
    marginBottom: 10,
  },
  referralTitle: {
    color: '#E5F0FF',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  referralMeta: {
    color: '#AFC5E6',
    fontSize: 12,
    marginBottom: 8,
  },
  profileSectionTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  profileSectionTabBtn: {
    flex: 1,
    backgroundColor: '#2A263B',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 9,
  },
  profileSectionTabBtnActive: {
    backgroundColor: '#8F4EF2',
  },
  profileSectionTabText: {
    color: '#A7A0C2',
    fontSize: 12,
    fontWeight: '700',
  },
  profileSectionTabTextActive: {
    color: '#F2EFFF',
  },
  notificationCard: {
    backgroundColor: '#1F1A33',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(126, 72, 219, 0.25)',
  },
  notificationTitle: {
    color: '#EDE8FF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  notificationBody: {
    color: '#A79FBE',
    fontSize: 12,
    lineHeight: 18,
  },
  createModalActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  betTypeTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  betTypeTabBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#2A263B',
    paddingVertical: 9,
    alignItems: 'center',
  },
  betTypeTabBtnActive: {
    backgroundColor: '#8F4EF2',
  },
  betTypeTabText: {
    color: '#A7A0C2',
    fontSize: 12,
    fontWeight: '700',
  },
  betTypeTabTextActive: {
    color: '#F2EFFF',
  },
  aiPreviewCard: {
    backgroundColor: 'rgba(38, 30, 57, 0.85)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(126,72,219,0.35)',
    padding: 10,
    marginBottom: 10,
  },
  aiPreviewTitle: {
    color: '#EEE7FF',
    fontWeight: '800',
    fontSize: 13,
    marginBottom: 2,
  },
  aiPreviewMeta: {
    color: '#A79FBE',
    fontSize: 11,
    marginBottom: 6,
  },
  aiPreviewText: {
    color: '#D1C7E8',
    fontSize: 12,
    lineHeight: 17,
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.22)',
    paddingBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#F5F5FF',
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 16,
    color: '#A9A9C7',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streakPill: {
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.35)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  streakPillText: {
    color: '#DDD6FE',
    fontWeight: '700',
    fontSize: 12,
  },
  bellBtn: {
    backgroundColor: 'rgba(139, 92, 246, 0.35)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.7)',
  },
  card: {
    backgroundColor: 'rgba(24, 24, 24, 0.68)',
    borderColor: 'rgba(240, 240, 240, 0.1)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#E8E8FF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  feedHeading: {
    color: '#F4F4FF',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 8,
  },
  myBetRow: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 92, 246, 0.24)',
    paddingBottom: 8,
    marginBottom: 8,
  },
  requestRow: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 92, 246, 0.24)',
    paddingBottom: 10,
    marginBottom: 10,
  },
  lbHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  lbRank: {
    color: '#C4B5FD',
    fontWeight: '800',
    fontSize: 13,
  },
  input: {
    backgroundColor: 'rgba(8, 8, 8, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(240, 240, 240, 0.18)',
    color: '#F0F0F0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  inputText: {
    color: '#F4F4FF',
  },
  inputPlaceholder: {
    color: '#7A7A7A',
  },
  primaryBtn: {
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  attachBtn: {
    marginBottom: 8,
  },
  activeBtn: {
    backgroundColor: '#8B5CF6',
  },
  primaryBtnText: {
    color: '#050505',
    fontWeight: '700',
  },
  dimText: {
    color: '#9A9A9A',
    marginTop: 8,
  },
  errorText: {
    marginTop: 10,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  promiseCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(13, 14, 19, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.35)',
  },
  betCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(20, 20, 20, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.32)',
    shadowColor: '#6366F1',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  promiseText: {
    color: '#F0F2FF',
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 4,
  },
  betTitle: {
    color: '#F0F0F0',
    fontWeight: '800',
    fontSize: 18,
    marginBottom: 8,
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  liveScanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.45)',
    backgroundColor: 'rgba(99, 102, 241, 0.16)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  verifiedBadge: {
    borderColor: 'rgba(240,240,240,0.45)',
    backgroundColor: 'rgba(240,240,240,0.14)',
  },
  rejectedBadge: {
    borderColor: 'rgba(139,92,246,0.6)',
    backgroundColor: 'rgba(139,92,246,0.18)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6366F1',
    marginRight: 6,
  },
  liveScanText: {
    color: '#F0F0F0',
    fontWeight: '700',
    fontSize: 12,
  },
  timeBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(240,240,240,0.26)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(61,61,61,0.5)',
  },
  timeBadgeText: {
    color: '#F0F0F0',
    fontSize: 12,
    fontWeight: '700',
  },
  meta: {
    color: '#B9B9B9',
    marginBottom: 4,
  },
  status: {
    color: '#AADDAA',
    fontWeight: '600',
    marginBottom: 8,
  },
  pass: {
    color: '#00FF88',
  },
  fail: {
    color: '#FF5F9E',
  },
  rowGap: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  smallBtn: {
    backgroundColor: '#3D3D3D',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  smallBtnAlt: {
    backgroundColor: '#6366F1',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  smallBtnText: {
    color: '#F0F0F0',
    fontWeight: '600',
  },
  proofWrap: {
    marginTop: 4,
    marginBottom: 8,
  },
  proofImage: {
    width: '100%',
    height: 160,
    borderRadius: 14,
    marginBottom: 8,
  },
  scanWrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 14,
    marginBottom: 8,
  },
  scanBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 42,
    backgroundColor: 'rgba(99,102,241,0.24)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(99,102,241,0.8)',
  },
  scanningText: {
    position: 'absolute',
    right: 8,
    top: 8,
    color: '#E6E7FF',
    fontWeight: '700',
    fontSize: 12,
  },
  holoSealPass: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    color: '#F0F0F0',
    fontWeight: '900',
    fontSize: 16,
    textShadowColor: '#6366F1',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  holoSealFail: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    color: '#C8A2FF',
    fontWeight: '900',
    fontSize: 16,
    textShadowColor: '#8B5CF6',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  posterWrap: {
    marginBottom: 8,
  },
  posterImage: {
    width: '100%',
    height: 220,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#3D3D3D',
  },
  betLine: {
    color: '#A9D8A9',
    marginTop: 2,
  },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 92, 246, 0.24)',
    paddingBottom: 8,
  },
  walletName: {
    color: '#ECECFF',
    fontWeight: '600',
  },
  walletCoins: {
    color: '#00FF88',
    fontWeight: '700',
  },
  rewardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 92, 246, 0.24)',
  },
  rewardLabel: {
    color: '#EDEEFF',
    fontWeight: '600',
  },
  toast: {
    marginTop: 8,
    backgroundColor: 'rgba(16, 17, 24, 0.92)',
    borderColor: '#8B5CF6',
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
  },
  toastText: {
    color: '#E6E7FF',
    fontWeight: '500',
  },
  bottomNavDock: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
  },
  postFabWide: {
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.55)',
    backgroundColor: 'rgba(139, 92, 246, 0.28)',
  },
  tagRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  tagPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(240, 240, 240, 0.2)',
    backgroundColor: 'rgba(61, 61, 61, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 4,
  },
  tagPillText: {
    color: '#F0F0F0',
    fontSize: 12,
    fontWeight: '700',
  },
  betHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ownerBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(16, 16, 16, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(240, 240, 240, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringWrap: {
    width: 46,
    height: 46,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSvg: {
    position: 'absolute',
  },
  ownerBadgeText: {
    color: '#EDE9FF',
    fontWeight: '800',
    fontSize: 12,
  },
  ownerHeaderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  meterSection: {
    marginBottom: 10,
  },
  meterLabel: {
    color: '#D6D7F7',
    fontWeight: '700',
    marginBottom: 4,
  },
  poolTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(61, 61, 61, 0.8)',
    overflow: 'hidden',
  },
  poolLiquidFill: {
    height: '100%',
    borderRadius: 999,
  },
  poolLiquidYes: {
    backgroundColor: '#F0F0F0',
  },
  poolLiquidNo: {
    backgroundColor: '#6366F1',
  },
  poolYesFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#00FF88',
  },
  poolLabels: {
    marginTop: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  poolYesText: {
    color: '#83FFCC',
    fontWeight: '700',
  },
  poolNoText: {
    color: '#D3C1FF',
    fontWeight: '700',
  },
  confidenceTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    overflow: 'hidden',
    marginBottom: 4,
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#8B5CF6',
  },
  facepileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  facepileWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  facepileItem: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(17, 17, 24, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  facepileText: {
    color: '#DAFFE9',
    fontWeight: '700',
    fontSize: 10,
  },
  aiTerminal: {
    backgroundColor: 'rgba(14, 14, 14, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(61, 61, 61, 0.8)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  aiTerminalTitle: {
    color: '#C6C7D9',
    letterSpacing: 1,
    fontSize: 11,
    marginBottom: 6,
  },
  aiTerminalText: {
    color: '#D7D7D7',
    marginTop: 4,
  },
  aiBookieBubble: {
    backgroundColor: 'rgba(139, 92, 246, 0.16)',
    borderColor: 'rgba(139, 92, 246, 0.35)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  aiBookieLabel: {
    color: '#D9C6FF',
    fontWeight: '700',
    fontSize: 11,
    marginBottom: 4,
  },
  verdictBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#E8E8FF',
    backgroundColor: 'rgba(75, 85, 99, 0.45)',
  },
  verdictPass: {
    backgroundColor: 'rgba(0, 255, 136, 0.22)',
    color: '#00FF88',
    textShadowColor: '#00FF88',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  verdictFail: {
    backgroundColor: 'rgba(255, 95, 158, 0.22)',
    color: '#FF8FC2',
    textShadowColor: '#FF5F9E',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  yesPillBtn: {
    backgroundColor: 'rgba(240, 240, 240, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(240, 240, 240, 0.7)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  noPillBtn: {
    backgroundColor: 'rgba(139, 92, 246, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.7)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  choiceActiveYes: {
    backgroundColor: 'rgba(240,240,240,0.35)',
  },
  choiceActiveNo: {
    backgroundColor: 'rgba(139,92,246,0.4)',
  },
  coinBurstRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  coinBurst: {
    color: '#FFE37A',
    fontSize: 18,
  },
  soulboundBadge: {
    marginTop: 6,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.45)',
    backgroundColor: 'rgba(0, 255, 136, 0.08)',
    padding: 10,
  },
  soulboundTitle: {
    color: '#90FFD3',
    fontWeight: '800',
    marginBottom: 2,
  },
  soulboundText: {
    color: '#CCFFE9',
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetBackdropTap: {
    flex: 1,
  },
  sheetPanel: {
    maxHeight: '70%',
    backgroundColor: 'rgba(18,18,24,0.96)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.5)',
    padding: 16,
  },
  overlayProofGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  overlayProofThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.55)',
  },
  statusRibbon: {
    position: 'absolute',
    right: 10,
    top: 10,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(61,61,61,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(240,240,240,0.15)',
    zIndex: 3,
  },
  statusRibbonText: {
    color: '#F0F0F0',
    fontWeight: '700',
    fontSize: 11,
  },
  dropzone: {
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(240,240,240,0.35)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  dropzoneAlt: {
    borderColor: 'rgba(99,102,241,0.55)',
  },
  dropzoneText: {
    color: '#F0F0F0',
    fontWeight: '600',
  },
  submitEvidenceBtn: {
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    paddingVertical: 12,
  },
  neuralNodes: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    gap: 6,
  },
  node: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#6366F1',
    shadowColor: '#6366F1',
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  shutterOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(240,240,240,0.62)',
  },
});








