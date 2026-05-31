# AWS Cost Guardian

An agentic web application for discovering, monitoring, and managing AWS resources that generate costs. Combines a visual dashboard with a natural language interface powered by AI agents.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React SPA (TypeScript) — S3 + CloudFront                   │
│  Dashboard | Cost Charts | Chat Panel | Approval UI         │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST / WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│  API Gateway + Cognito Authorizer                           │
│  Lambda Functions (TypeScript, Node.js 20)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
│ Step Functions│  │ Strands Agent│  │ DynamoDB             │
│ Multi-Region │  │ (Python +    │  │ ScanResults          │
│ Scanner      │  │  Bedrock)    │  │ ActionHistory        │
└──────────────┘  └──────────────┘  │ ApprovalLog          │
                                    └──────────────────────┘
```

## Key Features

- **Multi-region resource scanning** — Discovers EC2, EBS, RDS, Lambda, S3, Load Balancers, NAT Gateways, Elastic IPs, ECS tasks, AMIs, and snapshots across all enabled regions
- **Cost attribution** — Retrieves cost data from AWS Cost Explorer, grouped by service, region, and resource
- **Natural language interface** — Chat with an AI agent (Strands SDK + Bedrock) to query resources and perform actions
- **Approval workflow** — All destructive operations require explicit user confirmation with a 5-minute timeout
- **cloud-ops-toolkit integration** — Leverages existing shell scripts for resource operations

## Project Structure

```
aws-cost-guardian/
├── infrastructure/          # CDK/SAM templates
├── src/
│   ├── lambdas/             # TypeScript Lambda functions
│   │   ├── shared/          # Auth, validation, types
│   │   ├── scanner/         # Scan-related Lambdas
│   │   ├── costs/           # Cost retrieval
│   │   ├── history/         # History retrieval
│   │   ├── agent/           # Agent invoker
│   │   └── websocket/       # WebSocket handlers
│   ├── agent/               # Python Strands SDK agent
│   │   ├── tools/           # Agent tools (toolkit wrappers)
│   │   ├── approval/        # Approval workflow
│   │   └── tests/           # Agent tests
│   └── frontend/            # React SPA
└── package.json             # Root workspace config
```

## Prerequisites

- Node.js >= 20.0.0
- Python >= 3.12
- AWS CLI v2 configured with appropriate profiles
- AWS CDK CLI (`npm install -g aws-cdk`)
- An AWS account with Cost Explorer enabled

## Getting Started

```bash
# Install dependencies
npm install

# Install Python agent dependencies
cd src/agent && pip install -r requirements.txt

# Deploy infrastructure
npm run deploy:infra

# Start frontend dev server
cd src/frontend && npm run dev
```

## Security

- All AWS access uses IAM roles — no hardcoded credentials
- JWT authentication via Amazon Cognito on every API request
- Input validation and sanitization on all endpoints
- Gitleaks pre-commit hook to prevent secret leakage
- Approval workflow gates all destructive operations

## License

MIT
