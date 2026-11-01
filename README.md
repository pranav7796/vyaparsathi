# VyaparSaathi

VyaparSaathi is a companion for a micro or small business owner in Karnataka who wants a government loan or subsidy and does not want to hunt through portals alone.

A scheme page lists eligibility in official language, asks for a project report, and ends in a long form. The owner usually hears about the scheme from a neighbour or a bank clerk, then gives up when the site asks for a document they do not have with them. VyaparSaathi sits in front of that. It asks a few plain questions, reads an ID if one is uploaded, and comes back with the schemes that fit, the amount, and the papers still missing. If the owner wants to go further, it fills a practice application and stops. The form is not sent until they tap **Approve & submit**.

The name is साथी: a companion, not a portal and not a bank.

The screens are in English and Kannada. The owner can switch with the language button in the header.

## Who it is for

The person in mind runs a shop, a tailoring unit, a small food business, a workshop, or a service, in one of Karnataka’s districts. They may be applying for the first time. They may already have Udyam registration, or they may not. They should be able to finish the first pass by tapping, without typing a paragraph, though they can also describe the shop in their own words in English, Kannada, or a mix.

VyaparSaathi does not replace the District Industries Centre, the bank, or the official portal. It prepares the owner so those steps are shorter.

## What the owner does

1. **Start.** The home screen states the promise: find the government loan the business deserves, from official sources, for free, and only after the owner approves.

2. **Upload an ID, or skip it.** A photo or PDF of Aadhaar, PAN, or an Udyam certificate is enough. The app reads the name, date of birth, age, gender, address, district, pincode, and ID type. The ID number is kept only as a mask, such as `XXXX0000`. The owner corrects anything wrong and confirms. They can also continue without an ID and answer the questions by hand.

3. **Answer only what is still missing.** Taps cover the kind of work (shop, tailoring, food, manufacturing, services, or other), the Karnataka district, how long the business has been running, the loan size (₹1 lakh, ₹3 lakh, ₹5 lakh, or ₹10 lakh and above), gender and category, and whether they have Udyam. A district or gender already read from the ID is not asked again. A free-text box can fill several of those fields at once: “A tailoring shop in Mysuru. I need 3 lakh.”

4. **See the matches.** The app checks PMEGP, PM Mudra, and MyScheme Karnataka, then ranks what came back. The top card is the best match: scheme name, a qualify / maybe / no verdict, the largest amount mentioned in the benefit, a one-line reason, and any paper the profile does not already cover (Udyam certificate, rural certificate, category certificate). Other schemes sit underneath. Farmer-only schemes are set aside when the work is a business.

5. **Start applying.** Opening a scheme shows the practice PMEGP form with the owner’s name, age, gender, category, district, and loan filled in. Fields the profile does not have, such as project cost, Udyam number, and bank details, stay blank and are marked as needing input. The owner can change a value. **Approve & submit** stays disabled while they are editing.

6. **Track it.** After approval, the application is saved in the browser and the status page shows where it stands: draft, submitted, query raised, or approved. **Check status now** looks again. In the demo, that check raises a query asking for a bank passbook and can send the same note on WhatsApp.

## Two jobs, kept apart

Eligibility and browsing are different jobs, and they are not given to the same system.

The language model reads. It turns an ID image or a sentence into a profile, and it compares that profile with each scheme’s eligibility text. A field that was not clearly stated stays empty. It does not guess age, category, or income. It does not open websites, and it does not invent a scheme that was not in the list it was given. If it cannot decide, the verdict is **unclear**, with a reason that points at the missing fact. If the model is unavailable, every scheme stays **unclear** and the owner still sees the list.

TinyFish browses. It opens the live portal, reads the scheme (name, benefit, eligibility, documents, how to apply), and can type into the practice form. It never decides who qualifies. It is told to stop before the submit button. Each call is limited to 30 seconds. If it times out or fails, discovery keeps the last saved schemes, or a local seed list, and the form is filled from the profile on this machine instead of from the live page.

That split is the rule of the product: the model judges, the browser agent fetches and types, and the owner sends.

## Where the schemes come from

Three portals are read:

| Portal | What it is |
| --- | --- |
| PMEGP | Prime Minister’s Employment Generation Programme, for a new micro enterprise, with margin money and a bank loan |
| PM Mudra | Collateral-free loans for a non-farm micro business, up to ₹10 lakh |
| MyScheme Karnataka | The national MyScheme search, used here for Karnataka MSME schemes |

