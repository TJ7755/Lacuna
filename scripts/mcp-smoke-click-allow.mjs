import http from 'node:http';
import WebSocket from 'ws';

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:9223${path}`, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

let target;
for (let attempt = 0; attempt < 80; attempt += 1) {
  try {
    const targets = await getJson('/json/list');
    target = targets.find((candidate) => candidate.type === 'page' && candidate.url === 'http://localhost:5173/');
    if (target) break;
  } catch {
    // Electron may not have opened its debug endpoint yet.
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!target) throw new Error('Lacuna renderer did not appear.');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once('open', resolve);
  socket.once('error', reject);
});

let id = 0;
const pending = new Map();
socket.on('message', (raw) => {
  const message = JSON.parse(raw.toString());
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
function evaluate(expression) {
  const requestId = ++id;
  socket.send(JSON.stringify({ id: requestId, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  return new Promise((resolve) => pending.set(requestId, resolve));
}

const expectedApprovals = Number(process.argv[2] ?? 2);
let approvals = 0;
for (let attempt = 0; attempt < 240 && approvals < expectedApprovals; attempt += 1) {
  const result = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === 'Allow');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (result.result?.result?.value === true) {
    approvals += 1;
    console.error(`SMOKE approved-consent=${approvals}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

socket.close();
if (approvals !== expectedApprovals) throw new Error(`Expected ${expectedApprovals} consent prompts, approved ${approvals}.`);
