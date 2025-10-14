const state = {
  cookies: 0,
  floor: 1,
  depthModifier: 1,
  clickDamage: 1,
  autoDamage: 0,
  critChance: 0.05,
  focusActive: false,
  focusCooldown: 0,
  healCooldown: 0,
  autoTimer: 1,
  monsterTimer: 2,
  player: {
    hp: 20,
    maxHp: 20,
    defense: 0,
  },
  currentMonster: null,
  upgrades: [],
  log: [],
};

const MONSTER_TEMPLATES = [
  {
    name: "Crumb Crawler",
    hp: 15,
    attack: 3,
    desc: "A sentient pile of crumbs held together by malice.",
  },
  {
    name: "Glaze Ghoul",
    hp: 22,
    attack: 4,
    desc: "It oozes frosting that burns like acid.",
  },
  {
    name: "Batch Warden",
    hp: 28,
    attack: 5,
    desc: "Guardian of overcooked secrets.",
  },
  {
    name: "Macaron Mimic",
    hp: 32,
    attack: 6,
    desc: "Looks delicious. Bites ferociously.",
  },
  {
    name: "Void Baker",
    hp: 40,
    attack: 7,
    desc: "Cooks horrors beyond mortal palettes.",
  },
];

const UPGRADE_LIBRARY = [
  {
    id: "steel-spatula",
    name: "Tempered Spatula",
    desc: "+1 click damage",
    baseCost: 20,
    type: "clickDamage",
    value: 1,
  },
  {
    id: "oven-imp",
    name: "Oven Imp",
    desc: "+2 auto damage per second",
    baseCost: 45,
    type: "autoDamage",
    value: 2,
  },
  {
    id: "caramel-core",
    name: "Caramel Core",
    desc: "+10 max HP",
    baseCost: 60,
    type: "maxHp",
    value: 10,
  },
  {
    id: "pan-shield",
    name: "Iron Pan Shield",
    desc: "+1 defense",
    baseCost: 80,
    type: "defense",
    value: 1,
  },
  {
    id: "crit-glaze",
    name: "Crystalline Glaze",
    desc: "+3% crit chance",
    baseCost: 75,
    type: "crit",
    value: 0.03,
  },
  {
    id: "mystic-yeast",
    name: "Mystic Yeast",
    desc: "Depth multiplier +0.1",
    baseCost: 120,
    type: "depth",
    value: 0.1,
  },
];

const EVENT_LIBRARY = [
  (state) => ({
    text: "You stumble upon a cache of scorched sugar.",
    options: [
      {
        label: "Harvest",
        outcome: () => {
          const reward = Math.round(12 * state.depthModifier);
          addCookies(reward);
          pushLog(`Harvested ${reward} cookies!`, "positive");
        },
      },
      {
        label: "Leave",
        outcome: () => pushLog("You leave the strange sugar untouched."),
      },
    ],
  }),
  (state) => ({
    text: "A cursed rolling pin offers a pact.",
    options: [
      {
        label: "Accept",
        outcome: () => {
          const hpLoss = Math.min(state.player.hp - 1, 5);
          state.player.hp -= hpLoss;
          const bonus = Math.round(40 * state.depthModifier);
          addCookies(bonus);
          pushLog(
            `The pin drains ${hpLoss} HP but grants ${bonus} cookies!`,
            hpLoss > 0 ? "negative" : "positive"
          );
        },
      },
      {
        label: "Decline",
        outcome: () => pushLog("You decline the cursed bargain."),
      },
    ],
  }),
  () => ({
    text: "You find a relic oven mitt, still warm.",
    options: [
      {
        label: "Equip",
        outcome: () => {
          state.depthModifier += 0.15;
          pushLog("The relic warms your resolve. Depth modifier increased!", "positive");
          updateStats();
        },
      },
    ],
  }),
  (state) => ({
    text: "A whisk wisp whispers forbidden techniques.",
    options: [
      {
        label: "Listen",
        outcome: () => {
          state.clickDamage += 2;
          pushLog("You learn a brutal stir. Click damage increased!", "positive");
          updateStats();
        },
      },
      {
        label: "Silence it",
        outcome: () => {
          pushLog("You silence the wisp, gaining a moment of calm.");
          healPlayer(5);
        },
      },
    ],
  }),
];

