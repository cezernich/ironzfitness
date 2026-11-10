'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup() {
  let uid = 'synthetic-a', error = null, gate = null, dispatchSwap = null;
  let reply = { revision: 1, currentRevision: 1, requestId: '10000000-0000-0000-0000-000000000001', replayed: false };
  const calls = [], writes = [];
  const context = {
    console, navigator: { onLine: true }, setTimeout: () => 0, clearTimeout() {},
    localStorage: { getItem: key => key === 'ironz_last_user_id' ? uid : null, setItem: (...args) => writes.push(args) },
  };
  context.window = context;
  context.supabaseClient = {
    auth: { getSession: async () => ({ data: { session: uid ? { user: { id: uid } } : null } }), refreshSession: async () => ({ data: {} }) },
    from(table) {
      assert.equal(table, 'training_workspaces');
      return { select() { return this; }, eq(key, owner) { calls.push({ key, owner }); return this; }, async maybeSingle() {
        if (gate) await gate;
        return { data: null, error };
      } };
    },
    async rpc(name, args) {
      calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
      if (gate) await gate;
      const capturedActor=uid;
      if(dispatchSwap)uid=dispatchSwap;
      const boundError=args.p_expected_user_id!==uid?{code:'42501'}:null;
      uid=capturedActor;
      return { data: boundError?null:reply, error: boundError||error };
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/db.js'), 'utf8') + '\nthis.service = DB.trainingWorkspace;', context);
  return { service: context.service, calls, writes, user(value) { uid = value; }, fail(value) { error = value; }, reply(value) { reply = value; }, wait(value) { gate = value; }, swap(value) { dispatchSwap = value; } };
}

(async () => {
  const h = setup();
  const initial = await h.service.load();
  assert.equal(initial.revision, 0);
  assert.equal(h.calls[0].owner, 'synthetic-a');
  const request = { expectedUserId: 'synthetic-a', expectedRevision: 0, requestId: '10000000-0000-0000-0000-000000000001', command: { kind: 'replace_inputs', payload: {} } };
  const saved = await h.service.command(request);
  assert.equal(saved.needsReload, false);
  assert.equal(h.calls.at(-1).args.p_expected_revision, 0);
  assert.equal(h.calls.at(-1).args.p_request_id, request.requestId);
  h.reply({ revision: 1, currentRevision: 3, requestId: request.requestId, replayed: true });
  assert.equal((await h.service.command(request)).needsReload, true, 'old acknowledgement is visibly stale');
  h.fail({ code: '40001' });
  const count = h.calls.length;
  await assert.rejects(h.service.command(request), /another device/);
  assert.equal(h.calls.length, count + 1, 'conflict does not automatically retry against a newer revision');
  assert.equal(h.writes.length, 0, 'neither failures nor old acknowledgements overwrite the device cache');
  await assert.rejects(h.service.load(), /could not be loaded/);
  h.fail(null);
  h.swap('synthetic-b');
  await assert.rejects(h.service.command(request), /account changed/, 'token swap A-B-A is rejected by the bound server command');
  assert.equal(h.calls.at(-1).args.p_expected_user_id,'synthetic-a');
  h.swap(null);
  h.user('synthetic-b');
  const callsBeforeWrongAccount=h.calls.length;
  await assert.rejects(h.service.command(request), /original account/);
  assert.equal(h.calls.length,callsBeforeWrongAccount,'retry cannot be rebound to another account');
  h.user('synthetic-a');
  let resume;
  h.wait(new Promise(resolve => { resume = resolve; }));
  const changing = h.service.command(request);
  await new Promise(resolve => setImmediate(resolve));
  h.user('synthetic-b');
  resume();
  await assert.rejects(changing, /account changed/);
  h.wait(null);
  h.user('synthetic-a');
  h.wait(new Promise(resolve => { resume = resolve; }));
  const signingOut = h.service.load();
  await new Promise(resolve => setImmediate(resolve));
  h.user(null);
  resume();
  await assert.rejects(signingOut, /account changed/);
  h.wait(null);
  h.user(null);
  await assert.rejects(h.service.command(request), /Sign in/);
  await assert.rejects(h.service.command({ ...request, expectedRevision: undefined }), /revision/);
  console.log('PASS: server workspace owner checks, revision conflicts, stable retry IDs, stale acknowledgements and no cache writes');
})().catch(error => { console.error(error); process.exitCode = 1; });
