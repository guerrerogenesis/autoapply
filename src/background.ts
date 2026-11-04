import { restrictStorage } from './background-helpers';

// Runs every time the service worker starts (install, browser start, wake up).
restrictStorage();
chrome.runtime.onInstalled.addListener(() => void restrictStorage());
chrome.runtime.onStartup.addListener(() => void restrictStorage());