const cookieBtn = document.getElementById("cookie");
const cookieCount = document.getElementById("cookie-count");
const floorLabel = document.getElementById("floor");
const depthLabel = document.getElementById("depth-mod");
const hpBar = document.getElementById("hp-bar");
const hpText = document.getElementById("hp-text");
const damageLabel = document.getElementById("damage");
const autoDamageLabel = document.getElementById("auto-damage");
const defenseLabel = document.getElementById("defense");
const critLabel = document.getElementById("crit");
const focusBtn = document.getElementById("ability-focus");
const healBtn = document.getElementById("ability-heal");
const focusCd = document.getElementById("focus-cd");
const healCd = document.getElementById("heal-cd");
const monsterName = document.getElementById("monster-name");
const monsterDesc = document.getElementById("monster-desc");
const monsterBar = document.getElementById("monster-bar");
const monsterHp = document.getElementById("monster-hp");
const advanceBtn = document.getElementById("advance");
const upgradesList = document.getElementById("upgrades");
const eventsPanel = document.getElementById("events");
const exploreBtn = document.getElementById("explore");
const logList = document.getElementById("log");

function randomOf(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pushLog(message, type = "") {
  state.log.push({ message, type, time: Date.now() });
  if (state.log.length > 80) state.log.shift();
  const li = document.createElement("li");
  li.textContent = message;
  if (type) li.classList.add(type);
  logList.prepend(li);
}

function addCookies(amount) {
  state.cookies += amount;
  cookieCount.textContent = Math.floor(state.cookies);
}

function spendCookies(amount) {
  if (state.cookies >= amount) {
    state.cookies -= amount;
    cookieCount.textContent = Math.floor(state.cookies);
    return true;
  }
  return false;
}

function createMonster() {
  const template = randomOf(MONSTER_TEMPLATES);
  const scale = 1 + (state.floor - 1) * 0.2 + state.depthModifier * 0.1;
  const hp = Math.round(template.hp * scale);
  const attack = Math.round(template.attack * (0.8 + state.floor * 0.15));
  state.currentMonster = {
    ...template,
    hp,
    maxHp: hp,
    attack,
  };
  state.monsterTimer = Math.max(1.4, 2.4 - state.floor * 0.08);
  renderMonster();
  pushLog(`A ${template.name} emerges on floor ${state.floor}!`);
}

function renderMonster() {
  const monster = state.currentMonster;
  if (!monster) return;
  monsterName.textContent = monster.name;
  monsterDesc.textContent = monster.desc;
  monsterHp.textContent = `${Math.max(monster.hp, 0)} / ${monster.maxHp}`;
  monsterBar.style.width = `${(monster.hp / monster.maxHp) * 100}%`;
  advanceBtn.disabled = monster.hp > 0;
}

function updateStats() {
  cookieCount.textContent = Math.floor(state.cookies);
  floorLabel.textContent = state.floor;
  depthLabel.textContent = `${state.depthModifier.toFixed(1)}x`;
  hpBar.style.width = `${(state.player.hp / state.player.maxHp) * 100}%`;
  hpText.textContent = `${Math.round(state.player.hp)} / ${state.player.maxHp}`;
  damageLabel.textContent = state.clickDamage;
  autoDamageLabel.textContent = state.autoDamage;
  defenseLabel.textContent = state.player.defense;
  critLabel.textContent = `${Math.round(state.critChance * 100)}%`;
}

function healPlayer(amount) {
  const before = state.player.hp;
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + amount);
  const healed = Math.round(state.player.hp - before);
  if (healed <= 0) {
    pushLog("You already feel fully restored.");
    return;
  }
  updateStats();
  pushLog(`Recovered ${healed} HP.`, "positive");
}

function takeDamage(amount) {
  const mitigated = Math.max(0, amount - state.player.defense);
  if (mitigated <= 0) return;
  state.player.hp -= mitigated;
  pushLog(`You take ${mitigated} damage!`, "negative");
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    updateStats();
    gameOver();
    return;
  }
  updateStats();
}

