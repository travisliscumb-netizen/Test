/* =====================================================================
   [CORE] POST-PROCESSING: colour grade + vignette + grain
   ===================================================================== */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.32 }, uSat: { value: 1.12 }, uCon: { value: 1.06 }, uTime: { value: 0 }, uNight: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig; uniform float uSat; uniform float uCon; uniform float uTime; uniform float uNight; varying vec2 vUv;
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uCon + 0.5;
      col += mix(vec3(0.0, 0.006, 0.012), vec3(0.004, 0.006, 0.02), uNight) * (1.0 - l);
      col *= mix(vec3(1.0), vec3(1.025, 1.0, 0.965), smoothstep(0.45, 1.0, l));
      vec2 d = vUv - 0.5; col *= 1.0 - dot(d, d) * uVig * 2.2;
      float gr = fract(sin(dot(vUv * 1000.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      col += (gr - 0.5) * 0.012;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`
};

