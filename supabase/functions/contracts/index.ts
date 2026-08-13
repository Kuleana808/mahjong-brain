import { createPorts } from '../../../apps/api/src/config.ts';
import { handleEdgeRequest } from '../../../apps/api/src/edge.ts';

const { ports, lines } = createPorts((key) => Deno.env.get(key));
for (const line of lines) console.info(line);

Deno.serve((request) => handleEdgeRequest(request, ports));
