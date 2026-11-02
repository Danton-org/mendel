import htmx from "htmx.org";
import "beercss/dist/cdn/beer.min.js";

window.htmx = htmx;

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

window.toggleTheme = function () {
  const isDark = document.body.classList.contains("dark");
  applyTheme(isDark ? "light" : "dark");
};

window.scrollToBottom = function (force = false) {
  const container = document.getElementById("chat-scroll");
  if (!container) return;
  const distanceFromBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;
  if (force || distanceFromBottom < 220) {
    container.scrollTop = container.scrollHeight;
  }
};

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
};

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
      previewIcon.textContent = file.type.startsWith("video/")
        ? "movie"
        : "attach_file";
      previewIcon.style.display = "inline-flex";
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("mendel_theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));

  window.scrollToBottom(true);

  const fileInput = document.getElementById("media-input");
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      updateMediaPreview(file);
    });
  }

  // Support pasting images/videos directly into the chat composer
  document.addEventListener("paste", (e) => {
    if (!e.clipboardData || !e.clipboardData.files || !e.clipboardData.files.length) {
      return;
    }
    const file = e.clipboardData.files[0];
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      const input = document.getElementById("media-input");
      if (input) {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        updateMediaPreview(file);
      }
    }
  });

  // Connect to Server-Sent Events for live incoming messages and status updates
  let lastVersion = -1;
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

document.addEventListener("htmx:afterRequest", (evt) => {
  const elt = evt.detail.elt;
  if (elt && elt.id === "chat-form" && evt.detail.successful) {
    const textInput = document.getElementById("message-text-input");
    if (textInput) {
      textInput.value = "";
      textInput.focus();
    }
    window.clearMediaSelection();
    window.scrollToBottom(true);
  }
});

document.addEventListener("htmx:afterSwap", (evt) => {
  if (evt.detail.target && evt.detail.target.id === "chat-messages") {
    window.scrollToBottom(false);
  }
});
