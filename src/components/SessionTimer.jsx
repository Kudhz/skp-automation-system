import React, { useEffect, useState } from "react";

const readRemaining = () => {
  try {
    const loginTime = Number(localStorage.getItem("bot_login_time"));
    const duration = Number(localStorage.getItem("bot_session_duration"));
    if (!loginTime || !duration) return 0;
    return Math.max(0, loginTime + duration * 60 * 1000 - Date.now());
  } catch {
    return 0;
  }
};

const format = (ms) => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}j ${String(minutes).padStart(2, "0")}m`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export default function SessionTimer() {
  const [remaining, setRemaining] = useState(readRemaining);

  useEffect(() => {
    const timer = setInterval(() => setRemaining(readRemaining()), 1000);
    return () => clearInterval(timer);
  }, []);

  const expired = remaining <= 0;
  const warning = !expired && remaining < 10 * 60 * 1000;
  const tone = expired ? "expired" : warning ? "warning" : "normal";

  return (
    <span
      className={`saas-timer saas-timer-${tone}`}
      title="Sisa waktu sesi login"
      role="timer"
      aria-label={expired ? "Sesi berakhir" : `Sisa sesi ${format(remaining)}`}
    >
      <span className="saas-timer-dot" aria-hidden="true"></span>
      <span>{expired ? "Sesi habis" : format(remaining)}</span>
    </span>
  );
}
