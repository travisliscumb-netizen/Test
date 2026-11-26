// Street network routing on the City's road-segment centrelines.
//
// Nodes are segment endpoints snapped together within SNAP metres (the City
// splits segments at intersections). Edges are bidirectional: the public layer
// reports every segment as two-way (ONEWAYDIR = "B"), which is recorded as a
// known limitation. Points of interest are attached mid-edge at their
// projection, so a stop halfway along a block is not mis-costed by snapping it
// to the nearest intersection.

import { dist, lineLength, projectOnLine, pointAlong, toXY, bboxOf, type LngLat, type BBox } from './geo.ts';
import type { RoadSegment } from '../data/schema.ts';

const SNAP = 1.5;

export interface Edge {
  id: number;
  seg: number;
  a: number;
  b: number;
  len: number;
  line: LngLat[];
  name: string;
}

export interface Graph {
  nodes: LngLat[];
  edges: Edge[];
  /** adjacency: node -> edge ids */
  adj: number[][];
  bySeg: Map<number, number[]>;
}

export interface Located {
  edge: number;
  along: number;
  point: LngLat;
  offset: number;
}

export function buildGraph(segments: RoadSegment[], area?: BBox): Graph {
  const nodes: LngLat[] = [];
  const grid = new Map<string, number[]>();
  const key = (p: LngLat) => {
    const [x, y] = toXY(p);
    return [Math.floor(x / SNAP), Math.floor(y / SNAP)];
  };
  const nodeFor = (p: LngLat): number => {
    const [gx, gy] = key(p);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const n of grid.get(`${gx + dx},${gy + dy}`) ?? []) if (dist(nodes[n], p) <= SNAP) return n;
      }
    }
    nodes.push(p);
    const k = `${gx},${gy}`;
    const cell = grid.get(k);
    if (cell) cell.push(nodes.length - 1);
    else grid.set(k, [nodes.length - 1]);
    return nodes.length - 1;
  };
  const edges: Edge[] = [];
  const bySeg = new Map<number, number[]>();
  for (const s of segments) {
    for (const line of s.lines) {
      if (line.length < 2) continue;
      if (area && !line.some((p) => p[0] >= area.w && p[0] <= area.e && p[1] >= area.s && p[1] <= area.n)) continue;
      const a = nodeFor(line[0]);
      const b = nodeFor(line[line.length - 1]);
      const e: Edge = { id: edges.length, seg: s.id, a, b, len: lineLength(line), line, name: s.name };
      edges.push(e);
      const list = bySeg.get(s.id);
      if (list) list.push(e.id);
      else bySeg.set(s.id, [e.id]);
    }
  }
  const adj: number[][] = nodes.map(() => []);
  for (const e of edges) {
    adj[e.a].push(e.id);
    if (e.b !== e.a) adj[e.b].push(e.id);
  }
  return { nodes, edges, adj, bySeg };
}

/** Attach a point to the network, preferring a given road segment if close. */
export function locate(g: Graph, p: LngLat, preferSeg?: number | null, preferWithin = 40): Located | null {
  let best: Located | null = null;
  const consider = (eid: number) => {
    const e = g.edges[eid];
    const pr = projectOnLine(p, e.line);
    if (pr && (!best || pr.distance < best.offset)) best = { edge: eid, along: pr.along, point: pr.point, offset: pr.distance };
  };
  if (preferSeg != null) {
    for (const eid of g.bySeg.get(preferSeg) ?? []) consider(eid);
    if (best && (best as Located).offset <= preferWithin) return best;
    best = null;
  }
  for (const e of g.edges) {
    // cheap reject on first vertex distance
    if (dist(e.line[0], p) > e.len + 250) continue;
    consider(e.id);
  }
  return best;
}