A successful read is stored in `data/vyaparsaathi.db` with the time it was fetched. A row younger than seven days is reused, so the next owner does not wait on the portals again. If a portal has nothing fresh, a seed list stands in: PMEGP, PM Mudra, CGTMSE, and the Karnataka Udyogini scheme. Seed names are shown without the `[SEED DATA]` marker.

The best match is not “the first eligible row.” Eligible beats unclear, which beats not eligible. Within that, the rank prefers a scheme whose text matches the kind of work, a women-focused scheme when the applicant is a woman, a category mention when the applicant is not in the general category, and a benefit cap that can cover the loan they asked for.

## The practice portal

Apply and status for the demo do not post to the real PMEGP site. They use a local practice portal:

- `/mock-portal/apply.html` is the application form.
- `/mock-portal/status.html` is the status lookup.

The agent is instructed to fill the fields and stop before **Submit application**. The preview in VyaparSaathi shows what would be sent. Approval writes an application id like `PMEGP-KA-2026-…` into the browser session and moves the owner to the status screen.

## Demo mode and live mode

`DEMO_MODE=true` is the hackathon path. It is meant to finish even when a portal or a vision call is slow.

| Step | In demo mode | When demo mode is off |
| --- | --- | --- |
| ID photo | The sample card printed for this demo is returned immediately. It is marked sample, and it is not a real ID. | The photo is sent to the vision model. Unreadable fields stay empty. |
| Schemes | The saved TinyFish rows are returned at once. Missing portals are not fetched in the background. | Missing portals are fetched, with a 30 second cap. A failure leaves the cache or the seed list. |
| Form | Fields are filled from the profile on this server. No live browser run. | TinyFish fills the practice form and stops before submit. On failure, the same local fill is used. |
| Status | The check returns **Query raised: upload bank passbook** and tries a WhatsApp note. | TinyFish reads the practice status page. On failure, the same query is used. |

`NEXT_PUBLIC_DEMO_MODE=true` only shortens the on-screen “filling the form” steps. It does not change the data.

## What is stored

The profile and the applications the owner just made live in the browser session. Closing the tab clears them. The scheme cache lives in SQLite at `data/vyaparsaathi.db`, so discovery can be fast for the next run. ID numbers are masked before they are shown. Do not commit `.env.local` or a database that contains anything other than public scheme text.

## Run it

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use `localhost`, not `127.0.0.1`, unless that host is listed in `allowedDevOrigins` in `next.config.ts`. On `127.0.0.1` the dev server blocks its own scripts and the buttons do nothing.

### A full demo, in order

1. Tap **Start**.
2. Upload the sample ID photo. The card itself says **SAMPLE — NOT A REAL ID**.
3. Tap **Yes, this is correct**.
4. Tap **Shop**, **Mysuru**, **1 year**, **₹1L**, **Male**, **General**, **No**.
5. On PMEGP, the best match, tap **Start applying**.
6. When the preview shows the name, tap **Approve & submit**.
7. Tap **Check status now**. The alert is **Query raised: upload bank passbook**.

### Environment

Copy `.env.local.example` and fill in what you have.

| Variable | Used for |
| --- | --- |
| `OPENAI_API_KEY` | Profile text, scheme matching, and ID photos |
| `OPENAI_BASE_URL` | Any OpenAI-compatible endpoint. The model is set in `lib/llm.ts` |
| `TINYFISH_API_KEY` | Live scheme reads and form fill |
| `DEMO_MODE` | `true` uses the cached schemes, the sample ID, local form fill, and the practice status alert |
| `NEXT_PUBLIC_DEMO_MODE` | Shortens the filling animation in the browser |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `OWNER_WHATSAPP` | Optional WhatsApp note when a query is raised. If these are empty, the status screen still updates |

`TWILIO_WHATSAPP_FROM` and `OWNER_WHATSAPP` can be `whatsapp:+91...` or a plain number. The sender must be a Twilio WhatsApp sender the recipient has joined.

### Scripts

```bash
npm run dev     # local app
npm run build   # production build
npm run start   # serve the build
npm run lint
```

## Stack

Next.js (App Router), React, TypeScript, Tailwind, Zod, an OpenAI-compatible client, TinyFish for the live pages, better-sqlite3 for the scheme cache, and Twilio for the optional WhatsApp note.
