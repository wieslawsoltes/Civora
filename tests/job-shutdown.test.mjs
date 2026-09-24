import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {OperationsStore} from '../server/operations.mjs';
import {createJobRunner} from '../server/jobs.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('rendition shutdown settles workers terminated during startup without hanging', {timeout: 15000}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'civora-stop-test-'));
  const ops = new OperationsStore(directory);
  let runner;
  try {
    const blob = new Blob(['Source text']);
    const hash = createHash('sha256').update('Source text').digest('hex');
    const document = {id: 'doc', projectId: 'p', name: 'source.txt', versions: [{id:'v', hash, blobId:hash, label:'P01'}]};
    for (let i = 0; i < 20; i++) {
      document.versions[0].id = 'v' + i;
      runner = await createJobRunner({ops, dataDir: directory, store: {
        read: async () => ({documents:[document]}), blob: async () => blob
      }});
      const job = runner.enqueue(document, document.versions[0], 'pdf', 'admin');
      const running = runner.tick();
      await delay(i % 4);
      await runner.close();
      await running;
      assert.ok(['queued','running','completed','failed'].includes(ops.job(job.id).status));
    }
  } finally {
    await runner?.close();
    ops.close();
    await rm(directory, {recursive:true, force:true});
  }
});
