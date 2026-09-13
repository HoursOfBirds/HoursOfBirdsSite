// Shared preference for the homepage and standalone game pages.
const sessionPreferences = new Map();
export function readPreference(key, fallback) {
    if (sessionPreferences.has(key)) return sessionPreferences.get(key);
    try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
export function writePreference(key, value) {
    try { localStorage.setItem(key, value); sessionPreferences.delete(key); }
    catch { sessionPreferences.set(key, value); }
}
export function getMode() {
    return readPreference('siteMode', 'normal') === 'creative' ? 'creative' : 'normal';
}
export function setMode(value) {
    if (!['creative', 'normal'].includes(value)) return;
    writePreference('siteMode', value);
    window.dispatchEvent(new CustomEvent('site-mode', { detail: value }));
}
