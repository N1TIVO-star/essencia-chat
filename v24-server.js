const fs = require('fs');
const path = require('path');
const Module = require('module');

// V24 mantém a base atual e aplica V21 + V23 + correção administrativa V24
// antes de compilar o runtime do presence-lite-server.
const wrapperPath = path.join(__dirname, 'presence-lite-server.js');
let wrapperSource = fs.readFileSync(wrapperPath, 'utf8');

const marker = "const runtimeFilename = path.join(__dirname, 'server.presence-lite.runtime.js');";
if (!wrapperSource.includes(marker)) {
  throw new Error('V24 não encontrou o ponto seguro de extensão da base atual.');
}

wrapperSource = wrapperSource.replace(
  marker,
  "source = require('./v21-source-patch')(source);\n" +
  "source = require('./v23-source-patch')(source);\n" +
  "source = require('./v24-source-patch')(source);\n\n" + marker
);

const runtimeFilename = path.join(__dirname, 'server.v24-wrapper.runtime.js');
const runtimeModule = new Module(runtimeFilename, module);
runtimeModule.filename = runtimeFilename;
runtimeModule.paths = module.paths;
runtimeModule._compile(wrapperSource, runtimeFilename);