function gameOver() {
  pushLog("You fall in the dungeon. The oven grows cold...", "negative");
  cookieBtn.disabled = true;
  focusBtn.disabled = true;
  healBtn.disabled = true;
  exploreBtn.disabled = true;
  advanceBtn.disabled = true;
}

function handleClick() {
  if (!state.currentMonster || state.player.hp <= 0) return;
  const crit = Math.random() < state.critChance;
  const focusBoost = state.focusActive ? 2 : 1;
  const damage = Math.round(state.clickDamage * focusBoost * (crit ? 2 : 1));
  state.currentMonster.hp -= damage;
  pushLog(`You strike for ${damage}${crit ? " (crit!)" : ""}.`, crit ? "positive" : "");
  addCookies(Math.round(1 * state.depthModifier));
  if (state.currentMonster.hp <= 0) {
    state.currentMonster.hp = 0;
    const loot = Math.round(10 * state.depthModifier + state.floor * 2);
    addCookies(loot);
    pushLog(`The ${state.currentMonster.name} crumbles, dropping ${loot} cookies!`, "positive");
    advanceBtn.disabled = false;
  }
  renderMonster();
}

function applyAutoDamage(delta) {
  if (!state.currentMonster || state.currentMonster.hp <= 0) return;
  if (state.autoDamage <= 0) return;
  state.autoTimer -= delta;
  if (state.autoTimer > 0) return;
  state.autoTimer = 1;
  const damage = Math.round(state.autoDamage);
  state.currentMonster.hp -= damage;
  if (state.currentMonster.hp <= 0) {
    state.currentMonster.hp = 0;
    const loot = Math.round(10 * state.depthModifier + state.floor * 2);
    addCookies(loot);
    pushLog(
      `Passive damage shatters the ${state.currentMonster.name} for ${loot} cookies!`,
      "positive"
    );
  }
  renderMonster();
}

function monsterTurn(delta) {
  if (!state.currentMonster || state.currentMonster.hp <= 0) return;
  state.monsterTimer -= delta;
  if (state.monsterTimer > 0) return;
  state.monsterTimer = Math.max(0.8, 2.2 - state.floor * 0.05);
  takeDamage(state.currentMonster.attack);
}

function advanceFloor() {
  state.floor += 1;
  state.depthModifier += 0.05;
  state.player.maxHp += 2;
  state.player.hp = Math.min(state.player.hp + 5, state.player.maxHp);
  state.autoTimer = 1;
  state.monsterTimer = Math.max(1.2, 2.2 - state.floor * 0.07);
  pushLog(`You descend to floor ${state.floor}. The air grows thicker.`);
  createMonster();
  updateStats();
}

function populateUpgrades() {
  upgradesList.innerHTML = "";
  UPGRADE_LIBRARY.forEach((upgrade) => {
    const li = document.createElement("li");
    const amountPurchased = state.upgrades.filter((u) => u === upgrade.id).length;
    const cost = Math.round(upgrade.baseCost * Math.pow(1.4, amountPurchased));
    li.innerHTML = `
      <div class="title">${upgrade.name}</div>
      <div class="desc">${upgrade.desc}</div>
      <div class="meta">Cost: ${cost} cookies</div>
    `;
    if (state.cookies >= cost) li.classList.add("affordable");
    const button = document.createElement("button");
    button.textContent = "Purchase";
    button.disabled = state.cookies < cost;
    button.addEventListener("click", () => {
      if (!spendCookies(cost)) return;
      applyUpgrade(upgrade);
      state.upgrades.push(upgrade.id);
      populateUpgrades();
      updateStats();
    });
    li.appendChild(button);
    upgradesList.appendChild(li);
  });
}