class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size(): number {
    return this.k.length;
  }
  push(node: number, cost: number): void {
    const k = this.k;
    const v = this.v;
    k.push(node);
    v.push(cost);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= v[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const k = this.k;
    const v = this.v;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && v[l] < v[m]) m = l;
        if (r < k.length && v[r] < v[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

export interface Tree {
  dist: Float64Array;
  prevEdge: Int32Array;
}

export function dijkstra(g: Graph, sources: [number, number][]): Tree {
  const n = g.nodes.length;
  const d = new Float64Array(n).fill(Infinity);
  const prevEdge = new Int32Array(n).fill(-1);
  const h = new Heap();
  for (const [node, c] of sources) {
    if (c < d[node]) {
      d[node] = c;
      h.push(node, c);
    }
  }
  while (h.size) {
    const [u, du] = h.pop();
    if (du > d[u]) continue;
    for (const eid of g.adj[u]) {
      const e = g.edges[eid];
      const w = e.a === u ? e.b : e.a;
      const nd = du + e.len;
      if (nd < d[w]) {
        d[w] = nd;
        prevEdge[w] = eid;
        h.push(w, nd);
      }
    }
  }
  return { dist: d, prevEdge };
}

function sourcesOf(g: Graph, L: Located): [number, number][] {
  const e = g.edges[L.edge];
  return [
    [e.a, L.along],
    [e.b, e.len - L.along],
  ];
}

/** Network distance between two located points given a tree grown from `from`. */
export function distanceVia(g: Graph, tree: Tree, from: Located, to: Located): number {
  const e = g.edges[to.edge];
  let best = Math.min(tree.dist[e.a] + to.along, tree.dist[e.b] + (e.len - to.along));
  if (from.edge === to.edge) best = Math.min(best, Math.abs(from.along - to.along));
  return best;
}

/** Full n×n network distance matrix (metres) between located points. */
export function distanceMatrix(g: Graph, locs: Located[]): Float64Array {
  const n = locs.length;
  const m = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    const tree = dijkstra(g, sourcesOf(g, locs[i]));
    for (let j = 0; j < n; j++) m[i * n + j] = i === j ? 0 : distanceVia(g, tree, locs[i], locs[j]);
  }
  return m;
}

export function treeFrom(g: Graph, from: Located): Tree {
  return dijkstra(g, sourcesOf(g, from));
}

/** Shortest path geometry and length between two located points. */
export function path(g: Graph, from: Located, to: Located, tree?: Tree): { length: number; coords: LngLat[] } {
  const t = tree ?? treeFrom(g, from);
  const te = g.edges[to.edge];
  if (from.edge === to.edge) {
    const direct = Math.abs(from.along - to.along);
    const viaNet = Math.min(t.dist[te.a] + to.along, t.dist[te.b] + te.len - to.along);
    if (direct <= viaNet + 1e-6) return { length: direct, coords: slice(te.line, from.along, to.along) };
  }
  const viaA = t.dist[te.a] + to.along;
  const viaB = t.dist[te.b] + (te.len - to.along);
  const endNode = viaA <= viaB ? te.a : te.b;
  const tail = viaA <= viaB ? slice(te.line, 0, to.along) : slice(te.line, te.len, to.along);
  const chain: LngLat[][] = [];
  let node = endNode;
  const fe = g.edges[from.edge];
  let guard = 0;
  while (guard++ < 100_000) {
    const eid = t.prevEdge[node];
    if (eid < 0) break;
    const e = g.edges[eid];
    const prev = e.a === node ? e.b : e.a;
    chain.push(e.a === prev ? e.line : e.line.slice().reverse());
    node = prev;
  }
  // node is now one of the source nodes of `from`'s edge.
  const head = node === fe.a ? slice(fe.line, from.along, 0) : slice(fe.line, from.along, fe.len);
  const coords: LngLat[] = [...head];
  for (let i = chain.length - 1; i >= 0; i--) coords.push(...chain[i].slice(1));
  coords.push(...tail.slice(1));
  return { length: Math.min(viaA, viaB), coords };
}

/** Sub-line between two distances along a line (either direction). */
export function slice(line: LngLat[], d0: number, d1: number): LngLat[] {
  const fwd = d1 >= d0;
  const lo = Math.min(d0, d1);
  const hi = Math.max(d0, d1);
  const out: LngLat[] = [pointAlong(line, lo)];
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    walked += dist(line[i - 1], line[i]);
    if (walked > lo && walked < hi) out.push(line[i]);
  }
  out.push(pointAlong(line, hi));
  return fwd ? out : out.reverse();
}

export function areaAround(points: LngLat[], padMetres = 900): BBox {
  return bboxOf(points, padMetres);
}
