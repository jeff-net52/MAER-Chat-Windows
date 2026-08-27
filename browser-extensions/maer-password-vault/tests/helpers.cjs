'use strict';

const path = require('node:path');

const extensionRoot = path.resolve(__dirname, '..');

function loadProtocol() {
  delete global.MaerVault;
  const files = [
    path.join(extensionRoot, 'src', 'common', 'constants.js'),
    path.join(extensionRoot, 'src', 'common', 'protocol.js')
  ];
  for (const file of files) {
    delete require.cache[require.resolve(file)];
    require(file);
  }
  return global.MaerVault;
}

function loadNativeClient() {
  const namespace = loadProtocol();
  const clientPath = path.join(extensionRoot, 'src', 'background', 'native-client.js');
  delete require.cache[require.resolve(clientPath)];
  require(clientPath);
  return namespace;
}

module.exports = { extensionRoot, loadNativeClient, loadProtocol };