function applyUpgrade(upgrade) {
  switch (upgrade.type) {
    case "clickDamage":
      state.clickDamage += upgrade.value;
      break;
    case "autoDamage":
      state.autoDamage += upgrade.value;
      break;
    case "maxHp":
      state.player.maxHp += upgrade.value;
      state.player.hp += upgrade.value;
      break;
    case "defense":
      state.player.defense += upgrade.value;
      break;
    case "crit":
      state.critChance = Math.min(0.75, state.critChance + upgrade.value);
      break;
    case "depth":
      state.depthModifier += upgrade.value;
      break;
  }
  pushLog(`${upgrade.name} acquired!`, "positive");
}

function triggerEvent() {
  const generator = randomOf(EVENT_LIBRARY);
  const event = generator(state);
  eventsPanel.innerHTML = `<p>${event.text}</p>`;
  event.options.forEach((option) => {
    const btn = document.createElement("button");
    btn.textContent = option.label;
    btn.addEventListener("click", () => {
      option.outcome();
      eventsPanel.innerHTML = "<p>The room grows quiet once more.</p>";
      exploreBtn.disabled = false;
      updateStats();
    });
    eventsPanel.appendChild(btn);
  });
  exploreBtn.disabled = true;
}

function updateCooldowns() {
  if (state.focusCooldown > 0) {
    focusCd.textContent = `${state.focusCooldown.toFixed(1)}s`;
    focusBtn.disabled = true;
  } else {
    focusCd.textContent = "Ready";
    focusBtn.disabled = state.player.hp <= 0;
  }

  if (state.healCooldown > 0) {
    healCd.textContent = `${state.healCooldown.toFixed(1)}s`;
    healBtn.disabled = true;
  } else {
    healCd.textContent = "Ready";
    healBtn.disabled = state.player.hp <= 0;
  }
}

function focusStrike() {
  if (state.focusCooldown > 0 || state.player.hp <= 0) return;
  state.focusActive = true;
  state.focusCooldown = 15;
  pushLog("You center your will. Next strikes are empowered!", "positive");
  focusBtn.disabled = true;
  setTimeout(() => {
    state.focusActive = false;
    pushLog("Your focus fades.");
  }, 4000);
}

function healAbility() {
  if (state.healCooldown > 0 || state.player.hp <= 0) return;
  const cost = 25;
  if (!spendCookies(cost)) {
    pushLog("Not enough cookies to feast.", "negative");
    return;
  }
  healPlayer(12);
  state.healCooldown = 20;
  healBtn.disabled = true;
}

function tick(delta) {
  if (state.player.hp <= 0) return;
  applyAutoDamage(delta);
  monsterTurn(delta);
  if (state.focusCooldown > 0) {
    state.focusCooldown = Math.max(0, state.focusCooldown - delta);
  }
  if (state.healCooldown > 0) {
    state.healCooldown = Math.max(0, state.healCooldown - delta);
  }
  updateCooldowns();
}

function setup() {
  state.player.maxHp = 20;
  state.player.hp = 20;
  state.player.defense = 0;
  state.clickDamage = 2;
  state.autoDamage = 0;
  state.depthModifier = 1;
  state.cookies = 0;
  state.critChance = 0.05;
  state.focusCooldown = 0;
  state.healCooldown = 0;
  state.autoTimer = 1;
  state.monsterTimer = 2;
  pushLog("You enter the Cookie Crypt.");
  createMonster();
  populateUpgrades();
  updateStats();
  eventsPanel.innerHTML = "<p>The dungeon awaits your curiosity.</p>";
  updateCooldowns();
}

cookieBtn.addEventListener("click", handleClick);
advanceBtn.addEventListener("click", advanceFloor);
exploreBtn.addEventListener("click", triggerEvent);
focusBtn.addEventListener("click", focusStrike);
healBtn.addEventListener("click", healAbility);

setup();

let lastTime = performance.now();
function gameLoop(now) {
  const delta = (now - lastTime) / 1000;
  lastTime = now;
  tick(delta);
  populateUpgrades();
  renderMonster();
  updateStats();
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);

setInterval(() => {
  if (state.player.hp <= 0) return;
  const regen = state.upgrades.filter((u) => u === "caramel-core").length;
  if (regen > 0 && state.player.hp < state.player.maxHp) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + regen);
    pushLog("A caramel warmth restores you.", "positive");
    updateStats();
  }
}, 15000);
