// notifications.js — User-Controlled Notification / Reminder System
// Phase 2.2: Browser Notification API, smart reminders, anti-spam.

/* =====================================================================
   NOTIFICATION SETTINGS
   ===================================================================== */

const NOTIF_DEFAULTS = {
  workout:   { enabled: true, time: "08:30" },
  meal:      { enabled: true, times: ["08:00", "12:00", "18:00"] },
  hydration: { enabled: true, intervalHours: 2, startTime: "08:00", endTime: "21:00" },
  checkin:   { enabled: true },
};

const NOTIF_MAX_PER_DAY = 5;

const MOTIVATIONAL_QUOTES = [
  "The only bad workout is the one that didn't happen.",
  "Your body can stand almost anything. It's your mind you have to convince.",
  "Discipline is choosing between what you want now and what you want most.",
  "You don't have to be extreme, just consistent.",
  "The pain you feel today will be the strength you feel tomorrow.",
  "Show up. Work hard. Leave nothing on the table.",
  "Small daily improvements lead to staggering long-term results.",
  "It never gets easier, you just get stronger.",
  "Success isn't always about greatness. It's about consistency.",
  "Push yourself because no one else is going to do it for you.",
  "Sweat now, shine later.",
  "Champions train. Losers complain.",
  "Fall in love with taking care of yourself.",
  "One workout at a time. One rep at a time. One day at a time.",
  "Be stronger than your excuses.",
  "Today's effort is tomorrow's result.",
  "You're one workout away from a better mood.",
  "Commitment means staying loyal to what you said you would do.",
  "Make yourself proud.",
  "The best project you'll ever work on is you.",
];

function getNotifSettings() {
  try { return JSON.parse(localStorage.getItem("notifSettings") || "null") || NOTIF_DEFAULTS; }
  catch { return NOTIF_DEFAULTS; }
}

function saveNotifSettings(settings) {
  localStorage.setItem("notifSettings", JSON.stringify(settings));
}

function getNotifLog() {
  try { return JSON.parse(localStorage.getItem("notifLog") || "{}"); } catch { return {}; }
}

/* =====================================================================
   PERMISSION MANAGEMENT
   ===================================================================== */

function isNotifSupported() {
  return "Notification" in window;
}

function getNotifPermission() {
  if (!isNotifSupported()) return "unsupported";
  return Notification.permission; // "granted", "denied", "default"
}

