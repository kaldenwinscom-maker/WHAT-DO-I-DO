/**
 * Voice Recorder app logic: mic capture, waveform visualization,
 * recording list rendering, playback, and IndexedDB persistence.
 */
(() => {
  "use strict";

  // ---------- DOM refs ----------
  const recordBtn = document.getElementById("recordBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const timerEl = document.getElementById("timer");
  const visualizer = document.getElementById("visualizer");
  const visCtx = visualizer.getContext("2d");
  const errorBanner = document.getElementById("errorBanner");
  const recordingsList = document.getElementById("recordingsList");
  const emptyState = document.getElementById("emptyState");
  const recordingTemplate = document.getElementById("recordingTemplate");
  const tagFilterButtons = document.querySelectorAll(".tag-filter");
  const trashToggle = document.getElementById("trashToggle");
  const trashCountEl = document.getElementById("trashCount");
  const trashSection = document.getElementById("trashSection");
  const trashList = document.getElementById("trashList");
  const trashEmptyState = document.getElementById("trashEmptyState");

  const TAGS = {
    work: { label: "Work", color: "#5b8cff" },
    personal: { label: "Personal", color: "#35c76a" },
    idea: { label: "Idea", color: "#f5a623" },
  };
  const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
  let activeTagFilter = "all";

  // ---------- Recording state ----------
  let mediaStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let audioContext = null;
  let analyser = null;
  let sourceNode = null;
  let animationFrameId = null;

  let recordState = "idle"; // idle | recording | paused
  let elapsedMs = 0;
  let timerStartedAt = 0;
  let timerIntervalId = null;

  // Track which recording item is currently playing so we can pause it
  // when another one starts.
  let currentlyPlayingAudio = null;

  // ---------- Utility ----------
  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
  }

  function clearError() {
    errorBanner.hidden = true;
    errorBanner.textContent = "";
  }

  function setStatus(state) {
    recordState = state;
    statusDot.className = "status-dot";
    recordBtn.classList.remove("is-recording", "is-paused");

    if (state === "idle") {
      statusDot.classList.add("status-dot--idle");
      statusText.textContent = "Idle";
      recordBtn.setAttribute("aria-label", "Start recording");
      pauseBtn.disabled = true;
    } else if (state === "recording") {
      statusDot.classList.add("status-dot--recording");
      statusText.textContent = "Recording";
      recordBtn.classList.add("is-recording");
      recordBtn.setAttribute("aria-label", "Stop recording");
      pauseBtn.disabled = false;
      pauseBtn.setAttribute("aria-label", "Pause recording");
    } else if (state === "paused") {
      statusDot.classList.add("status-dot--paused");
      statusText.textContent = "Paused";
      recordBtn.classList.add("is-paused");
      recordBtn.setAttribute("aria-label", "Stop recording");
      pauseBtn.disabled = false;
      pauseBtn.setAttribute("aria-label", "Resume recording");
    }
  }

  // ---------- Timer ----------
  function startTimer() {
    timerStartedAt = performance.now() - elapsedMs;
    timerIntervalId = setInterval(() => {
      elapsedMs = performance.now() - timerStartedAt;
      timerEl.textContent = formatTime(elapsedMs / 1000);
    }, 200);
  }

  function stopTimer() {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }

  function resetTimer() {
    stopTimer();
    elapsedMs = 0;
    timerEl.textContent = "00:00";
  }

  // ---------- Waveform visualizer ----------
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    visualizer.width = visualizer.clientWidth * dpr;
    visualizer.height = visualizer.clientHeight * dpr;
    visCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawIdleLine() {
    resizeCanvas();
    const w = visualizer.clientWidth;
    const h = visualizer.clientHeight;
    visCtx.clearRect(0, 0, w, h);
    visCtx.strokeStyle = "#2a2f3a";
    visCtx.lineWidth = 2;
    visCtx.beginPath();
    visCtx.moveTo(0, h / 2);
    visCtx.lineTo(w, h / 2);
    visCtx.stroke();
  }

  function drawVisualizer() {
    if (!analyser) return;
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    const w = visualizer.clientWidth;
    const h = visualizer.clientHeight;

    function render() {
      animationFrameId = requestAnimationFrame(render);
      analyser.getByteTimeDomainData(dataArray);

      visCtx.clearRect(0, 0, w, h);
      visCtx.lineWidth = 2;
      visCtx.strokeStyle = recordState === "paused" ? "#f5a623" : "#ff4d4f";
      visCtx.beginPath();

      const sliceWidth = w / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * h) / 2;
        if (i === 0) visCtx.moveTo(x, y);
        else visCtx.lineTo(x, y);
        x += sliceWidth;
      }
      visCtx.lineTo(w, h / 2);
      visCtx.stroke();
    }
    render();
  }

  function stopVisualizer() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    drawIdleLine();
  }

  // ---------- Recording flow ----------
  async function startRecording() {
    clearError();
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      handleMicError(err);
      return;
    }

    // Set up Web Audio analyser for the live visualizer.
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    sourceNode.connect(analyser);

    const mimeType = pickSupportedMimeType();
    mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
    recordedChunks = [];

    mediaRecorder.addEventListener("dataavailable", (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    });

    mediaRecorder.addEventListener("stop", onRecordingStop);

    mediaRecorder.start();
    elapsedMs = 0;
    startTimer();
    drawVisualizer();
    setStatus("recording");
  }

  function pickSupportedMimeType() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
    ];
    return candidates.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type));
  }

  function togglePause() {
    if (!mediaRecorder) return;
    if (recordState === "recording") {
      mediaRecorder.pause();
      stopTimer();
      setStatus("paused");
    } else if (recordState === "paused") {
      mediaRecorder.resume();
      startTimer();
      setStatus("recording");
    }
  }

  function stopRecording() {
    if (!mediaRecorder) return;
    if (mediaRecorder.state === "inactive") return;
    mediaRecorder.stop();
  }

  async function onRecordingStop() {
    stopTimer();
    stopVisualizer();

    const finalDurationSeconds = elapsedMs / 1000;

    // Tear down audio graph / mic stream.
    if (sourceNode) sourceNode.disconnect();
    if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
    if (audioContext) audioContext.close();
    sourceNode = null;
    analyser = null;
    mediaStream = null;
    audioContext = null;

    const blobType = mediaRecorder && mediaRecorder.mimeType ? mediaRecorder.mimeType : "audio/webm";
    const blob = new Blob(recordedChunks, { type: blobType });
    recordedChunks = [];
    mediaRecorder = null;

    resetTimer();
    setStatus("idle");

    if (blob.size === 0) return; // nothing captured (e.g. instantly cancelled)

    const record = {
      id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: `Recording ${new Date().toLocaleString()}`,
      blob,
      mimeType: blobType,
      duration: finalDurationSeconds,
      createdAt: Date.now(),
      notes: "",
      tag: null,
      trashed: false,
      trashedAt: null,
    };

    await RecordingsDB.addRecording(record);
    renderRecordingItem(record, { prepend: true });
    updateEmptyState();
  }

  function handleMicError(err) {
    let message = "Something went wrong accessing your microphone.";
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      message = "Microphone access was denied. Please allow microphone permissions in your browser settings and try again.";
    } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      message = "No microphone was found. Please connect a microphone and try again.";
    } else if (err.name === "NotReadableError") {
      message = "Your microphone is already in use by another application.";
    } else if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      message = "Microphone access requires HTTPS (or localhost). Please serve this app over HTTPS.";
    }
    showError(message);
  }

  // ---------- Record / pause button handlers ----------
  recordBtn.addEventListener("click", () => {
    if (recordState === "idle") startRecording();
    else stopRecording();
  });

  pauseBtn.addEventListener("click", togglePause);

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    const active = document.activeElement;
    // Don't hijack spacebar when the user is typing in a text field.
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
    e.preventDefault();
    if (recordState === "idle") startRecording();
    else stopRecording();
  });

  // ---------- WAV conversion ----------
  async function blobToWavBlob(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const offlineCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer.slice(0));
    offlineCtx.close();
    return audioBufferToWav(audioBuffer);
  }

  function audioBufferToWav(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const numFrames = audioBuffer.length;
    const bytesPerSample = 2; // 16-bit PCM
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = numFrames * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeString(offset, str) {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // audio format = PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); // byte rate
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true); // bits per sample
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    // Interleave channels and write 16-bit PCM samples.
    const channelData = [];
    for (let ch = 0; ch < numChannels; ch++) {
      channelData.push(audioBuffer.getChannelData(ch));
    }

    let offset = 44;
    for (let frame = 0; frame < numFrames; frame++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channelData[ch][frame]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: "audio/wav" });
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function sanitizeFilename(name) {
    return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "recording";
  }

  // ---------- Waveform thumbnails ----------
  let decodingAudioContext = null;
  function getDecodingAudioContext() {
    if (!decodingAudioContext) decodingAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    return decodingAudioContext;
  }

  function computePeaks(audioBuffer, numBars) {
    const channel = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channel.length / numBars));
    const peaks = [];
    for (let i = 0; i < numBars; i++) {
      const start = i * blockSize;
      let max = 0;
      for (let j = 0; j < blockSize && start + j < channel.length; j++) {
        const v = Math.abs(channel[start + j]);
        if (v > max) max = v;
      }
      peaks.push(Math.min(1, max));
    }
    return peaks;
  }

  // ---------- Tag filter / trash toolbar ----------
  function applyTagFilter() {
    recordingsList.querySelectorAll(".recording-item").forEach((node) => {
      const matches = activeTagFilter === "all" || node.dataset.tag === activeTagFilter;
      node.hidden = !matches;
    });
  }

  tagFilterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTagFilter = btn.dataset.tag;
      tagFilterButtons.forEach((b) => b.classList.toggle("is-active", b === btn));
      applyTagFilter();
    });
  });

  trashToggle.addEventListener("click", () => {
    trashSection.hidden = !trashSection.hidden;
  });

  function updateTrashCount() {
    const count = trashList.children.length;
    trashCountEl.textContent = String(count);
    trashEmptyState.hidden = count > 0;
  }

  // ---------- Recordings list rendering ----------
  function updateEmptyState() {
    emptyState.hidden = recordingsList.children.length > 0;
  }

  function renderRecordingItem(record, { prepend = false } = {}) {
    const node = recordingTemplate.content.firstElementChild.cloneNode(true);
    const objectUrl = URL.createObjectURL(record.blob);

    const playBtn = node.querySelector(".play-btn");
    const iconPlay = node.querySelector(".icon-play");
    const iconPause = node.querySelector(".icon-pause");
    const nameInput = node.querySelector(".recording-name");
    const dateEl = node.querySelector(".recording-date");
    const durationEl = node.querySelector(".recording-duration");
    const waveformCanvas = node.querySelector(".waveform-canvas");
    const wfCtx = waveformCanvas.getContext("2d");
    const audioEl = node.querySelector(".audio-el");
    const speedBtns = node.querySelectorAll(".speed-btn");
    const downloadWebmBtn = node.querySelector(".download-webm");
    const downloadWavBtn = node.querySelector(".download-wav");
    const deleteBtn = node.querySelector(".delete-btn");
    const notesToggle = node.querySelector(".notes-toggle");
    const notesSection = node.querySelector(".notes-section");
    const notesList = node.querySelector(".notes-list");
    const notesInput = node.querySelector(".notes-input");
    const tagDots = node.querySelectorAll(".tag-dot");

    node.dataset.id = record.id;
    nameInput.value = record.name;
    dateEl.textContent = new Date(record.createdAt).toLocaleString();
    durationEl.textContent = formatTime(record.duration || 0);
    audioEl.src = objectUrl;

    // -- Tag --
    function updateTagUI() {
      const color = record.tag && TAGS[record.tag] ? TAGS[record.tag].color : null;
      node.style.setProperty("--tag-color", color || "transparent");
      node.dataset.tag = record.tag || "none";
      tagDots.forEach((dot) => {
        const isSelected = dot.dataset.tag === "none" ? !record.tag : dot.dataset.tag === record.tag;
        dot.classList.toggle("is-selected", isSelected);
      });
    }

    tagDots.forEach((dot) => {
      dot.addEventListener("click", async () => {
        const newTag = dot.dataset.tag === "none" ? null : dot.dataset.tag;
        record.tag = newTag;
        await RecordingsDB.updateRecording(record.id, { tag: newTag });
        updateTagUI();
        applyTagFilter();
      });
    });

    updateTagUI();

    // -- Waveform thumbnail --
    let peaks = null;

    function drawWaveform(progressRatio) {
      if (!peaks) return;
      const dpr = window.devicePixelRatio || 1;
      const w = waveformCanvas.clientWidth;
      const h = waveformCanvas.clientHeight;
      if (w === 0 || h === 0) return;
      waveformCanvas.width = w * dpr;
      waveformCanvas.height = h * dpr;
      wfCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      wfCtx.clearRect(0, 0, w, h);
      const barWidth = w / peaks.length;
      const progressX = progressRatio * w;
      peaks.forEach((peak, i) => {
        const barHeight = Math.max(2, peak * h);
        const x = i * barWidth;
        const y = (h - barHeight) / 2;
        wfCtx.fillStyle = x < progressX ? "#5b8cff" : "#3a3f4a";
        wfCtx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
      });
    }

    async function loadWaveform() {
      try {
        const arrayBuffer = await record.blob.arrayBuffer();
        const audioBuffer = await getDecodingAudioContext().decodeAudioData(arrayBuffer);
        peaks = computePeaks(audioBuffer, 96);
      } catch (err) {
        peaks = new Array(96).fill(0.08);
      }
      drawWaveform(0);
    }
    loadWaveform();

    const waveformResizeObserver = new ResizeObserver(() => {
      drawWaveform(audioEl.duration ? audioEl.currentTime / audioEl.duration : 0);
    });
    waveformResizeObserver.observe(waveformCanvas);

    waveformCanvas.addEventListener("click", (e) => {
      if (!audioEl.duration) return;
      const rect = waveformCanvas.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      audioEl.currentTime = ratio * audioEl.duration;
      drawWaveform(ratio);
    });

    // -- Playback speed --
    speedBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        audioEl.playbackRate = parseFloat(btn.dataset.speed);
        speedBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
      });
    });

    // -- Playback --
    playBtn.addEventListener("click", () => {
      if (audioEl.paused) {
        if (currentlyPlayingAudio && currentlyPlayingAudio !== audioEl) {
          currentlyPlayingAudio.pause();
        }
        audioEl.play();
        currentlyPlayingAudio = audioEl;
      } else {
        audioEl.pause();
      }
    });

    audioEl.addEventListener("play", () => {
      iconPlay.hidden = true;
      iconPause.hidden = false;
    });

    audioEl.addEventListener("pause", () => {
      iconPlay.hidden = false;
      iconPause.hidden = true;
    });

    audioEl.addEventListener("ended", () => {
      iconPlay.hidden = false;
      iconPause.hidden = true;
      drawWaveform(0);
    });

    audioEl.addEventListener("timeupdate", () => {
      if (audioEl.duration) {
        drawWaveform(audioEl.currentTime / audioEl.duration);
      }
    });

    audioEl.addEventListener("loadedmetadata", () => {
      if (isFinite(audioEl.duration) && audioEl.duration > 0) {
        durationEl.textContent = formatTime(audioEl.duration);
      }
    });

    // -- Rename --
    nameInput.addEventListener("change", async () => {
      const newName = nameInput.value.trim() || "Untitled recording";
      nameInput.value = newName;
      await RecordingsDB.updateRecording(record.id, { name: newName });
      record.name = newName;
    });

    // -- Download --
    downloadWebmBtn.addEventListener("click", () => {
      const ext = record.mimeType.includes("ogg") ? "ogg" : "webm";
      triggerDownload(record.blob, `${sanitizeFilename(nameInput.value)}.${ext}`);
    });

    downloadWavBtn.addEventListener("click", async () => {
      downloadWavBtn.disabled = true;
      downloadWavBtn.textContent = "⭳ Converting…";
      try {
        const wavBlob = await blobToWavBlob(record.blob);
        triggerDownload(wavBlob, `${sanitizeFilename(nameInput.value)}.wav`);
      } catch (err) {
        showError("Couldn't convert this recording to WAV in your browser.");
      } finally {
        downloadWavBtn.disabled = false;
        downloadWavBtn.textContent = "⭳ WAV";
      }
    });

    // -- Notes (bullet list per recording) --
    function notesLines() {
      return (record.notes || "").split("\n").map((line) => line.trim()).filter(Boolean);
    }

    function markHasNotes() {
      notesToggle.classList.toggle("is-active", notesLines().length > 0);
    }

    function showNotesView() {
      const lines = notesLines();
      notesList.innerHTML = "";
      if (lines.length === 0) {
        const li = document.createElement("li");
        li.className = "notes-empty";
        li.textContent = "No notes yet — click to add some.";
        notesList.appendChild(li);
      } else {
        lines.forEach((line) => {
          const li = document.createElement("li");
          li.textContent = line;
          notesList.appendChild(li);
        });
      }
      notesList.hidden = false;
      notesInput.hidden = true;
    }

    function showNotesEditor() {
      notesInput.value = record.notes || "";
      notesList.hidden = true;
      notesInput.hidden = false;
      notesInput.focus();
    }

    notesToggle.addEventListener("click", () => {
      const opening = notesSection.hidden;
      notesSection.hidden = !opening;
      if (opening) {
        if (notesLines().length > 0) showNotesView();
        else showNotesEditor();
      }
    });

    notesList.addEventListener("click", showNotesEditor);

    notesInput.addEventListener("blur", async () => {
      const newNotes = notesInput.value;
      if (newNotes !== record.notes) {
        record.notes = newNotes;
        await RecordingsDB.updateRecording(record.id, { notes: newNotes });
        markHasNotes();
      }
      showNotesView();
    });

    markHasNotes();

    // -- Delete (moves to trash, recoverable for a while) --
    deleteBtn.addEventListener("click", async () => {
      record.trashed = true;
      record.trashedAt = Date.now();
      await RecordingsDB.updateRecording(record.id, { trashed: true, trashedAt: record.trashedAt });
      waveformResizeObserver.disconnect();
      URL.revokeObjectURL(objectUrl);
      node.remove();
      updateEmptyState();
      renderTrashItem(record, { prepend: true });
      updateTrashCount();
    });

    if (prepend) recordingsList.prepend(node);
    else recordingsList.appendChild(node);
    applyTagFilter();
  }

  // ---------- Trash ----------
  function renderTrashItem(record, { prepend = false } = {}) {
    const node = document.createElement("li");
    node.className = "recording-item recording-item--trashed";

    const top = document.createElement("div");
    top.className = "recording-item__top";

    const meta = document.createElement("div");
    meta.className = "recording-item__meta";

    const nameEl = document.createElement("div");
    nameEl.className = "recording-name";
    nameEl.style.padding = "2px 6px";
    nameEl.textContent = record.name;

    const sub = document.createElement("div");
    sub.className = "recording-sub";
    sub.textContent = `${new Date(record.createdAt).toLocaleString()} • ${formatTime(record.duration || 0)}`;

    meta.appendChild(nameEl);
    meta.appendChild(sub);
    top.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "recording-item__actions";

    const restoreBtn = document.createElement("button");
    restoreBtn.className = "icon-action restore-btn";
    restoreBtn.textContent = "↺ Restore";
    restoreBtn.addEventListener("click", async () => {
      record.trashed = false;
      record.trashedAt = null;
      await RecordingsDB.updateRecording(record.id, { trashed: false, trashedAt: null });
      node.remove();
      updateTrashCount();
      renderRecordingItem(record, { prepend: true });
      updateEmptyState();
    });

    const deleteForeverBtn = document.createElement("button");
    deleteForeverBtn.className = "icon-action delete-forever-btn";
    deleteForeverBtn.textContent = "🗑 Delete Forever";
    deleteForeverBtn.addEventListener("click", async () => {
      if (!confirm(`Permanently delete "${record.name}"? This can't be undone.`)) return;
      await RecordingsDB.deleteRecording(record.id);
      node.remove();
      updateTrashCount();
    });

    actions.appendChild(restoreBtn);
    actions.appendChild(deleteForeverBtn);

    node.appendChild(top);
    node.appendChild(actions);

    if (prepend) trashList.prepend(node);
    else trashList.appendChild(node);
  }

  // ---------- Init ----------
  async function init() {
    drawIdleLine();
    window.addEventListener("resize", () => {
      if (recordState === "idle") drawIdleLine();
    });

    if (!navigator.mediaDevices || !window.MediaRecorder) {
      showError("Your browser doesn't support audio recording (MediaRecorder API). Try the latest Chrome, Firefox, Edge, or Safari.");
      recordBtn.disabled = true;
    }

    setStatus("idle");

    try {
      const existing = await RecordingsDB.getAllRecordings();
      const now = Date.now();
      for (const record of existing) {
        const expired = record.trashed && record.trashedAt && now - record.trashedAt > TRASH_RETENTION_MS;
        if (expired) {
          await RecordingsDB.deleteRecording(record.id);
          continue;
        }
        if (record.trashed) renderTrashItem(record);
        else renderRecordingItem(record);
      }
    } catch (err) {
      showError("Couldn't load saved recordings from local storage.");
    }
    updateEmptyState();
    updateTrashCount();
  }

  init();
})();
