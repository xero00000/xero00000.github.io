import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  arrayUnion,
  increment,
  deleteField,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;
let currentMatchId = null;
let currentRole = null;
let unsubscribeMatch = null;
let isAlienMode = false;

const lobbyForm = document.querySelector("#lobbyForm");
const leaveMatchButton = document.querySelector("#leaveMatch");
const playerNameInput = document.querySelector("#playerName");
const matchIdInput = document.querySelector("#matchId");
const matchStateBlock = document.querySelector("#matchState");
const roleLabel = document.querySelector("#roleLabel");
const modeLabel = document.querySelector("#modeLabel");
const playerRoster = document.querySelector("#playerRoster");
const survivorSolved = document.querySelector("#survivorSolved");
const keyFragments = document.querySelector("#keyFragments");
const survivorTools = document.querySelector("#survivorTools");
const killerSolved = document.querySelector("#killerSolved");
const killerTools = document.querySelector("#killerTools");
const killerLocation = document.querySelector("#killerLocation");
const killerTitle = document.querySelector("#killerTitle");
const logList = document.querySelector("#logList");
const solvePuzzleButton = document.querySelector("#solvePuzzle");
const hideActionButton = document.querySelector("#hideAction");
const killerPuzzleButton = document.querySelector("#triggerKillerPuzzle");
const usePassageButton = document.querySelector("#usePassage");
const modeToggle = document.querySelector("#modeToggle");

const firebaseReady = new Promise((resolve, reject) => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      resolve(user);
    } else {
      signInAnonymously(auth).catch((error) => {
        reject(error);
        renderSystemMessage(
          "Authentication failed: " + error.message + ". Ensure Firebase credentials are configured.",
          "error"
        );
      });
    }
  });
});

modeToggle.addEventListener("click", async () => {
  isAlienMode = !isAlienMode;
  const pressed = isAlienMode ? "true" : "false";
  modeToggle.setAttribute("aria-pressed", pressed);
  modeToggle.textContent = isAlienMode ? "Return to Core Scenario" : "Switch to Alien Hunt";
  document.body.classList.toggle("alien-mode", isAlienMode);
  killerTitle.textContent = isAlienMode ? "Alien Arsenal" : "Ripper's Arsenal";
  if (currentMatchId) {
    await updateDoc(doc(db, "matches", currentMatchId), {
      mode: isAlienMode ? "alien" : "core",
      log: arrayUnion({
        actor: "system",
        message: isAlienMode
          ? "The Alien Hunt protocol descends over the estate."
          : "Masque Noire returns to its shadowed human horrors.",
        at: Date.now(),
      }),
    });
  }
  updateModeLabel(isAlienMode ? "Alien Hunt" : "Core Scenario");
});

lobbyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const playerName = playerNameInput.value.trim();
  const matchId = matchIdInput.value.trim();
  if (!playerName || !matchId) {
    return;
  }

  await firebaseReady.catch(() => {});
  if (!currentUser) {
    renderSystemMessage("Unable to authenticate with Firebase. Check configuration.", "error");
    return;
  }

  if (currentMatchId && currentMatchId !== matchId) {
    await leaveMatch();
  }

  currentMatchId = matchId;
  const matchRef = doc(db, "matches", currentMatchId);

  await setDoc(
    matchRef,
    {
      createdAt: serverTimestamp(),
      mode: isAlienMode ? "alien" : "core",
      survivor: { solved: 0, keyFragments: 0, tools: [] },
      killer: { solved: 0, tools: [], location: "Unknown" },
    },
    { merge: true }
  );

  await setDoc(
    matchRef,
    {
      players: {
        [currentUser.uid]: {
          name: playerName,
          joinedAt: serverTimestamp(),
          lastAction: serverTimestamp(),
        },
      },
    },
    { merge: true }
  );

  await updateDoc(matchRef, {
    log: arrayUnion({
      actor: "system",
      message: playerName + " slips into the grand vestibule.",
      at: Date.now(),
    }),
  });

  subscribeToMatch(matchRef);
  updateLobbyState(true);
  renderSystemMessage("You joined match " + matchId + ".", "success");
});

leaveMatchButton.addEventListener("click", async () => {
  await leaveMatch();
});

