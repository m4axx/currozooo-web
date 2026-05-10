const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const DEST = path.join(__dirname, 'assets', 'instagram');
if (!fs.existsSync(DEST)) fs.mkdirSync(DEST, { recursive: true });

const RECEIVER_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Image Receiver</title>
<style>body{background:#04040a;color:#00f5ff;font-family:monospace;padding:24px;}pre{font-size:14px;line-height:1.6;}</style>
</head>
<body>
<pre id="log">Leyendo window.name...</pre>
<script>
(async function() {
  const log = document.getElementById('log');
  const raw = window.name;
  if (!raw || raw.length < 10) {
    log.textContent = 'ERROR: window.name vacío. Ejecuta el bookmarklet primero en Instagram.';
    return;
  }
  let data;
  try { data = JSON.parse(raw); } catch(e) { log.textContent = 'JSON parse error: ' + e.message; return; }
  const keys = Object.keys(data);
  log.textContent = 'Encontradas ' + keys.length + ' imágenes. Descargando...\\n';
  let saved = 0;
  for (const k of keys) {
    if (!data[k]) continue;
    const fname = k === 'profile' ? 'profile.jpg' : k + '.jpg';
    const val = data[k];
    const isUrl = val.startsWith('http');
    try {
      const res = await fetch(isUrl ? '/save-url' : '/save', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(isUrl ? {filename: fname, url: val} : {filename: fname, data: val})
      });
      if (res.ok) { saved++; log.textContent += '✓ ' + fname + '\\n'; }
      else { const t = await res.text(); log.textContent += '✗ ' + fname + ': ' + t + '\\n'; }
    } catch(e) { log.textContent += '✗ ' + fname + ': ' + e.message + '\\n'; }
  }
  log.textContent += '\\nListo! Guardadas: ' + saved + '/' + keys.length;
  window.name = '';
  await fetch('/done');
})();
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors); res.end(); return;
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/receiver')) {
    res.writeHead(200, { ...cors, 'Content-Type': 'text/html' });
    res.end(RECEIVER_HTML);
    return;
  }

  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { filename, data } = JSON.parse(body);
        const b64 = data.includes(',') ? data.split(',')[1] : data;
        const buf = Buffer.from(b64, 'base64');
        fs.writeFileSync(path.join(DEST, filename), buf);
        console.log(`✓ ${filename} — ${buf.length} bytes`);
        res.writeHead(200, { ...cors, 'Content-Type': 'text/plain' });
        res.end('ok');
      } catch (e) {
        console.error('Error:', e.message);
        res.writeHead(500, cors); res.end('error');
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/save-url') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { filename, url } = JSON.parse(body);
        const dest = path.join(DEST, filename);
        const proto = url.startsWith('https') ? https : http;
        const reqImg = proto.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://www.instagram.com/',
          }
        }, (imgRes) => {
          if (imgRes.statusCode === 301 || imgRes.statusCode === 302) {
            const redir = imgRes.headers.location;
            const p2 = redir.startsWith('https') ? https : http;
            p2.get(redir, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.instagram.com/' } }, (r2) => {
              const chunks = [];
              r2.on('data', c => chunks.push(c));
              r2.on('end', () => { fs.writeFileSync(dest, Buffer.concat(chunks)); console.log(`✓ ${filename}`); });
            });
          } else {
            const chunks = [];
            imgRes.on('data', c => chunks.push(c));
            imgRes.on('end', () => { fs.writeFileSync(dest, Buffer.concat(chunks)); console.log(`✓ ${filename}`); });
          }
        });
        reqImg.on('error', e => console.error(`✗ ${filename}: ${e.message}`));
        res.writeHead(200, { ...cors, 'Content-Type': 'text/plain' });
        res.end('ok');
      } catch (e) {
        console.error('Error:', e.message);
        res.writeHead(500, cors); res.end(e.message);
      }
    });
    return;
  }

  if (req.url === '/done') {
    console.log('\nAll done — closing server.');
    res.writeHead(200, cors); res.end('done');
    setTimeout(() => server.close(), 500);
    return;
  }

  res.writeHead(404, cors); res.end('not found');
});

server.listen(7777, () => {
  console.log('Receiver ready at http://localhost:7777/receiver');
  console.log(`Saving to: ${DEST}`);
});
