import React, { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
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
  generateSecretGesture,
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

function normalizeBet(docSnap) {
  const payload = docSnap.data() || {};
  return {
    id: docSnap.id,
    text: payload.text || '',
    deadlineISO: payload.deadlineISO || '',
    actorId: payload.actorId || payload.ownerId,
    ownerId: payload.ownerId,
    ownerName: payload.ownerName || 'Unknown',
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
  const [tab, setTab] = useState('Feed');
  const [betText, setBetText] = useState('');
  const [deadline, setDeadline] = useState('');
  const [deadlineDate, setDeadlineDate] = useState(() => new Date(Date.now() + 60 * 60 * 1000));
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [deadlinePickerMode, setDeadlinePickerMode] = useState('date');
  const [stakeAmount, setStakeAmount] = useState('0');
  const [proof, setProof] = useState({});
  const [proofImageByBet, setProofImageByBet] = useState({});
  const [proofVideoByBet, setProofVideoByBet] = useState({});
  const [betAmount, setBetAmount] = useState(DEFAULT_BET);
  const [friendEmail, setFriendEmail] = useState('');
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [commentDraftByBet, setCommentDraftByBet] = useState({});
  const [recapByUser, setRecapByUser] = useState({});
  const [recapProviderByUser, setRecapProviderByUser] = useState({});
  const [recapLoadingByUser, setRecapLoadingByUser] = useState({});
  const [coinBurstByBet, setCoinBurstByBet] = useState({});
  const [message, setMessage] = useState('');

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
      setProofVideoByBet({});
      setRecapByUser({});
      setRecapProviderByUser({});
      setRecapLoadingByUser({});
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
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      })().catch(() => {});

      unsubscribeProfile = onSnapshot(userRef, (snap) => {
        const data = snap.data() || {};
        const name = data.name || actorName;
        const coins = Number.isFinite(data.coins) ? data.coins : 1000;
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

  const getDisplayNameForUser = (userId) => {
    if (!userId) return 'Unknown';
    if (userId === selfId) return resolveActorName(authUser);
    const fromFriend = friends.find((f) => (f.friendId || f.id) === userId);
    if (fromFriend?.name) return fromFriend.name;
    const fromBet = bets.find((b) => b.ownerId === userId && b.ownerName);
    return fromBet?.ownerName || userId;
  };

  const generateRecapForUser = async (userId) => {
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
      await Share.share({
        message: `Join me on Bet On Me: ${inviteLink}`,
      });
    } catch (error) {
      setMessage(error?.message || 'Failed to share invite.');
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
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setMessage('Photo library permission denied.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
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

  const pickProofVideo = async (betId) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setMessage('Photo/video library permission denied.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        quality: 0.6,
        videoMaxDuration: 3,
      });
      if (result.canceled || !result.assets?.length) return;
      const uri = result.assets[0].uri;
      setProofVideoByBet((prev) => ({ ...prev, [betId]: uri }));
    } catch (error) {
      setMessage(error?.message || 'Failed to pick proof video.');
    }
  };

  const createNewBet = async () => {
    if (!authUser?.uid) {
      setMessage('Please log in first.');
      return;
    }

    if (!betText.trim() || !deadline.trim()) {
      setMessage('Add both bet text and deadline.');
      return;
    }

    const deadlineMs = parseDeadlineToMs(deadline.trim());
    if (!Number.isFinite(deadlineMs)) {
      setMessage('Invalid deadline. Use format: YYYY-MM-DD HH:mm');
      return;
    }

    if (deadlineMs <= Date.now()) {
      setMessage('Deadline must be in the future.');
      return;
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
        return;
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
      const secretGesture = generateSecretGesture({ userName: resolveActorName(authUser) });

      await setDoc(doc(db, 'bets', base.id), {
        id: base.id,
        ownerId: authUser.uid,
        ownerName: resolveActorName(authUser),
        actorId: authUser.uid,
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
        secretGesture,
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
      setMessage('Bet posted with AI synthesis.');
    } catch (error) {
      setMessage(error?.message || 'Failed to create bet.');
    }
  };

  const placePrediction = async (betId, side) => {
    if (!authUser?.uid) {
      setMessage('Please log in first.');
      return;
    }

    const targetBet = bets.find((b) => b.id === betId);
    if (targetBet?.ownerId === authUser.uid) {
      setMessage('You cannot predict on your own bet.');
      return;
    }

    const amount = Number(betAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage('Enter a valid prediction amount.');
      return;
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
    } catch (error) {
      setMessage(error?.message || 'Failed to place prediction.');
    }
  };

  const handlePredictionTap = (betId, side) => {
    setCoinBurstByBet((prev) => ({ ...prev, [betId]: side }));
    setTimeout(() => {
      setCoinBurstByBet((prev) => {
        const next = { ...prev };
        delete next[betId];
        return next;
      });
    }, 650);
    placePrediction(betId, side);
  };

  const submitProof = async (betId) => {
    if (!selfId) {
      return;
    }

    const note = proof[betId] || '';
    const imageUri = proofImageByBet[betId] || '';
    const videoUri = proofVideoByBet[betId] || '';
    const target = bets.find((b) => b.id === betId);

    if (!target || target.status !== 'OPEN') {
      return;
    }

    if (target.ownerId !== selfId) {
      setMessage('Only the bet owner can submit proof.');
      return;
    }

    if (!imageUri) {
      setMessage('Proof image is required before AI submission.');
      return;
    }

    if (!videoUri) {
      setMessage('3-second liveness video is required.');
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
        videoUri,
        secretGesture: target.secretGesture,
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
        proofVideoUri: videoUri || '',
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
          <Text style={styles.title}>Bet On Me</Text>
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
          <Text style={styles.title}>Bet On Me</Text>
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
                placeholderTextColor="#62B862"
                style={styles.input}
              />
            )}

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor="#62B862"
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#62B862"
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
          <Text style={styles.title}>Bet On Me</Text>
          <Text style={styles.subtitle}>Futuristic social accountability, powered by your friends.</Text>

          <View style={styles.headerRow}>
            <Text style={styles.meta}>Signed in as: {resolveActorName(authUser)}</Text>
            <Pressable style={styles.smallBtnAlt} onPress={handleLogout}>
              <Text style={styles.smallBtnText}>Logout</Text>
            </Pressable>
          </View>

        {tab === 'Feed' && (
          <View>
            <Text style={styles.feedHeading}>Feed</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Post a Bet</Text>
              <TextInput
                value={betText}
                onChangeText={setBetText}
                placeholder="I will wake up at 5 AM tomorrow"
                placeholderTextColor="#62B862"
                style={styles.input}
              />
              <TextInput
                value={stakeAmount}
                onChangeText={setStakeAmount}
                placeholder="Stake coins on yourself (optional)"
                placeholderTextColor="#62B862"
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
              <View style={styles.tagRow}>
                <Pressable style={styles.tagPill} onPress={() => setBetText('I will wake up at 5 AM tomorrow')}>
                  <Text style={styles.tagPillText}>Wake Up</Text>
                </Pressable>
                <Pressable style={styles.tagPill} onPress={() => setBetText('I will finish my workout before 7 PM')}>
                  <Text style={styles.tagPillText}>Fitness</Text>
                </Pressable>
                <Pressable style={styles.tagPill} onPress={() => setBetText('I will complete 2 hours of focused study')}>
                  <Text style={styles.tagPillText}>Learning</Text>
                </Pressable>
              </View>
              <Pressable style={styles.postFabWide} onPress={createNewBet}>
                <Text style={styles.primaryBtnText}>Post Bet</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Friends Feed</Text>
              <TextInput
                value={betAmount}
                onChangeText={setBetAmount}
                keyboardType="number-pad"
                placeholder="Prediction amount"
                placeholderTextColor="#62B862"
                style={styles.input}
              />

              {friendFeedBets.length === 0 && (
                <View>
                  <Text style={styles.dimText}>No friend bets yet.</Text>
                  <Text style={styles.dimText}>Send or accept friend requests in Social tab.</Text>
                  <Pressable style={styles.smallBtn} onPress={() => setTab('Social')}>
                    <Text style={styles.smallBtnText}>Go To Social</Text>
                  </Pressable>
                </View>
              )}

              {friendFeedBets.map((bet) => {
                const predictions = predictionsByBet[bet.id] || [];
                const disputes = disputesByBet[bet.id] || [];
                const comments = commentsByBet[bet.id] || [];
                const reactions = reactionsByBet[bet.id] || [];
                const myPrediction = predictions.find((p) => p.userId === selfId);
                const myDispute = disputes.find((d) => d.userId === selfId);
                const ownerStats = ownerStatsByUser[bet.ownerId] || computeUserHistoryStats(bets, bet.ownerId);
                const ownerOdds = Number.isFinite(bet.ownerFollowThroughOdds)
                  ? bet.ownerFollowThroughOdds
                  : predictPassOddsFromHistory(ownerStats);
                const trueOdds = Number.isFinite(bet.trueOdds) ? bet.trueOdds : ownerOdds;
                const disputeOpen =
                  bet.disputeWindowEndsAtMs > 0 && Date.now() <= bet.disputeWindowEndsAtMs;
                const proofDeadlinePassed =
                  bet.proofDeadlineAtMs > 0 && Date.now() > bet.proofDeadlineAtMs;
                return (
                  <View key={bet.id} style={styles.betCard}>
                    <View style={styles.betHeaderRow}>
                      <View style={styles.ownerBadge}>
                        <Text style={styles.ownerBadgeText}>{getInitials(bet.ownerName)}</Text>
                      </View>
                      <View style={styles.ownerHeaderMeta}>
                        <Text style={styles.meta}>@{bet.ownerName}</Text>
                        <View style={styles.tagPill}>
                          <Text style={styles.tagPillText}>{getBetTag(bet.text)}</Text>
                        </View>
                      </View>
                    </View>

                    <Text style={styles.betTitle}>{bet.text}</Text>
                    <Text style={styles.meta}>Deadline: {bet.deadlineISO}</Text>
                    {!!bet.riskLabel && <Text style={styles.meta}>Risk: {bet.riskLabel}</Text>}
                    {Number.isFinite(bet.ownerStake) && bet.ownerStake > 0 && (
                      <Text style={styles.meta}>
                        Owner stake: {bet.ownerStake} coins x{bet.ownerStakeMultiplier || 1.8}
                      </Text>
                    )}
                    {!!bet.aiBookieComment && (
                      <View style={styles.aiBookieBubble}>
                        <Text style={styles.aiBookieLabel}>AI BOOKIE</Text>
                        <Text style={styles.aiTerminalText}>{bet.aiBookieComment}</Text>
                      </View>
                    )}

                    <View style={styles.meterSection}>
                      <Text style={styles.meterLabel}>Pool Ratio</Text>
                      <View style={styles.poolTrack}>
                        <View
                          style={[
                            styles.poolYesFill,
                            {
                              width: `${Math.max(
                                4,
                                ((bet.poolTotal ? bet.poolYes / bet.poolTotal : 0.5) * 100).toFixed(0)
                              )}%`,
                            },
                          ]}
                        />
                      </View>
                      <View style={styles.poolLabels}>
                        <Text style={styles.poolYesText}>YES {bet.poolYes}</Text>
                        <Text style={styles.poolNoText}>NO {bet.poolNo}</Text>
                      </View>
                    </View>

                    <View style={styles.meterSection}>
                      <Text style={styles.meterLabel}>Confidence Meter</Text>
                      <View style={styles.confidenceTrack}>
                        <View
                          style={[
                            styles.confidenceFill,
                            { width: `${Math.max(4, Math.min(100, trueOdds)).toFixed(0)}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.meta}>
                        {trueOdds.toFixed(0)}% true odds from {ownerStats.resolvedCount} resolved bets
                      </Text>
                    </View>

                    <View style={styles.facepileRow}>
                      <Text style={styles.meta}>Predictors</Text>
                      <View style={styles.facepileWrap}>
                        {predictions.slice(0, 5).map((prediction, index) => (
                          <View
                            key={`${bet.id}_${prediction.id}_fp`}
                            style={[styles.facepileItem, { marginLeft: index === 0 ? 0 : -10 }]}
                          >
                            <Text style={styles.facepileText}>{getInitials(prediction.userName)}</Text>
                          </View>
                        ))}
                        {predictions.length > 5 && (
                          <View style={[styles.facepileItem, { marginLeft: -10 }]}>
                            <Text style={styles.facepileText}>+{predictions.length - 5}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={styles.aiTerminal}>
                      <Text style={styles.aiTerminalTitle}>AI VERDICT SCAN</Text>
                      <Text
                        style={[
                          styles.verdictBadge,
                          bet.aiVerdict === 'PASS' && styles.verdictPass,
                          bet.aiVerdict === 'FAIL' && styles.verdictFail,
                        ]}
                      >
                        {bet.aiVerdict}
                      </Text>
                      {!!bet.aiReason && <Text style={styles.aiTerminalText}>{bet.aiReason}</Text>}
                    </View>
                    {!!bet.proofImageUri && (
                      <Image source={{ uri: bet.proofImageUri }} style={styles.proofImage} />
                    )}
                    {!!bet.victoryPosterUri && (
                      <View style={styles.posterWrap}>
                        <Text style={styles.meta}>Victory poster ({bet.victoryPosterStyle || 'enhanced'}):</Text>
                        <Image source={{ uri: bet.victoryPosterUri }} style={styles.posterImage} />
                        <Pressable style={styles.smallBtn} onPress={() => shareVictoryPoster(bet)}>
                          <Text style={styles.smallBtnText}>Share Victory Poster</Text>
                        </Pressable>
                      </View>
                    )}
                    {!!bet.victoryPosterError && <Text style={styles.dimText}>{bet.victoryPosterError}</Text>}

                    {bet.status === 'OPEN' && !myPrediction && !proofDeadlinePassed && bet.ownerId !== selfId && (
                      <View style={styles.rowGap}>
                        <Pressable style={styles.yesPillBtn} onPress={() => handlePredictionTap(bet.id, 'YES')}>
                          <Text style={styles.smallBtnText}>YES</Text>
                        </Pressable>
                        <Pressable style={styles.noPillBtn} onPress={() => handlePredictionTap(bet.id, 'NO')}>
                          <Text style={styles.smallBtnText}>NO</Text>
                        </Pressable>
                      </View>
                    )}
                    {!!coinBurstByBet[bet.id] && (
                      <View style={styles.coinBurstRow}>
                        <Text style={styles.coinBurst}>🪙</Text>
                        <Text style={styles.coinBurst}>✨</Text>
                        <Text style={styles.coinBurst}>🪙</Text>
                      </View>
                    )}

                    {proofDeadlinePassed && bet.status === 'OPEN' && (
                      <Text style={styles.fail}>Proof deadline passed. This bet is awaiting expiry.</Text>
                    )}

                    {!!myPrediction && (
                      <Text style={styles.meta}>
                        Your prediction: {myPrediction.side} ({myPrediction.amount})
                      </Text>
                    )}

                    {bet.status === 'SETTLED' && myPrediction && disputeOpen && !myDispute && (
                      <Pressable style={styles.smallBtnAlt} onPress={() => raiseDispute(bet.id)}>
                        <Text style={styles.smallBtnText}>Raise Dispute</Text>
                      </Pressable>
                    )}

                    {bet.status === 'OPEN' && bet.ownerId === selfId && (
                      <View style={styles.proofWrap}>
                        <TextInput
                          value={proof[bet.id] || ''}
                          onChangeText={(value) =>
                            setProof((prev) => ({
                              ...prev,
                              [bet.id]: value,
                            }))
                          }
                          placeholder="Proof note (required with photo)"
                          placeholderTextColor="#62B862"
                          style={styles.input}
                        />
                        {!!proofImageByBet[bet.id] && (
                          <Image source={{ uri: proofImageByBet[bet.id] }} style={styles.proofImage} />
                        )}
                        <Pressable style={[styles.primaryBtn, styles.attachBtn]} onPress={() => pickProofImage(bet.id)}>
                          <Text style={styles.primaryBtnText}>Upload Proof Photo</Text>
                        </Pressable>
                        <Text style={styles.meta}>
                          Photo selected: {proofImageByBet[bet.id] ? 'Yes' : 'No'}
                        </Text>
                        <Pressable style={[styles.primaryBtn, styles.attachBtn]} onPress={() => pickProofVideo(bet.id)}>
                          <Text style={styles.primaryBtnText}>Upload 3s Liveness Video</Text>
                        </Pressable>
                        <Text style={styles.meta}>Video selected: {proofVideoByBet[bet.id] ? 'Yes' : 'No'}</Text>
                        {!!bet.secretGesture && (
                          <Text style={styles.meta}>Liveness challenge: {bet.secretGesture}</Text>
                        )}
                        <Pressable style={styles.primaryBtn} onPress={() => submitProof(bet.id)}>
                          <Text style={styles.primaryBtnText}>Submit Proof for AI</Text>
                        </Pressable>
                      </View>
                    )}

                    {bet.status === 'OPEN' && bet.ownerId !== selfId && (
                      <Text style={styles.dimText}>Only the bet owner can upload proof.</Text>
                    )}

                    {bet.status === 'SETTLED' && bet.ownerId === selfId && disputes.length > 0 && (
                      <Pressable style={styles.smallBtn} onPress={() => startManualReview(bet.id)}>
                        <Text style={styles.smallBtnText}>Start Manual Review</Text>
                      </Pressable>
                    )}

                    {bet.status === 'UNDER_REVIEW' && bet.ownerId === selfId && (
                      <View style={styles.rowGap}>
                        <Pressable style={styles.smallBtn} onPress={() => resolveManualReview(bet.id, 'PASS')}>
                          <Text style={styles.smallBtnText}>Manual PASS</Text>
                        </Pressable>
                        <Pressable style={styles.smallBtnAlt} onPress={() => resolveManualReview(bet.id, 'FAIL')}>
                          <Text style={styles.smallBtnText}>Manual FAIL</Text>
                        </Pressable>
                      </View>
                    )}

                    <Text style={styles.meta}>Predictions:</Text>
                    {predictions.map((prediction) => (
                      <Text key={`${bet.id}_${prediction.id}`} style={styles.betLine}>
                        {prediction.userName} -> {prediction.side} ({prediction.amount})
                      </Text>
                    ))}
                    {predictions.length === 0 && <Text style={styles.dimText}>No predictions yet.</Text>}

                    <Text style={styles.meta}>Disputes:</Text>
                    {disputes.map((dispute) => (
                      <Text key={`${bet.id}_d_${dispute.id}`} style={styles.betLine}>
                        {dispute.userName} -> {dispute.reason}
                      </Text>
                    ))}
                    {disputes.length === 0 && <Text style={styles.dimText}>No disputes.</Text>}
                    {!!bet.aiDisputeSummary && (
                      <View style={styles.aiTerminal}>
                        <Text style={styles.aiTerminalTitle}>AI DISPUTE SUMMARY ({bet.aiDisputeProvider || 'fallback'})</Text>
                        <Text style={styles.aiTerminalText}>{bet.aiDisputeSummary}</Text>
                      </View>
                    )}

                    <Text style={styles.meta}>Reactions:</Text>
                    <View style={styles.rowGap}>
                      <Pressable style={styles.smallBtn} onPress={() => setReaction(bet.id, '🔥')}>
                        <Text style={styles.smallBtnText}>🔥</Text>
                      </Pressable>
                      <Pressable style={styles.smallBtn} onPress={() => setReaction(bet.id, '👏')}>
                        <Text style={styles.smallBtnText}>👏</Text>
                      </Pressable>
                      <Pressable style={styles.smallBtn} onPress={() => setReaction(bet.id, '💯')}>
                        <Text style={styles.smallBtnText}>💯</Text>
                      </Pressable>
                    </View>
                    {reactions.length > 0 && (
                      <Text style={styles.meta}>
                        {reactions.map((r) => r.emoji).join(' ')} ({reactions.length})
                      </Text>
                    )}

                    <Text style={styles.meta}>Comments:</Text>
                    <TextInput
                      value={commentDraftByBet[bet.id] || ''}
                      onChangeText={(value) =>
                        setCommentDraftByBet((prev) => ({
                          ...prev,
                          [bet.id]: value,
                        }))
                      }
                      placeholder="Add a comment..."
                      placeholderTextColor="#62B862"
                      style={styles.input}
                    />
                    <Pressable style={styles.smallBtn} onPress={() => addComment(bet.id)}>
                      <Text style={styles.smallBtnText}>Post Comment</Text>
                    </Pressable>
                    {comments.map((comment) => (
                      <Text key={`${bet.id}_c_${comment.id}`} style={styles.betLine}>
                        {comment.userName}: {comment.text}
                      </Text>
                    ))}
                    {comments.length === 0 && <Text style={styles.dimText}>No comments yet.</Text>}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {tab === 'My Bets' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>My Bets</Text>
              {myBets.length === 0 && <Text style={styles.dimText}>You have not posted any bets yet.</Text>}
              {myBets.map((bet) => {
                const stats = ownerStatsByUser[bet.ownerId] || computeUserHistoryStats(bets, bet.ownerId);
                const odds = Number.isFinite(bet.ownerFollowThroughOdds)
                  ? bet.ownerFollowThroughOdds
                  : predictPassOddsFromHistory(stats);
                return (
                  <View key={`mine_${bet.id}`} style={styles.promiseCard}>
                    <Text style={styles.promiseText}>{bet.text}</Text>
                    <Text style={styles.meta}>Status: {bet.status}</Text>
                    <Text style={styles.meta}>Odds snapshot: {odds.toFixed(0)}%</Text>
                    <Text style={styles.meta}>Deadline: {bet.deadlineISO}</Text>
                    <Text style={styles.meta}>Pool: {bet.poolTotal} coins</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {tab === 'Social' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Invite</Text>
              <Pressable style={styles.primaryBtn} onPress={shareInvite}>
                <Text style={styles.primaryBtnText}>Share Invite Link</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Add Friend</Text>
              <TextInput
                value={friendEmail}
                onChangeText={setFriendEmail}
                placeholder="Friend email"
                placeholderTextColor="#62B862"
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
              <Pressable style={styles.primaryBtn} onPress={sendFriendRequest}>
                <Text style={styles.primaryBtnText}>Send Request</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Incoming Requests</Text>
              {incomingRequests.length === 0 && <Text style={styles.dimText}>No incoming requests.</Text>}
              {incomingRequests.map((req) => (
                <View key={`req_${req.id}`} style={styles.requestRow}>
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

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Friends</Text>
              {friends.length === 0 && <Text style={styles.dimText}>No friends yet.</Text>}
              {friends.map((friend) => (
                <Text key={`f_${friend.id}`} style={styles.betLine}>
                  {friend.name || friend.email || friend.id}
                </Text>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>AI Recaps</Text>
              {knownUserIds.length === 0 && <Text style={styles.dimText}>No users to recap yet.</Text>}
              {knownUserIds.map((userId) => {
                const name = getDisplayNameForUser(userId);
                const stats = ownerStatsByUser[userId] || computeUserHistoryStats(bets, userId);
                const odds = predictPassOddsFromHistory(stats);
                return (
                  <View key={`recap_${userId}`} style={styles.myBetRow}>
                    <Text style={styles.walletName}>{name}</Text>
                    <Text style={styles.meta}>
                      Odds: {odds.toFixed(0)}% | PASS {stats.passCount} / FAIL {stats.failCount}
                    </Text>
                    <Pressable
                      style={styles.smallBtn}
                      onPress={() => generateRecapForUser(userId)}
                      disabled={!!recapLoadingByUser[userId]}
                    >
                      <Text style={styles.smallBtnText}>
                        {recapLoadingByUser[userId] ? 'Generating...' : 'Generate AI Recap'}
                      </Text>
                    </Pressable>
                    {!!recapByUser[userId] && (
                      <Text style={styles.meta}>
                        {recapByUser[userId]} ({recapProviderByUser[userId] || 'fallback'})
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Notifications</Text>
              {notifications.length === 0 && <Text style={styles.dimText}>No notifications yet.</Text>}
              {notifications.slice(0, 20).map((n) => (
                <View key={`n_${n.id}`} style={styles.myBetRow}>
                  <Text style={styles.walletName}>{n.title || 'Notification'}</Text>
                  <Text style={styles.meta}>{n.body || ''}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {tab === 'Profiles' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>User Profiles</Text>
              {knownUserIds.length === 0 && <Text style={styles.dimText}>No users available yet.</Text>}
              {knownUserIds.map((userId) => {
                const name = getDisplayNameForUser(userId);
                const stats = ownerStatsByUser[userId] || computeUserHistoryStats(bets, userId);
                const odds = predictPassOddsFromHistory(stats);
                const streak = computeStreak(bets, userId);
                const recentBets = bets
                  .filter((b) => b.ownerId === userId)
                  .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
                  .slice(0, 5);
                return (
                  <View key={`profile_${userId}`} style={styles.promiseCard}>
                    <Text style={styles.promiseText}>{name}</Text>
                    <Text style={styles.meta}>Current streak: {streak}</Text>
                    <Text style={styles.meta}>Total bets: {stats.totalBets}</Text>
                    <Text style={styles.meta}>PASS: {stats.passCount} | FAIL: {stats.failCount}</Text>
                    <Text style={styles.meta}>Expired: {stats.expiredCount}</Text>
                    <Text style={styles.meta}>Follow-through odds: {odds.toFixed(0)}%</Text>
                    {streak >= 7 && (
                      <View style={styles.soulboundBadge}>
                        <Text style={styles.soulboundTitle}>Soulbound Badge</Text>
                        <Text style={styles.soulboundText}>7-day streak unlocked: Consistency Phantom</Text>
                      </View>
                    )}
                    <Text style={styles.meta}>
                      {userId === selfId ? 'My Bets:' : 'Recent Bets:'}
                    </Text>
                    {recentBets.length === 0 && <Text style={styles.dimText}>No bets yet.</Text>}
                    {recentBets.map((bet) => (
                      <Text key={`profile_bet_${userId}_${bet.id}`} style={styles.betLine}>
                        {bet.text} ({bet.status})
                      </Text>
                    ))}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {tab === 'Wallet' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Coin Wallet</Text>
            {users.map((u) => (
              <View key={u.id} style={styles.walletRow}>
                <Text style={styles.walletName}>
                  {u.name}
                  {u.isSelf ? ' (You)' : ''}
                </Text>
                <Text style={styles.walletCoins}>{u.coins} coins</Text>
              </View>
            ))}
            <Text style={styles.dimText}>Payout for other users should move to backend settlement.</Text>
          </View>
        )}

        {tab === 'Rewards' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Redeem Rewards</Text>
            <Text style={styles.meta}>Your balance: {self?.coins || 0} coins</Text>
            {rewardCatalog.map((reward) => (
              <View key={reward.id} style={styles.rewardRow}>
                <View>
                  <Text style={styles.rewardLabel}>{reward.label}</Text>
                  <Text style={styles.meta}>{reward.cost} coins</Text>
                </View>
                <Pressable style={styles.smallBtn} onPress={() => redeemReward(reward)}>
                  <Text style={styles.smallBtnText}>Redeem</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

          {!!message && (
            <View style={styles.toast}>
              <Text style={styles.toastText}>{message}</Text>
            </View>
          )}
        </ScrollView>
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
    backgroundColor: '#0A0A0A',
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
  card: {
    backgroundColor: 'rgba(19, 19, 24, 0.65)',
    borderColor: 'rgba(139, 92, 246, 0.28)',
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
    borderBottomColor: '#1F4D1F',
    paddingBottom: 8,
    marginBottom: 8,
  },
  requestRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#1F4D1F',
    paddingBottom: 10,
    marginBottom: 10,
  },
  input: {
    backgroundColor: 'rgba(8, 8, 12, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.35)',
    color: '#F4F4FF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  inputText: {
    color: '#F4F4FF',
  },
  inputPlaceholder: {
    color: '#7A7AA0',
  },
  primaryBtn: {
    backgroundColor: '#2FAE5B',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  attachBtn: {
    marginBottom: 8,
  },
  activeBtn: {
    backgroundColor: '#289A50',
  },
  primaryBtnText: {
    color: '#F8FAFF',
    fontWeight: '700',
  },
  dimText: {
    color: '#8D8DA9',
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
    borderColor: 'rgba(0, 255, 136, 0.28)',
  },
  betCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(14, 15, 20, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.32)',
    shadowColor: '#00FF88',
    shadowOpacity: 0.16,
    shadowRadius: 14,
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
    color: '#F2F4FF',
    fontWeight: '800',
    fontSize: 18,
    marginBottom: 8,
  },
  meta: {
    color: '#A5A7C8',
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
    backgroundColor: '#00C974',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  smallBtnAlt: {
    backgroundColor: '#3A254F',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  smallBtnText: {
    color: '#E8FFE8',
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
  posterWrap: {
    marginBottom: 8,
  },
  posterImage: {
    width: '100%',
    height: 220,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2A6B2A',
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
    borderBottomColor: '#1F4D1F',
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
    borderBottomColor: '#1F4D1F',
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
    borderColor: 'rgba(0, 255, 136, 0.35)',
    backgroundColor: 'rgba(0, 255, 136, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 4,
  },
  tagPillText: {
    color: '#8FFFD0',
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
    backgroundColor: 'rgba(139, 92, 246, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
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
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    overflow: 'hidden',
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
    backgroundColor: 'rgba(7, 12, 9, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.25)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  aiTerminalTitle: {
    color: '#86F7BF',
    letterSpacing: 1,
    fontSize: 11,
    marginBottom: 6,
  },
  aiTerminalText: {
    color: '#A7EFD0',
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
    backgroundColor: 'rgba(0, 255, 136, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.7)',
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
});



