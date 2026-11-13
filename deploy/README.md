# Wayne's app: moving from Vercel to dj-server1

**Goal:** run Wayne's meter app (app.wmfixandfinish.co.za) on dj-server1, next to its database, instead of on Vercel.

**Why now:** since 12 Nov 2026 the app shows Vercel's "402 Payment required, DEPLOYMENT_DISABLED". The Vercel account is suspended over an unpaid invoice, so Wayne and his clients can't use the app. The database at `api.djbase.co.za` is fine. Only the app's web server is gone.

**Never write passwords or keys in this file, in chat, or in Google Sheets.** They go in Vaultwarden and in the server's `.env` file only.

## Where Caddy fits (short answer: it doesn't, here)

Plinth's [Preview hosting](https://plinth.digitaljunction.co.za/systems/sys-preview-hosting/) is a Caddy container (`preview-caddy`) that serves **static** files: html, css and js from `/srv/sites/<name>-preview`. Wayne's app is not static. It is a Next.js app that needs a running Node server: it checks logins, talks to Supabase, Rebill and Brevo, and makes PDFs.

So the app gets its own container, `wayne-app`. It is set up the same way as Caddy: no open ports, on the shared Docker network, reached only through the Cloudflare Tunnel. The tunnel route points straight at `http://wayne-app:3000`. Cloudflare already does what a reverse proxy would (HTTPS, DDoS protection, the managed firewall), so Caddy isn't needed in front of it.

```
Phone -> Cloudflare -> tunnel (cloudflared) -> wayne-app:3000 -> api.djbase.co.za (Supabase)
```

## Before you start: two things to settle with Dale

### 1. Plinth's rule about live sites

Plinth's [Hosting accounts](https://plinth.digitaljunction.co.za/toolbox/tool-hosting-accounts/) page says: *live sites stay on Cyber Circuit, Vercel or Netlify, not on the home servers, until backups and a UPS exist.* Backups are running. There is **no UPS yet** ([Recover after a power cut](https://plinth.digitaljunction.co.za/guides/guide-power-cut/) still says so).

What that means for Wayne: his data already lives on dj-server1, so in a power cut the app is already unusable. Moving the app there adds no new outage, but it does break the written rule. Dale needs to agree to the exception, and Plinth's rule needs updating to match. The quicker fix is to pay the Vercel invoice. If you do that, nothing in this guide is needed.

No payments and no Swiss client data are involved. The app only stores the quoted add-on prices. Rebill handles invoices and payments.

### 2. Wayne's domain isn't in Cloudflare

`wmfixandfinish.co.za` uses Cyber Circuit's name servers (`ns1za`–`ns4za.cybercircuit.co.za`). A Cloudflare Tunnel can only publish addresses for domains in DJ's own Cloudflare account, so the domain has to move into Cloudflare first (Part 4). That's the same step as Step A of the djbass plan. It can take up to a day, and the mail records must be copied over correctly.

If that can't happen quickly, a stopgap is to run the app on a djbase address for now, such as `wayne.djbase.co.za`. That needs more changes: Supabase redirect URLs, `NEXT_PUBLIC_SITE_URL`, and every invite and reset link. Ask Claude before going that way.

---

## Part 1: The code (done on the `redesign` branch)

These files are new or changed. Commit them, merge to `main` and push, because the server pulls from GitHub.

| File | What it's for |
|---|---|
| `next.config.ts` | `output: "standalone"`: the build makes a small self-contained server |
| `Dockerfile` | Builds the app into an image (Node 22) |
| `.dockerignore` | Keeps `.env` files, `node_modules` and the migration files out of the image |
| `docker-compose.yml` | The `wayne-app` stack: no open ports, on the `garage_default` network, restarts by itself |
| `deploy/README.md` | This checklist |

## Part 2: Put the app on the server (Marci, about 30 min)

