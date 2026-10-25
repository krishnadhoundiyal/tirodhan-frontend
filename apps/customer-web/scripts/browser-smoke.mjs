// Actual Chrome DOM/network/keyboard smoke tests. No browser package or live service needed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
const fixture = process.argv.includes('--fixture');
const output = resolve('../../.local/cw-p0-01/browser');
await mkdir(output, { recursive: true });
const root = resolve('dist');
let server, dev;
let origin;
if (fixture) {
  dev = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5187'],
    {
      env: { ...process.env, VITE_CUSTOMER_FIXTURE: 'true' },
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  origin = 'http://127.0.0.1:5187';
} else {
  server = createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(
        new URL(req.url, 'http://local.invalid').pathname,
      );
      if (!extname(pathname))
        pathname = `${pathname.replace(/\/$/, '')}/index.html`;
      const path = resolve(root, `.${pathname}`);
      if (!path.startsWith(root + sep)) throw new Error('Invalid path');
      const data = await readFile(path);
      res.setHeader(
        'Content-Type',
        {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.ttf': 'font/ttf',
          '.txt': 'text/plain',
        }[extname(path)] ?? 'application/octet-stream',
      );
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end('Not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = await mkdtemp(`${tmpdir()}/tirodhan-customer-browser-`);
const chrome = spawn(
  process.env.CHROME_BIN ??
    (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : 'google-chrome'),
  [
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
);
let log = '';
chrome.stderr.on('data', (d) => {
  log += d;
});
let chromeError;
chrome.on('error', (e) => {
  chromeError = e;
});
let socket;
try {
  for (
    let i = 0;
    i < 200 && !/DevTools listening on (ws:\/\/[^\s]+)/.test(log);
    i++
  ) {
    if (chromeError) throw chromeError;
    await wait(100);
  }
  const browserWs = log.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
  assert(browserWs, 'Chrome DevTools did not start');
  const address = new URL(browserWs).origin.replace('ws:', 'http:');
  const target = await (
    await fetch(`${address}/json/new?about:blank`, { method: 'PUT' })
  ).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    socket.addEventListener('open', r, { once: true });
    socket.addEventListener('error', j, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  const errors = [];
  const protectedNetwork = [];
  socket.addEventListener('message', (e) => {
    const value = JSON.parse(String(e.data));
    if (value.id) {
      const item = pending.get(value.id);
      if (item) {
        clearTimeout(item.timer);
        pending.delete(value.id);
        if (value.error) item.reject(new Error(JSON.stringify(value.error)));
        else item.resolve(value.result);
      }
    } else if (value.method === 'Runtime.exceptionThrown')
      errors.push(value.params.exceptionDetails.text);
    else if (
      value.method === 'Log.entryAdded' &&
      value.params.entry.level === 'error' &&
      !value.params.entry.url?.endsWith('/favicon.ico')
    )
      errors.push(value.params.entry.text);
    else if (
      value.method === 'Network.requestWillBeSent' &&
      ['Fetch', 'XHR'].includes(value.params.type)
    )
      protectedNetwork.push(value.params.request.url);
    else if (
      value.method === 'Network.responseReceived' &&
      value.params.response.status >= 400 &&
      !value.params.response.url.endsWith('/favicon.ico')
    )
      errors.push(
        `HTTP ${value.params.response.status} ${value.params.response.url}`,
      );
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout ${method}`));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async (expression) => {
    for (let i = 0; i < 150; i++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await wait(100);
    }
    throw new Error(`Browser condition timed out: ${expression}`);
  };
  const navigate = async (path) => {
    await call('Page.navigate', { url: origin + path });
    await until(
      `location.pathname===${JSON.stringify(path)}&&document.readyState==='complete'&&document.querySelector('h1')`,
    );
    await evaluate('document.fonts.ready');
  };
  const button = async (label) => {
    assert(
      await evaluate(
        `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)return false;b.click();return true;})()`,
      ),
      `Missing enabled button ${label}`,
    );
  };
  const screenshot = async (name) => {
    const { data } = await call('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await (
      await import('node:fs/promises')
    ).writeFile(`${output}/${name}.png`, Buffer.from(data, 'base64'));
  };
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Network.enable');
  await call('Log.enable');
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(origin);
      if (r.ok) break;
    } catch {}
    await wait(100);
  }
  if (!fixture) {
    await call('Emulation.setScriptExecutionDisabled', { value: true });
    for (const path of [
      '/',
      '/how-it-works',
      '/what-we-collect',
      '/availability',
      '/help',
      '/about',
      '/policies',
      '/policies/privacy',
      '/policies/terms',
    ]) {
      await navigate(path);
      assert.equal(await evaluate("document.querySelectorAll('h1').length"), 1);
      assert((await evaluate('document.title')).includes('Tirodhan'));
      assert(
        (await evaluate("document.querySelector('main').textContent.length")) >
          250,
      );
      assert(
        await evaluate(
          "Boolean(document.querySelector('meta[name=description]').content)",
        ),
      );
    }
    await navigate('/');
    for (const width of [390, 768, 1440]) {
      await call('Emulation.setDeviceMetricsOverride', {
        width,
        height: width === 1440 ? 1050 : 844,
        deviceScaleFactor: 1,
        mobile: false,
      });
      assert(
        await evaluate('document.documentElement.scrollWidth<=innerWidth'),
        `Public overflow ${width}`,
      );
      await screenshot(`public-${width}`);
    }
    await call('Emulation.setScriptExecutionDisabled', { value: false });
    await navigate('/account/addresses');
    await until(
      "document.body.textContent.includes('Online booking is not yet activated.')",
    );
    assert(
      await evaluate(
        "document.querySelector('meta[name=robots]').content.includes('noindex')",
      ),
    );
    assert(
      !(await evaluate('document.body.textContent')).includes(
        'DEVELOPMENT FIXTURE',
      ),
    );
    assert.equal(protectedNetwork.length, 0);
    await navigate('/');
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    });
    await call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    });
    assert.equal(
      await evaluate('document.activeElement.textContent'),
      'Skip to content',
    );
    await call('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: false,
    });
    assert(
      await evaluate(
        "(()=>{const d=document.querySelector('.mobile-menu');d.open=true;return getComputedStyle(d).display!=='none'&&d.querySelectorAll('a').length===5;})()",
      ),
    );
  } else {
    await navigate('/account/addresses');
    await until("document.body.textContent.includes('DEVELOPMENT FIXTURE')");
    await button('Enter development customer');
    await until("document.body.textContent.includes('Sample home')");
    await button('Select address');
    await button('Check selected address');
    await until(
      "document.body.textContent.includes('This address is serviceable.')",
    );
    for (const width of [390, 768, 1440]) {
      await call('Emulation.setDeviceMetricsOverride', {
        width,
        height: width === 1440 ? 1050 : 844,
        deviceScaleFactor: 1,
        mobile: false,
      });
      assert(
        await evaluate('document.documentElement.scrollWidth<=innerWidth'),
        `Account overflow ${width}`,
      );
      await screenshot(`account-${width}`);
    }
    await button('Add an address +');
    await until("document.activeElement.textContent==='Add a new address'");
    await evaluate("document.querySelector('textarea').focus()");
    await call('Input.insertText', { text: 'Browser fixture address' });
    await button('Save address');
    await until(
      "[...document.querySelectorAll('article')].some(a=>a.textContent.includes('Browser fixture address'))",
    );
    assert(
      await evaluate(
        "(()=>{const a=[...document.querySelectorAll('article')].find(a=>a.textContent.includes('Browser fixture address'));[...a.querySelectorAll('button')].find(b=>b.textContent==='Archive').click();return true;})()",
      ),
    );
    await button('Confirm archive');
    await until(
      "![...document.querySelectorAll('article')].some(a=>a.textContent.includes('Browser fixture address'))",
    );
    await button('Log out');
    await until("!document.body.textContent.includes('Sample home')");
    assert.equal(protectedNetwork.length, 0);
  }
  // An optional favicon 404 is harmless; application runtime errors are not.
  assert.deepEqual(errors, []);
  console.log(
    `${fixture ? 'Fixture' : 'Production'} Chrome smoke passed: navigation, responsive widths, account isolation, keyboard/DOM and zero live protected requests. Screenshots: ${output}`,
  );
} finally {
  socket?.close();
  chrome.kill();
  dev?.kill();
  if (server) await new Promise((r) => server.close(r));
}
