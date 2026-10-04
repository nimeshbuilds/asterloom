import path from 'node:path';
import {sign} from '@electron/osx-sign';
import {entitlementPath} from './signing.mjs';

// Internal worker: the parent validates paths, copies the app and bounds this
// process group. Only public identity/path metadata crosses this boundary.
const {app,identity,inventory}=JSON.parse(process.argv[2]||'{}');
if(!app||!identity||!Array.isArray(inventory?.binaries)||!Array.isArray(inventory?.bundles))throw new Error('Launch signing through scripts/sign-desktop.mjs.');
const allowed=new Set([...inventory.binaries,...inventory.bundles]);
await sign({app,identity,platform:'darwin',type:'distribution',identityValidation:true,strictVerify:true,preAutoEntitlements:false,preEmbedProvisioningProfile:false,
  ignore:filename=>!allowed.has(filename),optionsForFile:filename=>{
    console.log(`Signing ${path.relative(app,filename)||path.basename(app)}`);
    return {hardenedRuntime:true,entitlements:entitlementPath(filename,app)};
  }});
