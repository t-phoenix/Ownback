/** Renders public/brand/og.png and the logo lockups with the brand fonts. Run from frontend/: npx tsx scripts/render-brand.mts */
import { readFileSync, writeFileSync } from 'node:fs';
import React from 'react';
import { ImageResponse } from 'next/og';
const h = React.createElement;
const F = 'node_modules/@fontsource';
const fonts = [
  { name: 'Bricolage', data: readFileSync(`${F}/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff`), weight: 800 as const, style: 'normal' as const },
  { name: 'Bricolage', data: readFileSync(`${F}/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff`), weight: 700 as const, style: 'normal' as const },
  { name: 'Source', data: readFileSync(`${F}/source-sans-3/files/source-sans-3-latin-600-normal.woff`), weight: 600 as const, style: 'normal' as const },
];
const coin = `data:image/png;base64,${readFileSync(process.argv[2] ?? 'public/brand/coin-feather.png').toString('base64')}`;
const OUT = 'public/brand';
const mark = (size: number, coinFill: string) => h('svg', { width: size, height: size, viewBox: '0 0 64 64' },
  h('path', { d: 'M32 8a24 24 0 1 0 24 24H32z', fill: coinFill }), h('path', { d: 'M37 3a24 24 0 0 1 24 24H37z', fill: '#E9B949' }));
async function save(el: React.ReactElement, w: number, hh: number, file: string) {
  const res = new ImageResponse(el, { width: w, height: hh, fonts });
  writeFileSync(`${OUT}/${file}`, Buffer.from(await res.arrayBuffer()));
  console.log('wrote', file);
}
// Open Graph / social card
await save(h('div', { style: { width: '100%', height: '100%', display: 'flex', background: 'radial-gradient(120% 90% at 85% 10%, #163A2B 0%, #0F2A1E 62%)', color: '#F6F8F5', fontFamily: 'Source', position: 'relative' } },
  h('img', { src: coin, width: 620, height: 620, style: { position: 'absolute', right: -40, top: 10 } }),
  h('div', { style: { display: 'flex', flexDirection: 'column', padding: '64px 72px', width: 720, justifyContent: 'space-between', height: '100%' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 16 } }, mark(56, '#4CC38A'), h('span', { style: { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 44, letterSpacing: -2 } }, 'Ownback')),
    h('div', { style: { display: 'flex', flexDirection: 'column' } },
      h('div', { style: { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 76, lineHeight: 1.02, letterSpacing: -3.5 } }, 'Own a piece of what you buy.'),
      h('div', { style: { marginTop: 24, fontSize: 30, color: '#A7C2B4', lineHeight: 1.35 } }, 'A small share of every purchase goes into the companies behind it. You approve every buy.')),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 14, fontSize: 24, color: '#E9B949', fontWeight: 600, letterSpacing: 2 } }, 'RECEIPT  →  JAR  →  YOUR WALLET'))), 1200, 630, 'og.png');
// Logo lockups
const lockup = (bg: string, fg: string, coinFill: string) => h('div', { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, background: bg } },
  mark(150, coinFill), h('span', { style: { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 150, letterSpacing: -7, color: fg } }, 'Ownback'));
await save(lockup('#F6F8F5', '#0E2A1F', '#0F7B4F'), 1200, 360, 'ownback-lockup-light.png');
await save(lockup('#0F2A1E', '#F6F8F5', '#4CC38A'), 1200, 360, 'ownback-lockup-dark.png');
