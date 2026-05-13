const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const express = require('express');
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
require('dotenv').config();
const mqtt = require('mqtt');
const { Boiler, Motor, Conveyor, CoolingPump } = require('./assets');

class IndustrialMCPServer {
    constructor() {
        this.assets = [
            new Boiler('boiler-01', 'High Pressure Boiler'),
            new Motor('motor-01', 'Assembly Line Motor'),
            new Conveyor('conv-01', 'Main Logistics Conveyor'),
            new CoolingPump('pump-01', 'Primary Cooling Pump')
        ];

        this.clients = new Map(); // asset.id -> mqttClient
        this.setupMQTT();

        this.server = new Server({
            name: "industrial-copilot",
            version: "1.0.0",
        }, {
            capabilities: {
                tools: {},
            },
        });

        this.setupTools();
        this.startSimulation();
    }

    setupTools() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: "get_factory_status",
                    description: "Get summary of all machines in the factory",
                    inputSchema: { type: "object", properties: {} }
                },
                {
                    name: "get_machine_details",
                    description: "Get detailed telemetry and alarms for a specific machine",
                    inputSchema: {
                        type: "object",
                        properties: {
                            machineId: { type: "string", description: "ID of the machine (e.g., boiler-01, motor-01, conv-01, pump-01)" }
                        },
                        required: ["machineId"]
                    }
                },
                {
                    name: "reset_machine_alarms",
                    description: "Clear all active alarms for a specific machine. Equivalent to hitting the reset button on the dashboard.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            machineId: { type: "string", description: "ID of the machine" }
                        },
                        required: ["machineId"]
                    }
                },
                {
                    name: "set_machine_status",
                    description: "Turn a machine on (running) or off (offline).",
                    inputSchema: {
                        type: "object",
                        properties: {
                            machineId: { type: "string", description: "ID of the machine" },
                            status: { type: "string", enum: ["running", "offline"], description: "The new status to set" }
                        },
                        required: ["machineId", "status"]
                    }
                }
            ]
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            if (name === "get_factory_status") {
                return {
                    content: [{ type: "text", text: JSON.stringify(this.assets.map(a => a.getStatusSummary()), null, 2) }]
                };
            }

            if (name === "get_machine_details") {
                const asset = this.assets.find(a => a.id === args.machineId);
                if (!asset) return { content: [{ type: "text", text: "Machine not found. Valid IDs are: boiler-01, motor-01, conv-01, pump-01" }], isError: true };
                return {
                    content: [{ type: "text", text: JSON.stringify(asset.getStatusSummary(), null, 2) }]
                };
            }

            if (name === "reset_machine_alarms") {
                const asset = this.assets.find(a => a.id === args.machineId);
                if (!asset) return { content: [{ type: "text", text: "Machine not found" }], isError: true };
                asset.clearAlarms();
                
                // Immediately push updated attributes to reflect on dashboard
                this.pushTelemetry();
                
                return {
                    content: [{ type: "text", text: `Successfully cleared alarms for ${asset.name}.` }]
                };
            }

            if (name === "set_machine_status") {
                const asset = this.assets.find(a => a.id === args.machineId);
                if (!asset) return { content: [{ type: "text", text: "Machine not found" }], isError: true };
                
                asset.status = args.status;
                this.pushTelemetry();

                return {
                    content: [{ type: "text", text: `Successfully set ${asset.name} status to ${args.status}.` }]
                };
            }

            throw new Error(`Tool not found: ${name}`);
        });
    }

    setupMQTT() {
        const tokens = {
            'boiler-01': process.env.TB_TOKEN_BOILER,
            'motor-01': process.env.TB_TOKEN_MOTOR,
            'conv-01': process.env.TB_TOKEN_CONVEYOR,
            'pump-01': process.env.TB_TOKEN_PUMP
        };

        const host = process.env.TB_HOST || 'eu.thingsboard.cloud';

        this.assets.forEach(asset => {
            const token = tokens[asset.id];
            if (!token) {
                console.error(`No token found for ${asset.id}. Skipping MQTT.`);
                return;
            }

            const client = mqtt.connect(`mqtt://${host}`, { username: token });
            
            client.on('connect', () => {
                console.error(`Connected to ThingsBoard: ${asset.name}`);
                // Subscribe to RPC commands
                client.subscribe('v1/devices/me/rpc/request/+');
            });

            client.on('message', (topic, message) => {
                if (topic.startsWith('v1/devices/me/rpc/request/')) {
                    const requestId = topic.split('/').pop();
                    const data = JSON.parse(message.toString());
                    console.error(`Received RPC [${asset.name}]:`, data);

                    // Handle commands
                    if (data.method === 'resetAlarms') {
                        asset.clearAlarms();
                        client.publish(`v1/devices/me/rpc/response/${requestId}`, JSON.stringify({ result: "success" }));
                    } else if (data.method === 'setRunningStatus' || data.method === 'setValue') {
                        asset.status = data.params ? 'running' : 'offline';
                        client.publish(`v1/devices/me/rpc/response/${requestId}`, JSON.stringify({ result: "success" }));
                    }
                }
            });

            client.on('error', (err) => {
                console.error(`MQTT Error [${asset.name}]:`, err.message);
            });

            this.clients.set(asset.id, client);
        });
    }

    pushTelemetry() {
        this.assets.forEach(asset => {
            const client = this.clients.get(asset.id);
            if (!client || !client.connected) return;

            // 1. Send Telemetry (Live Graph Data)
            const telemetryTopic = 'v1/devices/me/telemetry';
            client.publish(telemetryTopic, JSON.stringify(asset.telemetry));

            // 2. Send Attributes (Static/State Data for Alarms)
            const attributeTopic = 'v1/devices/me/attributes';
            const attributes = {
                status: asset.status,
                active_alarms: asset.alarms.length,
                last_alarm: asset.alarms.length > 0 ? asset.alarms[asset.alarms.length - 1].message : "None",
                last_update: asset.lastUpdate.toISO()
            };
            client.publish(attributeTopic, JSON.stringify(attributes));
        });
    }

    startSimulation() {
        setInterval(() => {
            this.assets.forEach(asset => asset.simulate());
            this.pushTelemetry();
        }, process.env.UPDATE_INTERVAL_MS || 5000);
    }

    async run() {
        const app = express();
        let transport;

        app.get("/sse", async (req, res) => {
            transport = new SSEServerTransport("/message", res);
            await this.server.connect(transport);
            console.error("ElevenLabs connected to MCP Server via SSE");
        });

        app.post("/message", async (req, res) => {
            if (!transport) {
                return res.status(400).send("SSE connection not established yet");
            }
            await transport.handlePostMessage(req, res);
        });

        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.error(`Industrial MCP Server listening on port ${PORT} for ElevenLabs`);
        });
    }
}

const server = new IndustrialMCPServer();
server.run().catch(console.error);
