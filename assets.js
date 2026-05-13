const { DateTime } = require('luxon');

class IndustrialAsset {
    constructor(id, name, type) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.status = 'running'; // running, warning, critical, offline
        this.telemetry = {};
        this.lastUpdate = DateTime.now();
        this.history = [];
        this.alarms = [];
    }

    updateTelemetry(data) {
        this.telemetry = { ...this.telemetry, ...data };
        this.lastUpdate = DateTime.now();
        this.history.push({
            ts: this.lastUpdate.toMillis(),
            values: { ...this.telemetry }
        });
        if (this.history.length > 100) this.history.shift();
    }

    addAlarm(severity, message) {
        const alarm = {
            id: Math.random().toString(36).substr(2, 9),
            severity, // warning, critical
            message,
            timestamp: DateTime.now().toISO(),
            acknowledged: false
        };
        this.alarms.push(alarm);
        if (severity === 'critical') this.status = 'critical';
        else if (severity === 'warning' && this.status !== 'critical') this.status = 'warning';
        return alarm;
    }

    clearAlarms() {
        this.alarms = [];
        this.status = 'running';
    }

    getStatusSummary() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            status: this.status,
            telemetry: this.telemetry,
            activeAlarms: this.alarms.length,
            lastUpdate: this.lastUpdate.toISO()
        };
    }
}

class Boiler extends IndustrialAsset {
    constructor(id, name) {
        super(id, name, 'Boiler');
        this.telemetry = { temp: 80, pressure: 45, waterLevel: 75 };
    }

    simulate() {
        if (this.status === 'offline') {
            this.updateTelemetry({ temp: 20, pressure: 0, waterLevel: this.telemetry.waterLevel });
            return;
        }

        let { temp, pressure, waterLevel } = this.telemetry;
        // Faster Sinusoidal fluctuation + higher noise for demo
        temp += Math.sin(Date.now() / 2000) * 3 + (Math.random() - 0.5) * 5;
        // Keep temp from going negative
        if (temp < 20) temp = 20;

        pressure = (temp * 0.5) + (Math.random() - 0.5) * 4;
        waterLevel += (Math.random() - 0.5) * 2;

        if (temp > 110) this.addAlarm('critical', `High temperature detected: ${temp.toFixed(2)}°C`);
        else if (temp > 95) this.addAlarm('warning', `Elevated temperature: ${temp.toFixed(2)}°C`);

        this.updateTelemetry({ temp, pressure, waterLevel });
    }
}

class Motor extends IndustrialAsset {
    constructor(id, name) {
        super(id, name, 'Motor');
        this.telemetry = { rpm: 1750, vibration: 0.1, load: 65, temp: 45 };
    }

    simulate() {
        if (this.status === 'offline') {
            this.updateTelemetry({ rpm: 0, vibration: 0, load: 0, temp: 20 });
            return;
        }

        let { rpm, vibration, load, temp } = this.telemetry;
        load += (Math.random() - 0.5) * 15; // big swings
        if (load < 0) load = 0;
        if (load > 100) load = 100;

        rpm = 1750 + (load - 65) * 15 + (Math.random() - 0.5) * 50;
        vibration = 0.05 + (load / 100) * 0.2 + (Math.random() * 0.1);
        temp = 40 + (load / 2) + (Math.random() - 0.5) * 3;

        if (vibration > 0.4) this.addAlarm('critical', `Excessive vibration: ${vibration.toFixed(2)}mm/s`);
        
        this.updateTelemetry({ rpm, vibration, load, temp });
    }
}

class Conveyor extends IndustrialAsset {
    constructor(id, name) {
        super(id, name, 'Conveyor');
        this.telemetry = { speed: 1.5, load: 40, motorTemp: 45, vibration: 0.1 };
    }

    simulate() {
        if (this.status === 'offline') {
            this.updateTelemetry({ speed: 0, load: 0, motorTemp: 20, vibration: 0 });
            return;
        }

        let { speed, load, motorTemp, vibration } = this.telemetry;
        
        load += (Math.random() - 0.5) * 10;
        if (load < 0) load = 0;
        if (load > 100) load = 100;

        speed = 1.5 + (Math.random() - 0.5) * 0.2;
        motorTemp = 40 + (load * 0.5) + (Math.random() - 0.5);
        vibration = 0.1 + (speed * 0.1) + (load / 200) + (Math.random() * 0.05);

        if (load > 90) this.addAlarm('warning', `Conveyor overload: ${load.toFixed(1)}%`);
        if (vibration > 0.5) this.addAlarm('critical', `Conveyor misalignment / high vibration: ${vibration.toFixed(2)}mm/s`);

        this.updateTelemetry({ speed, load, motorTemp, vibration });
    }
}

class CoolingPump extends IndustrialAsset {
    constructor(id, name) {
        super(id, name, 'Cooling Pump');
        this.telemetry = { flowRate: 250, pressure: 35, temp: 22, vibration: 0.05 };
    }

    simulate() {
        if (this.status === 'offline') {
            this.updateTelemetry({ flowRate: 0, pressure: 0, temp: 20, vibration: 0 });
            return;
        }

        const anomalyChance = parseFloat(process.env.ANOMALY_PROBABILITY) || 0.05;
        const isAnomaly = Math.random() < anomalyChance;

        let { flowRate, pressure, temp, vibration } = this.telemetry;

        if (isAnomaly) {
            flowRate *= 0.5; // Sudden drop
            this.addAlarm('critical', `Emergency: Significant drop in cooling flow detected!`);
        } else {
            flowRate = 250 + Math.sin(Date.now() / 5000) * 10 + (Math.random() - 0.5) * 5;
        }

        pressure = (flowRate / 7) + (Math.random() - 0.5) * 2;
        temp = 20 + (flowRate / 100) + (Math.random() - 0.5);
        vibration = 0.05 + (pressure / 100) + (Math.random() * 0.02);

        if (flowRate < 150 && !isAnomaly) this.addAlarm('critical', `Low coolant flow: ${flowRate.toFixed(1)} L/min`);
        if (pressure > 50) this.addAlarm('warning', `High pump pressure: ${pressure.toFixed(1)} PSI`);

        this.updateTelemetry({ flowRate, pressure, temp, vibration });
    }
}

module.exports = { Boiler, Motor, Conveyor, CoolingPump };
