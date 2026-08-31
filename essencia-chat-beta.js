const fs = require('fs');
const path = require('path');
const Module = require('module');

// Entrada única da versão Beta atual.
// Mantém o runtime estável e aplica apenas os patches ativos da Beta.
const wrapperPath = path.join(__dirname, 'essencia-beta-runtime.js');
let wrapperSource = fs.readFileSync(wrapperPath, 'utf8');

const marker = "const runtimeFilename = path.join(__dirname, 'server.presence-lite.runtime.js');";
if (!wrapperSource.includes(marker)) {
  throw new Error('Essência Beta não encontrou o ponto seguro de extensão do runtime.');
}

wrapperSource = wrapperSource.replace(
  marker,
  "source = require('./runtime/v21-source-patch')(source);\n" +
  "source = require('./runtime/v23-source-patch')(source);\n" +
  "source = require('./runtime/v24-source-patch')(source);\n" +
  "source = require('./runtime/v25-source-patch')(source);\n" +
  "source = require('./runtime/beta-source-patch')(source);\n\n" + marker
);

const runtimeFilename = path.join(__dirname, 'server.essencia-beta.runtime.js');
const runtimeModule = new Module(runtimeFilename, module);
runtimeModule.filename = runtimeFilename;
runtimeModule.paths = module.paths;
runtimeModule._compile(wrapperSource, runtimeFilename);
