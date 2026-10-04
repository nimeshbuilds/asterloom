import type {ClassificationActivity,DependencyActivity} from './structuredEngine';
export interface ClassificationResponse {assignments:Record<string,string[]>}
export interface ConnectionResponse {edges:{from:string;to:string;relation:string}[]}
export interface ConnectionDraft {from:string;to:string;relation:string}

/** Placement changes hypotheses, never checks or reads expected memberships. */
export function placeClassification(activity:ClassificationActivity,response:ClassificationResponse,itemId:string,categoryId:string,remove=false):ClassificationResponse {
 if(!activity.items.some(item=>item.id===itemId)||!activity.categories.some(category=>category.id===categoryId))return response;
 const before=response.assignments[itemId]??[];
 const after=remove?before.filter(id=>id!==categoryId):before.includes(categoryId)?before:[...before,categoryId];
 if(after.length===before.length&&after.every((id,index)=>id===before[index]))return response;
 return {assignments:{...response.assignments,[itemId]:after}};
}
/** Author-provided relation vocabulary is public; expected endpoints are never used. */
export function addModelConnection(activity:DependencyActivity,response:ConnectionResponse,draft:ConnectionDraft):{response:ConnectionResponse;message:string;added:boolean} {
 const invalid=(message:string)=>({response,message,added:false});
 if(!activity.nodes.some(node=>node.id===draft.from)||!activity.nodes.some(node=>node.id===draft.to))return invalid('Choose both concepts before connecting them.');
 if(!activity.edges.some(edge=>edge.relation===draft.relation))return invalid('Choose a relationship supplied for this model.');
 if(response.edges.length>=120)return invalid('This model has reached its 120-connection limit. Remove a link before adding another.');
 if(response.edges.some(edge=>edge.from===draft.from&&edge.to===draft.to&&edge.relation===draft.relation))return invalid('That connection is already in your model.');
 return {response:{edges:[...response.edges,{...draft}]},message:'Connection added to your model. Its meaning is checked when you submit.',added:true};
}
export function modelNodePositions(activity:Pick<DependencyActivity,'nodes'>){
 const columns=Math.min(3,activity.nodes.length),rows=Math.ceil(activity.nodes.length/columns);
 return {height:Math.max(260,rows*125+70),nodes:activity.nodes.map((node,index)=>({...node,x:columns===1?50:15+(index%columns)*70/(columns-1),y:70+Math.floor(index/columns)*125}))};
}
