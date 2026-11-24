"use strict";

const byId = id => document.getElementById(id);
const audio = byId("audio");
const play = byId("play");
const seek = byId("seek");
const continuous = byId("continuous");
const repeat = byId("repeat");
const trackList = byId("tracks");
const lyrics = byId("lyrics");
const status = byId("player-status");
const mediaSession = navigator.mediaSession;
const repeatModes = ["חזרה כבויה", "חזרה על השיר", "חזרה על האוסף"];

let songs = [];
let selected = -1;
let repeatMode = 0;
let loadedId = null;
let requestId = 0;
let wantsPlayback = false;
let lyricSize = 1.27;

function timeLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "–:––";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function currentSong() {
  return songs[selected];
}

function totalTime() {
  return (loadedId && Number.isFinite(audio.duration) && audio.duration > 0)
    ? audio.duration : currentSong()?.duration;
}

function drawProgress() {
  const duration = totalTime();
  seek.max = Number.isFinite(duration) ? duration : 0;
  seek.disabled = !loadedId || !Number.isFinite(audio.duration) || audio.readyState === 0 || Boolean(audio.error);
  seek.value = audio.currentTime;
  seek.setAttribute("aria-valuetext", timeLabel(audio.currentTime));
  byId("elapsed").textContent = timeLabel(audio.currentTime);
  byId("duration").textContent = timeLabel(duration);
  if (mediaSession?.setPositionState) {
    if (!loadedId || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      mediaSession.setPositionState();
    } else {
      mediaSession.setPositionState({
        duration: audio.duration,
        position: Math.min(audio.duration, audio.currentTime),
        playbackRate: audio.playbackRate
      });
    }
  }
}

function drawControls() {
  const pendingOrPlaying = wantsPlayback || !audio.paused;
  const label = pendingOrPlaying ? "השהיה" : "ניגון";
  byId("play-glyph").textContent = pendingOrPlaying ? "Ⅱ" : "▶";
  play.setAttribute("aria-label", label);
  play.title = label;
  play.disabled = !currentSong()?.audio;
  const canWrap = repeatMode === 2 && songs.length > 1;
  byId("previous").disabled = selected <= 0 && !canWrap;
  byId("next").disabled = selected < 0 || (selected >= songs.length - 1 && !canWrap);
  if (mediaSession) mediaSession.playbackState = audio.paused ? "paused" : "playing";
  for (const [index, row] of [...trackList.querySelectorAll("button")].entries()) {
    if (index === selected) row.setAttribute("aria-current", "true");
    else row.removeAttribute("aria-current");
    const playing = index === selected && !audio.paused;
    row.dataset.playing = String(playing);
    row.querySelector(".track-number").textContent = playing ? "♪" : String(index + 1).padStart(2, "0");
  }
}

function updateLyrics(song) {
  const credits = byId("credits");
  const authors = [`מילים: ${song.lyricist || "בבדיקה"}`, `לחן: ${song.composer || "בבדיקה"}`];
  credits.replaceChildren();
  for (const line of [authors.join(" · "), song.lyrics.note].filter(Boolean)) {
    const p = document.createElement("p");
    p.textContent = line;
    credits.append(p);
  }
  lyrics.replaceChildren();
  if (!song.lyrics.sections?.length) {
    const p = document.createElement("p");
    p.textContent = "מילות השיר ממתינות להשלמה.";
    lyrics.append(p);
  }
  for (const section of song.lyrics.sections || []) {
    const block = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = section.label;
    block.append(heading);
    for (const line of section.lines) {
      const item = document.createElement("p");
      if (typeof line === "string") item.textContent = line;
      else {
        item.className = "line-review";
        item.textContent = line.note;
      }
      block.append(item);
    }
    lyrics.append(block);
  }
  lyrics.scrollTop = 0;
}

