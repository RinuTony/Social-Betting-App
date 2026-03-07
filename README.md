# Social Betting App (Expo + React Native)

A social prediction platform where friends bet virtual coins on whether you'll do what you promised.

## MVP Features Implemented

- Create promises with deadlines.
- Friends place YES/NO bets with virtual coins.
- Pool updates in real time (local in-app state).
- Submit proof for completed promises.
- AI verdict simulation (`Pass`/`Fail`) to avoid self-report loopholes.
- Coin economy:
  - If promise passes: YES bettors win, NO bettors lose.
  - If promise fails: NO bettors win, YES bettors lose.
- Reward marketplace with voucher redemption using coins.

## Run

1. Install dependencies:
   - `npm install`
2. Start Expo:
   - `npm run start`
3. Open on your phone:
   - Install **Expo Go**.
   - Scan the QR code from terminal.

## Notes

- This is a hackathon-friendly MVP with local state and mocked AI judging.
- Next step is replacing the judge with a real Claude API integration and a backend for auth, persistence, and social graph.