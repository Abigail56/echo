# Private access with Tailscale

The optional `tailscale` Compose profile publishes ECHO over HTTPS to devices
in your tailnet. It does not enable Tailscale Funnel or expose an Internet
public endpoint.

## Setup

1. Install and sign in to Tailscale on each device that should access ECHO.
   The sidecar joins your tailnet itself; the Docker host does not need a
   separate Tailscale client. Enable MagicDNS and HTTPS certificates for your
   tailnet in the Tailscale admin console.
2. Create an auth key in the Tailscale admin console. Copy
   `tailscale/.env.example` to `tailscale/.env` and set `TS_AUTHKEY` there.
   Keep the key private; this local file is git-ignored, and the authenticated
   node state is stored in a Docker volume, so the key is only needed for
   initial authentication.
3. Copy `.env.example` to `.env`. Set a unique `JWT_SECRET_KEY`, then configure:

   ```dotenv
   FRONTEND_URL=https://echo-studio-app.<your-tailnet>.ts.net
   COOKIE_SECURE=true
   NEXT_PUBLIC_API_URL=/api/v1
   ```

   The origin must match the app's HTTPS MagicDNS name exactly; it is checked
   for API writes and room WebSockets.
4. Start ECHO and the Tailscale sidecar:

   ```sh
   docker compose --profile tailscale up --build -d
   docker compose logs -f tailscale
   ```

   Open `https://echo-studio-app.<your-tailnet>.ts.net` on a device connected to
   the same tailnet. Tailscale Serve routes `/api/v1/` to the backend and all
   other paths to the frontend, including room WebSockets.

The frontend API URL is embedded at build time. If you change
`NEXT_PUBLIC_API_URL`, rebuild with `docker compose --profile tailscale up
--build -d`. To return to local-only use, remove the Tailscale-specific
settings from `.env` (or restore the local defaults) and run
`docker compose up --build -d`.

The `tailscale` profile uses userspace networking and persists its node
identity in the `echo_tailscale_data` volume. Use your tailnet ACLs to control
who can reach the ECHO device. Do not enable Funnel unless you intentionally
want public Internet access.

If Serve reports that it cannot issue TLS certificates, enable HTTPS
certificates in the tailnet's **DNS** settings, then restart the Tailscale
service.
