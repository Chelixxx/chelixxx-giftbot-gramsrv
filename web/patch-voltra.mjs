import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if(!root) throw new Error('Pass the extracted Web client directory as the first argument.');

function replaceOnce(file, oldText, newText, label) {
  const filePath = path.join(root, file);
  const source = fs.readFileSync(filePath, 'utf8');
  const count = source.split(oldText).length - 1;
  if(count !== 1) throw new Error('Patch "' + label + '" expected exactly one match in ' + file + ', found ' + count + '.');
  fs.writeFileSync(filePath, source.replace(oldText, newText), 'utf8');
}

const railwayKey = 'bfd71296999350d47aeeee35bce83a67bfa3709559cbfd84871386d2bea4bfcee2614339ac63f6856b7c1e26a798a0964e42da82089dc5232bea4f11123e25e1ab8d2d769d7a1a928f99cc5b4118544f9c9f9c4bf365647a37659c81155d4a35c8962fd82edb6fb517c3792123205fe56f824077ede25c5638ad701dff404663c181cd7cc716eece0f4027962f28bd3533473044a5587a9ce0674ab284a0e1f6d45a4f4ae2ef50b964b5e7af51e80398d32e4ebf623cd4c2f578fac1349b932af667249b8d891a0ee09604a83ea116fae36a5fea400fdd2ece7a8cd05cde0c7c6de04cec11c90bfa0130262d54fd7518ad8e54e0d679ef70be24755d226f2d45';

replaceOnce(
  'src/lib/mtproto/rsaKeysManager.ts',
  '  }];\n\n  private publicKeysParsed: {',
  "  }, {\n    // VOLTRA Railway production server key.\n    // Public key fingerprint: 0x06a330bd65d9ae03.\n    modulus: '" + railwayKey + "',\n    exponent: '010001'\n  }];\n\n  private publicKeysParsed: {",
  'VOLTRA Railway RSA key'
);

const oldHttp = "    const httpPromise = deferredPromise<boolean>();\n" +
"    ((this.transports.https as HTTP)._send(new Uint8Array(), 'no-cors') as any as Promise<any>)\n" +
"    .then(() => httpPromise.resolve(true), () => httpPromise.resolve(false));\n" +
"    setTimeout(() => httpPromise.resolve(false), timeout);";
const newHttp = "    const httpPromise = deferredPromise<boolean>();\n" +
"    const httpTransport = transports.https as HTTP | undefined | null;\n" +
"    if(httpTransport && typeof (httpTransport as any)._send === 'function') {\n" +
"      ((httpTransport as any)._send(new Uint8Array(), 'no-cors') as Promise<any>)\n" +
"      .then(() => httpPromise.resolve(true), () => httpPromise.resolve(false));\n" +
"      setTimeout(() => httpPromise.resolve(false), timeout);\n" +
"    } else {\n" +
"      // Private Telesrv DC has no Telegram HTTP transport.\n" +
"      httpPromise.resolve(false);\n" +
"    }";
replaceOnce('src/lib/mtproto/transports/controller.ts', oldHttp, newHttp, 'HTTP transport guard');

