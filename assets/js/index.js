/**
 * Client-side script for the `mendel` web chat interface.
 *
 * Initializes HTMX and Beer CSS, manages light/dark theme persistence,
 * previews attached images, videos, and audio files, provides WhatsApp-style
 * voice message recording, and listens for live Server-Sent Events.
 *
 * @packageDocumentation
 */

import htmx from "htmx.org";
import "beercss/dist/cdn/beer.min.js";

window.htmx = htmx;

/**
 * Applies the specified color theme (`"light"` or `"dark"`) to the document
 * and persists it in `localStorage`.
 *
 * @param mode - Target theme mode (`"light"` or `"dark"`).
 */
function applyTheme(mode) {
  const isDark = mode === "dark";
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(isDark ? "dark" : "light");
  document.body.classList.remove("light", "dark");
  document.body.classList.add(isDark ? "dark" : "light");
  localStorage.setItem("mendel_theme", isDark ? "dark" : "light");

  const icon = document.getElementById("theme-icon");
  if (icon) {
    icon.textContent = isDark ? "light_mode" : "dark_mode";
  }
}

/**
 * Toggles the active theme between `"light"` and `"dark"`.
 */
window.toggleTheme = function () {
  const isDark = document.body.classList.contains("dark");
  applyTheme(isDark ? "light" : "dark");
};

/**
 * Tracks whether `#chat-scroll` was near the bottom before DOM updates or swaps.
 */
let wasAtBottom = true;

/**
 * Checks whether `#chat-scroll` is currently scrolled within threshold of the bottom.
 *
 * @param threshold - Distance in pixels from bottom considered "at the bottom" (default 120).
 * @returns Whether the user is near the bottom.
 */
function isAtBottom(threshold = 120) {
  const container = document.getElementById("chat-scroll");
  if (!container) return true;
  const dist =
    container.scrollHeight - container.scrollTop - container.clientHeight;
  return dist <= threshold;
}

/**
 * Updates the tracked `wasAtBottom` flag based on current scroll position.
 */
function updateWasAtBottom() {
  wasAtBottom = isAtBottom(120);
}

/**
 * Scrolls the `#chat-scroll` message feed to the bottom when near the end or
 * when `force` is `true`.
 *
 * @param force - Whether to scroll unconditionally regardless of current scroll position.
 */
window.scrollToBottom = function (force = false) {
  const container = document.getElementById("chat-scroll");
  if (!container) return;
  if (force || wasAtBottom) {
    container.scrollTop = container.scrollHeight;
    wasAtBottom = true;
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }
};

/**
 * Toggles visibility between the send button and the voice recording button
 * based on whether text has been entered, media is attached, or voice recording
 * is active.
 */
function updateComposerButtons() {
  const textInput = document.getElementById("message-text-input");
  const fileInput = document.getElementById("media-input");
  const sendBtn = document.getElementById("send-button");
  const micBtn = document.getElementById("mic-button");
  const voiceBar = document.getElementById("voice-recording-bar");

  if (!sendBtn || !micBtn) return;

  const isRecording = voiceBar && voiceBar.classList.contains("active");
  if (isRecording) {
    sendBtn.style.display = "inline-flex";
    micBtn.style.display = "none";
    return;
  }

  const hasText = Boolean(textInput && textInput.value.trim().length > 0);
  const hasFile = Boolean(
    fileInput && fileInput.files && fileInput.files.length > 0
  );

  if (hasText || hasFile) {
    sendBtn.style.display = "inline-flex";
    micBtn.style.display = "none";
  } else {
    sendBtn.style.display = "none";
    micBtn.style.display = "inline-flex";
  }
}

/**
 * Clears the selected media file input and hides `#media-preview-bar`.
 */
