import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, loadEnv } from 'vite';
import { readUc02Config } from './uc02-ios-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const mode = 'uc02-local';
const { url } = readUc02Config(loadEnv(mode, root, ['FAC_UC02_', 'VITE_COMMUNITY_TEA_V4']));
const { hostname } = new URL(url);

await build({ configFile: 'vite.native.config.js', mode });
execFileSync(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'ios'], { stdio: 'inherit' });

const plist = readFileSync('ios/App/App/Info.plist', 'utf8').replace('<dict>', `<dict>
  <key>NSLocalNetworkUsageDescription</key>
  <string>Connect to the local Supabase server for the UC02 test.</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSExceptionDomains</key>
    <dict>
      <key>${hostname}</key>
      <dict>
        <key>NSExceptionAllowsInsecureHTTPLoads</key>
        <true/>
      </dict>
    </dict>
  </dict>`);
writeFileSync('ios/App/App/Info.UC02Local.generated.plist', plist);
writeFileSync('ios/uc02-local.generated.xcconfig', 'FAC_UC02_DEBUG_PLIST = App/Info.UC02Local.generated.plist\n');
console.info(`[FAC UC02] Synced Debug test assets for ${url}`);
