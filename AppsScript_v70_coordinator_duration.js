function doGet() {
  try {
    const data = buildDisplayData();

    return ContentService
      .createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.message
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


function buildDisplayData() {
  const spreadsheet = SpreadsheetApp.openById(
    '1RJXBK5mfv8-9byMLxABDcszBNdXvsep4IJLkAMq4Z94'
  );

  const settingsSheet =
    spreadsheet.getSheetByName('הגדרות');

  const storeSheet =
    spreadsheet.getSheetByName('מרכולית');

  const birthdaysSheet =
    spreadsheet.getSheetByName('ימי הולדת');

  const announcementsSheet =
    spreadsheet.getSheetByName('הודעות');

  const coordinatorMessagesSheet =
    spreadsheet.getSheetByName('הודעות רכז נהגים');


  if (!settingsSheet) {
    throw new Error('לא נמצאה לשונית בשם הגדרות');
  }

  if (!storeSheet) {
    throw new Error('לא נמצאה לשונית בשם מרכולית');
  }

  if (!birthdaysSheet) {
    throw new Error('לא נמצאה לשונית בשם ימי הולדת');
  }

  if (!announcementsSheet) {
    throw new Error('לא נמצאה לשונית בשם הודעות');
  }

  if (!coordinatorMessagesSheet) {
    throw new Error(
      'לא נמצאה לשונית בשם הודעות רכז נהגים'
    );
  }


  // =========================
  // הגדרות
  // =========================

  const settingsRows = settingsSheet
    .getDataRange()
    .getDisplayValues();

  const rawSettings = {};

  for (let i = 1; i < settingsRows.length; i++) {
    const key =
      String(settingsRows[i][0] || '').trim();

    const value =
      String(settingsRows[i][1] || '').trim();

    if (key) {
      rawSettings[key] = value;
    }
  }


  // =========================
  // מרכולית
  // =========================

  const storeRows = storeSheet
    .getDataRange()
    .getDisplayValues();

  const store = [];

  for (let i = 1; i < storeRows.length; i++) {
    const name =
      String(storeRows[i][0] || '').trim();

    const price =
      String(storeRows[i][1] || '').trim();

    const icon =
      String(storeRows[i][2] || '').trim();

    const activeText =
      String(storeRows[i][3] || '').trim();

    if (!name) {
      continue;
    }

    store.push({
      name: name,
      price: price,
      icon: icon,
      active: activeText !== 'לא'
    });
  }


  // =========================
  // ימי הולדת
  // =========================

  const birthdayRows = birthdaysSheet
    .getDataRange()
    .getDisplayValues();

  const birthdaysList = [];

  for (let i = 1; i < birthdayRows.length; i++) {
    const name =
      String(birthdayRows[i][0] || '').trim();

    const date =
      String(birthdayRows[i][1] || '').trim();

    if (!name || !date) {
      continue;
    }

    birthdaysList.push({
      name: name,
      date: date
    });
  }


  const timeZone =
    spreadsheet.getSpreadsheetTimeZone();


  // =========================
  // הודעות החדר
  // =========================

  const announcements = readAnnouncements(
    announcementsSheet,
    timeZone
  );


  // =========================
  // הודעות רכז נהגים
  // =========================

  const coordinatorMessages =
    readCoordinatorMessages(
      coordinatorMessagesSheet,
      timeZone
    );


  // =========================
  // החזרת כל המידע לאתר
  // =========================

  return {
    success: true,
    updatedAt: new Date().toISOString(),

    settings: {
      systemName:
        rawSettings['שם_המערכת'] ||
        'מטענים חיפה LIVE',

      openingTitle:
        rawSettings['כותרת_פתיחה'] ||
        'ברוכים הבאים לחדר הנהגים',

      driverName:
        rawSettings['נהג_החודש_שם'] ||
        'בקרוב יפורסם',

      driverReason:
        rawSettings['נהג_החודש_סיבה'] ||
        '',

      driverImage:
        rawSettings['נהג_החודש_תמונה'] ||
        '',

      birthdays:
        rawSettings['ימי_הולדת'] ||
        'אין חוגגים חדשים כרגע',

      weekImage:
        rawSettings['תמונת_השבוע'] ||
        '',

      weekImageCaption:
        rawSettings['כיתוב_תמונה'] ||
        'תמונה מהשטח',

      smileCorner:
        rawSettings['פינת_החיוך'] ||
        '',

      smileCornerTitle:
        rawSettings['כותרת_פינת_החיוך'] ||
        '',

      smileVideoMaxSeconds:
        Number(
          rawSettings['זמן_מקסימלי_לסרטון']
        ) || 30,

      // תמיכה בהודעה הישנה מהגדרות
      announcement:
        rawSettings['הודעה'] ||
        rawSettings['תוכן_הודעה'] ||
        'אין הודעות חדשות כרגע',

      announcementTitle:
        rawSettings['כותרת_הודעה'] ||
        'שימו לב',

      announcementType:
        rawSettings['סוג_הודעה'] ||
        'מידע',

      announcementUpdated:
        rawSettings['עודכן_הודעה'] ||
        '',

      coordinatorName:
        rawSettings['שם_רכז_נהגים'] ||
        'סשה ארנזון',

      closingText:
        rawSettings['טקסט_סיום'] ||
        'שתהיה משמרת טובה ונסיעה בטוחה',

      slideSeconds:
        Number(
          rawSettings['זמן_שקופית']
        ) || 10,

      news1:
        rawSettings['news1'] || '',

      news2:
        rawSettings['news2'] || '',

      news3:
        rawSettings['news3'] || '',

      news4:
        rawSettings['news4'] || '',

      news5:
        rawSettings['news5'] || '',

      news6:
        rawSettings['news6'] || '',

      news7:
        rawSettings['news7'] || '',

      news8:
        rawSettings['news8'] || '',

      news9:
        rawSettings['news9'] || '',

      news10:
        rawSettings['news10'] || ''
    },

    store: store,

    birthdaysList: birthdaysList,

    announcements: announcements,

    coordinatorMessages: coordinatorMessages
  };
}


/**
 * קורא את גיליון "הודעות".
 *
 * סדר העמודות:
 * A - סוג
 * B - כותרת
 * C - תוכן
 * D - תאריך פרסום
 * E - פעיל
 * F - עדיפות
 * G - תוקף
 */
function readAnnouncements(sheet, timeZone) {
  const rows = sheet
    .getDataRange()
    .getValues();

  if (rows.length < 2) {
    return [];
  }

  const today = startOfDay(new Date());
  const announcements = [];

  for (let i = 1; i < rows.length; i++) {
    const type =
      String(rows[i][0] || '').trim();

    const title =
      String(rows[i][1] || '').trim();

    const content =
      String(rows[i][2] || '').trim();

    const publishDateValue =
      rows[i][3];

    const activeValue =
      rows[i][4];

    const priorityValue =
      rows[i][5];

    const expiryDateValue =
      rows[i][6];


    if (!type && !title && !content) {
      continue;
    }

    if (!isAnnouncementActive(activeValue)) {
      continue;
    }

    const publishDate =
      parseSheetDate(publishDateValue);

    const expiryDate =
      parseSheetDate(expiryDateValue);


    if (
      publishDate &&
      today < startOfDay(publishDate)
    ) {
      continue;
    }

    if (
      expiryDate &&
      today > startOfDay(expiryDate)
    ) {
      continue;
    }

    const priorityNumber =
      Number(priorityValue);

    announcements.push({
      type:
        type || 'מידע',

      title:
        title || 'שימו לב',

      content:
        content || '',

      publishDate:
        publishDate
          ? formatDateForDisplay(
              publishDate,
              timeZone
            )
          : '',

      expiryDate:
        expiryDate
          ? formatDateForDisplay(
              expiryDate,
              timeZone
            )
          : '',

      priority:
        Number.isFinite(priorityNumber) &&
        priorityNumber > 0
          ? priorityNumber
          : 999,

      active: true,

      rowNumber: i + 1
    });
  }


  announcements.sort(function(a, b) {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    return a.rowNumber - b.rowNumber;
  });


  return announcements.map(function(item) {
    return {
      type: item.type,
      title: item.title,
      content: item.content,
      publishDate: item.publishDate,
      expiryDate: item.expiryDate,
      priority: item.priority,
      slideSeconds: item.slideSeconds,
      active: item.active
    };
  });
}


/**
 * קורא את גיליון "הודעות רכז נהגים".
 *
 * סדר העמודות:
 * A - תוכן
 * B - תאריך פרסום
 * C - פעיל
 * D - עדיפות
 * E - תוקף
 * F - זמן שקופית בשניות
 */
function readCoordinatorMessages(
  sheet,
  timeZone
) {
  const rows = sheet
    .getDataRange()
    .getValues();

  if (rows.length < 2) {
    return [];
  }

  const today = startOfDay(new Date());
  const messages = [];

  for (let i = 1; i < rows.length; i++) {
    const content =
      String(rows[i][0] || '').trim();

    const publishDateValue =
      rows[i][1];

    const activeValue =
      rows[i][2];

    const priorityValue =
      rows[i][3];

    const expiryDateValue =
      rows[i][4];

    const slideSecondsValue =
      rows[i][5];

    if (!content) {
      continue;
    }

    if (!isAnnouncementActive(activeValue)) {
      continue;
    }

    const publishDate =
      parseSheetDate(publishDateValue);

    const expiryDate =
      parseSheetDate(expiryDateValue);

    if (
      publishDate &&
      today < startOfDay(publishDate)
    ) {
      continue;
    }

    if (
      expiryDate &&
      today > startOfDay(expiryDate)
    ) {
      continue;
    }

    const priorityNumber =
      Number(priorityValue);

    const slideSecondsNumber =
      Number(slideSecondsValue);

    messages.push({
      content: content,

      publishDate:
        publishDate
          ? formatDateForDisplay(
              publishDate,
              timeZone
            )
          : '',

      expiryDate:
        expiryDate
          ? formatDateForDisplay(
              expiryDate,
              timeZone
            )
          : '',

      priority:
        Number.isFinite(priorityNumber) &&
        priorityNumber > 0
          ? priorityNumber
          : 999,

      slideSeconds:
        Number.isFinite(slideSecondsNumber) &&
        slideSecondsNumber > 0
          ? slideSecondsNumber
          : 30,

      active: true,
      rowNumber: i + 1
    });
  }

  messages.sort(function(a, b) {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    return a.rowNumber - b.rowNumber;
  });

  return messages.map(function(item) {
    return {
      content: item.content,
      publishDate: item.publishDate,
      expiryDate: item.expiryDate,
      priority: item.priority,
      active: item.active
    };
  });
}


/**
 * תומך ב-Checkbox וגם בערכים ישנים.
 */
function isAnnouncementActive(value) {
  if (value === true) {
    return true;
  }

  if (
    value === false ||
    value === null ||
    value === ''
  ) {
    return false;
  }

  const text =
    String(value)
      .trim()
      .toLowerCase();

  return [
    'כן',
    'true',
    '1',
    'פעיל',
    'מאושר',
    'checked',
    '✓',
    '✔'
  ].includes(text);
}


/**
 * ממיר תאריך מהגיליון ל-Date.
 *
 * תומך ב:
 * DD/MM/YYYY
 * DD-MM-YYYY
 * YYYY-MM-DD
 */
function parseSheetDate(value) {
  if (!value) {
    return null;
  }

  if (
    Object.prototype.toString.call(value) ===
      '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return value;
  }

  const text =
    String(value).trim();

  if (!text) {
    return null;
  }


  // DD/MM/YYYY
  const dayFirstMatch = text.match(
    /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/
  );

  if (dayFirstMatch) {
    const day =
      Number(dayFirstMatch[1]);

    const month =
      Number(dayFirstMatch[2]) - 1;

    const year =
      Number(dayFirstMatch[3]);

    const date =
      new Date(year, month, day);

    if (!isNaN(date.getTime())) {
      return date;
    }
  }


  // YYYY-MM-DD
  const yearFirstMatch = text.match(
    /^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/
  );

  if (yearFirstMatch) {
    const year =
      Number(yearFirstMatch[1]);

    const month =
      Number(yearFirstMatch[2]) - 1;

    const day =
      Number(yearFirstMatch[3]);

    const date =
      new Date(year, month, day);

    if (!isNaN(date.getTime())) {
      return date;
    }
  }


  const parsedDate =
    new Date(text);

  return isNaN(parsedDate.getTime())
    ? null
    : parsedDate;
}


function startOfDay(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}


function formatDateForDisplay(
  date,
  timeZone
) {
  return Utilities.formatDate(
    date,
    timeZone ||
      Session.getScriptTimeZone(),
    'dd/MM/yyyy'
  );
}