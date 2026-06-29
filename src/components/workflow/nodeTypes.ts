import NodeRenderer from '@/components/workflow/WorkflowNode.vue';

export const nodeTypes = {
  agent: NodeRenderer,
  prompt: NodeRenderer,
  condition: NodeRenderer,
  output: NodeRenderer,
} as const;
