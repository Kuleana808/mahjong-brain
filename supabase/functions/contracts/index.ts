import { createEdgePorts } from '../../../apps/api/src/edgeConfig.ts';
import { handleEdgeRequest } from '../../../apps/api/src/edge.ts';

const { ports, lines } = createEdgePorts((key) => Deno.env.get(key));
for (const line of lines) console.info(line);

Deno.serve((request) => handleEdgeRequest(request, ports));
