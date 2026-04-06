import type { FlowNode } from '@/lib/flow/types'
export default function NodeConfigPanel({ node, onUpdate }: { node: FlowNode | null; onUpdate: (id: string, data: Partial<FlowNode['data']>) => void }) { return null }