solvePuzzleButton.addEventListener("click", async () => {
  if (currentRole !== "survivor" || !currentMatchId) return;
  const matchRef = doc(db, "matches", currentMatchId);
  const rewards = [
    { type: "tool", label: "Coded Resistance Map" },
    { type: "tool", label: "Makeshift Lockpick" },
    { type: "weapon", label: "Broken Sabre" },
    { type: "tool", label: "Morphine Syringe" },
    { type: "fragment" },
  ];
  const reward = rewards[Math.floor(Math.random() * rewards.length)];
  const updates = {
    "survivor.solved": increment(1),
    log: arrayUnion({
      actor: "survivor",
      message:
        reward.type === "fragment"
          ? "A survivor assembles a key fragment amidst the dust."
          : "A survivor unearths a " + reward.label + ".",
      at: Date.now(),
    }),
  };
  if (reward.type === "fragment") {
    updates["survivor.keyFragments"] = increment(1);
  } else {
    updates["survivor.tools"] = arrayUnion(reward.label);
  }
  await updateDoc(matchRef, updates);
});

hideActionButton.addEventListener("click", async () => {
  if (currentRole !== "survivor" || !currentMatchId) return;
  const matchRef = doc(db, "matches", currentMatchId);
  hideActionButton.disabled = true;
  hideActionButton.textContent = "Holding Breath…";
  const success = Math.random() > 0.35;
  setTimeout(async () => {
    hideActionButton.disabled = false;
    hideActionButton.textContent = "Hide & Hold Breath";
    const logEntry = {
      actor: "survivor",
      message: success
        ? "The survivor endures the suffocating silence."
        : "Breath escapes—footsteps quicken toward the hiding spot!",
      at: Date.now(),
    };
    const updates = {
      log: arrayUnion(logEntry),
    };
    if (!success) {
      updates["killer.location"] = "Alerted by gasping echoes";
    }
    await updateDoc(matchRef, updates);
  }, 2200);
});

killerPuzzleButton.addEventListener("click", async () => {
  if (currentRole !== "killer" || !currentMatchId) return;
  const matchRef = doc(db, "matches", currentMatchId);
  const results = [
    { tool: "Wire Cutter", detail: "Power cables severed—hallways drown in darkness." },
    { tool: "Poisoned Dagger", detail: "A glinting blade, slick with venom." },
    { tool: "Interrogation Lamp", detail: "Floodlights scorch the ballroom, unmasking cowards." },
  ];
  const outcome = results[Math.floor(Math.random() * results.length)];
  await updateDoc(matchRef, {
    "killer.solved": increment(1),
    "killer.tools": arrayUnion(outcome.tool),
    log: arrayUnion({
      actor: "killer",
      message: outcome.detail,
      at: Date.now(),
    }),
  });
});

usePassageButton.addEventListener("click", async () => {
  if (currentRole !== "killer" || !currentMatchId) return;
  const matchRef = doc(db, "matches", currentMatchId);
  const locations = [
    "Servant's crawlspace behind the chapel",
    "Vine-choked balcony overlooking the ballroom",
    "Hidden archives beneath the library",
    "Collapsed cellar corridor",
  ];
  const nextLocation = locations[Math.floor(Math.random() * locations.length)];
  await updateDoc(matchRef, {
    "killer.location": nextLocation,
    log: arrayUnion({
      actor: "killer",
      message: "The killer ghosts through a passage to the " + nextLocation.toLowerCase() + ".",
      at: Date.now(),
    }),
  });
});

function subscribeToMatch(matchRef) {
  if (unsubscribeMatch) {
    unsubscribeMatch();
  }
  unsubscribeMatch = onSnapshot(matchRef, async (snapshot) => {
    const data = snapshot.data();
    if (!data) return;
    await assignKillerIfMissing(matchRef, data);
    renderMatchState(data);
  });
}

async function assignKillerIfMissing(matchRef, data) {
  const players = data.players || {};
  const playerIds = Object.keys(players);
  if (!playerIds.length) return;
  const currentKiller = data.roles && data.roles.killer;
  if (currentKiller && playerIds.includes(currentKiller)) {
    return;
  }
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(matchRef);
      const match = snap.data();
      if (!match) return;
      const innerPlayers = match.players || {};
      const ids = Object.keys(innerPlayers);
      if (!ids.length) return;
      const existing = match.roles && match.roles.killer;
      if (existing && ids.includes(existing)) {
        return;
      }
      const newKiller = ids[Math.floor(Math.random() * ids.length)];
      const killerName = innerPlayers[newKiller] ? innerPlayers[newKiller].name : "Unknown";
      transaction.update(matchRef, {
        "roles.killer": newKiller,
        log: arrayUnion({
          actor: "system",
          message: killerName + " becomes the night's hunter.",
          at: Date.now(),
        }),
      });
    });
  } catch (error) {
    renderSystemMessage("Failed to assign killer: " + error.message, "error");
  }
}

