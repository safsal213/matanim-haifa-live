const CACHE_KEY = "matanimHaifaLiveData";
const { DATA_URL, DEFAULT_SLIDE_SECONDS, REFRESH_MINUTES } = window.APP_CONFIG;

let appData = null;
let currentSlide = 0;
let slideTimer = null;

const slideshow = document.getElementById("slideshow");
const slideCounter = document.getElementById("slideCounter");
const connectionStatus = document.getElementById("connectionStatus");
const lastUpdated = document.getElementById("lastUpdated");

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function imageMarkup(url, alt) {
  if (!url) return "";
  return `<img class="hero-image" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">`;
}

function buildSlides(data) {
  const s = data.settings || {};
  const storeItems = (data.store || []).filter(item => item.active !== false);

  const products = storeItems.length
    ? storeItems.map(item => `
        <div class="product">
          <span>${escapeHtml(item.icon || "•")} ${escapeHtml(item.name)}</span>
          <span class="product-price">₪${escapeHtml(item.price)}</span>
        </div>
      `).join("")
    : `<p class="empty">אין מוצרים פעילים כרגע</p>`;

  return [
    `
  <section class="slide opening-slide active">
    <div class="opening-glow"></div>

    <div class="slide-inner opening-content">
      <div class="opening-badge">🚂 חדר נהגים</div>

      <h1 class="opening-title">
        ${escapeHtml(s.systemName || "מטענים חיפה LIVE")}
      </h1>

      <div class="opening-line"></div>

      <p class="opening-subtitle">
        ${escapeHtml(s.openingTitle || "ברוכים הבאים לחדר הנהגים")}
      </p>

      <div class="opening-icons">
        <span>🏆</span>
        <span>☕</span>
        <span>📸</span>
        <span>😂</span>
      </div>
    </div>
  </section>
`,
    `
      <section class="slide">
        <div class="slide-inner">
          <div class="kicker">🏆 נהג החודש</div>
          <div class="card">
            ${imageMarkup(s.driverImage, "נהג החודש")}
            <h2 class="accent">${escapeHtml(s.driverName || "בקרוב יפורסם")}</h2>
            <p>${escapeHtml(s.driverReason || "")}</p>
          </div>
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-inner">
          <div class="kicker">☕ המרכולית של חדר הנהגים</div>
          <h2>מחירון</h2>
          <div class="products">${products}</div>
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-inner">
          <div class="kicker">🎂 ימי הולדת</div>
          <h2 class="accent">מזל טוב!</h2>
          <p>${escapeHtml(s.birthdays || "אין חוגגים חדשים כרגע")}</p>
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-inner">
          <div class="kicker">📸 תמונת השבוע</div>
          ${imageMarkup(s.weekImage, "תמונת השבוע")}
          <p>${escapeHtml(s.weekImageCaption || "תמונה מהשטח")}</p>
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-inner">
          <div class="kicker">😂 פינת החיוך</div>
          <h2 class="accent">משפט השבוע</h2>
          <p>${escapeHtml(s.smileCorner || "")}</p>
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-inner">
          <div class="kicker">📢 הודעות החדר</div>
          <h2>שימו לב</h2>
          <p>${escapeHtml(s.announcement || "אין הודעות חדשות כרגע")}</p>
        </div>
      </section>
    `,
    `
      <section class="slide">
        <div class="slide-inner">
          <div class="kicker">🚂 מטענים חיפה</div>
          <h1 class="accent">משמרת טובה!</h1>
          <p>${escapeHtml(s.closingText || "שתהיה נסיעה בטוחה לכולם")}</p>
        </div>
      </section>
    `
  ];
}

function render(data) {
  appData = data;
  currentSlide = 0;

  slideshow.innerHTML = buildSlides(data).join("");
  updateCounter();
  updateLastUpdated(data.updatedAt);
  restartSlideTimer();
}

function updateCounter() {
  const slides = document.querySelectorAll(".slide");
  slideCounter.textContent = `${currentSlide + 1}/${slides.length}`;
}

function showNextSlide() {
  const slides = document.querySelectorAll(".slide");
  if (!slides.length) return;

  slides[currentSlide].classList.remove("active");
  currentSlide = (currentSlide + 1) % slides.length;
  slides[currentSlide].classList.add("active");
  updateCounter();
}

function restartSlideTimer() {
  if (slideTimer) clearInterval(slideTimer);

  const seconds = Number(appData?.settings?.slideSeconds) || DEFAULT_SLIDE_SECONDS;
  const safeSeconds = Math.max(3, seconds);
  slideTimer = setInterval(showNextSlide, safeSeconds * 1000);
}

function formatUpdatedAt(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function updateLastUpdated(value) {
  lastUpdated.textContent = `עודכן לאחרונה: ${formatUpdatedAt(value)}`;
}

function setConnectionState(isOnline, usingSavedData = false) {
  if (isOnline) {
    connectionStatus.textContent = "🟢 מחובר";
  } else if (usingSavedData) {
    connectionStatus.textContent = "🔴 לא מחובר | מציג מידע שמור";
  } else {
    connectionStatus.textContent = "🔴 לא מחובר";
  }
}

function saveLocal(data) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function loadBundledSample() {
  const response = await fetch("data.example.json", { cache: "no-store" });
  if (!response.ok) throw new Error("לא ניתן לטעון נתוני דוגמה");
  return response.json();
}

async function fetchRemoteData() {
  if (!DATA_URL) throw new Error("לא הוגדרה כתובת נתונים");
  const separator = DATA_URL.includes("?") ? "&" : "?";
  const response = await fetch(`${DATA_URL}${separator}t=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`שגיאת שרת: ${response.status}`);
  }

  return response.json();
}

async function refreshData() {
  try {
    const data = DATA_URL ? await fetchRemoteData() : await loadBundledSample();
    saveLocal(data);
    render(data);
    setConnectionState(navigator.onLine, false);
  } catch (error) {
    const cached = loadLocal();
    if (cached) {
      render(cached);
      setConnectionState(false, true);
      console.warn("מציג מידע שמור:", error);
      return;
    }

    slideshow.innerHTML = `
      <section class="slide active">
        <div class="slide-inner">
          <h2>לא ניתן לטעון את המידע</h2>
          <p>בדוק את החיבור או את קובצי המערכת.</p>
        </div>
      </section>
    `;
    setConnectionState(false, false);
  }
}

window.addEventListener("online", () => {
  setConnectionState(true, false);
  refreshData();
});

window.addEventListener("offline", () => {
  setConnectionState(false, Boolean(loadLocal()));
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(console.error);
  });
}

refreshData();
setInterval(refreshData, Math.max(1, REFRESH_MINUTES) * 60 * 1000);
