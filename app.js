const CACHE_KEY = "matanimHaifaLiveData";
const { DATA_URL, DEFAULT_SLIDE_SECONDS, REFRESH_MINUTES } = window.APP_CONFIG;

let appData = null;
let currentSlide = 0;
let slideTimer = null;
let countdownTimer = null;
let announcementRotationTimer = null;
let slideDurationSeconds = DEFAULT_SLIDE_SECONDS;
let introFinished = false;
let offlineStatusTimer = null;
let consecutiveDataFailures = 0;
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


function isFullMediaUrl(value) {
  return /^(?:https?:\/\/|data:|blob:)/i.test(String(value || "").trim());
}

function resolveMediaPath(value, folder = "images") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  // קישור מלא או כתובת מיוחדת של הדפדפן נשארים ללא שינוי.
  if (isFullMediaUrl(raw)) return raw;

  // נתיב שכבר כולל תיקייה נשאר כפי שהוא, עם הסרת ./ או / מיותרים.
  const cleaned = raw.replace(/^(?:\.\/|\/)+/, "");
  if (cleaned.includes("/")) return cleaned;

  return `${folder.replace(/\/$/, "")}/${cleaned}`;
}

function resolveSmileMediaPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const type = getSmileContentType(raw);
  return resolveMediaPath(raw, type === "video" ? "videos" : "images");
}