async function leaveMatch() {
  if (!currentMatchId || !currentUser) return;
  const matchRef = doc(db, "matches", currentMatchId);
  await updateDoc(matchRef, {
    ["players." + currentUser.uid]: deleteField(),
    log: arrayUnion({
      actor: "system",
      message: (playerNameInput.value || "A guest") + " slips out into the rain-soaked night.",
      at: Date.now(),
    }),
  });
  updateLobbyState(false);
  roleLabel.textContent = "—";
  currentRole = null;
  currentMatchId = null;
  if (unsubscribeMatch) {
    unsubscribeMatch();
    unsubscribeMatch = null;
  }
}

function renderMatchState(data) {
  const players = data.players || {};
  const roster = Object.values(players).map((p) => p.name);
  playerRoster.textContent = roster.length ? roster.join(", ") : "No attendees";
  const killerId = data.roles ? data.roles.killer : null;
  currentRole = killerId === (currentUser && currentUser.uid) ? "killer" : "survivor";
  roleLabel.textContent = currentRole ? currentRole.toUpperCase() : "—";
  const modeName = data.mode === "alien" ? "Alien Hunt" : "Core Scenario";
  isAlienMode = data.mode === "alien";
  document.body.classList.toggle("alien-mode", isAlienMode);
  modeToggle.setAttribute("aria-pressed", isAlienMode ? "true" : "false");
  modeToggle.textContent = isAlienMode ? "Return to Core Scenario" : "Switch to Alien Hunt";
  killerTitle.textContent = isAlienMode ? "Alien Arsenal" : "Ripper's Arsenal";
  updateModeLabel(modeName);
  survivorSolved.textContent = data.survivor && typeof data.survivor.solved === "number" ? data.survivor.solved : 0;
  const fragments = data.survivor && typeof data.survivor.keyFragments === "number" ? data.survivor.keyFragments : 0;
  keyFragments.textContent = fragments + " / 4";
  survivorTools.textContent = formatList(data.survivor && data.survivor.tools);
  killerSolved.textContent = data.killer && typeof data.killer.solved === "number" ? data.killer.solved : 0;
  killerTools.textContent = formatList(data.killer && data.killer.tools);
  killerLocation.textContent = data.killer && data.killer.location ? data.killer.location : "Unknown";
  renderLog(data.log || []);
  updateActionButtons();
}

function renderLog(entries) {
  const recent = entries
    .slice()
    .sort((a, b) => (a && a.at ? a.at : 0) - (b && b.at ? b.at : 0))
    .slice(-14);
  logList.innerHTML = "";
  recent.forEach((entry) => {
    const item = document.createElement("li");
    item.textContent = entry.message;
    if (entry.actor === "killer") {
      item.style.borderLeftColor = "rgba(169, 50, 38, 0.8)";
    } else if (entry.actor === "survivor") {
      item.style.borderLeftColor = "rgba(112, 168, 137, 0.7)";
    } else if (entry.actor === "system") {
      item.style.borderLeftColor = isAlienMode
        ? "rgba(91, 198, 255, 0.7)"
        : "rgba(184, 139, 74, 0.7)";
    }
    logList.appendChild(item);
  });
  logList.scrollTop = logList.scrollHeight;
}

function formatList(list) {
  if (!Array.isArray(list) || !list.length) return "—";
  return list.join(", ");
}

function updateActionButtons() {
  const isSurvivor = currentRole === "survivor";
  const isKiller = currentRole === "killer";
  solvePuzzleButton.disabled = !isSurvivor;
  hideActionButton.disabled = !isSurvivor;
  killerPuzzleButton.disabled = !isKiller;
  usePassageButton.disabled = !isKiller;
}

function updateModeLabel(label) {
  modeLabel.textContent = label;
}

function updateLobbyState(connected) {
  matchStateBlock.hidden = !connected;
  leaveMatchButton.disabled = !connected;
  playerNameInput.disabled = connected;
  matchIdInput.disabled = connected;
  if (!connected) {
    solvePuzzleButton.disabled = true;
    hideActionButton.disabled = true;
    killerPuzzleButton.disabled = true;
    usePassageButton.disabled = true;
  }
}

function renderSystemMessage(message, tone) {
  const entry = document.createElement("div");
  entry.className = "system-message " + (tone || "info");
  entry.textContent = message;
  document.body.appendChild(entry);
  setTimeout(() => {
    entry.classList.add("visible");
  }, 30);
  setTimeout(() => {
    entry.classList.remove("visible");
    setTimeout(() => entry.remove(), 350);
  }, 4200);
}

window.addEventListener("beforeunload", () => {
  if (currentMatchId && currentUser) {
    navigator.sendBeacon(
      "/leave?match=" + encodeURIComponent(currentMatchId) + "&player=" + encodeURIComponent(currentUser.uid)
    );
  }
});

