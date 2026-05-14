const express = require('express');
require('dotenv').config();
const mqtt = require('mqtt');
const { Boiler, Motor, Conveyor, CoolingPump } = require('./assets');

class IndustrialWebhookServer {
    constructor() {
        this.assets = [
            new Boiler('boiler-01', 'High Pressure Boiler'),
            new Motor('motor-01', 'Assembly Line Motor'),
            new Conveyor('conv-01', 'Main Logistics Conveyor'),
            new CoolingPump('pump-01', 'Primary Cooling Pump')
        ];

        this.clients = new Map(); // asset.id -> mqttClient
        this.setupMQTT();
        this.startSimulation();
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
                client.subscribe('v1/devices/me/rpc/request/+');
            });

            client.on('message', (topic, message) => {
                if (topic.startsWith('v1/devices/me/rpc/request/')) {
                    const requestId = topic.split('/').pop();
                    const data = JSON.parse(message.toString());
                    console.error(`Received RPC [${asset.name}]:`, data);

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

            const telemetryTopic = 'v1/devices/me/telemetry';
            client.publish(telemetryTopic, JSON.stringify(asset.telemetry));

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

    async start() {
        const app = express();
        app.use(express.json());

        // ElevenLabs Webhook Endpoints

        // 1. Get Factory Status
        app.post("/webhook/get_factory_status", (req, res) => {
            console.error("Webhook called: get_factory_status");
            const summary = this.assets.map(a => a.getStatusSummary());
            res.json({
                status: "success",
                factory_summary: summary
            });
        });

        // 2. Get Machine Details
        app.post("/webhook/get_machine_details", (req, res) => {
            const { machineId } = req.body;
            console.error(`Webhook called: get_machine_details for ${machineId}`);
            
            const asset = this.assets.find(a => a.id === machineId);
            if (!asset) {
                return res.status(404).json({ 
                    status: "error", 
                    message: "Machine not found. Valid IDs: boiler-01, motor-01, conv-01, pump-01" 
                });
            }

            res.json({
                status: "success",
                machine_details: asset.getStatusSummary()
            });
        });

        // 3. Reset Machine Alarms
        app.post("/webhook/reset_machine_alarms", (req, res) => {
            const { machineId } = req.body;
            console.error(`Webhook called: reset_machine_alarms for ${machineId}`);

            const asset = this.assets.find(a => a.id === machineId);
            if (!asset) {
                return res.status(404).json({ status: "error", message: "Machine not found" });
            }

            asset.clearAlarms();
            this.pushTelemetry();

            res.json({
                status: "success",
                message: `Successfully cleared alarms for ${asset.name}.`
            });
        });

        // 4. Set Machine Status
        app.post("/webhook/set_machine_status", (req, res) => {
            const { machineId, status } = req.body;
            console.error(`Webhook called: set_machine_status for ${machineId} to ${status}`);

            const asset = this.assets.find(a => a.id === machineId);
            if (!asset) {
                return res.status(404).json({ status: "error", message: "Machine not found" });
            }

            if (!['running', 'offline'].includes(status)) {
                return res.status(400).json({ status: "error", message: "Invalid status. Use 'running' or 'offline'." });
            }

            asset.status = status;
            this.pushTelemetry();

            res.json({
                status: "success",
                message: `Successfully set ${asset.name} status to ${status}.`
            });
        });

        // Health check
        app.get("/health", (req, res) => res.send("Industrial Webhook Server Active"));

        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.error(`Industrial Webhook Server listening on port ${PORT}`);
            console.error(`Endpoints available:`);
            console.error(`- POST /webhook/get_factory_status`);
            console.error(`- POST /webhook/get_machine_details`);
            console.error(`- POST /webhook/reset_machine_alarms`);
            console.error(`- POST /webhook/set_machine_status`);
        });
    }
}

const server = new IndustrialWebhookServer();
server.start().catch(console.error);
