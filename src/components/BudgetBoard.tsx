import {useId,useState,type CSSProperties} from 'react';
import {ArrowDownLeft,ArrowUpRight,Check,Coins,Layers3,Minus,Package,Plus,Target} from 'lucide-react';
import type {BudgetActivity} from '../lib/structuredEngine';
import {getAgePresentation,worldPalette} from '../data/worlds';
import './budget-board.css';

export interface BudgetBoardProps {
 activity:BudgetActivity;
 response:{quantities:Record<string,number>};
 onChange:(response:{quantities:Record<string,number>})=>void;
 theme?:string;
 ageGroup?:string;
}
/** Resource effects are arithmetic from the supplied model. Live meters show the
 * learner's allocation; the shared evaluator alone assesses and awards it. */
export default function BudgetBoard({activity,response,onChange,theme='workshop',ageGroup='adult'}:BudgetBoardProps){
 const prefix=useId(),palette=worldPalette(theme,ageGroup),age=getAgePresentation(ageGroup);
 // Keep the last preview when focus or the pointer leaves a control. Collapsing
 // its details on blur can move the following Check button during a click.
 const [notice,setNotice]=useState(''),[preview,setPreview]=useState<{itemId:string;direction:1|-1}|null>(null);
 const number=(value:number)=>value.toLocaleString(undefined,{maximumFractionDigits:2});
 const quantity=(id:string)=>response.quantities[id]??0;
 // Match the evaluator’s currency tolerance; decimal arithmetic is not overspending.
 const remainder=(value:number)=>Math.abs(value)<=1e-8?0:value;
 const total=activity.items.reduce((sum,item)=>sum+quantity(item.id)*item.cost,0),remaining=remainder(activity.budget-total);
 const requirements=activity.requirements.map(requirement=>({...requirement,actual:Object.entries(requirement.contributions).reduce((sum,[id,value])=>sum+quantity(id)*value,0)}));
 const met=requirements.filter(requirement=>requirement.actual+1e-8>=requirement.minimum).length;
 const previewItem=preview&&activity.items.find(item=>item.id===preview.itemId);
 const previewAllowed=previewItem&&preview&&(preview.direction===1?quantity(preview.itemId)<previewItem.maxQuantity:quantity(preview.itemId)>0);
 const plannedTotal=previewAllowed?total+preview.direction*previewItem.cost:total,previewRemaining=remainder(activity.budget-plannedTotal);
 const setQuantity=(item:BudgetActivity['items'][number],value:number)=>{
  if(!Number.isFinite(value))return;
  const next=Math.max(0,Math.min(item.maxQuantity,Math.floor(value))),delta=next-quantity(item.id);if(!delta)return;
  const effects=requirements.filter(requirement=>requirement.contributions[item.id]).map(requirement=>`${number(Math.abs(delta)*requirement.contributions[item.id])} ${requirement.label.toLowerCase()}`).join(', ');
  const budgetAfter=remainder(activity.budget-(total+delta*item.cost));
  setNotice(`${delta>0?'Allocated':'Reclaimed'} ${number(Math.abs(delta))} × ${item.label}. ${delta>0?'Uses':'Returns'} ${number(Math.abs(delta)*item.cost)} ${activity.currency}${effects?`; ${delta>0?'adds':'removes'} ${effects}`:''}. ${number(Math.abs(budgetAfter))} ${activity.currency} ${budgetAfter<0?'over the budget':'remaining'}.`);
  onChange({quantities:{...response.quantities,[item.id]:next}});
 };
 return <section className="budget-workbench" aria-label="Resource allocation workbench" data-density={age.density} style={{'--budget-ink':palette.ink,'--budget-accent':palette.accent,'--budget-paper':palette.paper,'--budget-sky':palette.sky,'--budget-on-accent':age.density==='studio'?palette.sky:'#ffffff'} as CSSProperties}>
  <header className="budget-intro"><span className="budget-mark" aria-hidden="true"><Package size={27}/></span><div><span className="budget-kicker">ALLOCATE · COMPARE · REVISE</span><h3>{age.caregiverControls?'Pack your supplies.':'Build a plan that fits.'}</h3><p>Each resource has a cost and a job. Add a unit, watch what changes, then balance your plan against the requirements.</p></div></header>
  <div className="budget-bank" data-over-budget={remaining<0}>
   <div><span><Coins size={16} aria-hidden="true"/>{remaining<0?'Over the budget':'Available to spend'}</span><strong>{number(Math.abs(remaining))}<small> {activity.currency}</small></strong></div>
   <div className="budget-spending"><div><span>Resources used</span><strong>{number(total)} / {number(activity.budget)} {activity.currency}</strong></div><progress value={Math.min(total,activity.budget||1)} max={activity.budget||1} aria-label="Budget used"/><p>{remaining<0?'Reclaim or exchange resources to bring your plan back within budget.':`${met} of ${requirements.length} requirements currently met`}</p></div>
  </div>
  <div className="budget-play-area">
   <div className="budget-resource-deck" aria-label="Resources to allocate">{activity.items.map((item,index)=>{const count=quantity(item.id),units=Math.min(item.maxQuantity,12);return <article key={item.id} className="budget-resource structured-resource" data-allocated={count>0}>
    <header><span className="budget-resource-index" aria-hidden="true">{String(index+1).padStart(2,'0')}</span><div><h4>{item.label}</h4><span>{number(item.cost)} {activity.currency} / {item.unit}</span></div><Package size={21} aria-hidden="true"/></header>
    <ul className="budget-contributions" aria-label={`${item.label} contributions per unit`}>{requirements.filter(requirement=>requirement.contributions[item.id]>0).map(requirement=><li key={requirement.id}><Plus size={12} aria-hidden="true"/><strong>{number(requirement.contributions[item.id])}</strong><span>{requirement.label}</span></li>)}</ul>
    <div className="budget-inventory" aria-label={`${number(count)} ${item.label} allocated`}><div aria-hidden="true">{Array.from({length:units},(_,unit)=><span key={unit} data-filled={unit<count}><Layers3 size={18}/></span>)}{count>units&&<strong>+{number(count-units)}</strong>}</div><span>{number(count)} allocated · limit {number(item.maxQuantity)}</span></div>
    <div className="budget-allocation-controls"><button type="button" className="budget-reclaim" aria-label={`Reclaim one ${item.label}`} disabled={count<=0} onFocus={()=>setPreview({itemId:item.id,direction:-1})} onMouseEnter={()=>setPreview({itemId:item.id,direction:-1})} onClick={()=>setQuantity(item,count-1)}><Minus size={17} aria-hidden="true"/><span>Reclaim</span></button><label htmlFor={`${prefix}-${item.id}`}><span>Quantity</span><input id={`${prefix}-${item.id}`} type="number" inputMode="numeric" min={0} max={item.maxQuantity} step={1} aria-label={`Quantity of ${item.label}`} value={count} onChange={event=>setQuantity(item,Number(event.target.value))}/></label><button type="button" className="budget-allocate" aria-label={`Allocate one ${item.label}`} disabled={count>=item.maxQuantity} onFocus={()=>setPreview({itemId:item.id,direction:1})} onMouseEnter={()=>setPreview({itemId:item.id,direction:1})} onClick={()=>setQuantity(item,count+1)}><Plus size={17} aria-hidden="true"/><span>Allocate</span></button></div>
   </article>;})}</div>
   <aside className="budget-mission-targets" aria-label="Your plan’s requirements"><div className="budget-target-heading"><Target size={22} aria-hidden="true"/><div><h4>Make every requirement fit</h4><p>These targets come from the prepared source model.</p></div></div>
    {requirements.map(requirement=>{const satisfied=requirement.actual+1e-8>=requirement.minimum,next=previewAllowed?requirement.actual+preview.direction*(requirement.contributions[preview.itemId]??0):requirement.actual;return <div className="budget-target" key={requirement.id} data-met={satisfied}><div><strong>{requirement.label}</strong>{satisfied&&<Check size={16} aria-label="Requirement met"/>}</div><div className="budget-target-values"><strong>{number(requirement.actual)}</strong><span>/ {number(requirement.minimum)} needed</span></div><progress value={Math.min(requirement.actual,requirement.minimum||1)} max={requirement.minimum||1} aria-label={requirement.label}/><p>{satisfied?'Requirement met':`${number(requirement.minimum-requirement.actual)} still needed`}{previewAllowed&&next!==requirement.actual&&<span className="budget-preview-delta">{preview.direction===1?<ArrowUpRight size={12}/>:<ArrowDownLeft size={12}/>}Next move: {number(next)}</span>}</p></div>;})}
    <div className="budget-tradeoff" aria-label="Allocation preview"><strong>{previewAllowed?`${preview.direction===1?'Add':'Reclaim'} one ${previewItem.label}`:'Try a different balance'}</strong><p>{previewAllowed?`${number(Math.abs(previewRemaining))} ${activity.currency} would be ${previewRemaining<0?'over the budget':'left'}.`:'The same requirement may be met by different combinations. Compare each resource’s contribution with its cost.'}</p></div>
   </aside>
  </div>
  <p className="budget-move-feedback" role="status">{notice||'Allocate a resource to see its effect. You can reclaim units and try a different plan.'}</p>
  <p className="budget-check-note">Live meters show your current plan. Use “Check my work” when you are ready to test it.</p>
 </section>;
}