window.clearMediaSelection = function () {
  const fileInput = document.getElementById("media-input");
  const previewBar = document.getElementById("media-preview-bar");
  const previewName = document.getElementById("media-preview-name");
  const previewThumb = document.getElementById("media-preview-thumb");
  const previewIcon = document.getElementById("media-preview-icon");

  if (fileInput) fileInput.value = "";
  if (previewBar) previewBar.classList.remove("active");
  if (previewName) previewName.textContent = "";
  if (previewThumb) {
    previewThumb.removeAttribute("src");
    previewThumb.style.display = "none";
  }
  if (previewIcon) {
    previewIcon.style.display = "inline-flex";
  }

  updateComposerButtons();
};

/**
 * Updates `#media-preview-bar` with the selected image, video, or audio file
 * metadata and thumbnail.
 *
 * @param file - Selected `File` object, or `undefined` to clear the preview.
 */
function updateMediaPreview(file) {
  const previewBar = document.getElementById("media-preview-bar");
  const previewName = document.getElementById("media-preview-name");
  const previewThumb = document.getElementById("media-preview-thumb");
  const previewIcon = document.getElementById("media-preview-icon");

  if (!file) {
    window.clearMediaSelection();
    return;
  }

  const sizeKb = (file.size / 1024).toFixed(1);
  if (previewName) {
    previewName.textContent = `${file.name} (${sizeKb} KB)`;
  }
  if (previewBar) {
    previewBar.classList.add("active");
  }

  if (file.type.startsWith("image/") && previewThumb) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewThumb.src = e.target.result;
      previewThumb.style.display = "block";
      if (previewIcon) previewIcon.style.display = "none";
    };
    reader.readAsDataURL(file);
  } else {
    if (previewThumb) previewThumb.style.display = "none";
    if (previewIcon) {
      if (file.type.startsWith("video/")) {
        previewIcon.textContent = "movie";
      } else if (file.type.startsWith("audio/")) {
        previewIcon.textContent = "audiotrack";
      } else {
        previewIcon.textContent = "attach_file";
      }
      previewIcon.style.display = "inline-flex";
    }
  }

  updateComposerButtons();
}

/** Active `MediaRecorder` instance during audio recording. */
let activeMediaRecorder = null;
/** Recorded audio data chunks. */
let recordedAudioChunks = [];
/** Timer interval ID for updating recording duration. */
let recordingTimerInterval = null;
/** Timestamp in milliseconds when the current recording started. */
let recordingStartTimeMs = 0;
/** Completed `Blob` of recorded audio. */
let recordedAudioBlob = null;
/** Active microphone `MediaStream`. */
let activeAudioStream = null;

/**
 * Resolves the preferred audio container MIME type supported by the browser.
 *
 * @returns Supported audio MIME type string.
 */
function getSupportedAudioMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
  ];
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return "";
  }
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return "";
}

/**
 * Formats a duration in seconds as an `MM:SS` timer string.
 *
 * @param totalSeconds - Elapsed time in seconds.
 * @returns Formatted `MM:SS` string.
 */