function resetAudio() {
  requestId++;
  wantsPlayback = false;
  loadedId = null;
  audio.pause();
  if (audio.hasAttribute("src")) {
    audio.removeAttribute("src");
    audio.load();
  }
}

function select(index, start = false) {
  const song = songs[index];
  if (!song) return;
  if (selected !== index) {
    resetAudio();
    selected = index;
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${encodeURIComponent(song.id)}`);
    byId("player-title").textContent = song.title;
    byId("artist").textContent = song.performer;
    status.textContent = song.audio ? "" : "ההקלטה ממתינה לשילוב באוסף.";
    updateLyrics(song);
    drawProgress();
    if (mediaSession && "MediaMetadata" in window) {
      mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.performer,
        album: "משה הלל | הקול שנשאר",
        artwork: song.cover ? [{ src: new URL(song.cover, window.location.href).href }] : []
      });
    }
  }
  if (start) startPlayback();
  else drawControls();
}

function stopPlayback() {
  requestId++;
  wantsPlayback = false;
  audio.pause();
  status.textContent = "";
  drawControls();
}

const loadingError = "לא הצלחנו לטעון את ההקלטה. בדקו את החיבור ונסו לנגן שוב.";

async function startPlayback() {
  const song = currentSong();
  if (!song?.audio) return;
  if (loadedId !== song.id || audio.error) {
    loadedId = song.id;
    audio.src = song.audio;
  }
  const attempt = ++requestId;
  wantsPlayback = true;
  status.textContent = "טוען את ההקלטה…";
  drawControls();
  try {
    await audio.play();
    if (attempt === requestId) status.textContent = "";
  } catch (error) {
    if (attempt !== requestId) return;
    wantsPlayback = false;
    status.textContent = error.name === "NotAllowedError"
      ? "לחצו על ניגון כדי להתחיל להאזין." : loadingError;
    drawControls();
  }
}

function move(delta, start) {
  const target = selected + delta;
  if (songs[target]) select(target, start);
  else if (repeatMode === 2 && songs.length > 1) {
    select((target + songs.length) % songs.length, start);
  }
}

function selectPosition(seconds) {
  if (!seek.disabled && Number.isFinite(seconds)) {
    audio.currentTime = Math.min(audio.duration, Math.max(0, seconds));
    drawProgress();
  }
}

function chooseByHash() {
  let id;
  try { id = decodeURIComponent(window.location.hash.slice(1)); }
  catch { id = ""; }
  const index = songs.findIndex(song => song.id === id);
  select(index < 0 ? 0 : index);
}

play.addEventListener("click", () => {
  if (wantsPlayback || !audio.paused) stopPlayback();
  else startPlayback();
});
byId("previous").addEventListener("click", () => move(-1, wantsPlayback || !audio.paused));
byId("next").addEventListener("click", () => move(1, wantsPlayback || !audio.paused));
seek.addEventListener("input", () => selectPosition(Number(seek.value)));

repeat.addEventListener("click", () => {
  repeatMode = (repeatMode + 1) % repeatModes.length;
  audio.loop = repeatMode === 1;
  repeat.textContent = repeatModes[repeatMode];
  repeat.setAttribute("aria-label", `${repeatModes[repeatMode]}. לחיצה למעבר למצב הבא`);
  repeat.dataset.active = String(repeatMode !== 0);
  drawControls();
});
for (const event of ["loadedmetadata", "durationchange", "timeupdate", "emptied"]) {
  audio.addEventListener(event, drawProgress);
}
audio.addEventListener("playing", () => {
  wantsPlayback = false;
  status.textContent = "";
  drawControls();
});
audio.addEventListener("pause", () => {
  if (!audio.ended && !wantsPlayback && !audio.error) status.textContent = "";
  drawControls();
});
for (const event of ["waiting", "stalled"]) {
  audio.addEventListener(event, () => {
    if (loadedId && (wantsPlayback || !audio.paused)) status.textContent = "טוען את ההקלטה…";
  });
}
audio.addEventListener("ended", () => {
  wantsPlayback = false;
  if (continuous.checked) move(1, true);
  drawControls();
});
audio.addEventListener("error", () => {
  if (!loadedId) return;
  wantsPlayback = false;
  status.textContent = loadingError;
  drawControls();
  drawProgress();
});

const toggleLyrics = byId("toggle-lyrics");
function showLyrics(visible) {
  byId("lyric-content").hidden = !visible;
  toggleLyrics.textContent = visible ? "הסתרה" : "הצגה";
  toggleLyrics.setAttribute("aria-expanded", String(visible));
}
toggleLyrics.addEventListener("click", () => showLyrics(byId("lyric-content").hidden));
byId("jump-lyrics").addEventListener("click", () => {
  showLyrics(true);
  byId("lyric-title").scrollIntoView({ block: "start" });
  lyrics.focus({ preventScroll: true });
});
function changeSize(delta) {
  lyricSize = Math.min(2.1, Math.max(1, Math.round((lyricSize + delta) * 100) / 100));
  lyrics.style.setProperty("--lyrics-size", `${lyricSize}rem`);
  byId("smaller").disabled = lyricSize <= 1;
  byId("larger").disabled = lyricSize >= 2.1;
}
byId("smaller").addEventListener("click", () => changeSize(-0.14));
byId("larger").addEventListener("click", () => changeSize(0.14));

byId("share").addEventListener("click", async () => {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  if (navigator.share) {
    try {
      await navigator.share({ title: document.title, url: url.href });
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  const shareUrl = byId("share-url");
  shareUrl.value = url.href;
  byId("share-dialog").showModal();
  shareUrl.select();
});

if (mediaSession) {
  const handlers = {
    play: startPlayback,
    pause: stopPlayback,
    stop: () => { stopPlayback(); selectPosition(0); },
    previoustrack: () => move(-1, wantsPlayback || !audio.paused),
    nexttrack: () => move(1, wantsPlayback || !audio.paused),
    seekto: details => selectPosition(details.seekTime),
    seekbackward: details => selectPosition(audio.currentTime - (details.seekOffset || 10)),
    seekforward: details => selectPosition(audio.currentTime + (details.seekOffset || 10))
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try { mediaSession.setActionHandler(action, handler); }
    catch { /* The current browser does not support this action. */ }
  }
}

async function init() {
  try {
    const response = await fetch("songs.json");
    if (!response.ok) throw new Error("Catalog unavailable");
    const data = await response.json();
    songs = [...data.songs].sort((a, b) => a.order - b.order);
    if (!songs.length) throw new Error("Empty catalog");
    continuous.checked = data.settings?.continuous !== false;
    if (data.portrait?.src) {
      const image = new Image();
      image.alt = data.portrait.alt || "משה הלל";
      image.onload = () => {
        const portrait = byId("portrait");
        portrait.removeAttribute("aria-hidden");
        portrait.replaceChildren(image);
      };
      image.src = data.portrait.src;
    }
    byId("track-count").textContent = `${songs.length} שירים`;
    for (const [index, song] of songs.entries()) {
      const row = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "track";
      for (const [className, text] of [
        ["track-number", String(index + 1).padStart(2, "0")],
        ["track-name", song.title],
        ["track-time", timeLabel(song.duration)]
      ]) {
        const span = document.createElement("span");
        span.className = className;
        span.textContent = text;
        if (className !== "track-name") span.setAttribute("aria-hidden", "true");
        button.append(span);
      }
      button.addEventListener("click", () => select(index, wantsPlayback || !audio.paused));
      row.append(button);
      trackList.append(row);
    }
    chooseByHash();
    window.addEventListener("hashchange", chooseByHash);
  } catch {
    status.textContent = "לא הצלחנו לטעון את רשימת השירים. רעננו את העמוד ונסו שוב.";
  }
}
init();
