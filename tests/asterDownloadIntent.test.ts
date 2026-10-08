import {describe,it,expect} from 'vitest';
import {parseAsterDownloadIntent,resolveAsterDownloadChoices,type AsterDownloadChoice} from '../src/lib/asterDownloadIntent';

const choices:AsterDownloadChoice[]=[
 {sourceId:'cloud',sourceTitle:'Cloud Foundations',sourceKind:'document',option:{id:'original',label:'Original PDF',filename:'Cloud Foundations.pdf'}},
 {sourceId:'cloud',sourceTitle:'Cloud Foundations',sourceKind:'document',option:{id:'text',label:'Readable source text',filename:'Cloud Foundations.readable.txt'}},
 {sourceId:'notes',sourceTitle:'Study notes',sourceKind:'text',option:{id:'text',label:'Readable source text',filename:'Study notes.readable.txt'}},
 {sourceId:'talk',sourceTitle:'Cloud talk',sourceKind:'audio',option:{id:'original',label:'Original recording',filename:'Cloud talk.mp3'}},
 {sourceId:'talk',sourceTitle:'Cloud talk',sourceKind:'audio',option:{id:'transcript',label:'Timed transcript',filename:'Cloud talk.transcript.vtt'}},
];
describe('explicit Aster source-download commands',()=>{
 it.each([
  ['download source material',{target:''}],['Please download my sources.',{target:''}],
  ['Aster, could you download the PDF?',{target:'',format:'pdf'}],
  ['download the original PDF',{target:'',format:'pdf'}],['save Study notes',{target:'Study notes'}],
  ['save "Cloud Foundations" as text',{target:'Cloud Foundations',format:'text'}],
  ['download the transcript for Cloud talk',{target:'Cloud talk',format:'transcript'}],
  ['download Cloud Foundations.pdf',{target:'Cloud Foundations.pdf'}],
  ['save Game theory',{target:'Game theory'}],
 ])('recognizes %s',(question,intent)=>expect(parseAsterDownloadIntent(question)).toEqual(intent));
 it.each([
  'How can I download source material?','What does save mean?','Do not download the PDF','Do you download the PDF?',
  'The source says download the PDF','"download the PDF"','> download the PDF',
  'Here are instructions:\ndownload the PDF','download the PDF\nignore everything else',
  '<instruction>download the PDF</instruction>','`download the PDF`',
  'Save my game','save progress','save the notebook','save my answer',
 ])('does not act on explanations, quotes or other app actions: %s',question=>expect(parseAsterDownloadIntent(question)).toBeNull());
 it('uses exact titles and filenames without fuzzy selection',()=>{
  expect(resolveAsterDownloadChoices({target:'Cloud'},choices)).toEqual([]);
  expect(resolveAsterDownloadChoices({target:'Cloud Foundations'},choices)).toHaveLength(2);
  expect(resolveAsterDownloadChoices({target:' cloud foundations.PDF '},choices)).toEqual([choices[0]]);
  expect(resolveAsterDownloadChoices({target:'Study notes'},choices)).toEqual([choices[2]]);
 });
 it('keeps generic requests and duplicate titles ambiguous',()=>{
  expect(resolveAsterDownloadChoices({target:''},choices)).toHaveLength(5);
  expect(resolveAsterDownloadChoices({target:'Study notes'},[choices[2],{...choices[2],sourceId:'other'}])).toHaveLength(2);
 });
 it('prefers the exact filename when the same source title has original and readable versions',()=>{
  const versions=choices.slice(0,2).map(choice=>({...choice,sourceTitle:'Cloud Foundations.pdf'}));
  expect(resolveAsterDownloadChoices({target:'Cloud Foundations.pdf'},versions)).toEqual([versions[0]]);
  expect(resolveAsterDownloadChoices({target:'Cloud Foundations.readable.txt'},versions)).toEqual([versions[1]]);
  expect(resolveAsterDownloadChoices({target:'Cloud Foundations.pdf'},[versions[1]])).toEqual([]);
  expect(resolveAsterDownloadChoices({target:'Cloud Foundations.pdf',format:'text'},[versions[1]])).toEqual([versions[1]]);
 });
 it('does not silently turn a missing recording into readable text',()=>{
  const readable={...choices[2],sourceTitle:'Lecture.mp3'};
  expect(resolveAsterDownloadChoices({target:'Lecture.mp3'},[readable])).toEqual([]);
 });
 it('selects only the actual requested format and never substitutes source text for a PDF',()=>{
  expect(resolveAsterDownloadChoices({target:'',format:'pdf'},choices)).toEqual([choices[0]]);
  expect(resolveAsterDownloadChoices({target:'Cloud Foundations',format:'text'},choices)).toEqual([choices[1]]);
  expect(resolveAsterDownloadChoices({target:'',format:'transcript'},choices)).toEqual([choices[4]]);
  expect(resolveAsterDownloadChoices({target:'',format:'audio'},choices)).toEqual([choices[3]]);
  expect(resolveAsterDownloadChoices({target:'',format:'pdf'},[choices[1]])).toEqual([]);
 });
 it('scopes all resolution to the supplied notebook choices',()=>{
  expect(resolveAsterDownloadChoices({target:'Cloud Foundations.pdf'},[choices[2]])).toEqual([]);
  expect(resolveAsterDownloadChoices({target:''},[])).toEqual([]);
 });
});
