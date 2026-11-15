"use strict";
importScripts("settings.js");

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(Object.keys(SU_SETTINGS.defaults));
  await chrome.storage.sync.set(SU_SETTINGS.normalize(stored));
});
