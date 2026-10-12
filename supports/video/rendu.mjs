import { chromium } from 'playwright'
import { spawn } from 'child_process'
const FPS = 30, DUREE = 32
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 })
await p.goto('file://' + process.cwd() + '/promo.html'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500)
await p.evaluate(() => document.getAnimations().forEach(a => a.pause()))
const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', 'ap2a-promo.mp4'], { stdio: ['pipe', 'ignore', 'inherit'] })
for (let i = 0; i < FPS * DUREE; i++) {
  const t = i * 1000 / FPS
  await p.evaluate(t => document.getAnimations().forEach(a => { a.currentTime = t }), t)
  const img = await p.screenshot({ type: 'jpeg', quality: 92 })
  if (!ff.stdin.write(img)) await new Promise(r => ff.stdin.once('drain', r))
  if (i % 150 === 0) console.log('image', i)
}
ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close()
