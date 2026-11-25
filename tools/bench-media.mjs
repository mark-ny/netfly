// Run only against a temporary, loopback-bound server created by this process.
// Usage: node tools/bench-media.mjs [public/demo]
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readdir, stat, realpath } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

const root = await realpath(process.argv[2] || 'public/demo');
const studies = (await readdir(root, { withFileTypes: true })).filter(entry =>
  entry.isDirectory() && /^[a-z]+(?:-[a-z]+)*$/.test(entry.name));
const assets = new Map();
for (const { name } of studies) {
  const names = ['master.m3u8', '480p/index.m3u8', ...[0, 1, 2].map(i => '480p/seg-00' + i + '.ts')];
  const found = await Promise.all(names.map(async file => {
    const path = await realpath(join(root, name, file)).catch(() => null);
    if (!path || relative(root, path).startsWith('..' + sep)) return null;
    return ['/' + name + '/' + file, { path, length: (await stat(path)).size }];
  }));
  if (found.every(Boolean)) found.forEach(([file, meta]) => assets.set(file, meta));
}
const titles = [...assets.keys()].filter(key => key.endsWith('/master.m3u8')).map(key => key.split('/')[1]);
if (!titles.length) throw Error('No six-second, three-segment demo studies found');
const socket = new http.Agent({ keepAlive: true, maxSockets: 500 });
const server = http.createServer((req, res) => {
  const file = assets.get(req.url);
  if (!file) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Length': file.length });
  createReadStream(file.path).on('error', error => res.destroy(error)).pipe(res);
});
// Retain idle connections longer than the six-second segment interval.
server.keepAliveTimeout = 15_000;
const port = await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
let totalBytes = 0;
let totalRequests = 0;
const maxBytes = 1_250_000_000;
const maxRequests = 4000;
async function run(viewers) {
  const timing = [];
  let bytesRead = 0;
  let failures = 0;
  const launched = performance.now();
  async function fetchLocal(path) {
    const expected = assets.get(path).length;
    if (++totalRequests > maxRequests || (totalBytes += expected) > maxBytes)
      throw Error('Local benchmark safety limit reached');
    const started = performance.now();
    const bytes = await new Promise((success, failure) => {
      const req = http.get({ hostname:'127.0.0.1', port, path, agent:socket }, res => {
        let received = 0;
        res.on('data', chunk => { received += chunk.length; });
        res.on('error', failure);
        res.on('end', () => res.statusCode === 200 && received === expected
          ? success(received) : failure(Error('Incomplete asset')));
      });
      req.setTimeout(5000, () => req.destroy(Error('Request timeout')));
      req.on('error', failure);
    });
    timing.push(performance.now() - started);
    bytesRead += bytes;
  }
  await Promise.all(Array.from({ length:viewers }, async (_, i) => {
    const path = '/' + titles[i % titles.length] + '/';
    await delay(Math.floor(1000*i/viewers));
    try {
      await fetchLocal(path + 'master.m3u8');
      await fetchLocal(path + '480p/index.m3u8');
      const firstSegment = performance.now();
      for (let part=0; part<3; part++) {
        await delay(Math.max(0, firstSegment + part*6000 - performance.now()));
        await fetchLocal(path + '480p/seg-00' + part + '.ts');
      }
    } catch {
      failures++;
    }
  }));
  const seconds = (performance.now()-launched)/1000;
  timing.sort((a,b) => a-b);
  const p = percentile => Number((timing[Math.max(0, Math.ceil(timing.length*percentile)-1)] || 0).toFixed(2));
  console.log(JSON.stringify({ simulated_viewers:viewers, complete_requests:timing.length,
    failed_viewers:failures, duration_seconds:+seconds.toFixed(2), delivered_MB:+(bytesRead/1e6).toFixed(2),
    request_latency_ms:{p50:p(.5),p95:p(.95),p99:p(.99),max:p(1)} }));
  if (failures) process.exitCode=1;
}
try {
  console.log(JSON.stringify({ measured_utc:new Date().toISOString(), server:'loopback HTTP file streams',
    variant:'480p', segments_per_viewer:3, segment_seconds:6, start_ramp_seconds:1,
    limits:{max_requests:maxRequests,max_bytes:maxBytes}, runtime:process.version }));
  for (const viewers of [100,200,500]) await run(viewers);
} finally {
  socket.destroy();
  await new Promise(done => server.close(done));
}
