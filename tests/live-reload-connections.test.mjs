import test from 'node:test';
import assert from 'node:assert/strict';

import { LiveReloadConnections } from '../tools/live-reload-connections.js';

test('connection sequence increases for every accepted connection', () => {
  const connections = new LiveReloadConnections();
  const first = {};
  const second = {};

  connections.add(first);
  assert.equal(connections.size, 1);
  assert.equal(connections.connectionSeq, 1);

  connections.add(second);
  assert.equal(connections.size, 2);
  assert.equal(connections.connectionSeq, 2);
});

test('disconnecting clients does not reuse an earlier sequence number', () => {
  const connections = new LiveReloadConnections();
  const client = {};

  connections.add(client);
  connections.delete(client);

  assert.equal(connections.size, 0);
  assert.equal(connections.connectionSeq, 1);

  connections.add(client);
  assert.equal(connections.size, 1);
  assert.equal(connections.connectionSeq, 2);
});
