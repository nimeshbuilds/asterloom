#!/usr/bin/env node
import {signApplicationCopy} from '../desktop/signing.mjs';

const args=process.argv.slice(2);const options={};
for(let i=0;i<args.length;i++){
  const name=args[i];if(!['--identity','--app','--output'].includes(name)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Usage: node scripts/sign-desktop.mjs --identity "Developer ID Application: …" --app source.app --output candidate.app');
  options[name.slice(2)]=args[++i];
}
if(!options.identity||!options.app||!options.output)throw new Error('Explicit --identity, --app and --output are required. No signing identity is selected automatically.');
await signApplicationCopy(options);
