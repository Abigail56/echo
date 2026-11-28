const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const apiPath = path.resolve(__dirname, '../lib/api.ts');
const source = fs.readFileSync(apiPath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const apiModule = { exports: {} };
new Function('exports', 'require', 'module', '__filename', '__dirname', compiled)(
  apiModule.exports,
  require,
  apiModule,
  apiPath,
  path.dirname(apiPath),
);

async function expectUploadError(payload, status, expectedMessage) {
  const previousFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  try {
    await assert.rejects(
      apiModule.exports.liveAvatars.createImage(new Blob(['image']), 720, true),
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
