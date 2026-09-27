import { MultiDirectedGraph } from 'graphology'
import type {
  EdgeId,
  NodeId,
  RoutingEdge,
  RoutingGraph,
  RoutingGraphFactory,
  RoutingNode,
} from '../../domain/routing/routing-graph'
import type { StationId } from '../../domain/network/model'

class GraphologyRoutingGraph implements RoutingGraph {
  private readonly adjacency = new Map<NodeId, EdgeId[]>()
  private readonly byStation = new Map<StationId, NodeId[]>()

  constructor(private readonly graph: MultiDirectedGraph<RoutingNode, RoutingEdge>) {
    graph.forEachNode((id, attrs) => {
      this.adjacency.set(id, graph.outEdges(id))
      const list = this.byStation.get(attrs.stationId) ?? []
      list.push(id)
      this.byStation.set(attrs.stationId, list)
    })
  }

  get order() {
    return this.graph.order
  }

  get size() {
    return this.graph.size
  }

  node(id: NodeId): RoutingNode {
    return this.graph.getNodeAttributes(id)
  }

  edge(id: EdgeId): RoutingEdge {
    return this.graph.getEdgeAttributes(id)
  }

  outgoing(id: NodeId): readonly EdgeId[] {
    return this.adjacency.get(id) ?? []
  }

  nodesOfStation(stationId: StationId): readonly NodeId[] {
    return this.byStation.get(stationId) ?? []
  }
}

export const graphologyGraphFactory: RoutingGraphFactory = {
  create(nodes, edges) {
    const graph = new MultiDirectedGraph<RoutingNode, RoutingEdge>()
    for (const node of nodes) graph.addNode(node.id, node)
    for (const edge of edges) graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, edge)
    return new GraphologyRoutingGraph(graph)
  },
}
