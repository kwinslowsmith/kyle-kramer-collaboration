/**
 * Quiz Plus — EXPERIMENTAL teach-and-test slideshow over Kramer's own photos.
 *
 * Status: personal experiment, gated to OWNER_EMAIL only. Everyone else on the
 * Lens allowlist gets a friendly "not yet" screen. If the format proves out it
 * ships to all users (then the gate widens and the deck generation moves
 * server-side or into the app).
 *
 * The deck below was authored 2026-07-09 from the markdown takeout
 * (lens-vocab-ko-2026-07-09.md). Each slide's `sceneKo` is the verbatim Korean
 * scene caption of the photo it came from; at load we match those captions
 * against this user's `done` photo docs (scene_langs.ko.text) and paint the
 * real photo on the slide via a cached getDownloadURL — same pattern as
 * app.js's resolveImageUrl. A slide whose caption no longer matches (photo
 * deleted, caption regenerated) simply renders photo-less; the quiz itself
 * never depends on a photo loading.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, query, where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref as storageRef, getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

import { firebaseConfig, IS_CONFIGURED, QUIZ_PLUS_EMAILS } from "./config.js";

const $ = (s) => document.querySelector(s);

// ── Firebase wiring ──────────────────────────────────────────────────────────
if (!IS_CONFIGURED) throw new Error("Firebase not configured — see SETUP.md.");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const provider = new GoogleAuthProvider();
$("#google-signin").addEventListener("click", async () => {
  $("#login-error").textContent = "";
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    if (["auth/popup-blocked", "auth/popup-closed-by-user",
         "auth/operation-not-supported-in-this-environment",
         "auth/cancelled-popup-request"].includes(err.code)) {
      try { await signInWithRedirect(auth, provider); return; } catch (e2) { console.warn(e2); }
    }
    $("#login-error").textContent = `Sign-in failed (${err.code || err.message}). Try again.`;
    console.warn(err);
  }
});
getRedirectResult(auth).catch((err) => console.warn("redirect result:", err));
$("#notyou-signout").addEventListener("click", () => signOut(auth));

function show(view) {
  $("#login-view").hidden = view !== "login";
  $("#notyou-view").hidden = view !== "notyou";
  $("#quiz-view").hidden = view !== "quiz";
}

let started = false;
onAuthStateChanged(auth, (user) => {
  if (!user) { show("login"); return; }
  if (!QUIZ_PLUS_EMAILS.includes((user.email || "").toLowerCase())) {
    $("#notyou-msg").textContent =
      `Quiz Plus is an experimental feature being tested on one account for now ` +
      `(you're signed in as ${user.email}). If it works out, it rolls out to everyone on Lens.`;
    show("notyou");
    return;
  }
  show("quiz");
  if (!started) { started = true; startQuiz(user.uid); }
});

// ── Photo lookup: scene caption -> download URL ──────────────────────────────
// Normalize aggressively: the markdown takeout trims and the captions travel
// through copy/paste, so compare with whitespace collapsed away.
const normScene = (s) => String(s || "").normalize("NFC").replace(/\s+/g, "");

const photoByScene = new Map(); // normScene -> imagePath
const urlCache = new Map();     // imagePath -> Promise<string|null>

async function loadPhotoIndex(uid) {
  try {
    const snap = await getDocs(query(
      collection(db, "users", uid, "photos"), where("status", "==", "done")));
    snap.forEach((doc) => {
      const d = doc.data() || {};
      const ko = d.scene_langs && d.scene_langs.ko && d.scene_langs.ko.text;
      if (ko && d.imagePath) photoByScene.set(normScene(ko), d.imagePath);
    });
    console.log(`Quiz Plus: indexed ${photoByScene.size} photos by Korean caption`);
  } catch (e) {
    console.warn("Quiz Plus: photo index failed — running photo-less", e);
  }
}

function photoUrlFor(sceneKo) {
  const imagePath = photoByScene.get(normScene(sceneKo));
  if (!imagePath) return Promise.resolve(null);
  if (!urlCache.has(imagePath)) {
    urlCache.set(imagePath,
      getDownloadURL(storageRef(storage, imagePath)).catch((e) => {
        console.warn("image url failed", imagePath, e);
        return null;
      }));
  }
  return urlCache.get(imagePath);
}

// ── Korean TTS ───────────────────────────────────────────────────────────────
function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ko-KR";
  u.rate = 0.85;
  const v = speechSynthesis.getVoices().find((v) => v.lang && v.lang.startsWith("ko"));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
if (window.speechSynthesis) speechSynthesis.getVoices();
window.qpSpeak = speak; // for inline onclick in teach-slide HTML

// ── The deck ─────────────────────────────────────────────────────────────────
// Scene captions (sceneKo) are verbatim from the photos' scene_langs.ko.text.
const S = {
  morena:    "큰 창문이 있는 다층 벽돌 건물 1층에 '모레나 미아'라는 가게가 있고, 앞에는 나무가 있어요.",
  cafe:      "친구들이 야외 카페 테이블에 앉아 맥주와 커피를 마시며 이야기를 나누고 있어요.",
  station:   "지붕 아래 디지털 출발 안내판과 시계가 걸려 있는 조용한 기차역 플랫폼입니다.",
  platform:  "맑은 하늘 아래 철도 선로, 빨간 신호등, 그래피티로 덮인 벽이 있는 기차 승강장입니다.",
  dusk:      "두 사람이 황혼 무렵 좁은 돌길을 따라 걸어가고 있습니다.",
  barMatch:  "친구들이 바에서 맥주를 마시며 큰 화면으로 축구 경기를 보고 있어요.",
  selfie:    "수염이 있는 남자가 선글라스와 꽃무늬 셔츠를 입고 자전거 거치대 근처에서 셀피를 찍고 있어요.",
  suv:       "폭설이 내린 후 빨간 SUV가 눈 속에 파묻혀 있어요.",
  robots:    "복싱 링에서 큰 빨간 로봇이 쓰러진 파란 로봇 위에 서 있고, 작은 로봇들이 링 주변에서 지켜보고 있어요.",
  piano:     "교실 벽 앞에 검은색 업라이트 피아노가 있고, 벤치와 회색 백팩이 바닥에 놓여 있습니다.",
  stopsign:  "파란 꽃으로 장식된 프랑스계 캐나다 정지 표지판이 벽에 걸려 있고, 아래에는 트럼펫과 진공청소기가 있습니다.",
  bin:       "잔디 위에 놓인 열린 플라스틱 상자 안에 마이크 두 개와 뒤엉킨 오디오 케이블이 있어요.",
  watch:     "스마트워치와 PS5 컨트롤러가 회색 천 위에 나란히 놓여 있어요.",
  cake:      "치즈케이크 한 조각이 슬레이트 판 위에 생크림, 호두, 잼과 함께 놓여 있어요.",
  studio:    "한 남자가 키보드, 신디사이저, 케이블로 가득 찬 홈 스튜디오에서 작업하고 있습니다.",
  guitar:    "클래식 기타가 파일 캐비닛 옆 벽에 기대어 있어요.",
  warning:   "해변 근처 돌담에 세 가지 언어로 된 낙석 위험 경고 표지판이 붙어 있습니다.",
  noparking: "돌담에 주차 금지 표지판과 '칼레 데 라 펠로타' 이중 언어 거리 표지판이 붙어 있습니다.",
  skyplane:  "도심의 높은 빌딩들 사이로 올려다본 하늘에 작은 비행기 한 대가 보입니다.",
  catLeash:  "주황색 고양이가 목줄을 하고 잔디밭에 서서 철망 울타리와 나무를 바라보고 있어요.",
  boats:     "붉은 조정 보트와 빨간 카약이 잔잔한 강의 나무 부두에 나란히 정박해 있습니다.",
  wrap:      "나무 테이블 위에 후무스와 포크가 있는 접시 위로 고기와 채소가 들어간 랩을 손으로 들고 있어요.",
  cove:      "맑은 하늘 아래 바위 절벽 사이에 작은 모래 해변이 있고, 잔잔한 파란 바다가 수평선까지 펼쳐져 있어요.",
  vending:   "'Santa Klara'라고 적힌 나무 틀의 유제품 자판기가 광장 밖에 서 있습니다.",
  banner:    "벽에 걸린 빨간 현수막에 문어 그림과 함께 '풀포' 75주년(1951–2026)을 기념하고 있습니다.",
  harbor:    "잔잔한 파란 바다 너머로 작은 언덕과 항구가 보이고, 파란 하늘에 흰 구름이 떠 있어요.",
  mural:     "벽에 그려진 화려한 벽화에서 두 손이 꽃이 피어나는 심장을 들고 있어요.",
  airport:   "현대적인 공항 터미널에서 많은 여행객들이 줄을 서서 기다리고 있습니다.",
};

const T = (title, html, unit, sceneKo) => ({ type: "teach", title, html, unit, sceneKo });
const Q = (unit, prompt, context, choices, answer, explain, say, sceneKo) =>
  ({ type: "q", unit, prompt, context, choices, answer, explain, say, sceneKo });

const slides = [

T("", `
  <div class="kicker">Quiz Plus · experimental</div>
  <h1>Your photos, your Korean. Let's see what stuck.</h1>
  <p>Everything in here comes from your own Lens captures: 51 photos, 239 words, from San Sebastián streets to your cats on the windowsill. This time the photos come along for the ride.</p>
  <p>Five short units. Each one teaches, then tests. At the end you get a report card and a hit list of what to review.</p>
  <p class="soft">Tap the 🔊 buttons to hear the Korean out loud. Arrow keys work too.</p>
`),

// ================= UNIT 1: 있어요 =================
T("The workhorse: 있어요", `
  <div class="unitchip">Unit 1 · Existence and location</div>
  <h2>One verb, two jobs</h2>
  <div class="card">
    <span class="pattern">[명사]이/가 있어요</span><br>
    Something exists. 건물 앞에 나무가 있어요. <button class="speak" onclick="qpSpeak('건물 앞에 나무가 있어요')">🔊</button><br>
    <span class="soft">There is a tree in front of the building.</span>
  </div>
  <div class="card">
    <span class="pattern">[장소]에 있어요</span><br>
    Something is located somewhere. 가게가 1층에 있어요. <button class="speak" onclick="qpSpeak('가게가 1층에 있어요')">🔊</button><br>
    <span class="soft">The shop is on the first floor.</span>
  </div>
  <p>Consonant-final noun takes 이, vowel-final takes 가. Negative existence is 없어요.</p>
`, "Unit 1", S.morena),

T("", `
  <div class="unitchip">Unit 1 · Existence and location</div>
  <h2>에 vs 에서: the one that trips everyone</h2>
  <div class="card">
    <span class="pattern">에</span> marks where something sits still.<br>
    시계가 천장에 있어요. <button class="speak" onclick="qpSpeak('시계가 천장에 있어요')">🔊</button>
    <span class="soft">The clock is on the ceiling.</span>
  </div>
  <div class="card">
    <span class="pattern">에서</span> marks where an action happens.<br>
    친구들이 카페에서 이야기해요. <button class="speak" onclick="qpSpeak('친구들이 카페에서 이야기해요')">🔊</button>
    <span class="soft">The friends chat at the café.</span>
  </div>
  <p>Quick test: is the verb 있어요/없어요 (just being there)? Use 에. Is someone doing something there? Use 에서.</p>
`, "Unit 1", S.cafe),

Q("Unit 1",
  "건물 앞에 나무___ 있어요.",
  "The Morena Mia shopfront. Which particle completes it?",
  ["가", "이", "를", "에서"], 0,
  "나무 ends in a vowel, so it takes 가. 나무가 있어요: there is a tree.",
  "건물 앞에 나무가 있어요", S.morena),

Q("Unit 1",
  "친구들이 카페___ 이야기하고 있어요.",
  "The outdoor café. The friends are chatting: an action.",
  ["에", "에서", "이", "까지"], 1,
  "Chatting is an action, so the place takes 에서. 카페에서 이야기하고 있어요.",
  "친구들이 카페에서 이야기하고 있어요", S.cafe),

Q("Unit 1",
  "시계가 천장___ 있어요.",
  "The quiet train station platform. The clock just hangs there.",
  ["에서", "을", "에", "로"], 2,
  "Static location with 있어요 takes 에. 천장에 있어요: it is on the ceiling.",
  "시계가 천장에 있어요", S.station),

Q("Unit 1",
  'Which one means "There are almost no people on the platform"?',
  "Same empty station. Watch for the negative.",
  ["플랫폼에 사람이 거의 없어요.", "플랫폼에 사람이 거의 있어요.", "플랫폼에서 사람이 많아요.", "플랫폼이 사람에 없어요."], 0,
  "없어요 is the negative of 있어요, and 거의 means almost. 사람이 거의 없어요: there are almost no people.",
  "플랫폼에 사람이 거의 없어요", S.station),

Q("Unit 1",
  'How do you say "The shop is on the first floor"?',
  "Ground floor of the brick building.",
  ["가게가 1층에 있어요.", "가게가 1층에서 있어요.", "가게에 1층이 있어요.", "가게는 1층을 있어요."], 0,
  "Location of a thing: [thing]이/가 [place]에 있어요. 가게가 1층에 있어요.",
  "가게가 1층에 있어요", S.morena),

// ================= UNIT 2: -고 있어요 + past =================
T("", `
  <div class="unitchip">Unit 2 · Right now and back then</div>
  <h2>-고 있어요: happening right now</h2>
  <p>Take the verb stem, add 고 있어요. That's it.</p>
  <div class="card">
    마시다 → 마시<span class="ko">고 있어요</span> <button class="speak" onclick="qpSpeak('마시고 있어요')">🔊</button><br>
    걷다 → 걷<span class="ko">고 있어요</span> <button class="speak" onclick="qpSpeak('걷고 있어요')">🔊</button><br>
    보다 → 보<span class="ko">고 있어요</span> <button class="speak" onclick="qpSpeak('보고 있어요')">🔊</button>
  </div>
  <div class="card">
    <span class="pattern">-았어요/었어요</span> puts it in the past.<br>
    차가 눈에 파묻혔어요. <button class="speak" onclick="qpSpeak('차가 눈에 파묻혔어요')">🔊</button>
    <span class="soft">The car got buried in the snow.</span>
  </div>
`, "Unit 2", S.barMatch),

Q("Unit 2",
  "친구들이 맥주를 ___.",
  "The bar during the soccer match. 마시다 (to drink), happening right now.",
  ["마시고 있어요", "마셨어요", "마시어요", "마시고 해요"], 0,
  "Stem 마시 + 고 있어요. 마시고 있어요: they are drinking.",
  "친구들이 맥주를 마시고 있어요", S.barMatch),

Q("Unit 2",
  "두 사람이 좁은 골목길을 ___.",
  "The cobblestone street at dusk. 걷다 (to walk), in progress.",
  ["걷어요", "걷고 있어요", "걸고 있어요", "걷었어요"], 1,
  "The stem keeps its ㄷ before 고: 걷고 있어요. They are walking.",
  "두 사람이 좁은 골목길을 걷고 있어요", S.dusk),

Q("Unit 2",
  "남자가 셀피를 찍고 있어요. What is happening?",
  "The bearded guy in the floral shirt.",
  ["The man is taking a selfie.", "The man took a selfie.", "The man wants a selfie.", "The man should take a selfie."], 0,
  "찍고 있어요 is present progressive: he is taking it right now.",
  "남자가 셀피를 찍고 있어요", S.selfie),

Q("Unit 2",
  "차가 눈에 ___. (The car got buried in the snow.)",
  "The red SUV after the snowstorm. 파묻히다, past tense.",
  ["파묻히고 있어요", "파묻혀요", "파묻혔어요", "파묻히세요"], 2,
  "파묻히 + 었어요 → 파묻혔어요. Past tense, done and dusted.",
  "차가 눈에 파묻혔어요", S.suv),

Q("Unit 2",
  "파란 로봇이 링 위에서 ___. (The blue robot fell down.)",
  "The robot boxing match. 쓰러지다 (to fall down), past.",
  ["쓰러지고 있어요", "쓰러졌어요", "쓰러져야 해요", "쓰러지어요"], 1,
  "쓰러지 + 었어요 contracts to 쓰러졌어요. It fell.",
  "파란 로봇이 링 위에서 쓰러졌어요", S.robots),

// ================= UNIT 3: spatial =================
T("", `
  <div class="unitchip">Unit 3 · Where exactly?</div>
  <h2>The position words</h2>
  <p>Noun + position word + 에. Your photos used all five:</p>
  <div class="card">
    <span class="pattern">위에</span> on top · 판 위에 <button class="speak" onclick="qpSpeak('판 위에')">🔊</button><br>
    <span class="pattern">아래에</span> below · 표지판 아래에 <button class="speak" onclick="qpSpeak('표지판 아래에')">🔊</button><br>
    <span class="pattern">앞에</span> in front · 피아노 앞에 <button class="speak" onclick="qpSpeak('피아노 앞에')">🔊</button><br>
    <span class="pattern">옆에</span> next to · 캐비닛 옆에 <button class="speak" onclick="qpSpeak('캐비닛 옆에')">🔊</button><br>
    <span class="pattern">안에</span> inside · 상자 안에 <button class="speak" onclick="qpSpeak('상자 안에')">🔊</button>
  </div>
`, "Unit 3", S.cake),

Q("Unit 3",
  "백팩이 피아노 ___ 놓여 있어요.",
  "The classroom piano. The backpack sits in front of it.",
  ["위에", "앞에", "안에", "아래에"], 1,
  "앞에 means in front of. 피아노 앞에: in front of the piano.",
  "백팩이 피아노 앞에 놓여 있어요", S.piano),

Q("Unit 3",
  "표지판 ___ 트럼펫이 있어요.",
  "The French-Canadian stop sign. The trumpet is below it.",
  ["위에", "옆에", "아래에", "뒤에"], 2,
  "아래에 means below. 표지판 아래에: below the sign.",
  "표지판 아래에 트럼펫이 있어요", S.stopsign),

Q("Unit 3",
  "마이크가 상자 ___ 있어요.",
  "The storage bin on the grass, mics and tangled cables.",
  ["안에", "위에", "앞에", "옆에"], 0,
  "안에 means inside. 상자 안에: inside the box.",
  "마이크가 상자 안에 있어요", S.bin),

Q("Unit 3",
  "컨트롤러가 스마트워치 ___ 있어요.",
  "Smartwatch and PS5 controller, side by side.",
  ["아래에", "안에", "위에", "옆에"], 3,
  "옆에 means next to. Side by side is 옆에.",
  "컨트롤러가 스마트워치 옆에 있어요", S.watch),

Q("Unit 3",
  "치즈케이크가 슬레이트 판 ___ 있어요.",
  "The cheesecake with whipped cream and walnuts.",
  ["위에", "안에", "아래에", "뒤에"], 0,
  "위에 means on top of. 판 위에: on the board.",
  "치즈케이크가 슬레이트 판 위에 있어요", S.cake),

// ================= UNIT 4: verb clinic =================
T("", `
  <div class="unitchip">Unit 4 · Verb clinic</div>
  <h2>Your hit list</h2>
  <p>These are the verbs your Lens quiz history says you're still wrestling with, plus two patterns for must and must-not.</p>
  <div class="card">
    <span class="pattern">걸다</span> hang · <span class="pattern">기대다</span> lean against · <span class="pattern">녹음하다</span> record<br>
    <span class="pattern">들다</span> hold · <span class="pattern">기다리다</span> wait · <span class="pattern">올려다보다</span> look up
  </div>
  <div class="card">
    <span class="pattern">-아야/어야 해요</span> have to · 조심해야 해요 <button class="speak" onclick="qpSpeak('조심해야 해요')">🔊</button><br>
    <span class="pattern">-(으)면 안 돼요</span> not allowed · 주차하면 안 돼요 <button class="speak" onclick="qpSpeak('주차하면 안 돼요')">🔊</button>
  </div>
`, "Unit 4", S.guitar),

Q("Unit 4",
  "What does 걸다 mean?",
  "You quizzed this one at 0% in Lens. Time to nail it.",
  ["to hang", "to walk", "to lean", "to hold"], 0,
  "걸다 is to hang. 벽에 그림을 걸었어요: I hung a picture on the wall. Careful: 걷다 (walk) looks similar.",
  "벽에 그림을 걸었어요", S.stopsign),

Q("Unit 4",
  "벽에 그림을 ___. (I hung a picture on the wall.)",
  "걸다, past tense. Watch the ㄹ.",
  ["걸었어요", "걷었어요", "걸고 있어요", "걸어야 해요"], 0,
  "걸 + 었어요 → 걸었어요. Past tense of 걸다.",
  "벽에 그림을 걸었어요", S.stopsign),

Q("Unit 4",
  "스튜디오에서 노래를 ___. (He is recording a song.)",
  "The home studio, full of synths and cables. 녹음하다, in progress.",
  ["녹음했어요", "녹음해야 해요", "녹음하고 있어요", "녹음하면 안 돼요"], 2,
  "녹음하 + 고 있어요: recording right now. Another one from your 0% list.",
  "스튜디오에서 노래를 녹음하고 있어요", S.studio),

Q("Unit 4",
  "기타가 벽에 ___ 있어요. (The guitar leans against the wall.)",
  "The classical guitar next to the filing cabinet.",
  ["기대어", "기다려", "걸어", "들어"], 0,
  "기대다 is to lean against. 기대어 있어요: it is leaning. 기다리다 (wait) is the lookalike trap.",
  "기타가 벽에 기대어 있어요", S.guitar),

Q("Unit 4",
  'Which verb means "to wait"?',
  "You used it on both train platform photos and at the airport.",
  ["기대다", "기다리다", "기념하다", "걸다"], 1,
  "기다리다 is to wait. 승강장에서 기차를 기다리고 있어요: waiting for the train on the platform.",
  "승강장에서 기차를 기다리고 있어요", S.platform),

Q("Unit 4",
  "이 해변에서는 조심___ 해요. (You have to be careful at this beach.)",
  "The trilingual falling-rock warning sign.",
  ["하면", "해야", "하고", "해서"], 1,
  "조심해야 해요: obligation. Verb + 아야/어야 해요 means have to.",
  "이 해변에서는 조심해야 해요", S.warning),

Q("Unit 4",
  "여기에 주차하면 ___. (You can't park here.)",
  "The no-parking sign on the stone wall in Calle de la Pelota.",
  ["안 돼요", "있어요", "해야 해요", "없어요"], 0,
  "-(으)면 안 돼요: if you do it, it's not okay. The standard not-allowed pattern.",
  "여기에 주차하면 안 돼요", S.noparking),

Q("Unit 4",
  "하늘을 ___ 비행기가 보였어요. (When I looked up at the sky, I saw a plane.)",
  "Looking straight up between the skyscrapers. 올려다보다.",
  ["올려다보니", "바라보니", "내려다보니", "쳐다보고"], 0,
  "올려다보다 is to look up (올려 = upward). 바라보다 is to gaze at, 내려다보다 is to look down.",
  "하늘을 올려다보니 비행기가 보였어요", S.skyplane),

// ================= UNIT 5: vocab rapid round =================
T("", `
  <div class="unitchip">Unit 5 · Vocab rapid round</div>
  <h2>Twelve words, no mercy</h2>
  <p>Straight recall, both directions. Half of these are words Lens says you missed or haven't been quizzed on yet. The photo on each card is the one you took.</p>
  <p class="soft">Tip: say each answer out loud before you tap.</p>
`, "Unit 5", S.catLeash),

Q("Unit 5", "목줄", "Your cat on the harness walk. You scored 0% on this one.",
  ["leash", "harness", "collar bell", "fence"], 0,
  "목줄: leash (목 neck + 줄 line). 산책할 때는 목줄을 꼭 채워야 해요.", "목줄", S.catLeash),

Q("Unit 5", "부두", "The red rowing shell and kayak. Another 0% word.",
  ["breakwater", "dock / pier", "harbor", "bridge"], 1,
  "부두: dock or pier. 배를 부두에 묶어 두었어요: they tied the boat to the dock. 항구 is the whole harbor.", "부두", S.boats),

Q("Unit 5", "접시", "The wrap-and-hummus lunch. Quizzed twice, still at 0%.",
  ["fork", "tray", "plate", "bowl"], 2,
  "접시: plate. 음식이 하얀 접시에 담겨 나왔어요.", "접시", S.wrap),

Q("Unit 5", 'Which word means "cliff"?', "The sandy cove between the rocks.",
  ["해변", "절벽", "언덕", "돌담"], 1,
  "절벽: cliff. 해변 beach, 언덕 hill, 돌담 stone wall. All four showed up in your coast photos.", "절벽", S.cove),

Q("Unit 5", "승강장", "The train station with the red signal light.",
  ["railway track", "departure board", "platform", "signal light"], 2,
  "승강장: platform. 선로 is the track, 신호등 the signal, 출발 안내판 the departure board.", "승강장", S.platform),

Q("Unit 5", 'Which word means "vending machine"?', "The wooden Santa Klara dairy machine on the plaza.",
  ["자판기", "간판", "자전거", "지판기"], 0,
  "자판기: vending machine. 자판기에서 신선한 우유를 살 수 있어요.", "자판기", S.vending),

Q("Unit 5", "현수막", "The red 75th-anniversary octopus banner.",
  ["mural", "banner", "flag", "street sign"], 1,
  "현수막: banner. 벽화 is a mural, 깃발 a flag, 표지판 a sign.", "현수막", S.banner),

Q("Unit 5", 'Which word means "harbor"?', "The calm sea with the wooded hill.",
  ["부두", "방파제", "항구", "선로"], 2,
  "항구: harbor. 방파제 is the breakwater protecting it, 부두 the dock inside it.", "항구", S.harbor),

Q("Unit 5", "파일 캐비닛", "Leaning-guitar photo. One more from the 0% club.",
  ["bookshelf", "filing cabinet", "drawer", "locker"], 1,
  "파일 캐비닛: filing cabinet, a straight loanword. 서류는 파일 캐비닛 안에 있어요.", "파일 캐비닛", S.guitar),

Q("Unit 5", 'Which word means "snowstorm"?', "The buried red SUV.",
  ["폭설", "눈사람", "폭우", "눈길"], 0,
  "폭설: heavy snowfall or snowstorm. 어제 폭설이 내렸어요. 폭우 is its rainy cousin.", "폭설", S.suv),

Q("Unit 5", "벽화", "The heart with blooming flowers, painted on a wall.",
  ["wall", "graffiti", "mural", "poster"], 2,
  "벽화: mural (벽 wall + 화 painting). 그래피티 is the loanword for graffiti tags.", "벽화", S.mural),

Q("Unit 5", 'Which word means "queue / line"?', "The airport security crowd. Lens says you got this one right before.",
  ["짐", "줄", "표", "문"], 1,
  "줄: line or queue (also a guitar string!). 비행기를 타려면 줄을 서야 해요.", "줄", S.airport),

];

slides.push({ type: "results" });

// ── Quiz engine ──────────────────────────────────────────────────────────────
let idx = 0;
const answered = {};   // slideIndex -> {pick, right}
const box = $("#slidebox");
const fill = $("#progressfill");
const counter = $("#counter");
const nextbtn = $("#nextbtn");
const backbtn = $("#backbtn");
const totalQ = slides.filter((s) => s.type === "q").length;

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

// Paints the slide's photo card once its download URL resolves. The slide may
// have changed by then, so the img carries the slide index and we re-check.
function attachPhoto(slide, slideIndex) {
  if (!slide.sceneKo) return "";
  const id = `photo-${slideIndex}`;
  photoUrlFor(slide.sceneKo).then((url) => {
    const img = document.getElementById(id);
    if (!img) return; // user moved on
    if (!url) { img.remove(); return; }
    img.onload = () => img.classList.remove("loading");
    img.src = url;
  });
  return `<img class="photocard loading" id="${id}" alt="Your Lens photo for this card">`;
}

function render() {
  const s = slides[idx];
  fill.style.width = (idx / slides.length * 100) + "%";
  backbtn.disabled = idx === 0;

  if (s.type === "teach") {
    box.innerHTML = attachPhoto(s, idx) + s.html;
    nextbtn.disabled = false;
    nextbtn.textContent = idx === 0 ? "Let's go" : "Next";
  } else if (s.type === "q") {
    const qn = slides.slice(0, idx + 1).filter((x) => x.type === "q").length;
    const done = answered[idx];
    box.innerHTML = `
      ${attachPhoto(s, idx)}
      <div class="qnum">${s.unit} · Question ${qn} of ${totalQ}</div>
      <div class="question">${esc(s.prompt)} ${s.say ? `<button class="speak" data-say="${esc(s.say)}">🔊</button>` : ""}</div>
      <div class="context">${esc(s.context)}</div>
      <div class="choices">${s.choices.map((c, i) => `
        <button class="choice" data-i="${i}">${esc(c)}</button>`).join("")}
      </div>
      <div class="feedback" id="fb"></div>`;
    box.querySelectorAll(".choice").forEach((btn) => btn.onclick = () => pick(+btn.dataset.i));
    const sp = box.querySelector(".speak");
    if (sp) sp.onclick = () => speak(sp.dataset.say);
    nextbtn.textContent = "Next";
    nextbtn.disabled = !done;
    if (done) paintAnswer(done.pick);
  } else if (s.type === "results") {
    renderResults();
  }
  counter.textContent = (idx + 1) + " / " + slides.length;
}

function pick(i) {
  if (answered[idx]) return;
  const s = slides[idx];
  answered[idx] = { pick: i, right: i === s.answer };
  paintAnswer(i);
  nextbtn.disabled = false;
  if (s.say && i === s.answer) speak(s.say);
}

function paintAnswer(pickIdx) {
  const s = slides[idx];
  box.querySelectorAll(".choice").forEach((btn) => {
    const i = +btn.dataset.i;
    btn.disabled = true;
    if (i === s.answer) btn.classList.add("correct");
    else if (i === pickIdx) btn.classList.add("wrong");
  });
  const fb = document.getElementById("fb");
  const good = pickIdx === s.answer;
  fb.className = "feedback show " + (good ? "good" : "bad");
  fb.innerHTML = (good ? "맞아요! " : "아쉬워요. ") + s.explain;
}

function go(dir) {
  if (dir === 1 && idx === slides.length - 1) return;
  idx = Math.max(0, Math.min(slides.length - 1, idx + dir));
  if (window.speechSynthesis) speechSynthesis.cancel();
  render();
  $("#stage").scrollTop = 0;
}
nextbtn.onclick = () => go(1);
backbtn.onclick = () => go(-1);

function renderResults() {
  const units = {};
  slides.forEach((s, i) => {
    if (s.type !== "q") return;
    units[s.unit] = units[s.unit] || { total: 0, right: 0 };
    units[s.unit].total++;
    if (answered[i] && answered[i].right) units[s.unit].right++;
  });
  const names = {
    "Unit 1": "Existence & location (있어요, 에/에서)",
    "Unit 2": "Progressive & past tense",
    "Unit 3": "Position words",
    "Unit 4": "Verb clinic & obligation",
    "Unit 5": "Vocab rapid round",
  };
  let right = 0, total = 0;
  const rows = Object.keys(units).map((u) => {
    right += units[u].right; total += units[u].total;
    const pct = Math.round(units[u].right / units[u].total * 100);
    return `<tr><td>${names[u] || u}</td><td>${units[u].right}/${units[u].total}</td>
      <td><div class="bar"><div style="width:${pct}%"></div></div></td></tr>`;
  }).join("");

  const missed = [];
  slides.forEach((s, i) => {
    if (s.type === "q" && answered[i] && !answered[i].right)
      missed.push(`<li><span class="ko">${esc(s.prompt)}</span><br><span class="soft">${s.explain}</span></li>`);
  });
  const unansweredCount = slides.filter((s, i) => s.type === "q" && !answered[i]).length;
  const pctAll = total ? Math.round(right / total * 100) : 0;

  let verdict;
  if (pctAll >= 90) verdict = "That plateau is cracking. Time to feed Lens harder photos.";
  else if (pctAll >= 75) verdict = "Solid. The patterns are sticking; the vocab tail needs another pass.";
  else if (pctAll >= 50) verdict = "Good base. Rerun the units below 75% tomorrow, then requiz.";
  else verdict = "No judgment: this is exactly what the review list is for. Start with Unit 1 and rebuild.";

  box.innerHTML = `
    <div class="kicker">Report card</div>
    <h2>수고했어요! ${right} out of ${total}</h2>
    <div class="scorebig">${pctAll}%</div>
    <p>${verdict}</p>
    ${unansweredCount ? `<p class="soft">${unansweredCount} question${unansweredCount > 1 ? "s" : ""} skipped: go back and finish for a full score.</p>` : ""}
    <table class="report">
      <tr><th>Unit</th><th>Score</th><th></th></tr>${rows}
    </table>
    ${missed.length ? `<h2 style="margin-top:1.5rem">Your review list</h2><ul class="misslist">${missed.join("")}</ul>` : "<p>Nothing missed. Clean sweep!</p>"}
    <p style="margin-top:1.5rem"><button class="navbtn" id="againbtn">Take it again</button></p>
  `;
  document.getElementById("againbtn").onclick = () => {
    for (const k in answered) delete answered[k];
    idx = 0;
    render();
  };
  nextbtn.disabled = true;
  nextbtn.textContent = "Done";
  fill.style.width = "100%";
}

document.addEventListener("keydown", (e) => {
  if ($("#quiz-view").hidden) return;
  if (e.key === "ArrowRight" && !nextbtn.disabled) go(1);
  if (e.key === "ArrowLeft" && !backbtn.disabled) go(-1);
  const s = slides[idx];
  if (s && s.type === "q" && !answered[idx] && /^[1-4]$/.test(e.key)) pick(+e.key - 1);
});

async function startQuiz(uid) {
  render();               // show slide 1 immediately
  await loadPhotoIndex(uid);
  render();               // repaint so the current slide picks up its photo
}
