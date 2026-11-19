// Unit tests for the time limit and backoff used when asking Google (withinTime.ts, guide 21 section 15).
// Run: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { backoffMs, withinTime } from './withinTime.ts';

describe('the time limit for one class', () => {
  it('gives the answer when it comes in time', async () => {
    assert.equal(await withinTime(Promise.resolve(7), 50), 7);
  });
  it('gives up after the limit with a TimeoutError', async () => {
    const slow = new Promise((r) => setTimeout(() => r('late'), 200));
    await assert.rejects(withinTime(slow, 20), (e: Error) => e.name === 'TimeoutError');
  });
  it('passes on the work\'s own error', async () => {
    await assert.rejects(withinTime(Promise.reject(new Error('Google said no')), 50), /Google said no/);
  });
});

describe('waiting before trying Google again', () => {
  it('doubles each time, plus a little at random', () => {
    assert.equal(backoffMs(0, 16_000, () => 0), 1000);
    assert.equal(backoffMs(2, 16_000, () => 0.5), 4500);
  });
  it('never waits longer than the limit', () => assert.equal(backoffMs(10, 16_000, () => 0.9), 16_000));
});
