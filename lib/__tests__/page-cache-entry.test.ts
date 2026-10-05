import assert from 'node:assert/strict';
import test from 'node:test';
import { createCachedPostPage, readCachedPostPage } from '../page-cache-entry';
import { getManifest, readPage, writePage } from '../idb-cache';

test('cached pages retain ordered payloads when the same ID is written by another base or generation', () => {
  const first = createCachedPostPage('/a', 3, 'G1', [{ id: 'same', title: 'original' }, { id: 'other', title: 'second' }], 1);
  const otherBase = createCachedPostPage('/b', 2, 'G2', [{ id: 'same', title: 'different base' }], 2);
  const otherGeneration = createCachedPostPage('/a', 2, 'G2', [{ id: 'same', title: 'different generation' }], 3);
  const cache = new Map([['/a|3', structuredClone(first)], ['/b|2', structuredClone(otherBase)], ['/a|2', structuredClone(otherGeneration)]]);
  assert.deepEqual(readCachedPostPage(cache.get('/a|3'), '/a', 3, 'G1'), [{ id: 'same', title: 'original' }, { id: 'other', title: 'second' }]);
  assert.equal(readCachedPostPage(cache.get('/a|3'), '/a', 3, 'G2'), null);
  assert.equal(readCachedPostPage(cache.get('/a|3'), '/b', 3, 'G1'), null);
  assert.equal(readCachedPostPage(cache.get('/a|3'), '/a', 2, 'G1'), null);
});

test('an empty complete page is a hit and a legacy ID-only page is a miss', () => {
  assert.deepEqual(readCachedPostPage(createCachedPostPage('/a', 2, 'G1', [], 1), '/a', 2, 'G1'), []);
  assert.equal(readCachedPostPage({ base: '/a', page: 2, version: 'G1', postIds: ['same'], storedAt: 1, lastAccess: 1 }, '/a', 2, 'G1'), null);
});

test('a partial, reordered, or invalid cached payload is rejected as a whole', () => {
  const complete = createCachedPostPage('/a', 2, 'G1', [{ id: 'one' }, { id: 'two' }], 1);
  assert.equal(readCachedPostPage({ ...complete, posts: [{ id: 'one' }] }, '/a', 2, 'G1'), null);
  assert.equal(readCachedPostPage({ ...complete, posts: [{ id: 'two' }, { id: 'one' }] }, '/a', 2, 'G1'), null);
  assert.equal(readCachedPostPage({ ...complete, posts: [{ id: 'one' }, null] }, '/a', 2, 'G1'), null);
  assert.equal(readCachedPostPage({ ...complete, posts: [{ id: 'one' }, { id: '' }] }, '/a', 2, 'G1'), null);
});

test('denied IndexedDB does not prevent a network manifest or turn page cache into an error', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousIDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const previousFetch = globalThis.fetch;
  const denied = { open() { throw new Error('storage denied'); } };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { indexedDB: denied } });
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: denied });
  const manifest = { generatedAt: 'G1', lastPage: 2 };
  let requests = 0;
  globalThis.fetch = async input => { assert.equal(input, '/a/manifest.json'); requests++; return Response.json(manifest); };
  try {
    assert.deepEqual(await getManifest('/a'), manifest);
    assert.equal(requests, 1);
    assert.equal(await readPage('/a', 2, 'G1'), null);
    await writePage('/a', 2, 'G1', []);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (previousIDB) Object.defineProperty(globalThis, 'indexedDB', previousIDB); else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
});
