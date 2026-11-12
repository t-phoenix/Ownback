// node render.mjs -> business/socials/*.png (3D logo, avatar, banners, thumbnails)
import { chromium } from '/Users/abhinilagarwal/Desktop/Ownback/frontend/node_modules/playwright/index.mjs';
const DIR = new URL('.', import.meta.url).pathname;
const jobs = [['logo',2048,2048,'ownback-logo-3d-2048.png'],['avatar',1000,1000,'ownback-avatar-1000x1000.png'],['xheader',1500,500,'ownback-x-header-1500x500.png'],
  ['ytbanner',2560,1440,'ownback-youtube-banner-2560x1440.png'],['intro',1280,720,'ownback-youtube-thumbnail-intro-1280x720.png'],['demo',1280,720,'ownback-youtube-thumbnail-demo-1280x720.png']];
const b = await chromium.launch({ channel:'chrome', args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
for (const [m,w,h,out] of jobs) {
  const p = await b.newPage({ viewport:{ width:w, height:h } });
  p.on('pageerror', e => console.error(m, e.message));
  await p.goto(`file://${DIR}render.html#${m}`);
  await p.waitForFunction('window.DONE', null, { timeout: 60000 });
  await p.screenshot({ path: `${DIR}../${out}`, omitBackground: m === 'logo' });
  console.log('ok', out); await p.close();
}
await b.close();
