const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadTypeScriptModule(relativePath) {
  const modulePath = path.resolve(__dirname, relativePath);
  const source = fs.readFileSync(modulePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function('exports', 'require', 'module', '__filename', '__dirname', compiled)(
    loadedModule.exports,
    require,
    loadedModule,
    modulePath,
    path.dirname(modulePath),
  );
  return loadedModule.exports;
}

const api = loadTypeScriptModule('../lib/api.ts');
const media = loadTypeScriptModule('../lib/media.ts');

async function expectUploadError(payload, status, expectedMessage) {
  const previousFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  try {
    await assert.rejects(
      api.liveAvatars.createImage(new Blob(['image']), 720, true),
      { message: expectedMessage },
    );
  } finally {
    global.fetch = previousFetch;
  }
}

test('formats nested provider errors and keeps the HTTP status', async () => {
  await expectUploadError(
    { detail: { message: 'Image resolution is too low' } },
    422,
    'Image resolution is too low (HTTP 422)',
  );
});

test('formats FastAPI validation errors with their field path', async () => {
  await expectUploadError(
    { detail: [{ loc: ['body', 'file'], msg: 'Field required' }] },
    422,
    'body.file: Field required (HTTP 422)',
  );
});

test('uses an HTTP fallback for unrecognized error objects', async () => {
  await expectUploadError(
    { detail: { provider_code: 'unknown' } },
    502,
    'Upload failed (HTTP 502)',
  );
});

test('normalizes speech errors with nested details and HTTP status', async () => {
  const response = new Response(JSON.stringify({ detail: { message: 'Speech quota exceeded' } }), {
    status: 429,
    headers: { 'Content-Type': 'application/json' },
  });

  const error = await api.apiResponseError(response, 'Speech request failed');

  assert.equal(error.message, 'Speech quota exceeded (HTTP 429)');
});

test('plays the subscribed avatar audio without muting its output', async () => {
  let playCalled = false;
  const audio = {
    muted: true,
    play: async () => { playCalled = true; },
  };

  await media.playAvatarAudio(audio, () => assert.fail('Playback should not have been blocked'));

  assert.equal(audio.muted, false);
  assert.equal(playCalled, true);
});

test('reports when browser autoplay blocks avatar audio', async () => {
  let blocked = false;
  const audio = {
    muted: true,
    play: () => Promise.reject(new Error('Autoplay blocked')),
  };

  await media.playAvatarAudio(audio, () => { blocked = true; });

  assert.equal(audio.muted, false);
  assert.equal(blocked, true);
});
