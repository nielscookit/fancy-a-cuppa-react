import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { iosPilotMode, iosPilotMarker } from './ios-pilot-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);

if (['ios/uc02-local.generated.xcconfig', 'ios/App/App/Info.UC02Local.generated.plist'].some(path => existsSync(path))) {
  throw new Error('Use a separate pilot worktree. Fancy Test has generated configuration in this checkout.');
}
await build({ configFile: 'vite.native.config.js', mode: iosPilotMode });
execFileSync(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'ios'], { stdio: 'inherit' });

const app = 'ios/App/App/';
const config = JSON.parse(readFileSync(app + 'capacitor.config.json', 'utf8'));
const html = readFileSync(app + 'public/index.html', 'utf8');
if (config.appId !== 'com.fancyacuppa.app' || config.appName !== 'Fancy a Cuppa'
  || config.server || !html.includes('name="' + iosPilotMarker + '"') || html.includes('fac-uc02-local')) {
  throw new Error('Unexpected Capacitor pilot configuration after sync.');
}
console.info('iOS Pilot prepared. Use the App scheme with the Release configuration.');