const oldSocket = "    const websocketPromise = deferredPromise<boolean>();\n" +
"    const socket = transports.websocket as TcpObfuscated;\n" +
"    socket.setAutoReconnect(false);\n" +
"    socket.connection.addEventListener('close', () => websocketPromise.resolve(false), {once: true});\n" +
"    socket.connection.addEventListener('open', () => websocketPromise.resolve(true), {once: true});\n" +
"    setTimeout(() => {\n" +
"      if(websocketPromise.isFulfilled || websocketPromise.isRejected) {\n" +
"        return;\n" +
"      }\n\n" +
"      if(socket.connection) {\n" +
"        socket.connection.close();\n" +
"      }\n\n" +
"      websocketPromise.resolve(false);\n" +
"    }, timeout);";
const newSocket = "    const websocketPromise = deferredPromise<boolean>();\n" +
"    const socket = transports.websocket as TcpObfuscated | undefined | null;\n" +
"    if(socket) {\n" +
"      socket.setAutoReconnect(false);\n" +
"      socket.connection.addEventListener('close', () => websocketPromise.resolve(false), {once: true});\n" +
"      socket.connection.addEventListener('open', () => websocketPromise.resolve(true), {once: true});\n" +
"      setTimeout(() => {\n" +
"        if(websocketPromise.isFulfilled || websocketPromise.isRejected) {\n" +
"          return;\n" +
"        }\n\n" +
"        if(socket.connection) {\n" +
"          socket.connection.close();\n" +
"        }\n\n" +
"        websocketPromise.resolve(false);\n" +
"      }, timeout);\n" +
"    } else {\n" +
"      websocketPromise.resolve(false);\n" +
"    }";
replaceOnce('src/lib/mtproto/transports/controller.ts', oldSocket, newSocket, 'WebSocket transport guard');
replaceOnce('src/lib/mtproto/transports/controller.ts', '      transport.destroy();', '      transport?.destroy();', 'Optional transport cleanup');

const host = process.env.VOLTRA_WEB_HOST || 'chelixxx-giftbot-gramsrv.pages.dev';
const brand = path.join(root, 'src/config/brand.ts');
let brandText = fs.readFileSync(brand, 'utf8');
const brandReplacements = [
  ["export const TELESRV_NAME = 'Telesrv';", "export const TELESRV_NAME = 'VOLTRA';"],
  ["export const TELESRV_WEB_K_NAME = 'Telesrv Web K';", "export const TELESRV_WEB_K_NAME = 'VOLTRA Web';"],
  ["export const TELESRV_SCHEME = 'telesrv';", "export const TELESRV_SCHEME = 'voltra';"],
  ["export const TELESRV_PUBLIC_HOST = 'telesrv.net';", "export const TELESRV_PUBLIC_HOST = '" + host + "';"],
  ["export const TELESRV_WEB_A_URL = 'https://web.telesrv.net/';", "export const TELESRV_WEB_A_URL = 'https://" + host + "/';"],
  ["export const TELESRV_WEB_K_URL = 'https://webk.telesrv.net/';", "export const TELESRV_WEB_K_URL = 'https://" + host + "/';"],
  ["export const TELESRV_WEB_DOMAINS = ['web.telesrv.net', 'webk.telesrv.net'];", "export const TELESRV_WEB_DOMAINS = ['" + host + "'];"]
];
for(const [from, to] of brandReplacements) {
  const count = brandText.split(from).length - 1;
  if(count !== 1) throw new Error('Brand patch expected one match for: ' + from + ', found ' + count);
  brandText = brandText.replace(from, to);
}
fs.writeFileSync(brand, brandText, 'utf8');

const vitePath = path.join(root, 'vite.config.ts');
let viteText = fs.readFileSync(vitePath, 'utf8');
const oldContext = "  context: {\n" +
"    title: 'Telesrv Web K',\n" +
"    description: 'A private, self-hosted messaging client for telesrv.',\n" +
"    url: 'https://webk.telesrv.net/',\n" +
"    origin: 'https://webk.telesrv.net/'\n" +
"  }";
const newContext = "  context: {\n" +
"    title: 'VOLTRA Web',\n" +
"    description: 'Private messaging on VOLTRA.',\n" +
"    url: 'https://" + host + "/',\n" +
"    origin: 'https://" + host + "/'\n" +
"  }";
const contextCount = viteText.split(oldContext).length - 1;
if(contextCount !== 1) throw new Error('HTML branding patch expected one match, found ' + contextCount + '.');
viteText = viteText.replace(oldContext, newContext);
fs.writeFileSync(vitePath, viteText, 'utf8');

console.log('VOLTRA RSA, transport, and branding patches applied.');
