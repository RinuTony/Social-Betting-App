# Social Betting App (Expo + React Native)

A social prediction platform where friends place virtual-coin bets on whether you'll do what you said you'll do.

## App Store Style Pitch

**Betme** turns self-improvement into a social game.  
Post a commitment, let friends predict whether you will follow through, and prove it with AI-verified evidence.  
Win trust, coins, and streaks when you deliver.

### Why people keep using it
- Instant core loop:
  - Create commitment
  - Friends vote YES/NO
  - Submit proof, settle results, share wins
- AI that adds real value:
  - AI rewrites raw goals into clearer, verifiable commitments
  - AI preview gives risk/odds + bookie-style commentary
  - AI proof judge verifies completion evidence
  - AI recap summarizes personal performance
- Built-in monetization mechanics:
  - Freemium AI credits for advanced AI tools
  - Pro (demo flow) unlocks unlimited AI usage
  - One-time AI credit packs purchasable with in-app coins
- Shareability loops:
  - Share invite links and profile snapshots
  - Referral code rewards for both inviter and invitee
  - Victory poster generation for screenshot-worthy outcomes

## MVP Features Implemented

- Firebase email/password authentication (signup, login, logout).
- Bet ownership tied to authenticated Firebase `uid`.
- Wallet balance tied to authenticated Firebase `uid`.
- Create bets with deadlines.
- Calendar/date-time picker for bet deadlines.
- Multi-user predictions stored in Firestore subcollections.
- Pool updates in real time via Firestore listeners.
- Submit proof for completed bets.
- Social loop MVP:
  - Friends list + friend requests
  - Invite link sharing
  - Comments + emoji reactions on bets
  - In-app notification feed for new bets, friend requests, and verdicts
- AI proof judge:
  - Optional proof image picker (`expo-image-picker`)
  - Gemini-based verdict (`PASS`/`FAIL`) + reason + confidence
  - Gemini-only verification (submission fails if Gemini is unavailable or returns invalid output)
- Generative proof enhancement:
  - Turns proof photo into a shareable "MISSION ACCOMPLISHED" victory poster
  - Uses Gemini image generation with fallback to original proof photo
  - Stores poster on each settled bet for in-feed preview and sharing
- AI behavior insights:
  - History-based odds prediction per user (PASS probability)
  - AI-generated recap text per user in Social tab
- Intelligent social betting (MVP):
  - AI bet synthesis: rewrites raw goals into clearer, verifiable bet wording
  - True odds + risk label from last 10 settled bets
  - AI Bookie opening commentary on every new bet
  - Liveness challenge: secret gesture + 3-second video required for proof
  - AI dispute evidence summary generated when disputes are raised
  - Predictive nudge near deadline for the bet owner
  - Owner staking multiplier on successful completion
- Trust/safety flow:
  - Proof deadline enforcement
  - One proof submission per bet
  - 24-hour dispute window after settlement
  - Manual review fallback (`UNDER_REVIEW` -> manual resolve)
- AI verdict simulation (`Pass`/`Fail`) to avoid self-report loopholes.
- Coin economy:
  - If a bet passes: YES bettors win, NO bettors lose.
  - If a bet fails: NO bettors win, YES bettors lose.
- Reward marketplace with voucher redemption using coins.

## Run

1. Create env file:
   - Copy `.env.example` to `.env`
   - Fill your Firebase web app keys
2. Install dependencies:
   - `npm install`
3. Start Expo:
   - `npm run start`
4. Open on your phone:
   - Install **Expo Go**.
   - Scan the QR code from terminal.

## Firebase Setup

1. Create a Firebase project in Firebase Console.
2. Add a **Web App** in that project.
3. Enable **Authentication -> Sign-in method -> Email/Password**.
4. Enable **Cloud Firestore** (start in production or test mode).
5. Copy the web config values into `.env` using `.env.example`.

