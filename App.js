import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
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

function formatDate(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'N/A';
  return new Date(ms).toLocaleString();
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
    aiVerdict: payload.aiVerdict || 'PENDING',
    aiReason: payload.aiReason || '',
    aiConfidence: Number.isFinite(payload.aiConfidence) ? payload.aiConfidence : null,
    aiProvider: payload.aiProvider || 'unknown',
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
  const [proof, setProof] = useState({});
  const [proofImageByBet, setProofImageByBet] = useState({});
  const [betAmount, setBetAmount] = useState(DEFAULT_BET);
  const [friendEmail, setFriendEmail] = useState('');
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [commentDraftByBet, setCommentDraftByBet] = useState({});
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
      createdAtMs: now,
      createdAt: serverTimestamp(),
    });
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

      await setDoc(doc(db, 'bets', base.id), {
        id: base.id,
        ownerId: authUser.uid,
        ownerName: resolveActorName(authUser),
        actorId: authUser.uid,
        text: base.text,
        deadlineISO: base.deadlineISO,
        status: 'OPEN',
        aiVerdict: 'PENDING',
        reviewStatus: 'NOT_STARTED',
        proofNote: '',
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
      setMessage('Bet posted.');
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
      setMessage('Proof image is required before AI submission.');
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
        betText: target.text,
        deadlineISO: target.deadlineISO,
      });
      const now = Date.now();
      await updateDoc(doc(db, 'bets', betId), {
        status: 'SETTLED',
        aiVerdict: aiResult.verdict,
        aiReason: aiResult.reason,
        aiConfidence: aiResult.confidence,
        aiProvider: aiResult.provider,
        reviewStatus: 'AUTO_RESOLVED',
        proofNote: note,
        proofImageUri: imageUri || '',
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
      if (selfId && self && myPrediction) {
        const winnerSide = aiResult.verdict === 'PASS' ? 'YES' : 'NO';
        const delta = myPrediction.side === winnerSide ? myPrediction.amount : -myPrediction.amount;
        const nextCoins = Math.max(0, self.coins + delta);

        await updateDoc(doc(db, 'users', selfId), {
          coins: nextCoins,
          updatedAt: serverTimestamp(),
        });
      }

      setMessage(`AI verdict: ${aiResult.verdict} (${aiResult.provider}). Bet settled.`);
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

      setMessage('Dispute raised. Waiting for manual review.');
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
                placeholderTextColor="#7284A7"
                style={styles.input}
              />
            )}

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor="#7284A7"
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#7284A7"
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
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Bet On Me</Text>
        <Text style={styles.subtitle}>Place bets on goals. Make accountability social.</Text>

        <View style={styles.headerRow}>
          <Text style={styles.meta}>Signed in as: {resolveActorName(authUser)}</Text>
          <Pressable style={styles.smallBtnAlt} onPress={handleLogout}>
            <Text style={styles.smallBtnText}>Logout</Text>
          </Pressable>
        </View>

        <TopNav current={tab} onChange={setTab} />

        {tab === 'Feed' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Post a Bet</Text>
              <TextInput
                value={betText}
                onChangeText={setBetText}
                placeholder="I will wake up at 5 AM tomorrow"
                placeholderTextColor="#7284A7"
                style={styles.input}
              />
              <TextInput
                value={deadline}
                onChangeText={setDeadline}
                placeholder="Deadline (YYYY-MM-DD HH:mm)"
                placeholderTextColor="#7284A7"
                style={styles.input}
              />
              <Pressable style={styles.primaryBtn} onPress={createNewBet}>
                <Text style={styles.primaryBtnText}>Post Bet</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>My Bets</Text>
              {myBets.length === 0 && <Text style={styles.dimText}>You have not posted any bets yet.</Text>}
              {myBets.map((bet) => (
                <View key={`mine_${bet.id}`} style={styles.myBetRow}>
                  <Text style={styles.walletName}>{bet.text}</Text>
                  <Text style={styles.meta}>{bet.status}</Text>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Friends Feed</Text>
              <TextInput
                value={betAmount}
                onChangeText={setBetAmount}
                keyboardType="number-pad"
                placeholder="Prediction amount"
                placeholderTextColor="#7284A7"
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
                const disputeOpen =
                  bet.disputeWindowEndsAtMs > 0 && Date.now() <= bet.disputeWindowEndsAtMs;
                const proofDeadlinePassed =
                  bet.proofDeadlineAtMs > 0 && Date.now() > bet.proofDeadlineAtMs;
                return (
                  <View key={bet.id} style={styles.promiseCard}>
                    <Text style={styles.promiseText}>{bet.text}</Text>
                    <Text style={styles.meta}>By: {bet.ownerName}</Text>
                    <Text style={styles.meta}>Deadline: {bet.deadlineISO}</Text>
                    <Text style={styles.meta}>Proof deadline: {formatDate(bet.proofDeadlineAtMs)}</Text>
                    <Text style={styles.meta}>
                      Pool: {bet.poolTotal} coins (YES {bet.poolYes} / NO {bet.poolNo})
                    </Text>
                    <Text style={styles.meta}>Predictors: {bet.predictorCount}</Text>
                    <Text style={styles.meta}>Review: {bet.reviewStatus}</Text>
                    {bet.disputeWindowEndsAtMs > 0 && (
                      <Text style={styles.meta}>
                        Dispute window ends: {formatDate(bet.disputeWindowEndsAtMs)}
                      </Text>
                    )}
                    <Text
                      style={[
                        styles.status,
                        bet.aiVerdict === 'PASS' && styles.pass,
                        bet.aiVerdict === 'FAIL' && styles.fail,
                      ]}
                    >
                      Status: {bet.status} | AI: {bet.aiVerdict}
                    </Text>
                    {!!bet.aiReason && <Text style={styles.meta}>AI reason: {bet.aiReason}</Text>}
                    {Number.isFinite(bet.aiConfidence) && (
                      <Text style={styles.meta}>
                        AI confidence: {(bet.aiConfidence * 100).toFixed(0)}% ({bet.aiProvider})
                      </Text>
                    )}
                    {!!bet.proofImageUri && (
                      <Image source={{ uri: bet.proofImageUri }} style={styles.proofImage} />
                    )}

                    {bet.status === 'OPEN' && !myPrediction && !proofDeadlinePassed && bet.ownerId !== selfId && (
                      <View style={styles.rowGap}>
                        <Pressable style={styles.smallBtn} onPress={() => placePrediction(bet.id, 'YES')}>
                          <Text style={styles.smallBtnText}>Predict YES</Text>
                        </Pressable>
                        <Pressable style={styles.smallBtnAlt} onPress={() => placePrediction(bet.id, 'NO')}>
                          <Text style={styles.smallBtnText}>Predict NO</Text>
                        </Pressable>
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
                          placeholderTextColor="#7284A7"
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
                      placeholderTextColor="#7284A7"
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
                placeholderTextColor="#7284A7"
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 16,
    color: '#9DB0D4',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#111C31',
    borderColor: '#1B2B49',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#EAF0FF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  myBetRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#223559',
    paddingBottom: 8,
    marginBottom: 8,
  },
  requestRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#223559',
    paddingBottom: 10,
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#0E1728',
    borderWidth: 1,
    borderColor: '#294067',
    color: '#F2F6FF',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  primaryBtn: {
    backgroundColor: '#2A4FB9',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  attachBtn: {
    marginBottom: 8,
  },
  activeBtn: {
    backgroundColor: '#355CCF',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dimText: {
    color: '#91A3C3',
    marginTop: 8,
  },
  errorText: {
    marginTop: 10,
    color: '#FF9A9A',
    fontWeight: '600',
  },
  promiseCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#0D1628',
    borderWidth: 1,
    borderColor: '#23385E',
  },
  promiseText: {
    color: '#F5F8FF',
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 4,
  },
  meta: {
    color: '#A4B4CF',
    marginBottom: 4,
  },
  status: {
    color: '#D2DCF0',
    fontWeight: '600',
    marginBottom: 8,
  },
  pass: {
    color: '#53D28C',
  },
  fail: {
    color: '#FF7E7E',
  },
  rowGap: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  smallBtn: {
    backgroundColor: '#2B4EC2',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  smallBtnAlt: {
    backgroundColor: '#A04343',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  smallBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  proofWrap: {
    marginTop: 4,
    marginBottom: 8,
  },
  proofImage: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginBottom: 8,
  },
  betLine: {
    color: '#C8D4EB',
    marginTop: 2,
  },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#223559',
    paddingBottom: 8,
  },
  walletName: {
    color: '#E5EDFF',
    fontWeight: '600',
  },
  walletCoins: {
    color: '#87E1A0',
    fontWeight: '700',
  },
  rewardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#223559',
  },
  rewardLabel: {
    color: '#F1F5FF',
    fontWeight: '600',
  },
  toast: {
    marginTop: 8,
    backgroundColor: '#173059',
    borderColor: '#2A4FB9',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  toastText: {
    color: '#D7E6FF',
    fontWeight: '500',
  },
});

