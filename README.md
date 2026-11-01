# VyaparSaathi

VyaparSaathi helps a Karnataka shop owner find a government loan or subsidy and fill the application without sending it until they say so.

The owner uploads an ID, confirms what was read, and answers a few taps: work, district, how long the shop has been running, loan size, who is applying, and whether they have Udyam. The app matches that profile to schemes pulled from government portals, opens the best match, and shows a filled practice form. Nothing is submitted until they tap **Approve & submit**. A later status check can raise a query and send a WhatsApp note.

English and Kannada are both in the UI.

## Demo path

With `DEMO_MODE=true`, the walk-through stays on cached schemes and local form fill. Live portal agents are capped at 30 seconds and are not required.

1. Open the app and tap **Start**.
2. Upload the sample ID photo (the card marked **SAMPLE — NOT A REAL ID**).
3. Tap **Yes, this is correct**.
4. Tap **Shop**, **Mysuru**, **1 year**, **₹1L**, **Male**, **General**, **No**.
5. On **PMEGP**, the best match, tap **Start applying**.
6. When the preview shows the name, tap **Approve & submit**.
7. Tap **Check status now**. The alert is **Query raised: upload bank passbook**.

## How it is split

The language model reads the ID and the owner’s words, then decides eligibility. It never opens a website.

[TinyFish](https://tinyfish.ai) reads the scheme pages (PMEGP, PM Mudra, and MyScheme Karnataka) and can fill the practice form. It does not decide who qualifies. Each call stops after 30 seconds. If it does not finish, discovery keeps the cached or seed schemes, and apply keeps the locally filled fields.

The owner always approves the form. The app stops before submit.

## Run it

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use `localhost`, not `127.0.0.1`, unless that host is listed in `allowedDevOrigins` in `next.config.ts`. On `127.0.0.1` the dev server blocks its own scripts and the page stays frozen.

Scheme pages already fetched are stored in `data/vyaparsaathi.db` and reused for seven days.

## Environment

Copy `.env.local.example` and fill in what you have. Do not commit `.env.local`.

| Variable | Used for |
| --- | --- |
| `OPENAI_API_KEY` | Profile text, scheme matching, and ID photos |
| `OPENAI_BASE_URL` | Any OpenAI-compatible endpoint. The model is set in `lib/llm.ts` |
| `TINYFISH_API_KEY` | Live scheme reads and form fill |
| `DEMO_MODE` | `true` uses the cached schemes, the sample ID, local form fill, and the practice status alert |
| `NEXT_PUBLIC_DEMO_MODE` | Shortens the “filling the form” steps in the browser |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `OWNER_WHATSAPP` | Optional WhatsApp note when a status query is raised. If these are empty, the status screen still updates |

`TWILIO_WHATSAPP_FROM` and `OWNER_WHATSAPP` can be `whatsapp:+91...` or a plain number. The sender must be a Twilio WhatsApp sender the recipient has joined.

## Scripts

```bash
npm run dev    # local app
npm run build  # production build
npm run start  # serve the build
npm run lint
```
