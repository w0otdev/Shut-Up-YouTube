"use strict";
document.addEventListener("DOMContentLoaded", async () => {
  const toggleKeys = {
    adblockToggle: "su_adblockFix", warningToggle: "su_warningBypass",
    playablesToggle: "su_hidePlayables", logoToggle: "su_premiumLogo",
    shortsToggle: "su_hideShorts", aiToggle: "su_hideAI",
    enableToggle: "ytvr_enabled", autoStretchToggle: "ytvr_autoStretch"
  };
  const ratios = [...document.querySelectorAll(".ratio-btn")];
  const status = document.getElementById("pageStatus");
  const error = document.getElementById("saveError");
  let settings = SU_SETTINGS.normalize();
  let ready = false;

  function render() {
    for (const [id, key] of Object.entries(toggleKeys)) {
      const input = document.getElementById(id);
      input.checked = settings[key];
      input.disabled = !ready || (id === "autoStretchToggle" && !settings.ytvr_enabled);
      input.setAttribute("aria-label", input.closest(".row").querySelector(".row-title").textContent);
    }
    document.getElementById("controlsSection").style.opacity = settings.ytvr_enabled ? "1" : "0.4";
    for (const button of ratios) {
      const active = button.dataset.ratio === settings.ytvr_ratio;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      button.disabled = !ready || !settings.ytvr_enabled;
    }
  }

  async function updateStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const result = await chrome.tabs.sendMessage(tab.id, { type: "su-status" }, { frameId: 0 });
      status.textContent = [result.warning?.message, result.playback, result.stretch].filter(Boolean).join(" ");
    } catch {
      status.textContent = "Open or reload a YouTube tab to apply this extension.";
    }
  }

  async function save(patch) {
    settings = SU_SETTINGS.normalize({ ...settings, ...patch });
    render();
    try {
      await chrome.storage.sync.set(patch);
      error.textContent = "";
      await updateStatus();
    } catch {
      error.textContent = "Settings could not be saved. Please try again.";
      settings = SU_SETTINGS.normalize(await chrome.storage.sync.get(Object.keys(SU_SETTINGS.defaults)).catch(() => ({})));
      render();
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const key of Object.keys(SU_SETTINGS.defaults)) {
      if (changes[key]) settings[key] = changes[key].newValue;
    }
    settings = SU_SETTINGS.normalize(settings);
    render();
    updateStatus();
  });
  for (const [id, key] of Object.entries(toggleKeys)) {
    document.getElementById(id).addEventListener("change", event => save({ [key]: event.target.checked }));
  }
  for (const button of ratios) button.addEventListener("click", () => save({ ytvr_ratio: button.dataset.ratio }));
  render();
  try {
    settings = SU_SETTINGS.normalize(await chrome.storage.sync.get(Object.keys(SU_SETTINGS.defaults)));
    ready = true;
    render();
  } catch { error.textContent = "Could not load settings. Reopen the popup to retry."; }
  updateStatus();
  setInterval(updateStatus, 1500);
});
