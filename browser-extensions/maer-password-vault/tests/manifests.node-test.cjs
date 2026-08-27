'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { extensionRoot } = require('./helpers.cjs');

function manifest(browser) {
  return JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifests', `${browser}.json`), 'utf8'));
}

for (const browser of ['chromium', 'firefox']) {
  test(`${browser} manifest is MV3, local-only and storage-free`, () => {
    const value = manifest(browser);
    assert.equal(value.manifest_version, 3);
    assert.ok(value.permissions.includes('nativeMessaging'));
    assert.ok(value.permissions.includes('activeTab'));
    assert.equal(value.permissions.includes('storage'), false);
    assert.deepEqual(value.host_permissions, ['http://*/*', 'https://*/*']);
    assert.equal(value.externally_connectable, undefined);
    assert.equal(value.content_scripts[0].all_frames, false);
    assert.equal(value.content_scripts[0].match_about_blank, false);
    assert.equal(value.content_security_policy.extension_pages, "script-src 'self'; object-src 'self'");
  });
}

test('Chromium uses a service worker and Firefox uses ordered background scripts', () => {
  assert.equal(manifest('chromium').background.service_worker, 'background/service-worker.js');
  assert.deepEqual(manifest('firefox').background.scripts, [
    'common/constants.js',
    'common/protocol.js',
    'background/native-client.js',
    'background/service-worker.js'
  ]);
  assert.equal(manifest('firefox').browser_specific_settings.gecko.id, 'password-vault@maer.fr');
});
