import { readPreference, writePreference } from './experience.js';

export class HomeAudio {
    constructor(onChange) {
        this.onChange = onChange;
        this.unlocked = false;
        this.active = true;
        this.channels = {};
        for (const [name, volume] of [['music', .34], ['sounds', .69]]) {
            const saved = Number(readPreference(`home-${name}-volume`, String(volume)));
            const audio = new Audio();
            audio.preload = 'none';
            audio.volume = Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : volume;
            const channel = { audio, enabled: readPreference(`home-${name}-enabled`, 'true') === 'true', tracks: [], index: 0, failures: 0 };
            this.channels[name] = channel;
            audio.addEventListener('ended', () => { channel.failures = 0; this.next(name); });
            audio.addEventListener('error', () => {
                if (++channel.failures < channel.tracks.length) this.next(name);
            });
        }
        this.load();
    }
    async load() {
        try {
            const response = await fetch('./audio-playlists.json', { cache: 'no-cache' });
            if (!response.ok) return;
            const lists = await response.json();
            for (const name of Object.keys(this.channels)) {
                const folder = name === 'music' ? 'MusicOST/' : 'SoundsSite/';
                this.channels[name].tracks = (Array.isArray(lists[name]) ? lists[name] : []).filter(file => typeof file === 'string' && file.startsWith(folder) && !file.includes('..') && /\.(mp3|ogg)$/i.test(file));
            }
            this.sync();
        } catch { /* Empty or unavailable playlist leaves the forest usable. */ }
    }
    unlock() { this.unlocked = true; this.sync(); }
    setActive(active) { this.active = active; this.sync(); }
    toggle(name) {
        const channel = this.channels[name];
        channel.enabled = !channel.enabled;
        channel.failures = 0;
        writePreference(`home-${name}-enabled`, String(channel.enabled));
        this.unlock(); this.onChange();
    }
    volume(name, percent) {
        this.channels[name].audio.volume = Math.max(0, Math.min(1, percent / 100));
        writePreference(`home-${name}-volume`, String(this.channels[name].audio.volume));
        this.unlock();
    }
    next(name) {
        const channel = this.channels[name];
        if (!channel.tracks.length) return;
        channel.index = (channel.index + 1) % channel.tracks.length;
        channel.audio.removeAttribute('src');
        this.sync();
    }
    sync() {
        for (const channel of Object.values(this.channels)) {
            if (!this.active || !this.unlocked || !channel.enabled || !channel.tracks.length || channel.failures >= channel.tracks.length) {
                channel.audio.pause(); continue;
            }
            if (!channel.audio.getAttribute('src')) channel.audio.src = channel.tracks[channel.index].split('/').map(encodeURIComponent).join('/');
            channel.audio.play().catch(() => { /* Retry on the next genuine gesture. */ });
        }
    }
}
