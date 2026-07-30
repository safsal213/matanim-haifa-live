const CACHE_KEY = "matanimHaifaLiveData";
const { DATA_URL, DEFAULT_SLIDE_SECONDS, REFRESH_MINUTES } = window.APP_CONFIG;

let appData = null;
let currentSlide = 0;
let slideTimer = null;
let countdownTimer = null;
let slideDurationSeconds = DEFAULT_SLIDE_SECONDS;
let introFinished = false;
const slideshow = document.getElementById("slideshow");
const slideCounter = document.getElementById("slideCounter");
const slideTimerDisplay = document.getElementById("slideTimerDisplay");
const slideTimerValue = document.getElementById("slideTimerValue");
const connectionStatus = document.getElementById("connectionStatus");
const lastUpdated = document.getElementById("lastUpdated");
const newsTickerTrack = document.getElementById("newsTickerTrack");

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


function normalizeNewsItems(settings = {}) {
  const separateItems = Array.from({ length: 10 }, (_, index) => {
    const key = `news${index + 1}`;
    return String(settings[key] ?? "").trim();
  }).filter(Boolean);

  if (separateItems.length) {
    return separateItems;
  }

  // תאימות לאחור: עדיין אפשר להשתמש בשדה news אחד עם הפרדה באמצעות |
  const rawNews = settings.news ?? settings.newsTicker ?? settings.ticker ?? "";

  if (Array.isArray(rawNews)) {
    return rawNews
      .map(item => String(item).trim())
      .filter(Boolean);
  }

  return String(rawNews)
    .split("|")
    .map(item => item.trim())
    .filter(Boolean);
}

function renderNewsTicker(data) {
  if (!newsTickerTrack) return;

  const items = normalizeNewsItems(data.settings || {});
  const activeItems = items.length
    ? items
    : ["ברוכים הבאים למטענים חיפה LIVE"];

  const groupMarkup = activeItems
    .map(item => `<span class="news-ticker-item" dir="rtl">${escapeHtml(item)}</span>`)
    .join('<span class="news-ticker-separator" aria-hidden="true">◆</span>');

  newsTickerTrack.innerHTML = `
    <div class="news-ticker-group">${groupMarkup}</div>
    <div class="news-ticker-group" aria-hidden="true">${groupMarkup}</div>
  `;

  const totalCharacters = activeItems.join(" ").length;
  const durationSeconds = Math.max(22, Math.min(75, totalCharacters * 0.32));
  newsTickerTrack.style.setProperty("--ticker-duration", `${durationSeconds}s`);
}


function parseBirthdayDate(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})[\/.\-](\d{1,2})$/);

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);

  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return { day, month };
}

function getUpcomingBirthdays(items = [], limit = 5) {
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  return items
    .map(item => {
      const parsed = parseBirthdayDate(item.date);

      if (!parsed || !String(item.name || "").trim()) {
        return null;
      }

      let nextDate = new Date(
        todayStart.getFullYear(),
        parsed.month - 1,
        parsed.day
      );

      // מונע קבלה של תאריכים לא חוקיים כמו 31/02
      if (
        nextDate.getDate() !== parsed.day ||
        nextDate.getMonth() !== parsed.month - 1
      ) {
        return null;
      }

      if (nextDate < todayStart) {
        nextDate = new Date(
          todayStart.getFullYear() + 1,
          parsed.month - 1,
          parsed.day
        );
      }

      const daysUntil = Math.round(
        (nextDate.getTime() - todayStart.getTime()) / 86400000
      );

      return {
        name: String(item.name).trim(),
        date: String(item.date).trim(),
        daysUntil
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.daysUntil !== b.daysUntil) {
        return a.daysUntil - b.daysUntil;
      }

      return a.name.localeCompare(b.name, "he");
    })
    .slice(0, limit);
}

function birthdayCountdownText(daysUntil) {
  if (daysUntil === 0) return "היום 🎉";
  if (daysUntil === 1) return "מחר";
  return `בעוד ${daysUntil} ימים`;
}

