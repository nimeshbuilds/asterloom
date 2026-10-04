// Official @openai/codex 0.160.0 npm platform archives, pinned 2026-10-04.
// Install on explicit request only. No install script, npm lifecycle, or global PATH changes.
export const CODEX_VERSION='0.160.0';
const specs={
 'darwin-arm64':['aarch64-apple-darwin','aefV6cqZA2REZgR//4McyXlp7zLcTti4CI2v3j9IVgNndPBv2kCeNEcz07qeelXcwOdSFPUKb6roA48vZmDgrQ=='],
 'darwin-x64':['x86_64-apple-darwin','ir7cdsPrb9VkqNqpTECoTiomv04xws/FQ968mHQzuL+2J5Da0Dkh2Qlxp7sguDDZJab4YpYmNjQvBVMXbTeQaQ=='],
 'win32-x64':['x86_64-pc-windows-msvc','/gCFcuOmGlQkgGivWCtY8BNEDixh70Pue0HZOk9S8bj2vUIE1GLD9zcNB/KqqDJmn0S+lIttauLpzQnw6HOCHA=='],
 'win32-arm64':['aarch64-pc-windows-msvc','tTvK9ZIGuj9WnYaYOAnfjJVSfPV7dKqWtDHqUPLf0Hadp6SgynTxx7S7iMXRieFeXVOI2XH76KxEHSOTOnz3zw=='],
 'linux-x64':['x86_64-unknown-linux-musl','KI/73OqGrHmR18s7ya7E1NqV6rT0y3lxr0s8S1qR2m6zU6QRF/HlR529jALLh5vjdUnsRT4Ahoxt0axb4kY99g=='],
 'linux-arm64':['aarch64-unknown-linux-musl','VnVdsS06YlDsL8OwaJjQ3xdqdJNG4i+eBJBV3LytddknzSaF/urijLzVg3ptkwvoj8C7Gn7iWpVE+y8WEaPiCg=='],
};
export function codexArtifact(platform=process.platform,arch=process.arch){
 const target=`${platform}-${arch}`,spec=specs[target];if(!spec)return null;
 return {target,version:CODEX_VERSION,url:`https://registry.npmjs.org/@openai/codex/-/codex-${CODEX_VERSION}-${target}.tgz`,integrity:`sha512-${spec[1]}`,binary:`package/vendor/${spec[0]}/bin/codex${platform==='win32'?'.exe':''}`};
}
