import type { ConstructionActivity, ConstructionBuild, ConstructionEdge } from './compositionEngine';

/** A saved inspection path, never a simulated payload or a scored answer. */
export interface ConstructionTrace { startId: string; edges: ConstructionEdge[] }
export interface ConstructionTraceReport {
  status: 'ready' | 'blocked' | 'end' | 'loop' | 'limit' | 'stale';
  currentId: string; visitedIds: string[]; traversedEdges: ConstructionEdge[];
  message: string; blockedEdge?: ConstructionEdge;
}
export const MAX_TRACE_STEPS = 32;
export const sameConstructionEdge = (a: ConstructionEdge, b: ConstructionEdge) => a.from === b.from && a.to === b.to && a.fromPort === b.fromPort && a.toPort === b.toPort;
/** Only publicly authored port rules are inspected; no requirements, answer witnesses, or hidden outcomes. */
export function constructionConnectionFault(activity: ConstructionActivity, build: ConstructionBuild, edge: ConstructionEdge): string | undefined {
  const source = build.instances.find(item => item.id === edge.from), target = build.instances.find(item => item.id === edge.to);
  const from = activity.components.find(item => item.id === source?.componentId), to = activity.components.find(item => item.id === target?.componentId);
  const output = from?.ports.find(port => port.id === edge.fromPort), input = to?.ports.find(port => port.id === edge.toPort);
  if (!from || !to || !output || !input) return 'This connection no longer has both of its authored ports.';
  if (edge.from === edge.to) return 'A connection needs two different component instances.';
  if (output.direction !== 'out' || input.direction !== 'in') return `Direction mismatch: ${output.label} is ${output.direction}; ${input.label} is ${input.direction}. Follow an output into an input.`;
  if (output.type !== input.type) return `Type mismatch: ${from.label} sends ${output.type}, but ${to.label} accepts ${input.type} at this port. Compare their source descriptions before reconnecting.`;
  for (const [instanceId, part, port] of [[edge.from, from, output], [edge.to, to, input]] as const) {
    const used = build.edges.filter(item => item.from === instanceId && item.fromPort === port.id || item.to === instanceId && item.toPort === port.id).length;
    if (used > port.maxConnections) return `Connection limit: ${part.label} · ${port.label} has ${used} connections; the source allows ${port.maxConnections}. Remove a connection or revise the route.`;
  }
  return undefined;
}
export function inspectConstructionTrace(activity: ConstructionActivity, build: ConstructionBuild, trace: ConstructionTrace): ConstructionTraceReport {
  const visitedIds = [trace.startId], traversedEdges: ConstructionEdge[] = [];
  let currentId = trace.startId;
  const result = (status: ConstructionTraceReport['status'], message: string, blockedEdge?: ConstructionEdge): ConstructionTraceReport => ({status, currentId, visitedIds, traversedEdges, message, ...(blockedEdge ? {blockedEdge} : {})});
  if (!build.instances.some(item => item.id === currentId)) return result('stale', 'The starting component changed. Choose a component to start a new trace.');
  if (trace.edges.length > MAX_TRACE_STEPS) return result('stale', 'This inspection is too long. Start a new trace.');
  for (const edge of trace.edges) {
    if (edge.from !== currentId || !build.edges.some(item => sameConstructionEdge(item, edge))) return result('stale', 'The route changed. Start a new trace through the current connections.');
    const fault = constructionConnectionFault(activity, build, edge);
    if (fault) return result('blocked', fault, edge);
    traversedEdges.push(edge); currentId = edge.to;
    if (visitedIds.includes(currentId)) { visitedIds.push(currentId); return result('loop', 'The trace returned to a visited component. This is a loop; compare it with the source’s cycle rule.'); }
    visitedIds.push(currentId);
  }
  if (trace.edges.length >= MAX_TRACE_STEPS) return result('limit', 'The inspection reached its 32-connection limit. Start a new trace from another component.');
  return build.edges.some(edge => edge.from === currentId)
    ? result('ready', 'Choose a connected route to inspect its next port. The marker follows your wiring.')
    : result('end', 'No outgoing connection here. Compare this stopping point with the source requirements.');
}
export function restoreConstructionTrace(activity: ConstructionActivity, build: ConstructionBuild, value: unknown): ConstructionTrace | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.startId !== 'string' || !Array.isArray(candidate.edges) || candidate.edges.length > MAX_TRACE_STEPS || candidate.edges.some(edge => !edge || typeof edge !== 'object' || ['from','fromPort','to','toPort'].some(key => typeof edge[key] !== 'string'))) return undefined;
  const trace: ConstructionTrace = {startId: candidate.startId, edges: candidate.edges.map(edge => ({from: edge.from, fromPort: edge.fromPort, to: edge.to, toPort: edge.toPort}))};
  const report = inspectConstructionTrace(activity, build, trace);
  // No saved steps can occur after a stop/fault, or be silently replayed against an edited graph.
  if (report.status === 'stale' || report.traversedEdges.length + (report.blockedEdge ? 1 : 0) !== trace.edges.length) return undefined;
  return trace;
}
export function advanceConstructionTrace(activity: ConstructionActivity, build: ConstructionBuild, trace: ConstructionTrace, edge: ConstructionEdge): ConstructionTrace {
  const report = inspectConstructionTrace(activity, build, trace);
  if (report.status !== 'ready' || edge.from !== report.currentId || !build.edges.some(item => sameConstructionEdge(item, edge))) return trace;
  return {startId: trace.startId, edges: [...trace.edges, {...edge}]};
}
