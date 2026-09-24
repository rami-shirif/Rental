# Rental Cars Manager — Firebase + Printable Contracts
firebase: hedraf
apps script: hedraf
A small-agency fleet/rental manager upgraded to use **Firebase Realtime Database** instead of browser-only storage.

## Included

- Firebase Realtime Database persistence for `cars` and `rentals`
- Anonymous Firebase Authentication so database rules can require an authenticated session
- Automatic car price on rental creation
- Total rental calculation: **price per day × rental days**
- Active rental countdown / overdue status
- Rental history stored in Firebase
- Printable professional rental contract
- Contract details: customer, CIN/ID, phone, vehicle, plate, rental dates, duration, price and signatures
- Responsive dashboard, fleet, rentals and availability views

## Project structure

```text
rental-cars-manager/
├── src/
│   ├── App.jsx
│   ├── firebase.js
│   ├── main.jsx
│   └── styles.css
├── database.rules.json
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## Firebase setup

The Firebase web configuration supplied for this project is already in `src/firebase.js`.

Before running the app:

1. Open Firebase Console for the `rental-cars-manager` project.
2. Go to **Authentication → Sign-in method**.
3. Enable **Anonymous** sign-in.
4. Go to **Realtime Database → Rules**.
5. Paste the contents of `database.rules.json` and publish.

The rules allow only authenticated users to read/write the app data. The app signs users in anonymously automatically.

### Important

The Firebase web `apiKey` is not a password/secret. However, your database rules are critical. Do **not** use public `".read": true` / `".write": true` rules in production.

## Telegram reminders (background, works even with the app closed, 100% free — no card, no Blaze plan)

A [Google Apps Script](https://script.google.com) (`apps-script/Code.gs`) checks every 5 minutes for rentals due back within 3 hours and messages you on Telegram. It runs entirely on Google's free Apps Script infrastructure — not Firebase Cloud Functions — so there's no billing plan to upgrade and no card to add. It also sends a one-time overdue alert.

### One-time setup

1. **Create a Telegram bot**:
   - In Telegram, open a chat with `@BotFather`
   - Send `/newbot` and follow the prompts (any name/username)
   - BotFather replies with a **bot token** — save it

2. **Get your chat ID**:
   - Search for your new bot in Telegram and send it any message (e.g. "hi")
   - In a browser, open: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
   - Find `"chat":{"id":123456789, ...}` in the JSON response — that number is your **chat ID**

3. **Create the script**:
   - Go to [script.google.com](https://script.google.com) → **New project**
   - Delete the placeholder code, paste in the full contents of `apps-script/Code.gs`
   - Rename the project (e.g. "Rental Reminders") if you like

4. **Add your secrets** (Project Settings → gear icon on the left → Script Properties → Add script property):
   - `TELEGRAM_BOT_TOKEN` → your bot token
   - `TELEGRAM_CHAT_ID` → your chat id

5. **Install the schedule**:
   - In the toolbar function dropdown, select `installTrigger` → click **Run**
   - The first run asks you to authorize the script (it needs permission to make web requests) — approve it
   - This sets up a trigger that runs `checkRentals` every 5 minutes, forever, for free

To test immediately without waiting: select `checkRentals` in the same dropdown → **Run**.

To adjust the reminder window, edit `SOON_WINDOW_MS` near the top of `Code.gs` (and re-save — no redeploy step needed, Apps Script updates live).

## Run locally

Install Node.js, then:

```bash
npm install
npm run dev
```

Open the Vite address shown in the terminal.

## Build for deployment

```bash
npm run build
```

The production files will be generated in `dist/`.

## Data structure

```text
cars/
  car-id/
    id
    name
    model
    plate
    color
    pricePerDay
    status
    createdAt

rentals/
  rental-id/
    id
    carId
    customerName
    cin
    phone
    days
    pricePerDay
    totalPrice
    startDate
    returned
    returnedAt
    createdAt
```

## Printing a contract

Start a rental. The contract window opens automatically.

You can also open the contract from an active rental or rental history using **Contract → Print contract**.

The print stylesheet hides the dashboard and prints only the contract.

## Next recommended upgrades

- Firebase Storage for customer ID/vehicle documents
- Customer database and customer history
- Deposit and payment tracking
- Damage/inspection checklist with photos
- PDF download
- Contract numbering and agency information settings
- Login roles (owner, manager, employee)
- Firestore/Realtime Database audit log
