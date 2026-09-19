import './style.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  uniform sampler2D uTexture;
  uniform vec2 uImageSize;
  uniform vec2 uPlaneSize;
  uniform float uProgress;
  uniform float uPadding;
  varying vec2 vUv;

  const float PI = 3.14159265359;

  vec2 coverUv(vec2 uv, vec2 textureSize, vec2 quadSize) {
    float textureAspect = textureSize.x / textureSize.y;
    float quadAspect = quadSize.x / quadSize.y;
    vec2 scale = vec2(1.0);
    if (textureAspect > quadAspect) scale.x = quadAspect / textureAspect;
    else scale.y = textureAspect / quadAspect;
    return (uv - 0.5) * scale + 0.5;
  }

  float paperNoise(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  bool inBounds(vec2 p) {
    return p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0;
  }

  vec4 sampleImage(vec2 uv) {
    return texture2D(uTexture, coverUv(uv, uImageSize, uPlaneSize));
  }

  // Build a crisp adhesive rim from the source alpha. The reference image is
  // a die-cut sticker, not a rectangular photo, and this white edge is one of
  // the strongest perceptual cues that it can be lifted from the surface.
  vec4 sampleSticker(vec2 uv) {
    vec4 center = sampleImage(uv);
    float o = 0.0075;
    float mask = center.a;
    mask = max(mask, sampleImage(uv + vec2( o, 0.0)).a);
    mask = max(mask, sampleImage(uv + vec2(-o, 0.0)).a);
    mask = max(mask, sampleImage(uv + vec2(0.0,  o)).a);
    mask = max(mask, sampleImage(uv + vec2(0.0, -o)).a);
    mask = max(mask, sampleImage(uv + vec2( o,  o)).a);
    mask = max(mask, sampleImage(uv + vec2(-o,  o)).a);
    mask = max(mask, sampleImage(uv + vec2( o, -o)).a);
    mask = max(mask, sampleImage(uv + vec2(-o, -o)).a);
    mask = smoothstep(0.20, 0.52, mask);
    float imageAlpha = smoothstep(0.16, 0.50, center.a);
    vec3 stickerColor = mix(vec3(0.975, 0.97, 0.945), center.rgb, imageAlpha);
    return vec4(stickerColor, mask);
  }

  void main() {
    vec2 imageUv = (vUv - uPadding) / (1.0 - 2.0 * uPadding);

    // A single fold travels from the lifted bottom-left corner toward the
    // top-right. Unlike a page-curl cylinder, this model has one continuous
    // flap: already-peeled material is reflected over the moving hinge.
    vec2 normal = normalize(vec2(0.72, 1.0));
    vec2 tangent = vec2(-normal.y, normal.x);
    float maxDiagonal = dot(vec2(1.0), normal);
    float easedProgress = smoothstep(0.0, 1.0, uProgress);
    float crease = mix(0.16, maxDiagonal + 0.22, easedProgress);
    float radiusEnvelope = sin(clamp(uProgress, 0.0, 1.0) * PI);
    float foldWidth = mix(0.018, 0.044, pow(radiusEnvelope, 0.8));

    // A tiny hand-pulled skew keeps the hinge organic without introducing a
    // wave or a second roll. It fades away at both ends of the interaction.
    float alongHinge = dot(imageUv, tangent);
    float hingeSkew = (alongHinge - 0.5) * 0.020 * radiusEnvelope;
    float localCrease = crease + hingeSkew;
    float diagonal = dot(imageUv, normal);
    float ahead = diagonal - localCrease;
    vec2 linePoint = imageUv - normal * ahead;
    float peelActive = smoothstep(0.015, 0.08, uProgress);
    float release = 1.0 - smoothstep(0.955, 1.0, uProgress);

    // Preserve the untouched sticker exactly before the corner starts lifting.
    if (peelActive <= 0.001) {
      if (!inBounds(imageUv)) discard;
      gl_FragColor = sampleSticker(imageUv);
      #include <colorspace_fragment>
      return;
    }

    // The lifted sheet occupies only the far side of the hinge. Each output
    // point maps to exactly one point from the peeled region, preventing the
    // doubled, symmetrical rolls produced by a full cylinder projection.
    if (ahead >= 0.0 && peelActive > 0.0) {
      float perspective = mix(2.35, 1.72, radiusEnvelope);
      float bend = foldWidth * (1.0 - exp(-ahead / max(foldWidth, 0.001))) * 0.78;
      float sourceDistance = ahead * perspective + bend;
      vec2 flapPoint = linePoint - normal * sourceDistance;

      if (inBounds(flapPoint) && dot(flapPoint, normal) <= localCrease) {
        vec4 flap = sampleSticker(flapPoint);
        if (flap.a > 0.002) {
          float atFold = exp(-ahead / max(foldWidth * 1.05, 0.001));
          float foldHighlight = exp(-pow((ahead - foldWidth * 0.55) / max(foldWidth * 0.30, 0.001), 2.0));
          float grain = (paperNoise(gl_FragCoord.xy * 0.29) - 0.5) * 0.010;
          vec3 paper = mix(vec3(0.955, 0.942, 0.905), flap.rgb, 0.055);
          paper *= 0.96 - atFold * 0.22;
          paper += foldHighlight * 0.16 + grain;
          gl_FragColor = vec4(paper, flap.a * peelActive * release);
          #include <colorspace_fragment>
          return;
        }
      }
    }

    // Whatever lies behind the hinge has been lifted, so it is transparent.
    // Ahead of it, the original sticker remains completely pinned and crisp.
    if (ahead >= 0.0 && inBounds(imageUv)) {
      vec4 front = sampleSticker(imageUv);
      float contactShadow = exp(-ahead / max(foldWidth * 1.7, 0.001));
      front.rgb *= 1.0 - contactShadow * 0.20 * radiusEnvelope;
      gl_FragColor = front;
      #include <colorspace_fragment>
      return;
    }

    discard;
  }
`;

const container = document.querySelector('.hero-image');
const image = container.querySelector('img');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
renderer.domElement.className = 'hero-canvas';
container.appendChild(renderer.domElement);

const uniforms = {
  uTexture: { value: null },
  uImageSize: { value: new THREE.Vector2(5, 7) },
  uPlaneSize: { value: new THREE.Vector2(5, 7) },
  uProgress: { value: prefersReducedMotion ? 0 : 0 },
  uPadding: { value: 0.25 }
};

const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms,
  transparent: true,
  side: THREE.DoubleSide
});
scene.add(new THREE.Mesh(geometry, material));

function resize() {
  const { width, height } = container.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width * 2, height * 2, false);
  uniforms.uPlaneSize.value.set(width, height);
}

new THREE.TextureLoader().load(image.currentSrc || image.src, (texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  uniforms.uTexture.value = texture;
  uniforms.uImageSize.value.set(texture.image.width, texture.image.height);
  container.classList.add('is-loaded');
  container.querySelector('.loading').hidden = true;
  resize();
  renderer.render(scene, camera);
});

const render = () => renderer.render(scene, camera);

if (!prefersReducedMotion) {
  const lenis = new Lenis({ duration: 1.25, smoothWheel: true, wheelMultiplier: 0.82 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  let targetProgress = 0;
  let displayProgress = 0;
  let lastTime = performance.now();

  const smoothRender = () => {
    const now = performance.now();
    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const blend = 1.0 - Math.exp(-delta * 10.5);
    displayProgress += (targetProgress - displayProgress) * blend;
    if (Math.abs(targetProgress - displayProgress) < 0.00008) displayProgress = targetProgress;

    uniforms.uProgress.value = displayProgress;
    gsap.set('.progress-fill', { scaleX: displayProgress });
    gsap.set('.hero-copy', { opacity: 1 - Math.min(displayProgress * 2.8, 1), y: -displayProgress * 70 });
    gsap.set('.title-lockup', { y: -displayProgress * 65 });
    gsap.set('.scroll-cue', { opacity: 1 - Math.min(displayProgress * 5, 1) });
    render();
  };
  gsap.ticker.add(smoothRender);

  ScrollTrigger.create({
    trigger: '.hero',
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: ({ progress }) => {
      targetProgress = gsap.utils.clamp(0, 1, (progress - 0.025) / 0.86);
    }
  });
}

window.addEventListener('resize', () => {
  resize();
  ScrollTrigger.refresh();
});

window.addEventListener('pagehide', () => {
  geometry.dispose();
  material.dispose();
  renderer.dispose();
});

resize();
