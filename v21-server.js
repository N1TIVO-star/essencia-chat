const fs = require('fs');
const path = require('path');
const Module = require('module');

// Mantém toda a base V20 intacta e injeta as camadas V21/V23 imediatamente antes
// de o runtime legado compilar server.js. Assim o rollback continua simples.
const wrapperPath = path.join(__dirname, 'presence-lite-server.js');
let wrapperSource = fs.readFileSync(wrapperPath, 'utf8');

const marker = "const runtimeFilename = path.join(__dirname, 'server.presence-lite.runtime.js');";
if (!wrapperSource.includes(marker)) {
  throw new Error('V23 não encontrou o ponto seguro de extensão da base V20.');
}

wrapperSource = wrapperSource.replace(
  marker,
  "source = require('./v21-source-patch')(source);\nsource = require('./v23-source-patch')(source);\n\n" + marker
);

const runtimeFilename = path.join(__dirname, 'server.presence-lite.v23-wrapper.runtime.js');
const runtimeModule = new Module(runtimeFilename, module);
runtimeModule.filename = runtimeFilename;
runtimeModule.paths = module.paths;
runtimeModule._compile(wrapperSource, runtimeFilename);
