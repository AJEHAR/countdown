// AZ=R Countdown: weekly Firebase clean-up (run by GitHub Actions, see .github/workflows/firebase-cleanup.yml)
// Removes rooms not used for ROOM_DAYS days, and share codes that expired more than a day ago or were cancelled.
// Needs two GitHub secrets: FIREBASE_SERVICE_ACCOUNT (the JSON key) and FIREBASE_DATABASE_URL.
// Set DRY_RUN=1 to only list what would be removed.
import admin from 'firebase-admin';

const DAY = 864e5;
const ROOM_DAYS = Number(process.env.ROOM_DAYS || 30);
const DRY = process.env.DRY_RUN === '1';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!sa.project_id || !process.env.FIREBASE_DATABASE_URL) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT or FIREBASE_DATABASE_URL secret.');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: process.env.FIREBASE_DATABASE_URL });
const db = admin.database();
const now = Date.now();
const updates = {};

// Rooms: anything last touched before the cut-off. Rooms with no "updated" value sort first and are included.
const cutoff = now - ROOM_DAYS * DAY;
const roomsSnap = await db.ref('rooms').orderByChild('updated').endAt(cutoff).once('value');
let rooms = 0;
roomsSnap.forEach(s => { updates['rooms/' + s.key] = null; rooms++; });

// Share codes: cancelled, or expired more than a day ago. "No limit" codes (exp = 0) stay until cancelled.
const sharesSnap = await db.ref('shares').once('value');
let shares = 0;
sharesSnap.forEach(s => {
  const v = s.val() || {};
  if (v.revoked || (v.exp && v.exp < now - DAY)) { updates['shares/' + s.key] = null; updates['shareOwners/' + s.key] = null; shares++; }
});

console.log(`Rooms unused for ${ROOM_DAYS}+ days: ${rooms}`);
console.log(`Expired or cancelled share codes: ${shares}`);
if (DRY) { console.log('DRY_RUN=1, nothing removed.'); process.exit(0); }
if (Object.keys(updates).length) await db.ref().update(updates);
console.log('Clean-up finished.');
process.exit(0);
