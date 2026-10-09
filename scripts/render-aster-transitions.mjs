/** Build-time animation rendering only. FFmpeg is not needed to play these clips.
 * Usage: node scripts/render-aster-transitions.mjs /path/to/full/ffmpeg
 * Existing Aster artwork remains unchanged; the transparent energy mantle moves
 * behind whichever of her 50 expressions is currently displayed.
 */
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const executable=process.argv[2];
if(!executable)throw Error('Supply a full FFmpeg build with the libvpx-vp9 encoder.');
const input='public/assets/aster/agentic-aura.png',output='public/assets/aster/transitions';
await mkdir(output,{recursive:true});
const filter="scale=480:638,format=rgba,pad=480:640:0:1:color=0x00000000,rotate=0.035*sin(PI*t/2.4):ow=iw:oh=ih:c=0x00000000,fade=t=in:st=0:d=1.4:alpha=1,format=yuva420p";
const files=[];
for(const direction of ['connect','disconnect']){
 const file=path.join(output,direction+'.webm');
 const args=['-hide_banner','-loglevel','error','-y','-loop','1','-framerate','30','-i',input,'-filter_complex',`[0:v]trim=duration=2.4,${filter}${direction==='disconnect'?',reverse':''}[out]`,'-map','[out]','-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-auto-alt-ref','0','-b:v','0','-crf','28','-row-mt','1','-deadline','good','-cpu-used','3','-metadata','title=Aster mode transformation',file];
 const result=spawnSync(executable,args,{stdio:'inherit'});if(result.status!==0)throw Error(`Rendering ${direction} failed.`);
 const bytes=await readFile(file);files.push({file:direction+'.webm',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile(path.join(output,'provenance.json'),JSON.stringify({format:'asterloom-rendered-animation',createdAt:'2026-10-09',durationSeconds:2.4,framesPerSecond:30,width:480,height:640,codec:'VP9 with alpha',audio:false,tool:'FFmpeg libvpx-vp9',generativeVideo:false,sourceArtwork:'../agentic-aura.png',sourcePrompt:'../agentic-provenance.json',purpose:'A short, reversible transparent mantle transformation behind the current Aster expression. No character face is replaced and no live video or AI service is used during playback.',filter,files},null,2)+'\n');
console.log(JSON.stringify({rendered:files}));
