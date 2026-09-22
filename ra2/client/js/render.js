'use strict';
/* ============================== RENDERER ================================ */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc4baa6);
scene.fog = new THREE.Fog(0xcdbfa4, 45, 140);
const camera = new THREE.PerspectiveCamera(CFG.fov, innerWidth / innerHeight, 0.05, 300);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xe0d2b6, 0x5e4c36, 0.6));
const sun = new THREE.DirectionalLight(0xfff0d2, 1.15);
sun.position.set(38, 30, -22); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 5, far: 120 });
sun.shadow.bias = -0.0006;
scene.add(sun);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

