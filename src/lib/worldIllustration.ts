import {getAgePresentation,WORLD_PALETTES,type SceneGlyph,type WorldComposition} from '../data/worlds';
/** Project-authored vector primitives. No source text, remote URL, or generated markup is evaluated. */
export function glyphMarkup(glyph:SceneGlyph,ink:string,fill:string):string{
 const paths:Record<SceneGlyph,string>={
 bridge:'<path d="M-27 15V-8M27 15V-8M-27 0Q0-30 27 0M-27 9H27M-15-10V9M0-16V9M15-10V9"/>',
 leaf:'<path d="M-22 23Q-31-18 25-25Q28 25-22 23Z"/><path d="M-21 21L16-14M-9 8L-12-7M1-2L15 0"/>',
 book:'<path d="M-27-21Q-11-26 0-17Q11-26 27-21V22Q13 18 0 27Q-13 18-27 22ZM0-17V27M-19-9L-8-6M8-6L19-9M-19 1L-8 4M8 4L19 1"/>',
 gear:'<path d="M-7-28H7L10-18L20-20L28-7L20 0L28 7L20 20L10 18L7 28H-7L-10 18L-20 20L-28 7L-20 0L-28-7L-20-20L-10-18Z"/><circle r="10"/>',
 lens:'<circle cx="-6" cy="-6" r="20"/><path d="M9 9L28 28M-15-14Q-5-22 4-13"/>',
 shield:'<path d="M0-29L25-18V0Q25 19 0 30Q-25 19-25 0V-18ZM-12 0L-3 10L14-11"/>',
 server:'<rect x="-25" y="-27" width="50" height="54" rx="7"/><path d="M-25-9H25M-25 9H25M-16-18H-11M-16 0H-11M-16 18H-11M4-18H15M4 0H15M4 18H15"/>',
 flask:'<path d="M-10-28H10M-7-28V-8L-24 19Q-27 28-18 28H18Q27 28 24 19L7-8V-28M-15 6H15"/><circle cx="4" cy="16" r="3"/>',
 chart:'<path d="M-27-26V27H28M-18 16V2H-7V16M-2 16V-12H9V16M14 16V-24H25V16"/>',
 code:'<rect x="-30" y="-24" width="60" height="48" rx="7"/><path d="M-12-8L-21 1L-12 10M12-8L21 1L12 10M5-13L-5 15"/>',
 cloud:'<path d="M-19 21Q-40 19-30 0Q-25-9-17-7Q-15-29 8-23Q23-20 22-6Q38-3 30 13Q26 21 18 21Z"/>',
 key:'<circle cx="-11" cy="-9" r="17"/><circle cx="-11" cy="-9" r="6"/><path d="M1 3L25 27L30 20L20 10L14 16"/>',
 speech:'<path d="M-29-24H29V15H-4L-19 29V15H-29ZM-18-11H18M-18 0H8"/>',
 train:'<rect x="-29" y="-15" width="38" height="32" rx="6"/><path d="M9 17V-26H27V17M-20-15V-25H0V-15M-26-2H3M14-18H23M10 17H29"/><circle cx="-19" cy="21" r="7"/><circle cx="2" cy="21" r="7"/><circle cx="22" cy="21" r="7"/>',
 cube:'<path d="M0-29L28-13V17L0 32L-28 17V-13ZM-28-13L0 3L28-13M0 3V32"/>',
 flag:'<path d="M-19 29V-28M-19-25Q-5-32 5-24Q16-18 28-24V5Q15 12 5 4Q-5-4-19 3"/>',
 compass:'<circle r="28"/><path d="M10-16L4 6L-12 18L-5-6ZM0-28V-22M28 0H22M0 28V22M-28 0H-22"/>',
 scales:'<path d="M0-28V25M-15 28H15M-26-15H26M-19-15L-30 6H-8ZM19-15L8 6H30Z"/>',
 globe:'<circle r="28"/><ellipse rx="13" ry="28"/><path d="M-28 0H28M-23-15H23M-23 15H23"/>',
 star:'<path d="M0-30L9-10L30-7L14 9L18 31L0 20L-18 31L-14 9L-30-7L-9-10Z"/>',
 puppet:'<circle cy="-12" r="18"/><path d="M-18 7L-29 26H29L18 7M0-31V-40M-7-14V-12M7-14V-12M-6-4Q0 2 6-4"/>',
 basket:'<path d="M-29-9H29L20 27H-20ZM-18-9Q-19-39 0-39Q19-39 18-9M-22 3H22M-20 15H20M-10-8V26M10-8V26"/>',
 wave:'<path d="M-30-17Q-17-32-4-17T22-17M-30 0Q-17-15-4 0T22 0M-30 17Q-17 2-4 17T22 17"/>',
 branch:'<path d="M-17 27V-25M-17 7Q20 7 20-18"/><circle cx="-17" cy="-25" r="6"/><circle cx="20" cy="-23" r="6"/><circle cx="-17" cy="27" r="6"/>',
 document:'<path d="M-23-29H9L25-13V29H-23ZM9-29V-13H25M-13-4H15M-13 7H15M-13 18H6"/>',
 wrench:'<path d="M25-27Q5-37 0-16L-27 14Q-34 23-24 29Q-17 33-11 24L14-5Q37-5 29-24L18-11L8-21Z"/>',
 database:'<ellipse cy="-22" rx="27" ry="9"/><path d="M-27-22V22Q0 39 27 22V-22M-27-8Q0 9 27-8M-27 7Q0 24 27 7"/>',
 heart:'<path d="M0 28L-25 2Q-39-23-17-28Q-6-31 0-17Q6-31 17-28Q39-23 25 2Z"/><path d="M-23 0H-9L-3-10L5 11L12 0H23"/>',
 clock:'<circle r="28"/><path d="M0-19V0L14 8M0-28V-23M28 0H23M0 28V23M-28 0H-23"/>',
 pencil:'<path d="M-27 28L-20 8L16-28L29-15L-7 21ZM-20 8L-7 21M9-21L22-8M-27 28L-19 25"/>',
 };return `<g stroke="${ink}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" fill="${fill}">${paths[glyph]}</g>`;
}
export function worldBackdropMarkup(world:WorldComposition,theme='islands',age='adult',includeObjects=true):string{
 const p=WORLD_PALETTES[theme]??WORLD_PALETTES.islands,young=getAgePresentation(age).largeControls;
 const bases:Record<WorldComposition['layout'],string>={
 trail:`<path d="M70 268Q170 80 320 199T710 90" stroke="${p.paper}" stroke-width="58" fill="none"/><path d="M70 268Q170 80 320 199T710 90" stroke="${p.secondary}" stroke-width="2" stroke-dasharray="3 13" fill="none"/>`,
 network:`<path d="M130 278L228 87H567L683 278Z" fill="${p.paper}"/><path d="M172 244L272 132L397 259L551 132L640 248M272 132L551 132M397 259L397 94" stroke="${p.accent}" opacity=".18" stroke-width="5" fill="none"/>`,
 workbench:`<rect x="145" y="119" width="516" height="141" rx="16" fill="${p.paper}"/><path d="M157 259V305M648 259V305" stroke="${p.accent}" stroke-width="16"/><rect x="168" y="263" width="148" height="36" rx="7" fill="${p.ground}"/><path d="M223 274H260" stroke="${p.accent}" stroke-width="5"/>`,
 stage:`<path d="M121 309V64Q400-13 679 64V309" fill="${p.paper}"/><path d="M121 63Q170 202 111 308L186 309Q230 159 209 39M679 63Q630 202 689 308L614 309Q570 159 591 39" fill="${p.accent}" opacity=".25"/><path d="M180 300H620" stroke="${p.secondary}" stroke-width="14"/>`,
 garden:`<ellipse cx="250" cy="287" rx="252" ry="89" fill="${p.ground}"/><ellipse cx="617" cy="291" rx="268" ry="71" fill="${p.accent}" opacity=".17"/><path d="M283 333Q297 215 530 263" stroke="${p.paper}" stroke-width="45" fill="none"/>`,
 archive:`<rect x="136" y="83" width="533" height="222" rx="15" fill="${p.paper}"/><path d="M146 162H658M146 244H658" stroke="${p.ground}" stroke-width="13"/>${Array.from({length:13},(_,i)=>`<rect x="${155+i*37}" y="${96+i%3*9}" width="26" height="${58-i%3*9}" rx="4" fill="${i%2?p.secondary:p.accent}" opacity=".3"/>`).join('')}`,
 console:`<path d="M157 86H641L691 279H110Z" fill="${p.paper}"/><rect x="220" y="86" width="360" height="171" rx="17" fill="${p.accent}" opacity=".08"/><path d="M151 278H650" stroke="${p.accent}" stroke-width="11"/><circle cx="190" cy="289" r="5" fill="${p.secondary}"/><circle cx="212" cy="289" r="5" fill="${p.accent}"/>`,
 };
 return `<rect width="800" height="360" fill="${p.sky}"/><circle cx="669" cy="72" r="43" fill="${p.paper}" opacity=".7"/><circle cx="669" cy="72" r="63" fill="${p.paper}" opacity=".25"/><path d="M0 288Q180 216 385 281T800 270V360H0Z" fill="${p.ground}" opacity=".55"/>${bases[world.layout]}${(includeObjects?world.objects:[]).map((o,i)=>`<g transform="translate(${o.x*8} ${o.y*3.6}) scale(${o.size/43*(young?1.1:1)})"><ellipse cy="40" rx="34" ry="9" fill="${p.ink}" opacity=".08"/><circle r="41" fill="${p.paper}" opacity=".9"/>${glyphMarkup(o.glyph,p.accent,i===1?p.ground:p.paper)}</g>`).join('')}<path d="M42 69v14M35 76h14M731 285v14M724 292h14" stroke="${p.paper}" stroke-width="3"/>`;
}