async function requestNotifPermission() {
  if (!isNotifSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  return result;
}

/* =====================================================================
   SENDING NOTIFICATIONS
   ===================================================================== */

function sendNotification(title, body, tag) {
  if (getNotifPermission() !== "granted") return false;

  // Anti-spam: check daily count
  const today = getTodayString();
  const log = getNotifLog();
  if (!log[today]) log[today] = { count: 0, dismissed: 0 };
  if (log[today].count >= NOTIF_MAX_PER_DAY) return false;

  try {
    const notif = new Notification(title, {
      body: body,
      icon: "/assets/images/file.svg",
      tag: tag || generateId("notif"),
      requireInteraction: false,
    });

    log[today].count++;
    localStorage.setItem("notifLog", JSON.stringify(log));

    // Track dismissals for auto-cadence reduction
    notif.onclose = () => {
      const currentLog = getNotifLog();
      if (currentLog[today]) {
        currentLog[today].dismissed++;
        localStorage.setItem("notifLog", JSON.stringify(currentLog));
      }
    };

    notif.onclick = () => {
      window.focus();
      notif.close();
    };

    return true;
  } catch {
    return false;
  }
}

/* =====================================================================
   SCHEDULED REMINDERS
   ===================================================================== */

let _notifTimers = [];

/**
 * Sets up notification timers based on user settings and today's schedule.
 * Call on app init and when settings change.
 */
function initNotificationTimers() {
  // Clear existing timers
  _notifTimers.forEach(t => clearTimeout(t));
  _notifTimers = [];

  if (getNotifPermission() !== "granted") return;

  const settings = getNotifSettings();
  const now = new Date();

  // Workout reminder with motivational quote + summary
  if (settings.workout?.enabled) {
    const todayWorkouts = getTodayScheduledWorkouts();
    if (todayWorkouts.length > 0) {
      const wTime = settings.workout.time || "08:30";
      const [wh, wm] = wTime.split(":").map(Number);
      const reminderTime = new Date(now);
      reminderTime.setHours(wh, wm, 0, 0);
      const ms = reminderTime.getTime() - now.getTime();
      if (ms > 0 && ms < 86400000) {
        _notifTimers.push(setTimeout(() => {
          const quote = _getRandomQuote();
          const summary = _buildWorkoutSummary(todayWorkouts);
          sendNotification(
            `"${quote}"`,
            `Today's workout: ${summary}`,
            "workout-daily"
          );
        }, ms));
      }
    }
  }

  // Meal logging reminders
  if (settings.meal?.enabled && typeof isNutritionEnabled === "function" && isNutritionEnabled()) {
    (settings.meal.times || ["08:00", "12:00", "18:00"]).forEach(time => {
      const [h, m] = time.split(":").map(Number);
      const reminderTime = new Date(now);
      reminderTime.setHours(h, m, 0, 0);
      const ms = reminderTime.getTime() - now.getTime();
      if (ms > 0 && ms < 86400000) {
        _notifTimers.push(setTimeout(() => {
          sendNotification(
            "Meal Reminder",
            "Time to log your meal. Quick-add makes it easy!",
            `meal-${time}`
          );
        }, ms));
      }
    });
  }

  // Hydration reminders — once daily or repeating at interval
  if (settings.hydration?.enabled && typeof isHydrationEnabled === "function" && isHydrationEnabled()) {
    const startTime = settings.hydration.startTime || "08:00";
    const [sh, sm] = startTime.split(":").map(Number);
    const freq = settings.hydration.frequency || "once";
    const endHour = 21;

    const _scheduleHydrationNotif = (hour, minute, tag) => {
      const t = new Date(now);
      t.setHours(hour, minute, 0, 0);
      const ms = t.getTime() - now.getTime();
      if (ms > 0 && ms < 86400000) {
        _notifTimers.push(setTimeout(() => {
          const bottles = typeof getTodayHydration === "function" ? getTodayHydration() : 0;
          const target = typeof getHydrationTarget === "function" ? getHydrationTarget() : 96;
          const bottleSize = typeof getBottleSize === "function" ? getBottleSize() : 12;
          const currentOz = bottles * bottleSize;
          if (currentOz < target) {
            sendNotification(
              "Hydration Reminder",
              `${currentOz}/${target} oz so far today. Stay hydrated!`,
              tag
            );
          }
        }, ms));
      }
    };

    if (freq === "once") {
      _scheduleHydrationNotif(sh, sm, "hydration-daily");
    } else {
      const intervalHours = parseInt(freq) || 2;
      for (let h = sh; h <= endHour; h += intervalHours) {
        _scheduleHydrationNotif(h, h === sh ? sm : 0, `hydration-${h}`);
      }
    }
  }
}

function getTodayScheduledWorkouts() {
  const today = getTodayString();
  try {
    return (JSON.parse(localStorage.getItem("workoutSchedule") || "[]")).filter(w => w.date === today);
  } catch { return []; }
}

function _getRandomQuote() {
  return MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
}

function _buildWorkoutSummary(workouts) {
  if (!workouts.length) return "";
  const parts = workouts.map(w => {
    let desc = w.sessionName || w.type || "Workout";
    if (w.exercises && w.exercises.length > 0) {
      const names = w.exercises.slice(0, 3).map(e => e.name);
      desc += `: ${names.join(", ")}`;
      if (w.exercises.length > 3) desc += ` +${w.exercises.length - 3} more`;
    } else if (w.discipline && w.load) {
      const session = (typeof getSessionTemplate === "function")
        ? getSessionTemplate(w.discipline, w.load, w.weekNumber)
        : ((typeof SESSION_DESCRIPTIONS !== "undefined" && SESSION_DESCRIPTIONS[w.discipline])
            ? SESSION_DESCRIPTIONS[w.discipline][w.load] : null);
      if (session) desc += ` (${session.duration} min)`;
    }
    return desc;
  });
  return parts.join(" | ");
}

/* =====================================================================
   AUTO-CADENCE REDUCTION
   ===================================================================== */

/**
 * If user dismisses 3+ notifications in a row, suggest reducing cadence.
 */
function checkNotifFatigue() {
  const today = getTodayString();
  const log = getNotifLog();
  const todayLog = log[today];
  if (!todayLog) return false;
  return todayLog.dismissed >= 3 && todayLog.count > 0;
}

/* =====================================================================
   SETTINGS UI
   ===================================================================== */

function renderNotifSettings() {
  const container = document.getElementById("notif-settings-content");
  if (!container) return;

  const settings = getNotifSettings();
  const permission = getNotifPermission();

  let html = "";

  if (permission === "unsupported") {
    html = `<p class="hint">Notifications are not supported in this browser.</p>`;
  } else if (permission === "denied") {
    html = `<p class="hint">Notifications are blocked. Enable them in your browser settings for this site.</p>`;
  } else if (permission === "default") {
    html = `
      <p class="hint">Enable notifications to get workout, meal, and hydration reminders.</p>
      <button class="btn-primary" onclick="enableNotifications()">Enable Notifications</button>`;
  } else {
    // Granted — show toggle controls with time pickers
    const wTime = settings.workout?.time || "08:30";
    const mTimes = settings.meal?.times || ["08:00", "12:00", "18:00"];
    const hTime = settings.hydration?.time || "10:00";

    html = `
      <div class="notif-setting-row">
        <div class="notif-setting-info">
          <span class="notif-setting-name">${ICONS.weights} Workout Reminders</span>
          <span class="notif-setting-desc">Motivational quote + workout summary</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" ${settings.workout?.enabled ? "checked" : ""} onchange="toggleNotifType('workout', this.checked)" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      ${settings.workout?.enabled ? `<div class="notif-time-row"><label>Send at</label><input type="time" value="${wTime}" onchange="updateNotifTime('workout','time',this.value)" /></div>` : ""}

      <div class="notif-setting-row">
        <div class="notif-setting-info">
          <span class="notif-setting-name">${ICONS.utensils} Meal Logging</span>
          <span class="notif-setting-desc">Reminders to log your meals</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" ${settings.meal?.enabled ? "checked" : ""} onchange="toggleNotifType('meal', this.checked)" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      ${settings.meal?.enabled ? `<div class="notif-time-row"><label>Breakfast</label><input type="time" value="${mTimes[0]}" onchange="updateNotifMealTime(0,this.value)" /><label>Lunch</label><input type="time" value="${mTimes[1]}" onchange="updateNotifMealTime(1,this.value)" /><label>Dinner</label><input type="time" value="${mTimes[2]}" onchange="updateNotifMealTime(2,this.value)" /></div>` : ""}

      <div class="notif-setting-row">
        <div class="notif-setting-info">
          <span class="notif-setting-name">${ICONS.droplet} Hydration</span>
          <span class="notif-setting-desc">Hydration check-in reminders</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" ${settings.hydration?.enabled ? "checked" : ""} onchange="toggleNotifType('hydration', this.checked)" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      ${settings.hydration?.enabled ? (() => {
        const hFreq = settings.hydration?.frequency || "once";
        const hStart = settings.hydration?.startTime || "08:00";
        return `<div class="notif-time-row">
          <label>Frequency</label>
          <select class="mp-select" onchange="updateNotifTime('hydration','frequency',this.value);renderNotifSettings()">
            <option value="once" ${hFreq==="once"?"selected":""}>Once per day</option>
            <option value="2" ${hFreq==="2"?"selected":""}>Every 2 hours</option>
            <option value="3" ${hFreq==="3"?"selected":""}>Every 3 hours</option>
            <option value="4" ${hFreq==="4"?"selected":""}>Every 4 hours</option>
          </select>
          <label>${hFreq === "once" ? "Send at" : "Starting at"}</label>
          <input type="time" value="${hStart}" onchange="updateNotifTime('hydration','startTime',this.value)" />
        </div>`;
      })() : ""}`;
  }

  container.innerHTML = html;
}

async function enableNotifications() {
  const result = await requestNotifPermission();
  renderNotifSettings();
  if (result === "granted") {
    initNotificationTimers();
  }
}

function toggleNotifType(type, enabled) {
  const settings = getNotifSettings();
  if (settings[type]) {
    settings[type].enabled = enabled;
  }
  saveNotifSettings(settings);
  renderNotifSettings();
  initNotificationTimers();
}

function updateNotifTime(type, field, value) {
  const settings = getNotifSettings();
  if (settings[type]) {
    settings[type][field] = value;
  }
  saveNotifSettings(settings);
  initNotificationTimers();
}

function updateNotifMealTime(index, value) {
  const settings = getNotifSettings();
  if (!settings.meal) settings.meal = { enabled: true, times: ["08:00", "12:00", "18:00"] };
  settings.meal.times[index] = value;
  saveNotifSettings(settings);
  initNotificationTimers();
}
