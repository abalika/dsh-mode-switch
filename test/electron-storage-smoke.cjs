// Run twice in separate Electron processes against an isolated test profile.
const { app, session, BrowserWindow } = require('electron');
const fs = require('original-fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PARTITION, mainSource, patchArchive } = require('../desktop/persistent-session.cjs');
const [phase, origin, userData] = process.argv.slice(process.argv.indexOf('--') + 1);
app.setPath('userData', userData);
app.whenReady().then(async () => {
  const source = mainSource(patchArchive(fs.readFileSync(process.env.DSH_TEST_ARCHIVE))).toString();
  const start = source.indexOf('var DesktopBrowserGuests = class');
  if (start < 0 || source.indexOf('//#endregion', start) < 0) throw new Error('Desktop browser implementation was not found.');
  const code = source.slice(start, source.indexOf('//#endregion', start));
  const Guests = vm.runInNewContext(code + '; DesktopBrowserGuests', { session, randomUUID, URL });
  const guests = new Guests(() => undefined);
  const owner = {}, reserved = guests.acquire(owner, 'dsh-mode-switch:deepseek');
  const { partition } = reserved;
  assert.equal(partition, PARTITION);
  const otherA = guests.acquire(owner, 'smoke:other-a'), otherB = guests.acquire(owner, 'smoke:other-b');
  assert.equal(otherA.partition.startsWith('persist:'), false);
  assert.equal(otherB.partition.startsWith('persist:'), false);
  assert.notEqual(otherA.partition, otherB.partition);
  await assert.rejects(guests.release({}, reserved.lease), /belongs to another window/);
  await guests.release(owner, reserved.lease);
  const reopened = guests.acquire(owner, 'dsh-mode-switch:deepseek');
  assert.equal(reopened.partition, partition);
  assert.notEqual(reopened.lease, reserved.lease);
  await guests.release(owner, otherA.lease);
  await guests.release(owner, otherB.lease);
  console.log('SMOKE ownership: exact persistent workspace; other workspaces ephemeral; foreign-owner release denied');
  const ses = session.fromPartition(partition);
  const window = new BrowserWindow({ show: false, webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await window.loadURL(origin);
  if (phase === 'write') {
    await ses.cookies.set({ url: origin, name: 'dsh_persistence_smoke', value: 'test-only', httpOnly: true, expirationDate: Date.now() / 1000 + 3600 });
    await window.webContents.executeJavaScript(`(async () => {
      localStorage.setItem('dsh_persistence_smoke', 'test-only');
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('dsh-persistence-smoke', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('state');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('state', 'readwrite');
          tx.objectStore('state').put('test-only', 'value');
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      });
    })()`);
    await ses.cookies.flushStore();
    ses.flushStorageData();
    console.log('SMOKE write: persistent cookie, localStorage, IndexedDB saved');
  } else {
    const cookie = (await ses.cookies.get({ url: origin, name: 'dsh_persistence_smoke' }))[0];
    if (cookie?.value !== 'test-only') throw new Error('Cookie did not survive restart');
    const result = await window.webContents.executeJavaScript(`(async () => {
      const stored = localStorage.getItem('dsh_persistence_smoke');
      const indexed = await new Promise((resolve, reject) => {
        const request = indexedDB.open('dsh-persistence-smoke', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const query = db.transaction('state').objectStore('state').get('value');
          query.onsuccess = () => { db.close(); resolve(query.result); };
          query.onerror = () => reject(query.error);
        };
      });
      return { stored, indexed };
    })()`);
    if (result.stored !== 'test-only' || result.indexed !== 'test-only' || !ses.isPersistent()) throw new Error('Web storage did not survive restart');
    console.log('SMOKE read: cookie, localStorage, IndexedDB survived process restart');
  }
  window.destroy();
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
