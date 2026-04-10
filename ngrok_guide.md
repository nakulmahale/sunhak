# Sharing Debate Results via Ngrok

To allow your friend on another laptop to see your debate results, you can use **ngrok** to create a secure tunnel to your local backend server.

## 1. Setup Ngrok
If you don't have it installed:
1. Download from [ngrok.com](https://ngrok.com/download).
2. Follow the setup instructions on their site to authenticate your account (usually `ngrok config add-authtoken YOUR_TOKEN`).

## 2. Start the Tunnel
Open a new terminal and run:
```powershell
ngrok http 8000
```
*(Assuming your backend is running on the default port 8000)*

## 3. Share the URL
Ngrok will provide a "Forwarding" address like `https://a1b2-c3d4.ngrok.io`. 

Give your friend this specific link to see the latest debate report:
`https://<YOUR-NGROK-ID>.ngrok-free.app/api/v1/report/latest`

## 4. How your friend consumes the data
When your friend visits that URL in their browser (or calls it via their own code), they will receive a full JSON object containing:
- **`current_headline`**: The topic you debated.
- **`messages`**: The full transcript of the conversation.
- **`after_action_report`**: The Critic's final summary of the outcome.
- **`global_tension`**: The final stress level of the world.

> [!IMPORTANT]
> A report will only be available **after** at least one debate has successfully finished in your current session. If the server is restarted, the data is cleared.

> [!TIP]
> Your friend can also check `/health` or `/agents` on the same ngrok URL to see your simulation's configuration!
