/**
 * Rental Cars Manager – Telegram reminders
 * Runs entirely on Google Apps Script (free, no Google Cloud billing needed).
 * Checks active rentals every 5 minutes and messages you on Telegram when
 * one is due back within 3 hours, plus a one-time overdue alert.
 *
 * SETUP
 * 1. Open https://script.google.com/ → New project. Paste this whole file
 *    in as Code.gs (replace the default content).
 * 2. Project Settings (gear icon, left sidebar) → Script Properties → Add:
 *      TELEGRAM_BOT_TOKEN = <token from @BotFather>
 *      TELEGRAM_CHAT_ID   = <your chat id>
 * 3. Select the "installTrigger" function in the toolbar dropdown → Run.
 *    (First run asks you to authorize the script – approve it.)
 *    This installs a 5-minute time trigger for checkRentals.
 * 4. Done. Apps Script keeps running this in the background for free,
 *    with no card, no Blaze plan, no Cloud Functions involved.
 *
 * To test immediately: select "checkRentals" in the toolbar dropdown → Run.
 */

const FIREBASE_API_KEY = "AIzaSyD_mEgfFs7KBY20rK-rWhSAlzYl3DwPgdk";
const DB_URL = "https://rental-cars-manager-default-rtdb.firebaseio.com";
const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const SOON_WINDOW_MS = 3 * HOUR_MS; // "before 3 hours"

function checkRentals() {
  const props = PropertiesService.getScriptProperties();
  const botToken = props.getProperty("TELEGRAM_BOT_TOKEN");
  const chatId = props.getProperty("TELEGRAM_CHAT_ID");
  if (!botToken || !chatId) {
    throw new Error(
      "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID under Project Settings → Script Properties."
    );
  }

  const idToken = getIdToken();
  const rentals = fetchJson(`${DB_URL}/rentals.json?auth=${idToken}`) || {};
  const cars = fetchJson(`${DB_URL}/cars.json?auth=${idToken}`) || {};
  const now = Date.now();

  Object.keys(rentals).forEach((id) => {
    const rental = rentals[id];
    if (rental.returned) return;

    const end = new Date(rental.startDate).getTime() + Number(rental.days) * DAY_MS;
    const remaining = end - now;
    const car = cars[rental.carId];
    const carLabel = car ? `${car.name} ${car.model || ""}`.trim() : "Unknown car";

    if (remaining > 0 && remaining <= SOON_WINDOW_MS && !rental.notifiedSoon) {
      const hoursLeft = (remaining / HOUR_MS).toFixed(1);
      const msg =
        `🚗 Rental Cars Manager\n` +
        `${carLabel} (${rental.customerName}) is due back in ~${hoursLeft}h.\n` +
        `Return by: ${new Date(end).toUTCString()}`;
      sendTelegram(botToken, chatId, msg);
      patchFirebase(`${DB_URL}/rentals/${id}.json?auth=${idToken}`, { notifiedSoon: true });
    }

    if (remaining < 0 && !rental.notifiedOverdue) {
      const overdueHours = Math.abs(remaining / HOUR_MS).toFixed(1);
      const msg =
        `⚠️ Rental Cars Manager\n` +
        `${carLabel} (${rental.customerName}) is OVERDUE by ~${overdueHours}h.`;
      sendTelegram(botToken, chatId, msg);
      patchFirebase(`${DB_URL}/rentals/${id}.json?auth=${idToken}`, { notifiedOverdue: true });
    }
  });
}

/** Installs (or reinstalls) the 5-minute trigger. Run this once by hand. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === "checkRentals") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("checkRentals").timeBased().everyMinutes(5).create();
}

// ---- Firebase anonymous auth (matches the app's own sign-in method) ----
// Reuses one anonymous account via its refresh token instead of creating a
// new one on every run.
function getIdToken() {
  const props = PropertiesService.getScriptProperties();
  const refreshToken = props.getProperty("FIREBASE_REFRESH_TOKEN");

  if (!refreshToken) {
    const res = UrlFetchApp.fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
      {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({ returnSecureToken: true }),
        muteHttpExceptions: true,
      }
    );
    const body = JSON.parse(res.getContentText());
    if (!body.idToken) throw new Error("Firebase anonymous sign-up failed: " + res.getContentText());
    props.setProperty("FIREBASE_REFRESH_TOKEN", body.refreshToken);
    return body.idToken;
  }

  const res = UrlFetchApp.fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
    {
      method: "post",
      contentType: "application/x-www-form-urlencoded",
      payload: `grant_type=refresh_token&refresh_token=${refreshToken}`,
      muteHttpExceptions: true,
    }
  );
  const body = JSON.parse(res.getContentText());
  if (!body.id_token) {
    // Stored refresh token is no longer valid — drop it and get a fresh account next run.
    props.deleteProperty("FIREBASE_REFRESH_TOKEN");
    throw new Error("Firebase token refresh failed, re-run checkRentals: " + res.getContentText());
  }
  props.setProperty("FIREBASE_REFRESH_TOKEN", body.refresh_token);
  return body.id_token;
}

function fetchJson(url) {
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const text = res.getContentText();
  return text === "null" ? null : JSON.parse(text);
}

function patchFirebase(url, data) {
  UrlFetchApp.fetch(url, {
    method: "patch",
    contentType: "application/json",
    payload: JSON.stringify(data),
    muteHttpExceptions: true,
  });
}

function sendTelegram(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, text }),
    muteHttpExceptions: true,
  });
}
