const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
(async () => {
  if (!process.env.DSH_TEST_ELECTRON || !process.env.DSH_TEST_ARCHIVE) throw new Error('Set DSH_TEST_ELECTRON to an Electron executable and DSH_TEST_ARCHIVE to a supported app.asar. Only an isolated test profile is used.');
  for (const file of [process.env.DSH_TEST_ELECTRON, process.env.DSH_TEST_ARCHIVE]) if (!fs.statSync(file).isFile()) throw new Error('Test executable/archive must be files.');
  const server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>DSH storage test</title>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-storage-smoke-'));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    for (const phase of ['write', 'read']) {
      const { stdout } = await execute(process.env.DSH_TEST_ELECTRON, [
        path.join(__dirname, 'electron-storage-smoke.cjs'), '--', phase,
        `http://127.0.0.1:${server.address().port}/`, userData,
      ], { env, windowsHide: true, timeout: 30000 });
      console.log(stdout.trim());
    }
    console.log('Synthetic test profile retained in the OS temp directory:', userData);
  } finally { server.close(); }
})().catch(error => { console.error(error.code, error.signal, error.message, error.stdout || '', error.stderr || ''); process.exitCode = 1; });
