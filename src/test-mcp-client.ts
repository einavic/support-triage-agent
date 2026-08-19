import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/src/mcp-server.js"]
  });

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);

  const tools = await client.listTools();
  console.log("Tools:", JSON.stringify(tools, null, 2));

  const result = await client.callTool({
    name: "search_knowledge_base",
    arguments: { query: "shipping" }
  });
  console.log("Result:", JSON.stringify(result, null, 2));

  process.exit(0);
}

main();