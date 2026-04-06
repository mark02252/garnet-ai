'use client'

import { useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { FlowNode, FlowEdge } from '@/lib/flow/types'
import { AgentNodeComponent } from './nodes/AgentNode'
import { StartNodeComponent } from './nodes/StartNode'
import { EndNodeComponent } from './nodes/EndNode'
import { ToolNodeComponent } from './nodes/ToolNode'
import { useFlowRunStore } from '@/lib/flow/run-store'

// Register custom node types with ReactFlow
const nodeTypes = {
  start: StartNodeComponent,
  end: EndNodeComponent,
  agent: AgentNodeComponent,
  tool: ToolNodeComponent,
}

type Props = {
  nodes: FlowNode[]
  edges: FlowEdge[]
  onNodesChange: (nodes: FlowNode[]) => void
  onEdgesChange: (edges: FlowEdge[]) => void
  onNodeSelect: (nodeId: string | null) => void
  onSave: (nodes?: FlowNode[], edges?: FlowEdge[]) => void
}

export default function FlowCanvas({ nodes, edges, onNodesChange, onEdgesChange, onNodeSelect, onSave }: Props) {
  const nodeStatuses = useFlowRunStore(s => s.nodeStatuses)

  // Inject run status into node data for visual feedback
  const nodesWithStatus = nodes.map(n => ({
    ...n,
    data: { ...n.data, _status: nodeStatuses[n.id] ?? 'idle' },
  }))

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    const next = applyNodeChanges(changes, nodesWithStatus as never) as unknown as FlowNode[]
    onNodesChange(next.map(n => {
      const { _status: _, ...data } = n.data as FlowNode['data'] & { _status?: string }
      return { ...n, data } as FlowNode
    }))
  }, [nodesWithStatus, onNodesChange])

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    const next = applyEdgeChanges(changes, edges as never) as unknown as FlowEdge[]
    onEdgesChange(next)
  }, [edges, onEdgesChange])

  const handleConnect = useCallback((connection: Connection) => {
    const newEdge: FlowEdge = {
      id: `e-${connection.source}-${connection.target}`,
      source: connection.source!,
      target: connection.target!,
    }
    const next = addEdge(newEdge as never, edges as never) as unknown as FlowEdge[]
    onEdgesChange(next)
  }, [edges, onEdgesChange])

  return (
    <ReactFlow
      nodes={nodesWithStatus as never}
      edges={edges as never}
      nodeTypes={nodeTypes}
      onNodesChange={handleNodesChange}
      onEdgesChange={handleEdgesChange}
      onConnect={handleConnect}
      onNodeClick={(_e, node) => onNodeSelect(node.id)}
      onPaneClick={() => onNodeSelect(null)}
      fitView
    >
      <Background gap={16} color="var(--surface-border)" />
      <Controls />
    </ReactFlow>
  )
}
