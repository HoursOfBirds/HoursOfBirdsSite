import { readPreference, writePreference } from './experience.js';

export class HomeAudio {
    constructor(onChange) {
        this.onChange = onChange;
        this.unlocked = false;
        this.active = true;
        this.channels = {};
        const defaultsVersion = readPreference('home-audio-defaults-version', '1');
        for (const [name, volume, legacyVolume] of [['music', .13, .34], ['sounds', .33, .69]]) {
            const stored = readPreference(`home-${name}-volume`, '');
            let saved = stored === '' ? volume : Number(stored);
            if (defaultsVersion !== '2' && Math.abs(saved - legacyVolume) < .0001) {
                saved = volume;
                writePreference(`home-${name}-volume`, String(volume));
            }
            const audio = new Audio();
            audio.preload = 'none';
            const targetVolume = Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : volume;
            audio.volume = targetVolume;
            const channel = { audio, enabled: readPreference(`home-${name}-enabled`, 'true') === 'true', tracks: [], index: 0, failures: 0, targetVolume, fadeFrame: 0 };
            this.channels[name] = channel;
            audio.addEventListener('ended', () => { channel.failures = 0; this.next(name); });
            audio.addEventListener('error', () => {
                if (++channel.failures < channel.tracks.length) this.next(name);
            });
        }
        if (defaultsVersion !== '2') writePreference('home-audio-defaults-version', '2');
        this.load();
    }
    async load() {
        try {
            const response = await fetch('./audio-playlists.json', { cache: 'no-cache' });
            if (!response.ok) return;
            const lists = await response.json();
            for (const name of Object.keys(this.channels)) {
                const folder = name === 'music' ? 'MusicOST/' : 'SoundsSite/';
                const allowed = name === 'music' ? /^MusicOST\/[^/]+\.(?:mp3|ogg)$/i : /^SoundsSite\/[^/]+\.(?:mp3|ogg)$/i;
                this.channels[name].tracks = (Array.isArray(lists[name]) ? lists[name] : []).filter(file => typeof file === 'string' && allowed.test(file));
            }
            this.sync();
        } catch { /* Empty or unavailable playlist leaves the forest usable. */ }
    }
    unlock() { this.unlocked = true; this.sync(); }
    setActive(active, duration = 0) {
        if (active === this.active) {
            if (active) this.sync();
            return;
        }
        this.active = active;
        for (const channel of Object.values(this.channels)) {
            if (channel.fadeFrame) cancelAnimationFrame(channel.fadeFrame);
            channel.fadeFrame = 0;
            if (active) {
                channel.audio.volume = channel.targetVolume;
            } else if (duration > 0 && !channel.audio.paused) {
                this.fadeOut(channel, duration);
            } else {
                channel.audio.pause();
                channel.audio.volume = 0;
            }
        }
        if (active) this.sync();
    }

    fadeOut(channel, duration) {
        const started = performance.now();
        const initial = channel.audio.volume;
        const step = now => {
            const progress = Math.min(1, (now - started) / duration);
            channel.audio.volume = initial * (1 - progress);
            if (progress < 1) {
                channel.fadeFrame = requestAnimationFrame(step);
            } else {
                channel.fadeFrame = 0;
                channel.audio.pause();
                channel.audio.volume = 0;
            }
        };
        channel.fadeFrame = requestAnimationFrame(step);
    }
    toggle(name) {
        const channel = this.channels[name];
        channel.enabled = !channel.enabled;
        channel.failures = 0;
        writePreference(`home-${name}-enabled`, String(channel.enabled));
        this.unlock(); this.onChange();
    }
    volume(name, percent) {
        const channel = this.channels[name];
        channel.targetVolume = Math.max(0, Math.min(1, percent / 100));
        if (!channel.fadeFrame) channel.audio.volume = this.active ? channel.targetVolume : 0;
        writePreference(`home-${name}-volume`, String(channel.targetVolume));
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
                if (!channel.fadeFrame) channel.audio.pause();
                continue;
            }
            if (channel.fadeFrame) cancelAnimationFrame(channel.fadeFrame);
            channel.fadeFrame = 0;
            channel.audio.volume = channel.targetVolume;
            if (!channel.audio.getAttribute('src')) channel.audio.src = channel.tracks[channel.index].split('/').map(encodeURIComponent).join('/');
            channel.audio.play().catch(() => { /* Retry on the next genuine gesture. */ });
        }
    }
}
