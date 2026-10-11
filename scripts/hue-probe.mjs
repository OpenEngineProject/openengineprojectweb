/**
 * Dev probe: verifies hero <img>.landing-art inline filter changes over wall-clock time (rAF hue driver).
 * Run: npm run build && astro preview &
 * Then: npm exec -- playwright install chromium once, then node scripts/hue-probe.mjs
 */
import { chromium } from 'playwright';

const base = process.env.PREVIEW_URL ?? 'http://127.0.0.1:55671/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(base, { waitUntil: 'load', timeout: 30_000 });

for (let i = 0; i < 4; i++) {
	if (i > 0) await sleep(2200);
	const vals = await page.evaluate(() => {
		const el = document.querySelector('.landing-frame .landing-chroma img.landing-art');
		if (!el) return { error: 'no hero img.landing-art' };
		return {
			inline: el.style.filter || '(empty)',
			computed: getComputedStyle(el).filter || '(none)',
			visibility: document.visibilityState,
			hidden: document.hidden,
		};
	});
	console.log('sample', i, vals);
}

await browser.close();