function formatRecordingDuration(totalSeconds) {
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const secs = String(totalSeconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

/**
 * Initiates audio recording via the browser's `MediaRecorder` API and
 * transitions the composer into the WhatsApp-style recording bar.
 *
 * @returns Promise that resolves once recording has started.
 */
async function startVoiceRecording() {
  if (
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    const form = document.getElementById("chat-form");
    const errorMsg =
      form?.getAttribute("data-mic-error") ||
      "Microphone access is not supported by your browser or in this context.";
    alert(errorMsg);
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    activeAudioStream = stream;
    recordedAudioChunks = [];
    recordedAudioBlob = null;

    const mimeType = getSupportedAudioMimeType();
    const options = mimeType ? { mimeType } : undefined;
    activeMediaRecorder = new MediaRecorder(stream, options);

    activeMediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedAudioChunks.push(event.data);
      }
    };

    activeMediaRecorder.onstop = () => {
      const finalType =
        activeMediaRecorder?.mimeType || mimeType || "audio/webm";
      recordedAudioBlob = new Blob(recordedAudioChunks, { type: finalType });
      const previewAudio = document.getElementById("voice-preview-audio");
      if (previewAudio) {
        previewAudio.src = URL.createObjectURL(recordedAudioBlob);
      }
    };

    activeMediaRecorder.start(200);

    const textWrapper = document.getElementById("composer-text-wrapper");
    const attachBtn = document.getElementById("attach-button");
    const voiceBar = document.getElementById("voice-recording-bar");
    const voiceStatus = document.getElementById("voice-status");
    const previewAudio = document.getElementById("voice-preview-audio");
    const stopBtn = document.getElementById("voice-stop-btn");
    const timer = document.getElementById("voice-timer");

    if (textWrapper) textWrapper.style.display = "none";
    if (attachBtn) attachBtn.style.display = "none";
    if (voiceBar) {
      voiceBar.classList.add("active");
      voiceBar.style.display = "flex";
    }
    if (voiceStatus) voiceStatus.style.display = "flex";
    if (previewAudio) {
      previewAudio.pause();
      previewAudio.removeAttribute("src");
      previewAudio.style.display = "none";
    }
    if (stopBtn) stopBtn.style.display = "inline-flex";
    if (timer) timer.textContent = "00:00";

    updateComposerButtons();

    recordingStartTimeMs = Date.now();
    if (recordingTimerInterval) clearInterval(recordingTimerInterval);
    recordingTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartTimeMs) / 1000);
      if (timer) timer.textContent = formatRecordingDuration(elapsed);
    }, 500);
  } catch (err) {
    const form = document.getElementById("chat-form");
    const errorMsg =
      form?.getAttribute("data-mic-error") ||
      "Microphone access was denied or is not available.";
    alert(errorMsg);
    cancelVoiceRecording();
  }
}

/**
 * Stops live audio recording and switches the recording bar to audio preview
 * mode, allowing the user to listen to their voice message before sending.
 */
function stopVoiceRecordingForPreview() {
  if (recordingTimerInterval) {
    clearInterval(recordingTimerInterval);
    recordingTimerInterval = null;
  }

  if (activeMediaRecorder && activeMediaRecorder.state === "recording") {
    activeMediaRecorder.stop();
  }

  if (activeAudioStream) {
    activeAudioStream.getTracks().forEach((track) => track.stop());
    activeAudioStream = null;
  }

  const voiceStatus = document.getElementById("voice-status");
  const previewAudio = document.getElementById("voice-preview-audio");
  const stopBtn = document.getElementById("voice-stop-btn");

  if (voiceStatus) voiceStatus.style.display = "none";
  if (stopBtn) stopBtn.style.display = "none";
  if (previewAudio) previewAudio.style.display = "inline-flex";
}

/**
 * Cancels active audio recording, discards any captured audio data, stops the
 * microphone stream, and restores the standard composer view.
 */
function cancelVoiceRecording() {
  if (recordingTimerInterval) {
    clearInterval(recordingTimerInterval);
    recordingTimerInterval = null;
  }

  if (activeMediaRecorder && activeMediaRecorder.state !== "inactive") {
    try {
      activeMediaRecorder.stop();
    } catch {
      // ignore
    }
  }

  if (activeAudioStream) {
    activeAudioStream.getTracks().forEach((track) => track.stop());
    activeAudioStream = null;
  }

  recordedAudioChunks = [];
  recordedAudioBlob = null;
  activeMediaRecorder = null;

  const textWrapper = document.getElementById("composer-text-wrapper");
  const attachBtn = document.getElementById("attach-button");
  const voiceBar = document.getElementById("voice-recording-bar");
  const previewAudio = document.getElementById("voice-preview-audio");

  if (previewAudio) {
    previewAudio.pause();
    previewAudio.removeAttribute("src");
    previewAudio.style.display = "none";
  }

  if (voiceBar) {
    voiceBar.classList.remove("active");
    voiceBar.style.display = "none";
  }

  if (textWrapper) textWrapper.style.display = "";
  if (attachBtn) attachBtn.style.display = "";

  updateComposerButtons();
}