Required env vars:
- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_GEMINI_API_KEY` (optional for real Gemini AI)
- `EXPO_PUBLIC_GEMINI_MODEL` (optional, default `gemini-1.5-flash`)
- `EXPO_PUBLIC_GEMINI_IMAGE_MODEL` (optional, image model for poster generation)

## Firestore Collections

- `users/{uid}`
  - `uid`, `name`, `email`, `coins`, `plan`, `aiCredits`, `referralCode`, `referralCount`, `referredBy`, `createdAt`, `updatedAt`
- `users/{uid}/friends/{friendId}`
  - `friendId`, `name`, `email`, `createdAt`, `createdAtMs`
- `users/{uid}/incoming_requests/{fromUserId}`
  - `fromUserId`, `fromName`, `fromEmail`, `status`, `createdAt`, `createdAtMs`
- `users/{uid}/notifications/{notificationId}`
  - `type`, `title`, `body`, `betId?`, `createdAt`, `createdAtMs`
- `bets/{betId}`
  - `ownerId`, `ownerName`, `actorId`, `text`, `deadlineISO`, `status`, `aiVerdict`, `aiReason`, `aiConfidence`, `aiProvider`, `reviewStatus`, `proofNote`, `proofImageUri`, `proofVideoUri`, `secretGesture`, `trueOdds`, `riskLabel`, `aiBookieComment`, `aiDisputeSummary`, `aiDisputeProvider`, `ownerStake`, `ownerStakeMultiplier`, `nudgeSentAtMs`, `victoryPosterUri`, `victoryPosterStyle`, `victoryPosterProvider`, `victoryPosterError`, `proofDeadlineAtMs`, `proofSubmittedAtMs`, `disputeWindowEndsAtMs`, `poolYes`, `poolNo`, `poolTotal`, `predictorCount`, `createdAtISO`, `createdAtMs`, `updatedAt`
- `bets/{betId}/predictions/{uid}`
  - `userId`, `userName`, `side`, `amount`, `createdAt`, `createdAtMs`
- `bets/{betId}/disputes/{uid}`
  - `userId`, `userName`, `reason`, `status`, `createdAt`, `createdAtMs`
- `bets/{betId}/comments/{commentId}`
  - `userId`, `userName`, `text`, `createdAt`, `createdAtMs`
- `bets/{betId}/reactions/{uid}`
  - `userId`, `userName`, `emoji`, `updatedAt`, `updatedAtMs`

## Suggested Firestore Rules

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    match /users/{userId} {
      allow read, write: if signedIn() && request.auth.uid == userId;

      match /friends/{friendId} {
        allow read: if signedIn() && (request.auth.uid == userId || request.auth.uid == friendId);
        allow create, update, delete: if signedIn() && (request.auth.uid == userId || request.auth.uid == friendId);
      }

      match /incoming_requests/{requestId} {
        allow read, delete: if signedIn() && request.auth.uid == userId;
        allow create: if signedIn()
          && request.auth.uid == requestId
          && request.auth.uid != userId
          && request.resource.data.fromUserId == request.auth.uid;
        allow update: if signedIn() && request.auth.uid == userId;
      }

      match /notifications/{notificationId} {
        allow read, delete: if signedIn() && request.auth.uid == userId;
        allow create: if signedIn()
          && request.resource.data.actorId == request.auth.uid;
      }
    }

    match /bets/{betId} {
      allow read: if signedIn();
      allow create: if signedIn() && request.auth.uid == request.resource.data.ownerId;
      allow update, delete: if signedIn() && request.auth.uid == resource.data.ownerId;

      match /predictions/{predictionUserId} {
        allow read: if signedIn();
        allow create: if signedIn() && request.auth.uid == predictionUserId;
        allow update, delete: if signedIn() && request.auth.uid == predictionUserId;
      }

      match /disputes/{disputeUserId} {
        allow read: if signedIn();
        allow create: if signedIn() && request.auth.uid == disputeUserId;
        allow update, delete: if signedIn() && request.auth.uid == disputeUserId;
      }

      match /comments/{commentId} {
        allow read: if signedIn();
        allow create: if signedIn();
      }

      match /reactions/{reactionUserId} {
        allow read: if signedIn();
        allow create, update, delete: if signedIn() && request.auth.uid == reactionUserId;
      }

      match /attestations/{attestationUserId} {
        allow read: if signedIn();
        allow create, update, delete: if signedIn() && request.auth.uid == attestationUserId;
      }
    }
  }
}
```

## Notes

- Auth and data persistence are now Firebase-backed (Firestore + Firebase Auth).
- Current Gemini call runs from client for MVP speed. For production, move AI calls to backend/Cloud Functions to protect API keys.
- Final settlement across all users should move to backend/Cloud Functions for secure payouts.
