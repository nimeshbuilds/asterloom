/** Verified 2026-10-10 against official release API and registry manifests.
 * Runtime/model pins are application-owned. No user-supplied URLs or cloud tags. */
export const LOCAL_RUNTIME_VERSION='0.40.2';
const release='https://github.com/ollama/ollama/releases/download/v'+LOCAL_RUNTIME_VERSION+'/';
export const LOCAL_RUNTIME_ARTIFACTS={
 darwin:{version:LOCAL_RUNTIME_VERSION,file:'ollama-darwin.tgz',url:release+'ollama-darwin.tgz',bytes:167473220,sha256:'e888b7637291ceb80b622c00ea067f62c86d9c50d419b3eb903032e4f1f8a4f6',format:'tgz',binary:'ollama',expandedBytes:800*1024**2},
 'win32-x64':{version:LOCAL_RUNTIME_VERSION,file:'ollama-windows-amd64.zip',url:release+'ollama-windows-amd64.zip',bytes:1468085195,sha256:'e29ad1d5063dd4b54b2492d9b00adab2cff9621bfa654b6c92aa8d6f1fdfe7fc',format:'zip',binary:'ollama.exe',expandedBytes:5*1024**3},
 'win32-arm64':{version:LOCAL_RUNTIME_VERSION,file:'ollama-windows-arm64.zip',url:release+'ollama-windows-arm64.zip',bytes:209958164,sha256:'82ad9bff6dd5c1c70400ceac00d01aaa0389e9182b98d918d1d164ebf87acdb2',format:'zip',binary:'ollama.exe',expandedBytes:1024**3},
};
export const localRuntimeArtifact=(platform=process.platform,arch=process.arch)=>['arm64','x64'].includes(arch)?LOCAL_RUNTIME_ARTIFACTS[platform==='darwin'?'darwin':platform+'-'+arch]??null:null;
export const LOCAL_MODELS=[
 {id:'gemma4:e4b-it-qat',name:'Gemma 4 E4B · QAT',manifestSha256:'ee665637121887cf3befff38abbb1be4ee117c7db867d97a67e29049ecd7e15f',downloadBytes:6146501801,recommendedMemoryBytes:16*1024**3,contextTokens:32768,license:'Apache 2.0',sourceUrl:'https://ollama.com/library/gemma4:e4b-it-qat',description:'Smaller download. Local text answers and game drafts; quality still needs source review.'},
 {id:'gemma4:12b-it-qat',name:'Gemma 4 12B · QAT',manifestSha256:'38044be4f923e5a55264ed7df4eaac2676651a905f735197c504045140c02bd3',downloadBytes:7151003754,recommendedMemoryBytes:24*1024**3,contextTokens:32768,license:'Apache 2.0',sourceUrl:'https://ollama.com/library/gemma4:12b-it-qat',description:'Larger local model. Requires more memory and may respond slowly on CPU.'},
];
export const localModel=id=>LOCAL_MODELS.find(model=>model.id===id);
