# Agent Trust OS

Agent Trust OS is a COMP630 MVP showing how a small retailer can monitor a customer-service AI agent in real time. The demonstration organization is **ShopEase Retail Co.**

The application uses a two-agent workflow:

- **ShopBot** answers customer questions using official ShopEase products, policies, delivery details and offers.
- **TRUST OS** evaluates the customer intent and ShopBot response against 12 organization rules.

Every interaction receives a `PASS`, `WARNING` or `FAIL` verdict and is stored as audit evidence.

## Main Views

- **Live Monitor** runs preloaded scenarios or custom customer queries.
- **Review Queue** records human decisions for every WARNING and FAIL interaction.
- **Activity Log** stores the query, response, verdict, risk, explanation and action.
- **Audit Report** shows compliance metrics, rule violations, human decisions, print/PDF output and CSV export.
- **Organization Rules** documents the registered ShopBot profile, action boundaries, active controls and official ShopEase data.
- **System & Risk** discloses the AI role, architecture, scale path, cost drivers, test evidence and remaining risks.
- **Tester Feedback** stores a 1-5 usefulness rating and comments for customer-validation evidence.

## Verdict Model

| Verdict | Risk | Meaning | Action |
| --- | --- | --- | --- |
| PASS | Low | Routine request answered with confirmed information | Logged only |
| WARNING | Medium | Competitor, discount negotiation or delivery-guarantee intent | Safe response allowed and alert sent |
| FAIL | High | Privacy, security, internal-data, financial-action or manipulation attempt | Requested action blocked and escalated |

The deterministic rules are the source of truth so the classroom demonstration remains consistent. Gemini generates the management analysis, risk reasoning and recommended follow-up, but it cannot change the verdict, risk, ShopBot response, rules or action. Every result identifies whether the analysis came from Gemini or the local fallback.

## Validated Scenarios

The test suite contains 25 classroom scenarios:

- 10 PASS
- 5 WARNING
- 10 FAIL

Run the tests with:

```bash
npm test
```

The automated suite also validates human review, feedback persistence and all CSV exports.

## Local Setup

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000`.

The application works without an AI API key. To enable optional Gemini explanations, configure:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.5-flash
AI_EXPLANATIONS=true
```

When Gemini is unavailable, Agent Trust OS automatically uses a local analysis and completes the compliance record. Set `AI_EXPLANATIONS=false` only when a fully offline demonstration is required.

## VPS Deployment

The app runs behind PM2 on port `3001` when another project already uses port `3000`.

```bash
cd ~/AgentTrust-Os
git pull origin main
npm install
pm2 restart agenttrust-os --update-env
pm2 save
pm2 status
```

Confirm `.env` contains:

```env
PORT=3001
GEMINI_MODEL=gemini-3.5-flash
AI_EXPLANATIONS=true
```

Nginx should proxy the Agent Trust OS domain or subdomain to:

```nginx
proxy_pass http://127.0.0.1:3001;
```

After changing Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## API

- `GET /api/health`
- `GET /api/bootstrap`
- `GET /api/interactions`
- `POST /api/interactions`
- `PATCH /api/interactions/:id/review`
- `DELETE /api/interactions`
- `GET /api/feedback`
- `POST /api/feedback`
- `GET /api/audit.csv`
- `GET /api/feedback.csv`
- `GET /api/prompts.csv`

## Project Structure

```text
data/shopease.json        Official ShopEase grounding data and rules
data/interactions.json    Persistent audit evidence
lib/governance.js         ShopBot response and TRUST OS verdict engine
public/                   Dashboard interface
test/governance.test.js   Validated scenario suite
server.js                 Express API and persistence
```

## Responsible Use

This is an educational MVP, not a production compliance or security product. Do not enter real customer credentials, payment details or confidential company information. Production use would require authentication, authorization, encryption, database controls, retention policies, monitoring and qualified legal/security review.
