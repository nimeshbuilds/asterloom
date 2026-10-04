import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:'./',server:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api':'http://127.0.0.1:4319'}},build:{target:'es2022',assetsInlineLimit:(filePath:string)=>!(/\.(?:wasm|mjs)$/.test(filePath)),cssCodeSplit:false,chunkSizeWarningLimit:25000,rolldownOptions:{output:{codeSplitting:false}}},test:{include:['tests/**/*.test.ts'],environment:'node'}} as any);