function renderBirthdaysSlide(data) {
  const upcoming = getUpcomingBirthdays(data.birthdaysList || [], 5);
  const celebratingToday = upcoming.filter(item => item.daysUntil === 0);

  if (celebratingToday.length) {
    const namesMarkup = celebratingToday
      .map(item => `
        <div class="birthday-today-name">
          🎂 ${escapeHtml(item.name)} 🎂
        </div>
      `)
      .join("");

    return `
      <section class="slide birthday-slide birthday-today-slide" data-slide-seconds="15">
        <div class="birthday-celebration-glow"></div>

        <div class="birthday-balloons" aria-hidden="true">
          <span class="birthday-balloon balloon-one">🎈</span>
          <span class="birthday-balloon balloon-two">🎈</span>
          <span class="birthday-balloon balloon-three">🎈</span>
          <span class="birthday-balloon balloon-four">🎈</span>
          <span class="birthday-balloon balloon-five">🎈</span>
          <span class="birthday-balloon balloon-six">🎈</span>
        </div>

        <div class="slide-inner birthday-celebration-content">
          <div class="birthday-celebration-badge">🎉 יום הולדת היום 🎉</div>
          <div class="birthday-cake" aria-hidden="true">🎂</div>

          <h2 class="birthday-celebration-title">מזל טוב!</h2>

          <div class="birthday-today-list">
            ${namesMarkup}
          </div>

          <p class="birthday-celebration-message">
            מאחלים לכם בריאות, שמחה, הצלחה והמון רגעים טובים!
          </p>
        </div>
      </section>
    `;
  }

  if (!upcoming.length) {
    return `
      <section class="slide birthday-slide">
        <div class="slide-inner">
          <div class="kicker">🎂 ימי הולדת</div>
          <h2 class="accent">ימי ההולדת הקרובים</h2>
          <p class="empty">לא נמצאו ימי הולדת ברשימה</p>
        </div>
      </section>
    `;
  }

  const cardsMarkup = upcoming
    .map(item => `
      <div class="birthday-card">
        <div class="birthday-card-icon">🎂</div>
        <div class="birthday-card-details">
          <div class="birthday-card-name">${escapeHtml(item.name)}</div>
          <div class="birthday-card-date">${escapeHtml(item.date)}</div>
        </div>
        <div class="birthday-card-countdown">
          ${escapeHtml(birthdayCountdownText(item.daysUntil))}
        </div>
      </div>
    `)
    .join("");

  return `
    <section class="slide birthday-slide">
      <div class="slide-inner">
        <div class="kicker">🎂 ימי הולדת</div>
        <h2 class="accent">ימי ההולדת הקרובים</h2>
        <div class="birthday-list">
          ${cardsMarkup}
        </div>
      </div>
    </section>
  `;
}


function clearBirthdayEffects() {
  document
    .querySelectorAll(".birthday-confetti")
    .forEach(element => element.remove());
}

function launchBirthdayConfetti() {
  clearBirthdayEffects();

  const shapes = ["square", "circle", "strip"];

  for (let i = 0; i < 110; i++) {
    const element = document.createElement("div");
    element.className = `birthday-confetti birthday-confetti-${shapes[i % shapes.length]}`;
    element.style.left = `${Math.random() * 100}vw`;
    element.style.setProperty("--confetti-delay", `${Math.random() * 1.8}s`);
    element.style.setProperty("--confetti-duration", `${4.8 + Math.random() * 3.2}s`);
    element.style.setProperty("--confetti-drift", `${-120 + Math.random() * 240}px`);
    element.style.setProperty("--confetti-spin", `${540 + Math.random() * 720}deg`);
    document.body.appendChild(element);
  }

  setTimeout(clearBirthdayEffects, 9000);
}

