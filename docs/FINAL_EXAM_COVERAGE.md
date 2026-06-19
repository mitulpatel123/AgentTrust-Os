# COMP630 Final Exam Coverage

This document maps the Agent Trust OS MVP to `COMP630_2026_AI_Project_Guidelines.docx`. It is an evidence checklist, not a guarantee of a grade. The final report, pitch, customer evidence and financial assumptions must still meet the instructor's standards.

## MVP / POC Minimum Standard

| Requirement | Website Evidence | Status |
| --- | --- | --- |
| User enters or uploads something | Live Monitor accepts a preloaded or custom customer query and requester name. | Complete |
| System triggers an AI-enabled workflow | ShopBot creates a grounded response, TRUST OS applies controls, and Gemini produces management analysis when an enabled key is available. | Complete; replace the denied Gemini key |
| User receives useful output | Verdict, risk, response, explanation, AI analysis, rules, seven checks and action are displayed. | Complete |
| Output stored, displayed, exported or summarized | Interactions persist, dashboard metrics update, evidence appears in Activity/Audit, CSV export and print/PDF are available. | Complete |
| User provides feedback or rates usefulness | External Tester Feedback stores a 1-5 rating and comment and exports customer evidence to CSV. | Complete |
| Team explains scale, costs and remaining risks | System & Risk documents architecture, scale path, cost drivers, model limitations and remaining risks. | Complete |

## AgentTrust OS Concept Coverage

| Concept Requirement | Website Evidence |
| --- | --- |
| Register AI agents | Organization Rules displays the registered ShopBot profile, owner, department, purpose, tools and data access. |
| Define approved and prohibited actions | Approved, review-required and prohibited boundaries are displayed. |
| Require human approval for sensitive tasks | WARNING and FAIL records enter Review Queue; reviewer, decision, notes and timestamp are stored. |
| Log agent activity | Activity Log stores customer input, ShopBot output, verdict, risk, AI source, rules and action. |
| Generate audit-ready report | Audit Report supports metrics, rule analysis, human-review status, CSV export and print/PDF. |
| AI reviews actions and classifies risk | Deterministic controls make the final reliable classification; Gemini generates visible management reasoning. |
| Generate red-team test cases | The application includes 25 validated prompts and a prompt-library CSV export. |
| Recommend human-in-the-loop controls | Gemini/local analysis recommends follow-up, and Review Queue records the final human decision. |

## Responsible AI, IP and Data Evidence

- The result identifies Gemini or Local fallback as the analysis source.
- The model cannot override the deterministic verdict, risk, rules or action.
- WARNING and FAIL require human review.
- The UI and README state that real confidential or sensitive data must not be entered.
- System & Risk records hallucination, classification, prompt-injection, privacy, vendor and reviewer risks.
- Official ShopEase data grounds products, prices, offers, delivery and policies.
- Gemini model and configuration are documented in `.env.example` and `README.md`.

## Website Facts For Report And Pitch

- Product: Agent Trust OS
- Demonstration organization: ShopEase Retail Co.
- Worker agent: ShopBot
- Governance judge: TRUST OS
- AI provider role: Gemini management analysis and recommended follow-up
- Final classification: deterministic organization controls
- Verdicts: PASS / Low, WARNING / Medium, FAIL / High
- Test library: 10 PASS, 5 WARNING and 10 FAIL prompts
- Automated checks: 31
- Pricing hypothesis: $20 per month
- User: founder or operations manager
- Buyer: small-business owner
- Beachhead hypothesis: small U.S. e-commerce businesses with 2-10 employees using customer-service AI

## Separate Final-Package Work Still Required

The website cannot replace these required artifacts:

- 15-20 page APA 7 final report
- 12-15 slide investor pitch and clear funding ask
- 3-5 minute demo video and public MVP link
- At least five real customer interviews or survey responses
- Competitor matrix with cited current sources
- TAM, SAM and SOM assumptions with citations
- Lean Canvas or Business Model Canvas
- IP and risk memo
- Go-to-market one-pager
- 12-month roadmap
- Financial assumptions and use-of-funds table
- Prompt library appendix using the exported CSV
- Customer evidence appendix using the feedback CSV

Do not describe the 25 synthetic scenarios as customer validation. Use real interviews and external tester feedback as customer evidence, and label all pricing and market claims as hypotheses until validated.
