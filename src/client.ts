import { input, select } from "@inquirer/prompts";
import { Client } from "@modelcontextprotocol/sdk/client/index";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import { Tool } from "@modelcontextprotocol/sdk/types";

const mcp = new Client(
    {
        name: "cli-client",
        version: "1.0.0",
    },
);

const transport = new StdioClientTransport({
    command: "node",
    args: ["build/server.js"],
    stderr: "ignore",
});

async function main() {
    await mcp.connect(transport);

    const [
        { tools },
        { resources },
        { prompts },
        { resourceTemplates },
    ] = await Promise.all([
        mcp.listTools(),
        mcp.listResources(),
        mcp.listPrompts(),
        mcp.listResourceTemplates(),
    ]);
    
    console.log("You are connected!");

    while (true) {
        const option = await select({
            message: "What would you like to choose?",
            choices: ["Query", "Tools", "Resources", "Prompts"]
        });

        switch (option) {
            case "Tools":
                const toolName = await select({
                    message: "Select a tool",
                    choices: tools.map(tool => ({
                        name: tool.annotations?.title || tool.name,
                        value: tool.name,
                        description: tool.description,
                    })),
                });

                const tool = tools.find(tool => tool.name === toolName);
                if (tool == null) {
                    console.error("Tool not found!");
                } else {
                    await handleTool(tool);
                }
                break;
            case "Resources":
                const resourceUri = await select({
                    message: "Select a resource",
                    choices: [
                        ...resources.map(resource => ({
                            name: resource.name,
                            value: resource.uri,
                            description: resource.description
                        })),
                        ...resourceTemplates.map(template => ({
                            name: template.name,
                            value: template.uriTemplate,
                            description: template.description,
                        })),
                    ],
                });

                const uri = resources.find(resource => resource.uri === resourceUri)?.uri ??
                resourceTemplates.find(resource => resource.uriTemplate === resourceUri)?.uriTemplate;

                if (uri == null) {
                    console.error("Resource not found!");
                } else {
                    await handleResource(uri);
                }

                break;
        }
    }
}

async function handleTool(tool: Tool) {
    const args: Record<string, string> = {};

    for (const [key, value] of Object.entries(
        tool.inputSchema.properties ?? {}
    )) {
        args[key] = await input({
            message: `Enter value for ${key} (${(value as { type: string }).type}):`
        })
    }

    const res = await mcp.callTool({
        name: tool.name,
        arguments: args,
    });

    console.log((res.content as [{ text: string }])[0].text);
}

async function handleResource(uri: string) {
    let finalUri = uri;
    const paramMatches = uri.match(/{([^}]+)}/g);

    if (paramMatches != null) {
        for (const paramMatch of paramMatches) {
            const paramName = paramMatch.replace("{", "").replace("}", "");
            const paramValue = await input({
                message: `Enter value for ${paramName}:`,
            });
            finalUri = finalUri.replace(paramMatch, paramValue);
        }
    }

    const res = await mcp.readResource({
        uri: finalUri,
    });

    const content = res.contents[0];

    if (content && "text" in content) {
        console.log(JSON.stringify(JSON.parse(content.text), null, 2));
    } else {
        console.log("Cannot parse text");
    }

}

main();