function activateSlideEffects(slide) {
  if (slide?.classList.contains("birthday-today-slide")) {
    launchBirthdayConfetti();
  } else {
    clearBirthdayEffects();
  }
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
      <section class="slide driver-slide">
        <div class="driver-background-shape"></div>

        <div class="driver-month-shell">
          <div class="driver-heading">
            <span>🏆</span>
            <span>נהג החודש</span>
          </div>

          <div class="driver-card">
            <div class="driver-photo-wrap">
              ${
                s.driverImage
                  ? `<img
                       class="driver-photo"
                       src="${escapeHtml(s.driverImage)}"
                       alt="נהג החודש"
                     >`
                  : `<div class="driver-photo-placeholder">🚂</div>`
              }

              <div class="driver-medal">★</div>
              <div class="driver-photo-shine"></div>
            </div>

            <div class="driver-info">
              <div class="driver-label">נבחר החודש</div>

              <h2 class="driver-name">
                ${escapeHtml(s.driverName || "בקרוב יפורסם")}
              </h2>

              <div class="driver-stars" aria-label="חמישה כוכבים">
                <span>★</span>
                <span>★</span>
                <span>★</span>
                <span>★</span>
                <span>★</span>
              </div>

              <div class="driver-divider"></div>

              <p class="driver-reason">
                ${escapeHtml(
                  s.driverReason ||
                  "על מקצועיות, עזרה הדדית ואווירה טובה"
                )}
              </p>
            </div>
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
    renderBirthdaysSlide(data),
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
  renderNewsTicker(data);
  updateCounter();
  updateLastUpdated(data.updatedAt);
  if (introFinished) {
    restartSlideTimer();
  }
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
  activateSlideEffects(slides[currentSlide]);
  updateCounter();
  restartSlideTimer();
}

function updateSlideCountdown(secondsLeft, progress) {
  if (slideTimerValue) {
    slideTimerValue.textContent = Math.max(0, Math.ceil(secondsLeft));
  }

  if (slideTimerDisplay) {
    const safeProgress = Math.max(0, Math.min(1, progress));
    slideTimerDisplay.style.setProperty("--timer-progress", `${safeProgress * 360}deg`);
  }
}

function startSlideCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);

  const startedAt = Date.now();
  const durationMs = slideDurationSeconds * 1000;
  updateSlideCountdown(slideDurationSeconds, 1);

  countdownTimer = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const remainingMs = Math.max(0, durationMs - elapsed);
    const secondsLeft = remainingMs / 1000;
    const progress = remainingMs / durationMs;

    updateSlideCountdown(secondsLeft, progress);

    if (remainingMs <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 100);
}

function restartSlideTimer() {
  if (slideTimer) clearTimeout(slideTimer);
  if (countdownTimer) clearInterval(countdownTimer);

  const activeSlide = document.querySelector(".slide.active");
  const customSeconds = Number(activeSlide?.dataset?.slideSeconds);
  const defaultSeconds =
    Number(appData?.settings?.slideSeconds) || DEFAULT_SLIDE_SECONDS;

  slideDurationSeconds = Math.max(
    3,
    Number.isFinite(customSeconds) && customSeconds > 0
      ? customSeconds
      : defaultSeconds
  );

  startSlideCountdown();
  slideTimer = setTimeout(showNextSlide, slideDurationSeconds * 1000);
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
function updateLiveClock() {
  const clock = document.getElementById("liveClock");
  const dateElement = document.getElementById("liveDate");
  const now = new Date();

  if (clock) {
    clock.textContent = now.toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  if (dateElement) {
    dateElement.textContent = now.toLocaleDateString("he-IL", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }
}

updateLiveClock();
setInterval(updateLiveClock, 1000);
 const introScreen = document.getElementById("introScreen");
const introVideo = document.getElementById("introVideo");

function finishIntro() {
  if (introFinished) return;

  introFinished = true;

  if (introScreen) {
    introScreen.classList.add("hide");

    setTimeout(() => {
      introScreen.style.display = "none";
    }, 800);
  }

  if (appData) {
    restartSlideTimer();
  }
}

if (introVideo) {
  introVideo.addEventListener("ended", finishIntro);
  introVideo.addEventListener("error", finishIntro);

  const playPromise = introVideo.play();

  if (playPromise) {
    playPromise.catch(finishIntro);
  }

  setTimeout(finishIntro, 12000);
} else {
  finishIntro();
}
