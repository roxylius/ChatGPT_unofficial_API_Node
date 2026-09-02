// src/utils/pageLock.js
// The Puppeteer service exposes exactly one shared Page. Two requests
// interacting with it at the same time (typing over each other, polling the
// wrong response, navigating mid-poll) silently corrupt each other's output.
// This is a tiny async mutex: every prompt-handling route funnels its work
// through withPageLock() so requests are serialized in arrival order.

let queue = Promise.resolve();

/**
 * Runs `task` once every previously queued task has settled, and returns a
 * promise for `task`'s own result/rejection.
 *
 * @param {() => Promise<any>} task
 * @returns {Promise<any>}
 */
function withPageLock(task) {
  const result = queue.then(() => task());
  // Swallow errors in the chain itself so one failed request doesn't wedge
  // the queue — each caller still awaits `result` and sees the real error.
  queue = result.catch(() => {});
  return result;
}

module.exports = { withPageLock };
