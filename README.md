# AgentTrust OS

AgentTrust OS: AI Agent Governance and Audit Workspace is a COMP630 Technology Entrepreneurship MVP for Group B. It demonstrates how an organization could register AI agents, define policy boundaries, review agent actions, classify risk, route human approvals, and generate audit-ready evidence.

## Problem Being Solved

Organizations are adopting AI agents that can perform multistep work across tools and data sources. Many teams cannot clearly prove what an agent did, what data it touched, whether policy was followed, whether human approval was required, or who approved or rejected the action. AgentTrust OS provides a lightweight governance layer for demo and proof-of-concept use.

## Core Features

- Agent registry with owner, department, purpose, tools, data access, and risk category
- Policy rule builder for approved, approval-required, and prohibited actions
- Agent action logging form
- Preliminary risk scoring from deterministic business rules
- OpenAI-assisted risk review when `OPENAI_API_KEY` is configured
- Fallback local review output when no API key is present
- Approval queue with approve, reject, and escalate decisions
- Audit report generation with copy, print, and download actions
- Report archive, dashboard metrics, recent activity, pricing, funding ask, and MVP feedback

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js with Express
- AI integration: Gemini API through `GEMINI_API_KEY`, with optional OpenAI fallback through `OPENAI_API_KEY`
- Storage: JSON files in `data/`
- No database, React, Next.js, TypeScript, Tailwind, or MongoDB

## MVP Workflow

1. Register an AI agent.
2. Define governance rules for the selected agent.
3. Submit an agent action for review.
4. Backend validates the request and calculates preliminary risk.
5. AI review is generated through OpenAI or local fallback logic.
6. The system determines policy status and whether approval is required.
7. A reviewer approves, rejects, or escalates.
8. The system generates an audit report.
9. The user can copy, print, or download the report.
10. The user submits usefulness feedback.

## Folder Structure

```text
agenttrust-os/
├── package.json
├── server.js
├── .env.example
├── README.md
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── data/
    ├── agents.json
    ├── policies.json
    ├── logs.json
    ├── reports.json
    └── feedback.json
```

## Local Installation

```bash
npm install
cp .env.example .env
```

Edit `.env` and add at least one AI provider key:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
```

Then run:

```bash
npm start
```

Open `http://localhost:3000`.

The server tries Gemini first when `GEMINI_API_KEY` is set, then OpenAI when `OPENAI_API_KEY` is set. The app still works without an API key by using a deterministic fallback review, which is useful for classroom demos.

## VPS/KVM Deployment

1. Provision an Ubuntu VPS or KVM server.
2. Install Node.js 20 or newer.
3. Copy the `agenttrust-os` folder to the server.
4. Run `npm install`.
5. Copy `.env.example` to `.env` and configure `OPENAI_API_KEY` and `PORT`.
6. Start with `npm start` for testing.
7. For persistent hosting, use PM2:

```bash
npm install -g pm2
pm2 start server.js --name agenttrust-os
pm2 save
pm2 startup
```

8. Put Nginx or Apache in front of the app if using a domain and HTTPS.

## API Endpoint Summary

- `GET /` serves the single-page app
- `GET /api/health` returns app health
- `GET /api/agents` lists agents
- `POST /api/agents` registers an agent
- `DELETE /api/agents/:id` deactivates an agent
- `GET /api/policies` lists policies
- `POST /api/policies` saves or updates a policy
- `POST /api/review-action` validates, scores, and reviews an action
- `POST /api/decision` records approve, reject, or escalate decisions
- `POST /api/generate-audit-report` creates a saved report
- `GET /api/reports` lists reports
- `POST /api/feedback` stores MVP usefulness feedback
- `GET /api/logs` lists reviewed activity for dashboard use

## Sample Demo Scenario

Use the `Try Sample Agent` button. It loads the Finance Report Agent scenario:

- Agent: Finance Report Agent
- Purpose: Summarizes monthly sales, expenses, and vendor information
- Tools: Finance System, Email, File Storage
- Data: Financial Records, Confidential Documents, Internal Business Data
- Action: External Monthly Financial Report
- Recipient: Consultant
- Human approval requested: No
- External action: Yes
- Business impact: High

Expected result: high or critical risk, approval required or prohibited policy status, human approval required, and a recommended decision to escalate or reject because sensitive financial data was prepared for external sharing without required approval.

## Risk Scoring Explanation

The preliminary score starts at 10 and is capped from 0 to 100.

- +20 financial data
- +25 employee or HR data
- +30 health data
- +25 credentials or secrets
- +15 confidential documents
- +20 external action
- +15 customer, vendor, consultant, or public recipient
- +20 approval missing when policy requires it
- +30 prohibited action match
- +20 approval-required action match
- +15 high business impact
- +30 critical business impact
- +10 missing or unclear policy
- -10 human approval requested

Risk levels:

- 0-24: Low
- 25-49: Medium
- 50-74: High
- 75-100: Critical

## Responsible AI and Disclaimer

AgentTrust OS is an educational MVP. It does not provide verified legal, regulatory, cybersecurity, financial, HR, healthcare, safety, or professional compliance advice. AI output is decision support only. Human review is required for high-impact decisions. Do not use real confidential or sensitive company data in the demo. Prompt limitations, hallucinations, model errors, and incomplete policy context remain risks.

## Scaling Plan

Future versions could add role-based access, SSO, API integrations, Slack or Teams approvals, automated agent log ingestion, enterprise GRC integrations, policy versioning, encrypted storage, multi-tenant accounts, consultant dashboards, advanced analytics, and industry-specific templates.

## Cost Drivers

Main cost drivers include AI API usage, hosting, storage, security controls, customer support, compliance review, sales and marketing, and integration development.

## Business Model

Revenue streams could include monthly SaaS subscriptions, paid pilot projects, consultant plans, advanced reporting, team seats, enterprise integrations, and governance templates.

## Investor Story

The MVP shows that AgentTrust OS can become a lightweight AI-agent governance layer for compliance-conscious SMBs, mid-market SaaS companies, and teams piloting AI agents. The classroom funding ask is $80,000 pre-seed investment to validate pilots, deepen integrations, and improve security controls.

## Final Exam Alignment

This MVP supports the COMP630 final project by allowing users to enter information, trigger an AI-enabled workflow, receive useful output, download evidence, submit feedback, explain cost drivers, explain scaling, document remaining risks, support the final report, support the investor pitch, support a demo video, and provide screenshots and artifacts.

## Team Roles

Paul:

- Team coordination
- Investor pitch
- Final integration
- Presentation flow

Minaxiben Nayak:

- Financial model
- Pricing strategy
- Investor return
- Funding ask and use of funds

Abdul Rahman:

- Technical architecture
- AI workflow
- Prompt testing
- MVP feasibility

Turat:

- Customer discovery
- Risk register
- Competitor analysis
- Supporting documentation