"Server window" = your SSH session on dj-server1 (see [Get onto the server](https://plinth.digitaljunction.co.za/guides/guide-ssh-in/)). Paste one command at a time.

### 2.1 Give the server read access to the repo

Like the previews, the server gets a read-only deploy key for this one repo.

```
ssh-keygen -t ed25519 -f ~/.ssh/wayne-app-deploy -N "" -C "dj-server1 wayne-app"
cat ~/.ssh/wayne-app-deploy.pub
```

GitHub → `Digital-Junction-Online/meter-readings-poc` → Settings → Deploy keys → Add deploy key. Paste the line, name it `dj-server1`, and **leave "Allow write access" off**. Save the private key in the vault.

Tell SSH which key to use for this repo:

```
nano ~/.ssh/config
```

Add these lines, then save:

```
Host github-wayne-app
  HostName github.com
  User git
  IdentityFile ~/.ssh/wayne-app-deploy
  IdentitiesOnly yes
```

### 2.2 Download the app

```
cd ~
git clone -b main git@github-wayne-app:Digital-Junction-Online/meter-readings-poc.git wayne-app
cd wayne-app
```

### 2.3 Fill in the settings

```
nano .env
```

Seven lines, `NAME=value`, no quotes and no spaces around `=`. Take each value from the vault or from where the table says. The Vercel settings page may be locked while the account is suspended.

| Setting | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://api.djbase.co.za` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `ANON_KEY` from the djbase `.env` (`~/wayne-supabase/.env`) |
| `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` from the same file. Secret: server only |
| `NEXT_PUBLIC_SITE_URL` | `https://app.wmfixandfinish.co.za` |
| `REBILL_API_BASE` | `https://api.rebill.co.za` |
| `REBILL_API_KEY` | Rebill → Settings → Developer → API Access (vault) |
| `BREVO_API_KEY` | Brevo → SMTP & API → API Keys (vault) |

Lock the file so only you can read it:

```
chmod 600 .env
```

### 2.4 Check the Docker network name

The stack joins the same network as `cloudflared` and `preview-caddy`. Plinth's previews stack calls it `garage_default`. Check:

```
docker inspect cloudflared --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

If the name isn't `garage_default`, change both places in `docker-compose.yml` to the name shown. Tell Claude so the repo matches.

### 2.5 Build and start it

The first build takes 5 to 10 minutes and uses 1 to 2 GB of memory for a few minutes.

```
docker compose up -d --build
docker compose ps
docker logs wayne-app --tail 20
```

It's running when the log says `Ready`. It also shows up in Portainer as stack `wayne-app`.

### 2.6 Check it answers on the network

```
docker run --rm --network garage_default curlimages/curl -s -o /dev/null -w "%{http_code}\n" http://wayne-app:3000/
```

`200` = ✅

---

## Part 3: Test it on a private address first (Dale, about 10 min)

This tests the app before any client sees it, while app.wmfixandfinish.co.za stays as it is.

1. Zero Trust → Networks → Tunnels → dj-server1 → Published application routes → add `wayne-app-test.digitaljunction.co.za` → HTTP `wayne-app:3000`.
2. Add an Access app for it with the saved team policy (Dale and Marci), the same as Studio. Save. It doesn't autosave.
3. In a private window on `https://wayne-app-test.digitaljunction.co.za`:
   - [ ] Log in with an admin account and land on the admin page, not back on login
   - [ ] Old readings show with their photos
   - [ ] Admin → Quotes loads quotes from Rebill (see the note below)
   - [ ] Admin → Users shows the user list

Password reset links always point to app.wmfixandfinish.co.za, so test those in Part 5.

**About Rebill:** the Quotes and Clients pages have an `edge` runtime setting. It was a workaround for Cloudflare blocking Vercel's calls to Rebill. From dj-server1 the block may simply be gone. If Quotes says "Couldn't reach Rebill", send Claude the message.

## Part 4: Move wmfixandfinish.co.za into Cloudflare (Dale, up to a day)

Wayne's email (`support@wmfixandfinish.co.za`) and website use this domain. **The mail records are the part to get right.**

1. Cloudflare dashboard (the DJ account with the dj-server1 tunnel) → Add a domain → `wmfixandfinish.co.za` → Free plan. Cloudflare reads the existing records.
2. Open Cyber Circuit cPanel → Zone Editor for the domain, and check **every** record is now in Cloudflare too. In particular:
   - the website (`wmfixandfinish.co.za` and `www`)
   - mail: MX, `mail`, `webmail`, `autodiscover`, and any SRV records
   - the TXT records: SPF, DKIM (`default._domainkey`), DMARC, and **Brevo's** records (`brevo-code` and its DKIM). Without these, report and reset emails land in spam.
3. Mail records (MX, `mail`, `webmail`, `autodiscover`, and anything Brevo or cPanel names) must be **DNS only** (grey cloud), never proxied.
4. Write down the current `app` record (it points at Vercel) somewhere safe, then **delete it**. The tunnel route in Part 5 makes the new one.
5. At the registrar (likely Cyber Circuit, to confirm: vault entry `Cyber Circuit`), replace the four name servers with the two Cloudflare shows.
6. Wait until Cloudflare shows the domain as **Active**. Then:
   - [ ] the website still opens
   - [ ] an email to `support@wmfixandfinish.co.za` arrives, and a reply goes out
7. SSL/TLS → Edge Certificates → Always Use HTTPS: On. Leave Bot Fight Mode off.

## Part 5: Switch the app on (Dale, about 10 min)

1. Tunnel dj-server1 → Published application routes → add `app.wmfixandfinish.co.za` → HTTP `wayne-app:3000`. **No Access gate.** Wayne's clients must reach it directly.
2. Test in a private window on `https://app.wmfixandfinish.co.za`:
   - [ ] Log in with an admin account
   - [ ] Old readings and photos show
   - [ ] Take a new reading with a photo; it appears in the review queue
   - [ ] Take a reading while offline, go back online, and it syncs
   - [ ] Send a password reset to yourself; the email arrives and the link works
   - [ ] Admin → Reports → email a report to yourself; it arrives
   - [ ] Log in as a client: the dashboard shows, and an add-on request emails support@
3. Delete the `wayne-app-test` route and its Access app.
4. Tell Wayne the app is back. If anyone sees the login page, they just log in again.

---

## Updating the app later

After changes are merged to `main`, in the server window:

```
cd ~/wayne-app
git pull
docker compose up -d --build
```

- Changed a secret key only (`SUPABASE_SERVICE_ROLE_KEY`, `REBILL_API_KEY`, `BREVO_API_KEY`): edit `.env`, then `docker compose up -d`.
- Changed any `NEXT_PUBLIC_` value: these are baked in when the app is built, so run the full `docker compose up -d --build`.

## If something goes wrong

- **1033 or 502**: see [Read tunnel errors](https://plinth.digitaljunction.co.za/guides/guide-tunnel-errors/). Check the route says `wayne-app:3000` and `docker compose ps` shows it Up. After a reboot, `docker restart cloudflared`.
- **Log in works but bounces back to the login page**: the Supabase address or key is wrong in the build. Check `.env`, then `docker compose up -d --build`.
- **Emails don't send**: check `BREVO_API_KEY`, and that Brevo's DNS records came across in Part 4.
- **The container keeps restarting**: `docker logs wayne-app --tail 50`, and send the output to Claude. Never send the `.env`.
- **Going back to Vercel** (only once the account is paid): delete the `app.wmfixandfinish.co.za` tunnel route and put back the `app` record you wrote down in Part 4, as DNS only.

## Afterwards

- [ ] Plinth → [Cloudflare Tunnel and Access](https://plinth.digitaljunction.co.za/systems/sys-tunnel-access/): add `app.wmfixandfinish.co.za` → `wayne-app` (no Access login) to the routes table. That table also still lists `wayne-db.digitaljunction.co.za` and not `api.djbase.co.za`, so tidy that too.
- [ ] Plinth → [Cloudflare](https://plinth.digitaljunction.co.za/toolbox/tool-cloudflare/): add `wmfixandfinish.co.za` to the domains it holds DNS for.
- [ ] Plinth → [Hosting accounts](https://plinth.digitaljunction.co.za/toolbox/tool-hosting-accounts/): record the exception for Wayne, or the new rule.
- [ ] Plinth → Wayne's schematic: the App hosting rail and the Client app part say Vercel. Change them to dj-server1.
- [ ] Backups: the container holds no data. Everything is in the repo and djbase. Only the `.env` matters: save its values in the vault.
- [ ] When Wayne's stack moves to dj-server2 or the EliteDesk, repeat Part 2 there and point the tunnel route at the new server.