/**
 * Finalizes the audio recording (if still in progress), attaches the audio
 * file to `#media-input`, and submits the form to `/ui/send`.
 *
 * @returns Promise that resolves once the recording has been submitted.
 */
async function finishAndSendVoiceRecording() {
  if (activeMediaRecorder && activeMediaRecorder.state === "recording") {
    if (recordingTimerInterval) {
      clearInterval(recordingTimerInterval);
      recordingTimerInterval = null;
    }

    await new Promise((resolve) => {
      if (!activeMediaRecorder) {
        resolve(null);
        return;
      }
      activeMediaRecorder.onstop = () => {
        const mimeType =
          activeMediaRecorder?.mimeType ||
          getSupportedAudioMimeType() ||
          "audio/webm";
        recordedAudioBlob = new Blob(recordedAudioChunks, { type: mimeType });
        resolve(null);
      };
      activeMediaRecorder.stop();
    });
  }

  if (activeAudioStream) {
    activeAudioStream.getTracks().forEach((track) => track.stop());
    activeAudioStream = null;
  }

  if (!recordedAudioBlob || recordedAudioBlob.size === 0) {
    cancelVoiceRecording();
    return;
  }

  let mimeType = recordedAudioBlob.type || "audio/ogg";
  if (mimeType.startsWith("video/")) {
    mimeType = mimeType.replace(/^video\//, "audio/");
  }
  let extension = "ogg";
  if (mimeType.includes("mp4")) {
    extension = "mp4";
  } else if (mimeType.includes("webm")) {
    extension = "webm";
  } else if (mimeType.includes("opus") || mimeType.includes("ogg")) {
    extension = "ogg";
  }

  const audioFile = new File([recordedAudioBlob], `voice-message.${extension}`, {
    type: mimeType,
  });

  const textInput = document.getElementById("message-text-input");
  const caption = textInput && textInput.value ? textInput.value.trim() : "";

  const formData = new FormData();
  formData.append("media", audioFile, `voice-message.${extension}`);
  formData.append("mediaType", "audio");
  if (caption) {
    formData.append("text", caption);
  }

  cancelVoiceRecording();

  try {
    const response = await fetch("/ui/send", {
      method: "POST",
      body: formData,
    });
    if (response.ok) {
      const html = await response.text();
      const messagesContainer = document.getElementById("chat-messages");
      if (messagesContainer) {
        messagesContainer.innerHTML = html;
        window.scrollToBottom(true);
      }
      if (textInput) {
        textInput.value = "";
      }
      window.clearMediaSelection();
      updateComposerButtons();
    }
  } catch (err) {
    console.error("Failed to send voice recording:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("mendel_theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));

  window.scrollToBottom(true);
  updateComposerButtons();

  const scrollContainer = document.getElementById("chat-scroll");
  if (scrollContainer) {
    scrollContainer.addEventListener("scroll", updateWasAtBottom, {
      passive: true,
    });
  }

  const messagesContainer = document.getElementById("chat-messages");
  if (messagesContainer && typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      if (wasAtBottom) {
        window.scrollToBottom(true);
      }
    });
    ro.observe(messagesContainer);
  }

  const fileInput = document.getElementById("media-input");
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      updateMediaPreview(file);
    });
  }

  const textInput = document.getElementById("message-text-input");
  if (textInput) {
    textInput.addEventListener("input", updateComposerButtons);
  }

  const micBtn = document.getElementById("mic-button");
  if (micBtn) {
    micBtn.addEventListener("click", () => {
      void startVoiceRecording();
    });
  }

  const voiceCancelBtn = document.getElementById("voice-cancel-btn");
  if (voiceCancelBtn) {
    voiceCancelBtn.addEventListener("click", cancelVoiceRecording);
  }

  const voiceStopBtn = document.getElementById("voice-stop-btn");
  if (voiceStopBtn) {
    voiceStopBtn.addEventListener("click", stopVoiceRecordingForPreview);
  }

  const chatForm = document.getElementById("chat-form");
  if (chatForm) {
    chatForm.addEventListener("submit", (event) => {
      const voiceBar = document.getElementById("voice-recording-bar");
      if (voiceBar && voiceBar.classList.contains("active")) {
        event.preventDefault();
        event.stopPropagation();
        void finishAndSendVoiceRecording();
      }
    });
  }

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (
      !target ||
      !(target instanceof HTMLInputElement) ||
      !target.classList.contains("poll-checkbox")
    ) {
      return;
    }

    const form = target.closest(".poll-form");
    if (!form) return;

    const container = form.querySelector("[data-poll-selectable]");
    const max = container
      ? parseInt(container.getAttribute("data-poll-selectable") || "0", 10)
      : 0;

    const checkedBoxes = Array.from(
      form.querySelectorAll(".poll-checkbox:checked")
    );

    if (max > 0 && checkedBoxes.length > max) {
      target.checked = false;
    }

    const allBoxes = form.querySelectorAll(".poll-checkbox");
    for (const box of allBoxes) {
      if (box instanceof HTMLInputElement) {
        const label = box.closest(".poll-checkbox-label");
        if (label) {
          label.classList.toggle("voted", box.checked);
        }
      }
    }

    const submitBtn = form.querySelector(".poll-vote-btn");
    if (submitBtn instanceof HTMLButtonElement) {
      const remainingChecked = form.querySelectorAll(
        ".poll-checkbox:checked"
      ).length;
      submitBtn.disabled = remainingChecked === 0;
    }
  });

  document.addEventListener("paste", (e) => {
    if (
      !e.clipboardData ||
      !e.clipboardData.files ||
      !e.clipboardData.files.length
    ) {
      return;
    }
    const file = e.clipboardData.files[0];
    if (
      file.type.startsWith("image/") ||
      file.type.startsWith("video/") ||
      file.type.startsWith("audio/")
    ) {
      const input = document.getElementById("media-input");
      if (input && typeof DataTransfer !== "undefined") {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        updateMediaPreview(file);
      }
    }
  });

  let lastVersion = -1;
  /**
   * Connects to `/api/events` SSE stream and triggers an HTMX refresh whenever
   * the server message state version advances.
   */
  function connectSSE() {
    const es = new EventSource("/api/events");
    es.addEventListener("version", (evt) => {
      const nextVersion = Number(evt.data);
      if (lastVersion !== -1 && nextVersion !== lastVersion) {
        htmx.trigger(document.body, "mendel:refresh");
      }
      lastVersion = nextVersion;
    });
    es.onerror = () => {
      es.close();
      setTimeout(connectSSE, 1500);
    };
  }
  connectSSE();
});

document.addEventListener("htmx:beforeSwap", (evt) => {
  if (evt.detail.target && evt.detail.target.id === "chat-messages") {
    updateWasAtBottom();
  }
});

document.addEventListener("htmx:afterRequest", (evt) => {
  const elt = evt.detail.elt;
  if (elt && elt.id === "chat-form" && evt.detail.successful) {
    const textInput = document.getElementById("message-text-input");
    if (textInput) {
      textInput.value = "";
      textInput.focus();
    }
    window.clearMediaSelection();
    updateComposerButtons();
    window.scrollToBottom(true);
  }
});

document.addEventListener("htmx:afterSwap", (evt) => {
  if (evt.detail.target && evt.detail.target.id === "chat-messages") {
    if (wasAtBottom) {
      window.scrollToBottom(true);
    }
  }
});
