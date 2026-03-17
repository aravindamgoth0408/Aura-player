const DB_NAME = "aura_music_db";
const STORE_NAME = "tracks";
const audio = document.getElementById("audio");
const playBtn = document.getElementById("play-btn");
const playIcon = document.getElementById("play-icon");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const shuffleBtn = document.getElementById("shuffle-btn");
const repeatBtn = document.getElementById("repeat-btn");
const muteBtn = document.getElementById("mute-btn");
const progress = document.getElementById("progress");
const currentTimeEl = document.getElementById("current-time");
const totalTimeEl = document.getElementById("total-time");
const volume = document.getElementById("volume");
const nowTitle = document.getElementById("now-title");
const nowArtist = document.getElementById("now-artist");
const trackList = document.getElementById("track-list");
const trackCount = document.getElementById("track-count");
const songForm = document.getElementById("song-form");
const toastEl = document.getElementById("toast");

let db;
let tracks = [];
let currentIndex = -1;
let isShuffle = false;
let isRepeat = false;
let toastTimer;

async function init() {
  db = await openDB();
  tracks = await loadTracks();
  renderTracks();
  if (tracks.length > 0) {
    setTrack(0);
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const upgradeDb = event.target.result;
      if (!upgradeDb.objectStoreNames.contains(STORE_NAME)) {
        upgradeDb.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function loadTracks() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function addTrackToDB(track) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(track);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function updateTrackInDB(track) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(track);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function renderTracks() {
  trackList.innerHTML = "";
  trackCount.textContent = `${tracks.length} track${tracks.length === 1 ? "" : "s"}`;

  tracks.forEach((track, index) => {
    const li = document.createElement("li");
    li.className = `track-item ${index === currentIndex ? "active" : ""}`;

    li.innerHTML = `
      <div class="track-meta">
        <strong>${track.title}</strong>
        <small>${track.artist}</small>
      </div>
      <button class="icon-btn float-play" data-action="play">▶</button>
      <div class="track-actions">
        <button class="icon-btn like-btn ${track.liked ? "liked" : ""}" data-action="like">${track.liked ? "❤" : "♡"}</button>
      </div>
    `;

    li.querySelector('[data-action="play"]').addEventListener("click", () => {
      setTrack(index, true);
      showToast(`Playing ${track.title}`);
    });

    li.querySelector('[data-action="like"]').addEventListener("click", async () => {
      track.liked = !track.liked;
      await updateTrackInDB(track);
      renderTracks();
      showToast(track.liked ? "Added to liked songs" : "Removed from liked songs");
    });

    trackList.appendChild(li);
  });
}

function setTrack(index, autoplay = false) {
  if (!tracks.length) return;
  currentIndex = (index + tracks.length) % tracks.length;
  const track = tracks[currentIndex];
  const blob = new Blob([track.fileData], { type: track.fileType || "audio/mpeg" });
  audio.src = URL.createObjectURL(blob);
  nowTitle.textContent = track.title;
  nowArtist.textContent = track.artist;
  progress.value = 0;
  currentTimeEl.textContent = "0:00";
  totalTimeEl.textContent = track.duration || "--:--";
  renderTracks();

  if (autoplay) {
    playAudio();
  }
}

function playAudio() {
  if (currentIndex < 0 && tracks.length) {
    setTrack(0);
  }
  audio.play();
  playBtn.classList.add("playing");
  document.body.classList.add("playing-state");
  playIcon.textContent = "❚❚";
}

function pauseAudio() {
  audio.pause();
  playBtn.classList.remove("playing");
  document.body.classList.remove("playing-state");
  playIcon.textContent = "▶";
}

function togglePlayback() {
  if (audio.paused) {
    playAudio();
  } else {
    pauseAudio();
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

function nextTrack() {
  if (!tracks.length) return;
  if (isShuffle) {
    const randomIndex = Math.floor(Math.random() * tracks.length);
    setTrack(randomIndex, true);
    return;
  }
  setTrack(currentIndex + 1, true);
}

function prevTrack() {
  if (!tracks.length) return;
  setTrack(currentIndex - 1, true);
}

function showToast(message) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add("show");
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1700);
}

songForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = document.getElementById("title").value.trim();
  const artist = document.getElementById("artist").value.trim();
  const fileInput = document.getElementById("song-file");
  const file = fileInput.files[0];

  if (!file) return;

  const fileBuffer = await file.arrayBuffer();
  const duration = await new Promise((resolve) => {
    const temp = new Audio();
    temp.src = URL.createObjectURL(file);
    temp.addEventListener("loadedmetadata", () => {
      resolve(formatTime(temp.duration));
      URL.revokeObjectURL(temp.src);
    });
    temp.addEventListener("error", () => resolve("--:--"));
  });

  const newTrack = {
    title,
    artist,
    fileData: fileBuffer,
    fileType: file.type,
    duration,
    liked: false,
  };

  const id = await addTrackToDB(newTrack);
  newTrack.id = id;
  tracks.push(newTrack);
  renderTracks();
  if (currentIndex < 0) {
    setTrack(0);
  }
  showToast("Song added to permanent library");
  songForm.reset();
});

playBtn.addEventListener("click", togglePlayback);
nextBtn.addEventListener("click", nextTrack);
prevBtn.addEventListener("click", prevTrack);

shuffleBtn.addEventListener("click", () => {
  isShuffle = !isShuffle;
  shuffleBtn.classList.toggle("active", isShuffle);
  showToast(isShuffle ? "Shuffle enabled" : "Shuffle disabled");
});

repeatBtn.addEventListener("click", () => {
  isRepeat = !isRepeat;
  repeatBtn.classList.toggle("active", isRepeat);
  showToast(isRepeat ? "Repeat enabled" : "Repeat disabled");
});

muteBtn.addEventListener("click", () => {
  audio.muted = !audio.muted;
  muteBtn.textContent = audio.muted ? "🔇" : "🔊";
});

volume.addEventListener("input", () => {
  audio.volume = Number(volume.value);
  if (audio.volume === 0) {
    audio.muted = true;
    muteBtn.textContent = "🔇";
  } else {
    audio.muted = false;
    muteBtn.textContent = "🔊";
  }
});

progress.addEventListener("input", () => {
  if (!audio.duration) return;
  audio.currentTime = (Number(progress.value) / 100) * audio.duration;
});

audio.addEventListener("timeupdate", () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  progress.value = pct;
  currentTimeEl.textContent = formatTime(audio.currentTime);
  totalTimeEl.textContent = formatTime(audio.duration);
});

audio.addEventListener("ended", () => {
  if (isRepeat) {
    audio.currentTime = 0;
    playAudio();
    return;
  }
  nextTrack();
});

window.addEventListener("beforeunload", () => {
  if (audio.src.startsWith("blob:")) {
    URL.revokeObjectURL(audio.src);
  }
});

init().catch((error) => {
  showToast("Database could not be initialized");
  console.error(error);
});
