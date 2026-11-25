// Renders the app icons (original artwork: a person under a roof) to public/icons.
import sharp from 'sharp';

const art = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1d2733"/>
  <g transform="translate(256 270) scale(${1 - pad}) translate(-256 -270)">
    <circle cx="256" cy="270" r="190" fill="#2f6f6a"/>
    <path d="M96 250 L256 112 L416 250" fill="none" stroke="#f2c14e" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="256" cy="232" r="42" fill="#f4e3cf"/>
    <path d="M178 392 C178 320 214 290 256 290 C298 290 334 320 334 392 Z" fill="#f4e3cf"/>
    <path d="M150 430 H362" stroke="#e2725b" stroke-width="18" stroke-linecap="round"/>
  </g>
</svg>`;

await sharp(Buffer.from(art(0))).resize(192, 192).png().toFile('public/icons/icon-192.png');
await sharp(Buffer.from(art(0))).resize(512, 512).png().toFile('public/icons/icon-512.png');
await sharp(Buffer.from(art(0.18))).resize(512, 512).png().toFile('public/icons/icon-maskable-512.png');
await sharp(Buffer.from(art(0))).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');
console.log('icons written');
