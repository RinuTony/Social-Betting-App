# Social Betting App (Expo + React Native)

A social prediction platform where friends place virtual-coin bets on whether you'll do what you said you'll do.

## MVP Features Implemented

- Firebase email/password authentication (signup, login, logout).
- Bet ownership tied to authenticated Firebase `uid`.
- Wallet balance tied to authenticated Firebase `uid`.
- Create bets with deadlines.
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
  - Automatic fallback to mock AI when Gemini key/model is not set or request fails
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

## Firestore Collections

- `users/{uid}`
  - `uid`, `name`, `email`, `coins`, `createdAt`, `updatedAt`
- `users/{uid}/friends/{friendId}`
  - `friendId`, `name`, `email`, `createdAt`, `createdAtMs`
- `users/{uid}/incoming_requests/{fromUserId}`
  - `fromUserId`, `fromName`, `fromEmail`, `status`, `createdAt`, `createdAtMs`
- `users/{uid}/notifications/{notificationId}`
  - `type`, `title`, `body`, `betId?`, `createdAt`, `createdAtMs`
- `bets/{betId}`
  - `ownerId`, `ownerName`, `actorId`, `text`, `deadlineISO`, `status`, `aiVerdict`, `aiReason`, `aiConfidence`, `aiProvider`, `reviewStatus`, `proofNote`, `proofImageUri`, `proofDeadlineAtMs`, `proofSubmittedAtMs`, `disputeWindowEndsAtMs`, `poolYes`, `poolNo`, `poolTotal`, `predictorCount`, `createdAtISO`, `createdAtMs`, `updatedAt`
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
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /friends/{friendId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      match /incoming_requests/{requestId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      match /notifications/{notificationId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }

    match /bets/{betId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.ownerId;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.ownerId;

      match /predictions/{predictionUserId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null && request.auth.uid == predictionUserId;
        allow update, delete: if request.auth != null && request.auth.uid == predictionUserId;
      }

      match /disputes/{disputeUserId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null && request.auth.uid == disputeUserId;
        allow update, delete: if request.auth != null && request.auth.uid == disputeUserId;
      }

      match /comments/{commentId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null;
      }

      match /reactions/{reactionUserId} {
        allow read: if request.auth != null;
        allow create, update, delete: if request.auth != null && request.auth.uid == reactionUserId;
      }
    }
  }
}
```

## Notes

- Auth and data persistence are now Firebase-backed (Firestore + Firebase Auth).
- Current Gemini call runs from client for MVP speed. For production, move AI calls to backend/Cloud Functions to protect API keys.
- Final settlement across all users should move to backend/Cloud Functions for secure payouts.
