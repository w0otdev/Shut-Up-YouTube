"use strict";

document.addEventListener("DOMContentLoaded", function () {
  let adblockToggle = document.getElementById("adblockToggle");
  let warningToggle = document.getElementById("warningToggle");
  let playablesToggle = document.getElementById("playablesToggle");
  let logoToggle = document.getElementById("logoToggle");
  let enableToggle = document.getElementById("enableToggle");
  let autoStretchToggle = document.getElementById("autoStretchToggle");
  let ratioButtons = document.querySelectorAll(".ratio-btn");
  let controlsSection = document.getElementById("controlsSection");

  let keys = [
    "su_adblockFix",
    "su_warningBypass",
    "su_hidePlayables",
    "su_premiumLogo",
    "ytvr_enabled",
    "ytvr_ratio",
    "ytvr_autoStretch"
  ];

  function syncUiState() {
    controlsSection.style.opacity = enableToggle.checked ? "1" : "0.4";
    controlsSection.style.pointerEvents = enableToggle.checked ? "auto" : "none";
  }

  chrome.storage.sync.get(keys, function (res) {
    let data = res || {};
    adblockToggle.checked = data.su_adblockFix !== undefined ? data.su_adblockFix : true;
    warningToggle.checked = data.su_warningBypass !== undefined ? data.su_warningBypass : true;
    playablesToggle.checked = data.su_hidePlayables !== undefined ? data.su_hidePlayables : true;
    logoToggle.checked = data.su_premiumLogo !== undefined ? data.su_premiumLogo : true;
    enableToggle.checked = data.ytvr_enabled !== undefined ? data.ytvr_enabled : true;
    autoStretchToggle.checked = data.ytvr_autoStretch !== undefined ? data.ytvr_autoStretch : true;

    let savedRatio = data.ytvr_ratio || "fill";
    for (let i = 0; i < ratioButtons.length; i++) {
      let btn = ratioButtons[i];
      btn.classList.toggle("active", btn.getAttribute("data-ratio") === savedRatio);
    }
    syncUiState();
  });

  adblockToggle.addEventListener("change", function () {
    chrome.storage.sync.set({ su_adblockFix: adblockToggle.checked });
  });

  warningToggle.addEventListener("change", function () {
    chrome.storage.sync.set({ su_warningBypass: warningToggle.checked });
  });

  playablesToggle.addEventListener("change", function () {
    chrome.storage.sync.set({ su_hidePlayables: playablesToggle.checked });
  });

  logoToggle.addEventListener("change", function () {
    chrome.storage.sync.set({ su_premiumLogo: logoToggle.checked });
  });

  enableToggle.addEventListener("change", function () {
    chrome.storage.sync.set({ ytvr_enabled: enableToggle.checked });
    syncUiState();
  });

  autoStretchToggle.addEventListener("change", function () {
    chrome.storage.sync.set({ ytvr_autoStretch: autoStretchToggle.checked });
  });

  for (let i = 0; i < ratioButtons.length; i++) {
    ratioButtons[i].addEventListener("click", function () {
      for (let j = 0; j < ratioButtons.length; j++) {
        ratioButtons[j].classList.remove("active");
      }
      this.classList.add("active");
      chrome.storage.sync.set({ ytvr_ratio: this.getAttribute("data-ratio") });
    });
  }
});
