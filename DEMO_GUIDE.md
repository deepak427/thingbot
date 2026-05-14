# Thingbot: Demo & Setup Guide 🚀

This guide contains everything you need to set up and run the live demo for **Thingbot**.

## 1. ThingsBoard Configuration
*   **Login**: [ThingsBoard Cloud](https://eu.thingsboard.cloud/)
*   **Import Dashboard**: 
    *   Navigate to **Dashboards** -> **(+)** -> **Import dashboard**.
    *   Select `main_factory_floor.json`.
*   **Device Tokens**: Ensure your `.env` file has the correct access tokens for the Boiler, Motor, Conveyor, and Pump.

## 2. Local Server Setup
1.  **Install**: `npm install`
2.  **Env**: Ensure `.env` is configured.
3.  **Run**: `npm start`
4.  **Expose**: 
    ```bash
    ngrok http 3000
    ```
    *Copy the Forwarding URL (e.g., `https://xxxx.ngrok.io`).*

## 3. ElevenLabs Agent Setup
1.  **Dashboard**: Go to [ElevenLabs Conversational AI](https://elevenlabs.io/app/conversational-ai).
2.  **Tools**: Add these webhooks using your ngrok URL:
    *   `GET /webhook/get_factory_status`
    *   `POST /webhook/get_machine_details` (Body: `{ "machineId": "..." }`)
    *   `POST /webhook/reset_machine_alarms` (Body: `{ "machineId": "..." }`)
    *   `POST /webhook/set_machine_status` (Body: `{ "machineId": "...", "status": "..." }`)
3.  **Twilio**: Link your Twilio number to the agent.

## 4. Live Demo Script
*   **Step 1**: Open the ThingsBoard dashboard.
*   **Step 2**: Call the Twilio number.
*   **Step 3**: Say: *"Hey, give me a status update on the factory floor."*
*   **Step 4**: Say: *"The assembly line motor is vibrating too much. Stop it and reset the alarms."*
*   **Step 5**: Observe the ThingsBoard widgets update in real-time.

---

### Future Roadmap
*   **Radio Integration**: Bridge the AI agent with LMR/DMR radio systems for low-network areas (Oil Rigs, Dairy Farms).
*   **Predictive Maintenance**: Use history from ThingsBoard to predict failures before they happen.