function productIconMarkup(iconValue, productName) {
  const value = String(iconValue || "").trim();
  if (!value) return `<span class="product-emoji" aria-hidden="true">•</span>`;
  const looksLikeImage = isFullMediaUrl(value) || /\.(png|jpe?g|webp|gif|svg)(?:[?#].*)?$/i.test(value);
  if (!looksLikeImage) return `<span class="product-emoji" aria-hidden="true">${escapeHtml(value)}</span>`;
  const normalizedProductValue = value.replace(/^products\//i, "images/products/");
  const source = resolveMediaPath(normalizedProductValue, "images/products");
  return `
    <span class="product-image-wrap">
      <img class="product-image" src="${escapeHtml(source)}" alt="${escapeHtml(productName)}" loading="lazy"
        onerror="this.closest('.product-image-wrap').innerHTML='<span class=&quot;product-emoji&quot;>🥤</span>'">
    </span>`;
}

function imageMarkup(url, alt, extraClass = "") {
  const source = resolveMediaPath(url, "images");
  if (!source) return "";
  const className = ["hero-image", extraClass].filter(Boolean).join(" ");
  return `<img class="${escapeHtml(className)}" src="${escapeHtml(source)}" alt="${escapeHtml(alt)}">`;
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

function getIsraelTodayParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = {};

  parts.forEach(part => {
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day"
    ) {
      values[part.type] = Number(part.value);
    }
  });

  return {
    year: values.year,
    month: values.month,
    day: values.day
  };
}

function getUpcomingBirthdays(items = [], limit = 4) {
  const israelToday = getIsraelTodayParts();

  const todayUtc = Date.UTC(
    israelToday.year,
    israelToday.month - 1,
    israelToday.day
  );

  return items
    .map(item => {
      const parsed = parseBirthdayDate(item.date);

      if (!parsed || !String(item.name || "").trim()) {
        return null;
      }

      let birthdayYear = israelToday.year;
      let birthdayUtc = Date.UTC(
        birthdayYear,
        parsed.month - 1,
        parsed.day
      );

      const birthdayDate = new Date(birthdayUtc);

      // מונע תאריכים לא חוקיים כמו 31/02.
      if (
        birthdayDate.getUTCDate() !== parsed.day ||
        birthdayDate.getUTCMonth() !== parsed.month - 1
      ) {
        return null;
      }

      if (birthdayUtc < todayUtc) {
        birthdayYear += 1;
        birthdayUtc = Date.UTC(
          birthdayYear,
          parsed.month - 1,
          parsed.day
        );
      }

      const daysUntil = Math.round(
        (birthdayUtc - todayUtc) / 86400000
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
  // טוען את הרשימה המלאה כדי לא לפספס כמה חוגגים באותו יום.
  // כשאין יום הולדת היום מציגים רק את 4 הקרובים ביותר.
  const allBirthdays = getUpcomingBirthdays(
    data.birthdaysList || [],
    Math.max((data.birthdaysList || []).length, 4)
  );
  const celebratingToday = allBirthdays.filter(
    item => item.daysUntil === 0
  );

  const upcoming = allBirthdays
    .filter(item => item.daysUntil > 0)
    .slice(0, 4);

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

          <h2 class="birthday-celebration-title">${celebratingToday.length > 1 ? "מזל טוב לכולם!" : "מזל טוב!"}</h2>

          <div class="birthday-today-list">
            ${namesMarkup}
          </div>

          <p class="birthday-celebration-message">
            ${celebratingToday.length > 1
              ? "מאחלים לכם בריאות, שמחה, הצלחה והמון רגעים טובים!"
              : "מאחלים לך בריאות, שמחה, הצלחה והמון רגעים טובים!"}
          </p>
        </div>
      </section>
    `;
  }

  if (!upcoming.length) {
    return `
      <section class="slide birthdays-upcoming-slide birthday-slide">
        <div class="slide-inner birthdays-upcoming-inner">
          <div class="kicker">ימי הולדת</div>
          <h2 class="accent">ימי ההולדת הקרובים</h2>
          <p class="empty">לא נמצאו ימי הולדת ברשימה</p>
        </div>
      </section>
    `;
  }

  const birthdayCount = upcoming.length;

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
    <section class="slide birthday-slide birthdays-upcoming-slide birthday-count-${birthdayCount}">
      <div class="slide-inner birthdays-upcoming-inner">
        <div class="birthdays-upcoming-header">
          <div class="kicker">🎂 ימי הולדת</div>
          <h2 class="accent">ימי ההולדת הקרובים</h2>
        </div>

        <div class="birthday-list birthdays-upcoming-grid">
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
  stopAnnouncementRotation();
  setSmileVideoPlayback(slide);
  if (slide?.classList.contains("birthday-today-slide")) {
    launchBirthdayConfetti();
  } else {
    clearBirthdayEffects();
  }
  startAnnouncementRotation(slide);
}



function getAnnouncementTheme(typeValue = "") {
  const normalized = String(typeValue || "").trim().toLowerCase();

  const themes = {
    "בטיחות": { key: "safety", label: "בטיחות", icon: "🦺" },
    "safety": { key: "safety", label: "בטיחות", icon: "🦺" },
    "ניקיון": { key: "cleaning", label: "ניקיון", icon: "🧹" },
    "cleaning": { key: "cleaning", label: "ניקיון", icon: "🧹" },
    "תפעול": { key: "operations", label: "תפעול", icon: "🚂" },
    "operations": { key: "operations", label: "תפעול", icon: "🚂" },
    "עדכון": { key: "update", label: "עדכון", icon: "🔵" },
    "update": { key: "update", label: "עדכון", icon: "🔵" },
    "מידע": { key: "info", label: "מידע", icon: "ℹ️" },
    "info": { key: "info", label: "מידע", icon: "ℹ️" },
    "תזכורת": { key: "reminder", label: "תזכורת", icon: "🔔" },
    "reminder": { key: "reminder", label: "תזכורת", icon: "🔔" },
    "זהירות": { key: "warning", label: "זהירות", icon: "⚠️" },
    "warning": { key: "warning", label: "זהירות", icon: "⚠️" },
    "דחוף": { key: "urgent", label: "דחוף", icon: "🚨" },
    "urgent": { key: "urgent", label: "דחוף", icon: "🚨" }
  };

  return themes[normalized] || { key: "general", label: "הודעה", icon: "📢" };
}

function parseSheetDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (match) {
    const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? null
    : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function isAnnouncementActive(value) {
  if (value === true) return true;
  if (value === false || value == null || value === "") return false;
  const normalized = String(value).trim().toLowerCase();
  return ["true", "כן", "yes", "1", "פעיל", "✓", "✔"].includes(normalized);
}

function normalizeAnnouncements(data = {}) {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const list = Array.isArray(data.announcements) ? data.announcements : [];

  const active = list
    .map((item, index) => {
      const publishDate = parseSheetDate(item.publishDate || item.date || item["תאריך פרסום"]);
      const expiryDate = parseSheetDate(item.expiry || item.validUntil || item["תוקף"]);
      const priorityRaw = Number(item.priority ?? item["עדיפות"]);

      return {
        type: String(item.type ?? item["סוג"] ?? "").trim(),
        title: String(item.title ?? item["כותרת"] ?? "שימו לב").trim(),
        content: String(item.content ?? item.message ?? item["תוכן"] ?? "").trim(),
        publishDate,
        publishText: String(item.publishDate ?? item.date ?? item["תאריך פרסום"] ?? "").trim(),
        expiryDate,
        active: isAnnouncementActive(item.active ?? item["פעיל"]),
        priority: Number.isFinite(priorityRaw) && priorityRaw > 0 ? priorityRaw : 999,
        index
      };
    })
    .filter(item => item.active && item.content)
    .filter(item => !item.publishDate || item.publishDate <= todayStart)
    .filter(item => !item.expiryDate || item.expiryDate >= todayStart)
    .sort((a, b) => a.priority - b.priority || (b.publishDate?.getTime() || 0) - (a.publishDate?.getTime() || 0) || a.index - b.index);

  if (active.length) return active;

  // תאימות לאחור לשדות הישנים בגיליון הגדרות.
  const settings = data.settings || {};
  const oldMessage = String(settings.announcement || "").trim();
  if (!oldMessage) return [];

  return [{
    type: settings.announcementType || settings.announcementCategory || "",
    title: settings.announcementTitle || "שימו לב",
    content: oldMessage,
    publishText: settings.announcementUpdated || settings.announcementTime || "",
    priority: 1,
    index: 0
  }];
}

function announcementItemMarkup(item, index, total) {
  const theme = getAnnouncementTheme(item.type);
  const published = item.publishText
    ? `<div class="announcement-updated">פורסם: ${escapeHtml(item.publishText)}</div>`
    : "";

  return `
    <article class="announcement-item announcement-${theme.key}${index === 0 ? " is-current" : ""}" data-announcement-index="${index}">
      <div class="announcement-topline">
        <div class="announcement-category">
          <span class="announcement-category-icon" aria-hidden="true">${theme.icon}</span>
          <span>${escapeHtml(theme.label)}</span>
        </div>
        <div class="announcement-meta">
          ${published}
          ${total > 1 ? `<div class="announcement-position">${index + 1}/${total}</div>` : ""}
        </div>
      </div>

      <div class="announcement-card">
        <div class="announcement-main-icon" aria-hidden="true">${theme.icon}</div>
        <div class="announcement-content">
          <div class="kicker">📢 הודעות החדר</div>
          <h2>${escapeHtml(item.title || "שימו לב")}</h2>
          <p>${escapeHtml(item.content)}</p>
        </div>
      </div>
    </article>`;
}

function renderAnnouncementSlide(data = {}) {
  const announcements = normalizeAnnouncements(data);
  const items = announcements.length
    ? announcements
    : [{ type: "מידע", title: "אין הודעות חדשות", content: "לא קיימות כרגע הודעות פעילות.", publishText: "" }];

  const secondsPerMessage = 7;
  const slideSeconds = Math.max(10, items.length * secondsPerMessage);

  return `
    <section class="slide announcement-slide" data-slide-seconds="${slideSeconds}" data-announcement-count="${items.length}" data-announcement-seconds="${secondsPerMessage}">
      <div class="slide-inner announcement-shell">
        <div class="announcement-stack">
          ${items.map((item, index) => announcementItemMarkup(item, index, items.length)).join("")}
        </div>
        ${items.length > 1 ? `
          <div class="announcement-dots" aria-label="מספר ההודעה">
            ${items.map((_, index) => `<span class="announcement-dot${index === 0 ? " is-current" : ""}" data-announcement-dot="${index}"></span>`).join("")}
          </div>` : ""}
      </div>
    </section>`;
}

function stopAnnouncementRotation() {
  if (announcementRotationTimer) {
    clearInterval(announcementRotationTimer);
    announcementRotationTimer = null;
  }
}

function startAnnouncementRotation(slide) {
  stopAnnouncementRotation();
  if (!slide?.classList.contains("announcement-slide")) return;

  const items = Array.from(slide.querySelectorAll(".announcement-item"));
  const dots = Array.from(slide.querySelectorAll(".announcement-dot"));
  if (items.length < 2) return;

  let current = 0;
  const seconds = Math.max(4, Number(slide.dataset.announcementSeconds) || 7);

  announcementRotationTimer = setInterval(() => {
    items[current].classList.remove("is-current");
    dots[current]?.classList.remove("is-current");
    current = (current + 1) % items.length;
    items[current].classList.add("is-current");
    dots[current]?.classList.add("is-current");
  }, seconds * 1000);
}


function getSmileContentType(value) {
  const v = String(value || "").trim();
  if (/\.(mp4|webm|ogg)(?:[?#].*)?$/i.test(v)) return "video";
  if (/\.(png|jpe?g|webp|gif)(?:[?#].*)?$/i.test(v)) return "image";
  return "text";
}

function getSmileTitle(settings = {}) {
  return String(
    settings.smileCornerTitle ||
    settings.smileTitle ||
    ""
  ).trim();
}

function renderSmileContent(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return `
      <div class="smile-empty">
        😄 אין תוכן בפינת החיוך כרגע
      </div>
    `;
  }

  const type = getSmileContentType(rawValue);
  const resolvedValue =
    type === "text"
      ? rawValue
      : resolveSmileMediaPath(rawValue);

  if (type === "video") {
    return `
      <div class="smile-media-frame smile-media-frame--loading">
        <video
          class="smile-video"
          src="${escapeHtml(resolvedValue)}"
          muted
          playsinline
          preload="auto"
          disablepictureinpicture
        ></video>

        <div class="smile-video-error" hidden>
          😄 לא ניתן לטעון את הסרטון
        </div>
      </div>
    `;
  }

  if (type === "image") {
    return `
      <div class="smile-media-frame smile-media-frame--image">
        <img
          class="smile-image"
          src="${escapeHtml(resolvedValue)}"
          alt="פינת החיוך"
        >
      </div>
    `;
  }

  return `
    <p class="smile-text">
      ${escapeHtml(resolvedValue)}
    </p>
  `;
}


function prepareSmileVideo(video) {
  if (video.dataset.prepared === "true") {
    return;
  }

  video.dataset.prepared = "true";

  const frame = video.closest(".smile-media-frame");
  if (!frame) return;

  const errorBox = frame.querySelector(".smile-video-error");

  const applyLayout = () => {
    const width = Number(video.videoWidth) || 0;
    const height = Number(video.videoHeight) || 0;
    const ratio = height ? width / height : 0;

    frame.classList.remove(
      "smile-media-frame--loading",
      "smile-media-frame--portrait",
      "smile-media-frame--landscape",
      "smile-media-frame--square"
    );

    if (!ratio || ratio < 0.9) {
      frame.classList.add("smile-media-frame--portrait");
    } else if (ratio > 1.15) {
      frame.classList.add("smile-media-frame--landscape");
    } else {
      frame.classList.add("smile-media-frame--square");
    }
  };

  const hideVideoError = () => {
    frame.classList.remove("smile-media-frame--error");

    if (errorBox) {
      errorBox.hidden = true;
    }
  };

  const showVideoError = () => {
    frame.classList.add("smile-media-frame--error");

    if (errorBox) {
      errorBox.hidden = false;
    }
  };

  video.addEventListener("loadedmetadata", () => {
    applyLayout();
    hideVideoError();
  });

  video.addEventListener("loadeddata", hideVideoError);
  video.addEventListener("canplay", hideVideoError);
  video.addEventListener("playing", hideVideoError);
  video.addEventListener("error", showVideoError);

  /*
   * לא קוראים כאן ל-video.load().
   * ב-Chrome/Android TV קריאה חוזרת יכולה למחוק את הבאפר ולגרום
   * לבקשת רשת חדשה אחרי כמה סבבים ללא אינטרנט.
   */
}


function setSmileVideoPlayback(activeSlide) {
  document.querySelectorAll(".smile-video").forEach(video => {
    prepareSmileVideo(video);

    const shouldPlay = Boolean(
      activeSlide &&
      activeSlide.contains(video)
    );

    if (shouldPlay) {
      document.body.classList.add("smile-video-playing");
      video.muted = true;

      try {
        if (video.ended || video.currentTime > 0.15) {
          video.currentTime = 0;
        }
      } catch (_) {}

      const playPromise = video.play();

      if (
        playPromise &&
        typeof playPromise.catch === "function"
      ) {
        playPromise.catch(error => {
          console.warn("הפעלת הסרטון נכשלה:", error);
        });
      }
    } else {
      video.pause();

      if (!document.querySelector(".smile-slide.active .smile-video")) {
        document.body.classList.remove("smile-video-playing");
      }
    }
  });
}



function renderCoordinatorRichText(message) {
  const segments = Array.isArray(message?.richText)
    ? message.richText
    : [];

  if (!segments.length) {
    return escapeHtml(message?.content || "");
  }

  return segments.map(segment => {
    const text = escapeHtml(segment?.text || "");
    const styles = [];

    const color = String(segment?.color || "").trim();

    if (/^#[0-9a-f]{6}$/i.test(color)) {
      styles.push(`color:${color}`);
    }

    if (segment?.bold === true) {
      styles.push("font-weight:900");
    }

    if (segment?.italic === true) {
      styles.push("font-style:italic");
    }

    if (segment?.underline === true) {
      styles.push("text-decoration:underline");
      styles.push("text-underline-offset:0.14em");
    }

    if (!styles.length) {
      return text;
    }

    return `<span style="${styles.join(";")}">${text}</span>`;
  }).join("");
}

function getCoordinatorTextSizeClass(content) {
  const text = String(content || "").trim();

  if (!text) {
    return "coordinator-text-large";
  }

  const lineCount = text.split(/\r?\n/).length;
  const length = text.length;

  if (lineCount <= 5 && length <= 280) {
    return "coordinator-text-large";
  }

  if (lineCount <= 10 && length <= 650) {
    return "coordinator-text-medium";
  }

  return "coordinator-text-small";
}



function fitFaithText(root = document) {
  const elements = root.querySelectorAll(
    ".faith-text-content"
  );

  elements.forEach(element => {
    const container = element.closest(
      ".faith-text-shell"
    );

    if (!container) return;

    element.style.fontSize = "";
    element.style.lineHeight = "";

    let fontSize = Number.parseFloat(
      window.getComputedStyle(element).fontSize
    ) || 34;

    const minSize = 18;

    const overflow = () =>
      element.scrollHeight > container.clientHeight ||
      element.scrollWidth > container.clientWidth;

    while (fontSize > minSize && overflow()) {
      fontSize -= 1;
      element.style.fontSize = `${fontSize}px`;

      if (fontSize < 28) {
        element.style.lineHeight = "1.28";
      }

      if (fontSize < 23) {
        element.style.lineHeight = "1.18";
      }
    }
  });
}

function fitCoordinatorMessageText(root = document) {
  const elements = root.querySelectorAll(
    ".coordinator-message-text"
  );

  elements.forEach(element => {
    const container = element.closest(
      ".coordinator-message-body"
    );

    if (!container) return;

    element.style.fontSize = "";
    element.style.lineHeight = "";
    element.style.letterSpacing = "";

    let fontSize = Number.parseFloat(
      window.getComputedStyle(element).fontSize
    ) || 28;

    const minimumFontSize = 12;

    const isOverflowing = () => (
      element.scrollHeight > container.clientHeight ||
      element.scrollWidth > container.clientWidth
    );

    while (fontSize > minimumFontSize && isOverflowing()) {
      fontSize -= 1;
      element.style.fontSize = `${fontSize}px`;

      if (fontSize < 22) {
        element.style.lineHeight = "1.14";
      }

      if (fontSize < 17) {
        element.style.lineHeight = "1.07";
        element.style.letterSpacing = "-0.01em";
      }
    }

    if (isOverflowing()) {
      element.style.fontSize = `${minimumFontSize}px`;
      element.style.lineHeight = "1.02";
      element.style.letterSpacing = "-0.015em";
    }
  });
}


function getSlideDurationSeconds(slide, fallbackSeconds) {
  const customSeconds = Number(
    slide?.dataset?.slideSeconds
  );

  if (
    Number.isFinite(customSeconds) &&
    customSeconds > 0
  ) {
    return customSeconds;
  }

  const fallback = Number(fallbackSeconds);

  return (
    Number.isFinite(fallback) &&
    fallback > 0
  )
    ? fallback
    : 10;
}


function isTruthySetting(value) {
  if (value === true) return true;

  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  return [
    "כן",
    "true",
    "1",
    "פעיל",
    "מאושר",
    "checked",
    "✓",
    "✔"
  ].includes(normalized);
}

function resolveDocumentPath(value) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  if (
    /^https?:\/\//i.test(raw) ||
    raw.startsWith("./") ||
    raw.startsWith("/")
  ) {
    return raw;
  }

  return `./documents/${raw.replace(/^documents\//i, "")}`;
}


function renderFaithRichText(faith) {
  const segments = Array.isArray(faith?.richText)
    ? faith.richText
    : [];

  if (!segments.length) {
    return escapeHtml(faith?.content || "")
      .replace(/\n/g, "<br>");
  }

  return segments.map(segment => {
    const text = escapeHtml(segment?.text || "")
      .replace(/\n/g, "<br>");

    const styles = [];

    const color = String(segment?.color || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(color)) {
      styles.push(`color:${color}`);
    }

    if (segment?.bold === true) {
      styles.push("font-weight:900");
    }

    if (segment?.italic === true) {
      styles.push("font-style:italic");
    }

    if (segment?.underline === true) {
      styles.push("text-decoration:underline");
      styles.push("text-underline-offset:0.12em");
    }

    const fontFamily = String(segment?.fontFamily || "").trim();

    if (fontFamily) {
      const safeFamily = fontFamily
        .replace(/["'\\;]/g, "")
        .slice(0, 80);

      styles.push(
        `font-family:"${safeFamily}","David Libre","Noto Serif Hebrew","Arial Hebrew",Arial,sans-serif`
      );
    }

    const fontSize = Number(segment?.fontSize);

    if (
      Number.isFinite(fontSize) &&
      fontSize >= 8 &&
      fontSize <= 72
    ) {
      styles.push(`font-size:${fontSize}px`);
    }

    return styles.length
      ? `<span style="${styles.join(";")}">${text}</span>`
      : text;
  }).join("");
}

function renderFaithSlide(data) {
  const faith = data?.faithCorner || {};

  if (!isTruthySetting(faith.active)) {
    return "";
  }

  const title = String(
    faith.title || "דקה של אמונה"
  ).trim();

  const content = String(
    faith.content || ""
  ).trim();

  if (!content) {
    return "";
  }

  const slideSeconds =
    Number(faith.slideSeconds) > 0
      ? Number(faith.slideSeconds)
      : 45;

  return `
    <section
      class="slide faith-slide"
      data-slide-seconds="${slideSeconds}"
    >
      <div class="slide-inner faith-slide-inner faith-text-mode">
        <header class="faith-slide-header">
          <div class="faith-slide-title">
            ✨ ${escapeHtml(title)}
          </div>
          <div class="faith-slide-author">
            מאת יניר מנשה
          </div>
        </header>

        <div class="faith-text-shell">
          <div class="faith-text-content">
            ${renderFaithRichText(faith)}
          </div>
        </div>
      </div>
    </section>
  `;
}

function buildSlides(data) {
  const s = data.settings || {};
  const smileTitle = getSmileTitle(s);
  const smileHasTitle = Boolean(smileTitle);
  const storeItems = (data.store || []).filter(item => item.active !== false);
  const storeCount = Math.min(storeItems.length, 8);

  const products = storeItems.length
    ? storeItems.map(item => `
        <div class="store-card">
          <div class="store-card-image">
            ${productIconMarkup(item.icon, item.name)}
          </div>
          <div class="store-card-name">${escapeHtml(item.name)}</div>
          <div class="store-card-price">₪${escapeHtml(item.price)}</div>
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
                       src="${escapeHtml(resolveMediaPath(s.driverImage, "images"))}"
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
      <section class="slide store-slide store-count-${storeCount} ${
        String(s.storePromoEnabled || "").trim() &&
        !["לא", "false", "0"].includes(
          String(s.storePromoEnabled || "")
            .trim()
            .toLowerCase()
        )
          ? "store-slide--promo"
          : ""
      }">
        <div class="slide-inner">
          <div class="kicker">☕ המרכולית של חדר הנהגים</div>

          ${
            String(s.storePromoEnabled || "").trim() &&
            !["לא", "false", "0"].includes(
              String(s.storePromoEnabled || "")
                .trim()
                .toLowerCase()
            )
              ? `
                <div class="store-promo-banner">
                  <div class="store-promo-limited">🔥 לזמן מוגבל</div>

                  <div class="store-promo-title">
                    ${escapeHtml(
                      s.storePromoTitle ||
                      "🎉 מבצע השקה חגיגי"
                    )}
                  </div>

                  <div class="store-promo-text">
                    ${escapeHtml(
                      s.storePromoText ||
                      "שתייה + חטיף או שוקולד"
                    )}
                  </div>

                  <div class="store-promo-price">
                    ${escapeHtml(
                      s.storePromoPrice ||
                      "8 ₪ בלבד"
                    )}
                  </div>

                  ${
                    String(s.storePromoUntil || "").trim()
                      ? `
                        <div class="store-promo-until">
                          ${escapeHtml(s.storePromoUntil)}
                        </div>
                      `
                      : ""
                  }
                </div>
              `
              : ""
          }

          <h2>מחירון</h2>
          <div class="products">${products}</div>
        </div>
      </section>
    `,
    renderBirthdaysSlide(data),
    `
      <section class="slide week-image-slide">
        <div class="slide-inner week-image-slide-inner">
          <div class="kicker">📸 תמונת השבוע</div>
          ${imageMarkup(s.weekImage, "תמונת השבוע", "week-image")}
        </div>
      </section>
    `,
    `
      <section class="slide smile-slide ${smileHasTitle ? "" : "smile-slide--no-title"}">
        <div class="slide-inner smile-slide-inner">
          <div class="kicker">😂 פינת החיוך</div>
          ${smileHasTitle
            ? `<h2 class="accent smile-heading">${escapeHtml(smileTitle)}</h2>`
            : ""
          }
          ${renderSmileContent(s.smileCorner)}
        </div>
      </section>
    `,
    renderFaithSlide(data),

    `
      <section
        class="slide coordinator-message-slide"
        data-slide-seconds="${
          Number(data.coordinatorMessages?.[0]?.slideSeconds) > 0
            ? Number(data.coordinatorMessages[0].slideSeconds)
            : Number(s.slideSeconds || 10)
        }"
      >
        <div class="slide-inner coordinator-message-inner">
          <header class="coordinator-message-header">
            <div class="coordinator-message-main-title">
              🚂 הודעות מטעם רכז הנהגים
            </div>

            <div class="coordinator-message-name">
              ${escapeHtml(
                s.coordinatorName ||
                "סשה ארנזון"
              )}
            </div>
          </header>

          <div class="coordinator-message-divider"></div>

          <div class="coordinator-message-body">
            <div
              class="coordinator-message-text ${getCoordinatorTextSizeClass(
                data.coordinatorMessages?.[0]?.content || ""
              )}"
            >${
              Array.isArray(data.coordinatorMessages) &&
              data.coordinatorMessages.length
                ? renderCoordinatorRichText(
                    data.coordinatorMessages[0]
                  )
                : "אין הודעות חדשות כרגע"
            }</div>
          </div>

          ${
            Array.isArray(data.coordinatorMessages) &&
            data.coordinatorMessages.length &&
            data.coordinatorMessages[0].publishDate
              ? `
                <div class="coordinator-message-date">
                  📅 פורסם:
                  ${escapeHtml(
                    data.coordinatorMessages[0].publishDate
                  )}
                </div>
              `
              : ""
          }
        </div>
      </section>
    `,
    renderAnnouncementSlide(data),
    `
      <section class="slide">
        <div class="slide-inner">
          <div class="kicker">🚂 מטענים חיפה</div>
          <h1 class="accent">משמרת טובה!</h1>
          <p>${escapeHtml(s.closingText || "שתהיה נסיעה בטוחה לכולם")}</p>
        </div>
      </section>
    `
  ].filter(Boolean);
}


function dataFingerprint(data) {
  try {
    const copy = JSON.parse(JSON.stringify(data || {}));
    delete copy.updatedAt;
    return JSON.stringify(copy);
  } catch {
    return "";
  }
}

function renderOnlyIfChanged(data) {
  if (!data) return false;

  const currentFingerprint = dataFingerprint(appData);
  const nextFingerprint = dataFingerprint(data);

  if (appData && currentFingerprint === nextFingerprint) {
    updateLastUpdated(data.updatedAt || appData.updatedAt);
    appData.updatedAt = data.updatedAt || appData.updatedAt;
    return false;
  }

  render(data);
  return true;
}

function render(data) {
  appData = data;
  currentSlide = 0;

  slideshow.innerHTML = buildSlides(data).join("");

  requestAnimationFrame(() => {
    fitCoordinatorMessageText(slideshow);
    fitFaithText(slideshow);

    window.setTimeout(() => {
      fitCoordinatorMessageText(slideshow);
    }, 180);

    window.setTimeout(() => {
      fitCoordinatorMessageText(slideshow);
    }, 700);
  });

  document
    .querySelectorAll(".smile-video")
    .forEach(video => prepareSmileVideo(video));

  document
    .querySelectorAll(".smile-video")
    .forEach(video => prepareSmileVideo(video));

  renderNewsTicker(data);
  updateCounter();
  preloadNextSlide();
  updateLastUpdated(data.updatedAt);
  const firstActiveSlide = slideshow.querySelector(".slide.active");
  if (firstActiveSlide) activateSlideEffects(firstActiveSlide);
  if (introFinished) {
    restartSlideTimer();
  }
}


function preloadSlideMedia(slide) {
  if (!slide) return;
  slide.querySelectorAll("img[data-src]").forEach(image => {
    image.src = image.dataset.src;
    image.removeAttribute("data-src");
  });
  slide.querySelectorAll("video").forEach(video => {
    video.preload = "auto";
    prepareSmileVideo(video);
  });
}

function preloadNextSlide() {
  const slides = Array.from(document.querySelectorAll(".slide"));
  if (!slides.length) return;
  const nextIndex = (currentSlide + 1) % slides.length;
  preloadSlideMedia(slides[nextIndex]);
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
  preloadNextSlide();
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

function startSmileVideoCountdown(video) {
  if (countdownTimer) clearInterval(countdownTimer);

  const updateFromVideo = () => {
    const duration = Number(video.duration);
    const currentTime = Number(video.currentTime) || 0;

    if (!Number.isFinite(duration) || duration <= 0) {
      updateSlideCountdown(0, 0);
      return;
    }

    const remaining = Math.max(0, duration - currentTime);
    const progress = remaining / duration;
    updateSlideCountdown(remaining, progress);
  };

  updateFromVideo();
  countdownTimer = setInterval(updateFromVideo, 500);
}

function restartSlideTimer() {
  if (slideTimer) {
    clearTimeout(slideTimer);
    slideTimer = null;
  }

  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  const activeSlide = document.querySelector(".slide.active");
  const smileVideo = activeSlide?.querySelector(".smile-video");

  // בפינת החיוך: הסרטון מוצג עד סופו, אך לא מעבר לזמן המקסימלי שהוגדר.
  if (smileVideo) {
    smileVideo.loop = false;

    const rawMaxSeconds = Number(
      appData?.settings?.smileVideoMaxSeconds ??
      appData?.settings?.maxSmileVideoSeconds ??
      appData?.settings?.["זמן_מקסימלי_לסרטון"]
    );
    const maxVideoSeconds = Number.isFinite(rawMaxSeconds) && rawMaxSeconds > 0
      ? Math.max(3, rawMaxSeconds)
      : 30;

    smileVideo.onended = () => {
      if (slideTimer) {
        clearTimeout(slideTimer);
        slideTimer = null;
      }
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
      showNextSlide();
    };

    // אם הקובץ לא נטען, לא משאירים את המצגת תקועה.
    smileVideo.onerror = () => {
      slideDurationSeconds = 10;
      startSlideCountdown();
      slideTimer = setTimeout(showNextSlide, 10000);
    };

    const beginVideoTiming = () => {
      const videoDuration = Number(smileVideo.duration);
      slideDurationSeconds = Number.isFinite(videoDuration) && videoDuration > 0
        ? Math.min(videoDuration, maxVideoSeconds)
        : maxVideoSeconds;

      startSlideCountdown();
      slideTimer = setTimeout(showNextSlide, slideDurationSeconds * 1000);
    };

    if (smileVideo.readyState >= 1) {
      beginVideoTiming();
    } else {
      smileVideo.addEventListener("loadedmetadata", beginVideoTiming, { once: true });
    }

    return;
  }

  // בפינת החיוך: תמונה או משפט מוצגים תמיד 10 שניות.
  const isSmileSlide = activeSlide?.classList.contains("smile-slide");
  if (isSmileSlide) {
    slideDurationSeconds = 10;
    startSlideCountdown();
    slideTimer = setTimeout(showNextSlide, 10000);
    return;
  }

  const isCoordinatorSlide =
    activeSlide?.classList.contains("coordinator-message-slide");

  const coordinatorSeconds = Number(
    appData?.coordinatorMessages?.[0]?.slideSeconds
  );

  const customSeconds = isCoordinatorSlide
    ? coordinatorSeconds
    : Number(activeSlide?.dataset?.slideSeconds);

  const defaultSeconds =
    Number(appData?.settings?.slideSeconds) ||
    DEFAULT_SLIDE_SECONDS;

  slideDurationSeconds = Math.max(
    3,
    Number.isFinite(customSeconds) &&
    customSeconds > 0
      ? customSeconds
      : defaultSeconds
  );

  console.log(
    "משך שקופית:",
    activeSlide?.className,
    slideDurationSeconds
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
  if (!DATA_URL) {
    throw new Error("לא הוגדרה כתובת נתונים");
  }

  const separator = DATA_URL.includes("?") ? "&" : "?";
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      `${DATA_URL}${separator}t=${Date.now()}`,
      {
        cache: "no-store",
        signal: controller.signal
      }
    );

    if (!response.ok) {
      throw new Error(`שגיאת שרת: ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.success === false) {
      throw new Error(
        data?.error || "השרת החזיר תשובה לא תקינה"
      );
    }

    return data;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function refreshData(options = {}) {
  const { background = false } = options;

  // בלי חיבור: ממשיכים עם המידע שכבר מוצג או עם המידע השמור.
  if (!navigator.onLine) {
    if (!appData) {
      const cached = loadLocal();

      if (cached) {
        render(cached);
      }
    }

    setConnectionState(false, Boolean(appData || loadLocal()));
    return;
  }

  try {
    const data = DATA_URL
      ? await fetchRemoteData()
      : await loadBundledSample();

    saveLocal(data);
    renderOnlyIfChanged(data);
    consecutiveDataFailures = 0;
    setConnectionState(true, false);
  } catch (error) {
    const cached = loadLocal();

    if (!appData && cached) {
      render(cached);
    }

    if (appData || cached) {
      consecutiveDataFailures += 1;

      if (navigator.onLine) {
        // האינטרנט מחובר; רק עדכון הנתונים נכשל זמנית.
        // משאירים חיווי ירוק וממשיכים עם המידע האחרון.
        setConnectionState(true, true);
      } else {
        setConnectionState(false, true);
      }

      console.warn(
        "מציג מידע שמור לאחר כשל בעדכון:",
        error
      );
      return;
    }

    if (!background) {
      slideshow.innerHTML = `
        <section class="slide active">
          <div class="slide-inner">
            <h2>לא ניתן לטעון את המידע</h2>
            <p>בדוק את החיבור או את קובצי המערכת.</p>
          </div>
        </section>
      `;
    }

    setConnectionState(false, false);
  }
}

window.addEventListener("online", () => {
  if (offlineStatusTimer) {
    window.clearTimeout(offlineStatusTimer);
    offlineStatusTimer = null;
  }

  setConnectionState(true, false);
  refreshData({ background: true });
});

window.addEventListener("offline", () => {
  if (offlineStatusTimer) {
    window.clearTimeout(offlineStatusTimer);
  }

  offlineStatusTimer = window.setTimeout(() => {
    if (!navigator.onLine) {
      setConnectionState(
        false,
        Boolean(appData || loadLocal())
      );
    }
  }, 3000);
});


if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(console.error);
  });
}

const startupCachedData = loadLocal();

if (startupCachedData) {
  render(startupCachedData);
  setConnectionState(navigator.onLine, true);
}

if (navigator.onLine) {
  refreshData({ background: Boolean(startupCachedData) });
} else if (!startupCachedData) {
  refreshData();
}

setInterval(() => {
  if (navigator.onLine) {
    refreshData({ background: true });
  } else {
    setConnectionState(false, Boolean(appData || loadLocal()));
  }
}, Math.max(1, REFRESH_MINUTES) * 60 * 1000);
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


window.addEventListener("resize", () => {
  window.requestAnimationFrame(() => {
    fitCoordinatorMessageText(document);
  });
});
