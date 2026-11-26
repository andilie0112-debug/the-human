import { Vector2, type Camera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { Quality } from './graphics';

// The finishing touches on the image, by graphics level:
//   Low:    plain rendering (fastest, for phones).
//   Medium: soft glow around bright lights, a warm colour grade and a light vignette.
//   High:   plus ambient occlusion (soft contact shadows in corners and under furniture).

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1.08 },
    warmth: { value: 0.035 },
    contrast: { value: 1.04 },
    vignette: { value: 0.22 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float warmth;
    uniform float contrast;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, saturation);
      col = (col - 0.5) * contrast + 0.5;
      col += vec3(warmth, warmth * 0.35, -warmth * 0.6);
      vec2 d = vUv - 0.5;
      col *= 1.0 - vignette * dot(d, d) * 2.2;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }
  `,
};

export class PostFX {
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly ao: GTAOPass | null;
  private readonly bloom: UnrealBloomPass;

  constructor(private readonly renderer: WebGLRenderer, scene: Scene, camera: Camera, quality: Exclude<Quality, 'low'>) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.composer = new EffectComposer(renderer);
    // Keep edges smooth: the composer draws into multisampled targets.
    this.composer.renderTarget1.samples = 4;
    this.composer.renderTarget2.samples = 4;
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.ao = null;
    if (quality === 'high') {
      const ao = new GTAOPass(scene, camera, w, h);
      ao.blendIntensity = 0.8;
      ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1, thickness: 1, scale: 1, samples: 12 });
      this.composer.addPass(ao);
      this.ao = ao;
    }
    this.bloom = new UnrealBloomPass(new Vector2(w / 2, h / 2), 0.12, 0.35, 1.25);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new ShaderPass(GradeShader));
    this.setSize(w, h);
  }

  setSize(w: number, h: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render(scene: Scene, camera: Camera, dt: number): void {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    if (this.ao) {
      this.ao.scene = scene;
      this.ao.camera = camera;
    }
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
