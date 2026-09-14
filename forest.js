import * as THREE from './vendor/three/build/three.module.js';
import { GLTFLoader } from './vendor/three/addons/loaders/GLTFLoader.js';
import { CSS3DObject, CSS3DRenderer } from './vendor/three/addons/renderers/CSS3DRenderer.js';

const ASSETS = new URL('./D_ARCADE_WEB_EXPORT_v5/', import.meta.url);
const LENGTH = 70;
const FLIGHT_SECONDS = 4;
const CAMERA_HEIGHT = 2.4;
const CHUNK_FILES = new Map([
    ['A', 'd_arcade_chunk_a.glb'],
    ['B', 'd_arcade_chunk_b.glb'],
    ['C', 'd_arcade_chunk_c.glb'],
    ['GAMES', 'd_arcade_chunk_games.glb']
]);
const ease = t => t * t * (3 - 2 * t);

export class Forest {
    constructor(host, screenHost, onState, onEnter) {
        this.host = host;
        this.screenHost = screenHost;
        this.onState = onState;
        this.onEnter = onEnter;
        this.state = 'loading';
        this.mode = 'normal';
        const narrowScreen = matchMedia('(max-width: 700px)').matches;
        const lowPowerHardware = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
        this.lowPower = narrowScreen || lowPowerHardware;
        this.slots = [];
        this.pointer = new THREE.Vector2();
        this.gaze = new THREE.Vector2();
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x040506);
        this.scene.fog = new THREE.Fog(0x040506, 42, 88);
        this.camera = new THREE.PerspectiveCamera(58, 1, .025, 250);
        this.camera.position.set(0, CAMERA_HEIGHT, -10);
        this.renderer = new THREE.WebGLRenderer({
            antialias: !this.lowPower,
            powerPreference: 'low-power',
            precision: this.lowPower ? 'mediump' : 'highp'
        });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = .94;
        this.renderer.domElement.setAttribute('aria-label', 'Hours of Birds: forest');
        host.append(this.renderer.domElement);
        this.scene.add(new THREE.HemisphereLight(0x8397b0, 0x382017, .16));
        // Point lights are among the most expensive parts of this scene on
        // mobile GPUs. Keep a nearest-lamp pool instead of creating one light
        // for every exported lantern.
        this.lights = Array.from({ length: this.lowPower ? 12 : 18 }, () => {
            const light = new THREE.PointLight(0xff7a30, 0, 19, 2);
            this.scene.add(light);
            return light;
        });
        this.cssScene = new THREE.Scene();
        this.cssRenderer = new CSS3DRenderer();
        screenHost.append(this.cssRenderer.domElement);
        this.resize = this.resize.bind(this);
        this.onPointer = event => {
            this.pointer.set(event.clientX / innerWidth * 2 - 1, event.clientY / innerHeight * 2 - 1);
        };
        this.onVisibility = () => this.syncRendering();
        this.onContextLost = event => {
            event.preventDefault();
            this.renderer.setAnimationLoop(null);
            this.state = 'error';
            this.onState('error');
        };
        this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
        host.addEventListener('pointermove', this.onPointer);
        document.addEventListener('visibilitychange', this.onVisibility);
        window.addEventListener('resize', this.resize);
        this.resize();
    }

    async load() {
        this.loadingManager = new THREE.LoadingManager();
        this.requestController = new AbortController();
        try {
            await Promise.race([
                this.loadAssets(),
                new Promise((_, reject) => {
                    this.loadTimeout = setTimeout(() => reject(new Error('Forest loading timed out')), 90000);
                })
            ]);
        } finally { clearTimeout(this.loadTimeout); }
    }

    async loadAssets() {
        const loader = new GLTFLoader(this.loadingManager);
        const manifest = await fetch(new URL('d_arcade_manifest.json', ASSETS), { signal: this.requestController.signal }).then(response => {
            if (!response.ok) throw new Error('Manifest unavailable');
            return response.json();
        });
        if (!manifest || !Array.isArray(manifest.chunks) || manifest.chunks.length !== CHUNK_FILES.size) {
            throw new Error('Invalid forest manifest');
        }
        const definitions = new Map();
        for (const definition of manifest.chunks) {
            if (!definition || typeof definition.id !== 'string' || typeof definition.file !== 'string' || CHUNK_FILES.get(definition.id) !== definition.file || definitions.has(definition.id)) {
                throw new Error('Unexpected forest asset in manifest');
            }
            definitions.set(definition.id, definition);
        }
        if ([...CHUNK_FILES.keys()].some(id => !definitions.has(id))) throw new Error('Forest manifest is incomplete');
        this.templates = new Map();
        let done = 0;
        // Two concurrent parses keep peak GPU upload / CPU work bounded.
        let index = 0;
        await Promise.all(Array.from({ length: 2 }, async () => {
            while (index < manifest.chunks.length) {
                const definition = manifest.chunks[index++];
                const gltf = await loader.loadAsync(new URL(definition.file, ASSETS).href);
                if (this.disposed) { this.disposeRoot(gltf.scene); return; }
                this.templates.set(definition.id, this.prepare(gltf.scene, definition.id));
                this.onState('loading', ++done);
            }
        }));
        if (this.disposed) return;
        this.games = this.templates.get('GAMES');
        this.scene.add(this.games.root);
        this.games.root.visible = false;
        this.screenMesh = this.games.root.getObjectByName('HOB_Games_Machine_TVStaticScreen');
        if (!this.screenMesh) throw new Error('Arcade screen missing from export');
        this.screenMesh.geometry.computeBoundingBox();
        const bounds = this.screenMesh.geometry.boundingBox;
        const scale = this.screenMesh.getWorldScale(new THREE.Vector3());
        this.screenSize = bounds.getSize(new THREE.Vector3()).multiply(scale);
        // The static TV image has the correct opening aspect ratio, while the
        // frame bounding box also includes its thicker lower cabinet edge.
        // Expand the TV plane uniformly to the inner frame width so the live
        // game fills the glass without spilling down onto the blue controls.
        const bezel = this.games.root.getObjectByName('HOB_Games_Machine_ScreenFrame');
        if (bezel?.geometry) {
            bezel.geometry.computeBoundingBox();
            const size = bezel.geometry.boundingBox.getSize(new THREE.Vector3());
            const bezelScale = bezel.getWorldScale(new THREE.Vector3());
            const openingWidth = (size.x - .048) * bezelScale.x;
            this.screenSize.multiplyScalar(openingWidth / this.screenSize.x);
        }
        // The exported loading text and bars otherwise float over the live game.
        this.games.root.traverse(object => {
            if (/Machine_Loading|Machine_SpeedText/.test(object.name)) object.visible = false;
        });
        ['A', 'B', 'C'].forEach((id, i) => {
            const slot = this.templates.get(id);
            slot.root.position.z = 20 - i * LENGTH;
            this.scene.add(slot.root);
            this.slots.push(slot);
        });
        this.lookAhead();
        this.updateLights();
        await this.renderer.compileAsync(this.scene, this.camera);
        if (this.disposed) return;
        this.state = 'forest';
        this.host.classList.add('scene-ready');
        this.onState('forest');
        this.syncRendering();
    }

    prepare(source, id) {
        source.updateMatrixWorld(true);
        let road;
        source.traverse(object => {
            if (!road && /^Terrain_WebStatic/.test(object.name)) road = object;
        });
        if (!road) throw new Error(`Road surface missing in ${id}`);
        const bounds = new THREE.Box3().setFromObject(road);
        if (Math.abs(bounds.max.z - bounds.min.z - LENGTH) > .01) throw new Error(`Unexpected road length in ${id}`);
        // Normalize from actual road geometry, not foliage bounds or stale markers.
        const root = new THREE.Group();
        root.name = `CHUNK_${id}`;
        source.position.x -= (bounds.max.x + bounds.min.x) / 2;
        source.position.z -= bounds.max.z;
        root.add(source);
        const lamps = [];
        const remove = [];
        source.traverse(object => {
            if (id === 'GAMES' && /BEHIND_B/.test(object.name)) object.position.z -= 70 - 68.76612854003906;
            if (object.isLight) {
                const marker = new THREE.Object3D();
                marker.position.copy(object.position);
                lamps.push({ marker, color: object.color.clone(), intensity: object.intensity * .00084, range: object.distance || 12 });
                remove.push({ object, marker });
            }
            if (!object.isMesh) return;
            object.castShadow = false;
            object.receiveShadow = false;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach(material => Object.values(material).forEach(value => {
                if (value?.isTexture) value.anisotropy = 1;
            }));
            // Chunk meshes do not animate independently. Freezing their local
            // matrices removes per-frame update work while the moving chunk
            // root still updates their world matrices correctly.
            object.updateMatrix();
            object.matrixAutoUpdate = false;
        });
        remove.forEach(({ object, marker }) => { object.parent.add(marker); object.removeFromParent(); });
        return { root, lamps, id, bounds: { length: LENGTH, front: 0, back: -LENGTH } };
    }

    updateLights() {
        this.scene.updateMatrixWorld(true);
        const active = [...this.slots, this.games].filter(chunk => chunk?.root.visible);
        const candidates = active.flatMap(chunk => chunk.lamps.map(lamp => {
            const position = lamp.marker.getWorldPosition(new THREE.Vector3());
            return { ...lamp, position, distance: position.distanceTo(this.camera.position) };
        })).sort((a, b) => a.distance - b.distance);
        this.lights.forEach((light, i) => {
            const lamp = candidates[i];
            if (!lamp) { light.intensity = 0; return; }
            light.position.copy(lamp.position);
            light.color.copy(lamp.color);
            light.distance = lamp.range;
            const fade = 1 - THREE.MathUtils.smoothstep(lamp.distance, 48, 62);
            light.intensity = lamp.intensity * fade;
        });
    }

    lookAhead() {
        const amount = this.mode === 'creative' ? 1 : 0;
        this.gaze.lerp(this.pointer, .035);
        this.camera.lookAt(this.camera.position.x + this.gaze.x * 2.2 * amount, CAMERA_HEIGHT - .25 - this.gaze.y * .5 * amount, this.camera.position.z - 24);
    }

    setMode(mode) {
        if (!['creative', 'normal'].includes(mode)) return;
        this.mode = mode;
        this.syncRendering();
    }

    syncRendering() {
        this.lastTime = null;
        this.renderer.setAnimationLoop(null);
        if (this.disposed || !['forest', 'flight', 'arcade'].includes(this.state) || document.hidden) return;
        if (this.state === 'arcade') {
            this.renderStatic();
            return;
        }
        if (this.state === 'flight' || this.mode === 'creative') {
            this.renderer.setAnimationLoop(time => this.frame(time));
        } else if (this.state === 'forest') {
            this.updateLights();
            this.renderer.render(this.scene, this.camera);
        }
    }

    showCabinet() {
        this.camera.position.copy(this.screenCenter).addScaledVector(this.screenNormal, this.cabinetDistance());
        this.camera.lookAt(this.screenCenter);
        this.renderStatic();
    }

    setGameReady(ready) {
        this.games.root.traverse(object => {
            if (/FixedJoystick/.test(object.name)) object.visible = !ready;
        });
        this.renderStatic();
    }

    resume() {
        this.play();
        this.flightElapsed = FLIGHT_SECONDS;
        this.updateFlight(0);
    }

    play() {
        if (this.state !== 'forest') return;
        // Replace the first complete slot hidden behind the fog, leaving the
        // current road untouched. GAMES already includes its own next segment.
        const ahead = this.slots.filter(slot => slot.root.position.z < this.camera.position.z - this.scene.fog.far - 15)
            .sort((a, b) => b.root.position.z - a.root.position.z)[0];
        const boundary = ahead?.root.position.z ?? Math.min(...this.slots.map(slot => slot.root.position.z)) - LENGTH;
        this.games.root.position.z = boundary;
        this.games.root.visible = true;
        this.slots.forEach(slot => { if (slot.root.position.z <= boundary) slot.root.visible = false; });
        this.scene.updateMatrixWorld(true);
        this.screenCenter = this.screenMesh.getWorldPosition(new THREE.Vector3());
        this.screenRotation = this.screenMesh.getWorldQuaternion(new THREE.Quaternion());
        this.screenNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(this.screenRotation);
        this.flightFrom = this.camera.position.clone();
        this.flightRotation = this.camera.quaternion.clone();
        this.flightElapsed = 0;
        this.flightMode = this.mode;
        this.lastTime = performance.now();
        this.state = 'flight';
        this.renderer.setAnimationLoop(time => this.frame(time));
        this.onState('flight');
    }

    cabinetDistance() {
        const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
        return Math.max(this.screenSize.y / (2 * Math.tan(halfFov) * .64), this.screenSize.x / (2 * Math.tan(halfFov) * this.camera.aspect * .78));
    }

    updateFlight(dt) {
        this.flightElapsed += dt;
        const t = Math.min(1, this.flightElapsed / FLIGHT_SECONDS);
        const end = this.screenCenter.clone().addScaledVector(this.screenNormal, this.flightMode === 'creative' ? this.cabinetDistance() : .035);
        // Quintic Hermite: match the forest's 5 m/s initial motion, accelerate,
        // then reach the screen with zero velocity and zero acceleration.
        const distance = this.flightFrom.distanceTo(end);
        const initial = Math.min(.25, 5 * FLIGHT_SECONDS / distance);
        const smooth = t * t * t * (10 + t * (-15 + 6 * t));
        const tangent = t - 6 * t ** 3 + 8 * t ** 4 - 3 * t ** 5;
        this.camera.position.lerpVectors(this.flightFrom, end, smooth + initial * tangent);
        this.camera.lookAt(this.screenCenter);
        const rotation = this.camera.quaternion.clone();
        this.camera.quaternion.slerpQuaternions(this.flightRotation, rotation, ease(Math.min(1, t * 3)));
        if (t === 1) {
            this.state = 'arcade';
            this.onState(this.state);
            this.onEnter(this.flightMode);
        }
    }

    mountGame(element) {
        const width = 1336;
        const height = Math.round(width * this.screenSize.y / this.screenSize.x);
        element.style.width = `${width}px`;
        element.style.height = `${height}px`;
        const surface = new CSS3DObject(element);
        // The exported glass opening sits a little above the TV mesh origin.
        // Apply the correction in screen-local space so it remains aligned
        // when the cabinet is viewed at another aspect ratio.
        const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.screenRotation);
        surface.position.copy(this.screenCenter)
            .addScaledVector(screenUp, .026)
            .addScaledVector(this.screenNormal, .022);
        surface.quaternion.copy(this.screenRotation);
        surface.scale.setScalar(this.screenSize.x / width);
        this.cssScene.add(surface);
        this.surface = surface;
        this.screenMesh.visible = false;
        this.screenHost.hidden = false;
        this.renderStatic();
    }

    renderStatic() {
        if (this.disposed || document.hidden) return;
        this.updateLights();
        this.renderer.render(this.scene, this.camera);
        if (this.surface) this.cssRenderer.render(this.cssScene, this.camera);
    }

    back() {
        if (!['arcade', 'flight'].includes(this.state)) return;
        this.surface?.removeFromParent();
        this.surface?.element.remove();
        this.surface = null;
        this.screenHost.hidden = true;
        this.screenMesh.visible = true;
        this.setGameReady(false);
        this.games.root.visible = false;
        this.slots.forEach((slot, i) => { slot.root.visible = true; slot.root.position.z = 20 - i * LENGTH; });
        this.camera.position.set(0, CAMERA_HEIGHT, -10);
        this.camera.fov = 58;
        this.camera.updateProjectionMatrix();
        this.pointer.set(0, 0);
        this.gaze.set(0, 0);
        this.lookAhead();
        this.state = 'forest';
        this.onState('forest');
        this.syncRendering();
    }

    frame(time) {
        const elapsed = this.lastTime === null || document.hidden ? 0 : (time - this.lastTime) / 1000;
        const dt = Math.min(.1, elapsed);
        this.lastTime = time;
        if (document.hidden) return;
        if (this.state === 'forest' && this.mode === 'creative') {
            this.slots.forEach(slot => {
                slot.root.position.z += dt * 5;
                if (slot.root.position.z > 80) slot.root.position.z -= LENGTH * 3;
            });
            this.lookAhead();
        } else if (this.state === 'flight') this.updateFlight(elapsed);
        this.updateLights();
        this.renderer.render(this.scene, this.camera);
        if (this.surface) this.cssRenderer.render(this.cssScene, this.camera);
    }

    resize() {
        this.camera.aspect = innerWidth / innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.lowPower ? 1 : 1.25));
        this.renderer.setSize(innerWidth, innerHeight);
        this.cssRenderer.setSize(innerWidth, innerHeight);
        if (this.state === 'arcade') {
            this.camera.position.copy(this.screenCenter).addScaledVector(this.screenNormal, this.cabinetDistance());
            this.camera.lookAt(this.screenCenter);
        }
        this.syncRendering();
    }

    disposeRoot(root) {
        root.traverse(object => {
            object.geometry?.dispose();
            if (object.material) {
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                materials.forEach(material => {
                    Object.values(material).forEach(value => { if (value?.isTexture) value.dispose(); });
                    material.dispose();
                });
            }
        });
    }

    dispose() {
        this.disposed = true;
        clearTimeout(this.loadTimeout);
        this.requestController?.abort();
        this.loadingManager?.abort();
        this.renderer.setAnimationLoop(null);
        this.templates?.forEach(chunk => this.disposeRoot(chunk.root));
        this.surface?.element.remove();
        this.renderer.dispose();
        this.renderer.domElement.remove();
        this.host.classList.remove('scene-ready');
        this.cssRenderer.domElement.remove();
        window.removeEventListener('resize', this.resize);
        this.host.removeEventListener('pointermove', this.onPointer);
        document.removeEventListener('visibilitychange', this.onVisibility);
    }
}
