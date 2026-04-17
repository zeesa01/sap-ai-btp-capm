# HR App on SAP BTP CAP — Complete Learning Guide

## Project Structure Explained

```
mybtpcapmaiproject/
│
├── db/                         ← DATABASE LAYER
│   ├── schema.cds              ← Entity definitions (= database tables)
│   └── data/                   ← CSV seed data (auto-loaded on startup)
│       ├── hr-Employees.csv
│       ├── hr-Departments.csv
│       └── hr-LeaveTypes.csv
│
├── srv/                        ← SERVICE LAYER (your API)
│   ├── hr-service.cds          ← OData API definition (what you expose)
│   ├── hr-service.js           ← Business logic (event handlers)
│   └── ai-service.js           ← AI integration (Claude/Anthropic)
│
├── app/
│   └── index.html              ← Simple test UI
│
├── .env                        ← Local secrets (API keys, NOT committed to git)
├── .cdsrc.json                 ← CAP config per environment (dev/prod)
├── mta.yaml                    ← BTP deployment descriptor
├── xs-security.json            ← Role definitions for BTP auth
└── package.json                ← Node dependencies + CDS config
```

---

## How to Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Add your API key to .env
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" >> .env

# 3. Start the app (watches for file changes)
npm run dev
# OR
cds watch

# 4. Open http://localhost:4004
```

CAP will:
- Auto-create an SQLite database (`hr-app.db`) with your schema
- Load seed data from `db/data/*.csv`
- Start OData server at `http://localhost:4004/hr`
- Show all available endpoints at `http://localhost:4004`

---

## Switching Databases: SQLite → SAP HANA

### Why Two Databases?
| | SQLite | SAP HANA Cloud |
|---|---|---|
| **Use for** | Local development | Production on BTP |
| **Setup** | Zero — built in | Requires BTP subscription |
| **Speed** | Fast (file-based) | Fast (in-memory columnar) |
| **Features** | Basic SQL | HANA-specific (spatial, text, etc.) |
| **Cost** | Free | Paid BTP service |

### Step 1: Install HANA adapter
```bash
npm install @cap-js/hana
```

### Step 2: Get HANA credentials
In BTP Cockpit:
1. Go to your subaccount → Services → Service Marketplace
2. Search "SAP HANA Cloud" → Create instance
3. Or use an existing instance → Create Service Key
4. Download the service key JSON (contains `host`, `port`, `user`, `password`, `database`)

### Step 3: Configure for local HANA testing
In `.cdsrc.json`, update the `[development]` section:
```json
{
  "[development]": {
    "requires": {
      "db": {
        "kind": "hana",
        "credentials": {
          "host": "your-hana-host.hanacloud.ondemand.com",
          "port": 443,
          "user": "DBADMIN",
          "password": "your-password",
          "database": "HDB",
          "encrypt": true,
          "sslValidateCertificate": false
        }
      }
    }
  }
}
```

### Step 4: Deploy schema to HANA
```bash
# Build generates .hdbtable files from your .cds entities
cds build --production

# Deploy schema to HANA HDI container
cds deploy --to hana
```

### What Changes Between SQLite and HANA?
**NOTHING in your application code.** CAP abstracts the database completely.
The same `SELECT.from(Employees).where(...)` works on both.
CAP generates different SQL dialects under the hood.

---

## BTP Destinations — Connecting to External Systems

### What is a Destination?
A "Destination" in BTP is a named connection configuration stored in BTP Cockpit.
It holds: URL, authentication type, headers, certificates.
Your app never hardcodes URLs or credentials — it just says "give me destination X".

### Types of Destinations

#### 1. Internet Destination (e.g., Anthropic AI API)
```
BTP App → Destination Service → Internet → api.anthropic.com
```

**Setup in BTP Cockpit → Connectivity → Destinations:**
```
Name:           ANTHROPIC_AI
Type:           HTTP
URL:            https://api.anthropic.com
Authentication: NoAuthentication
Additional Properties:
  URL.headers.x-api-key        = sk-ant-your-key
  URL.headers.anthropic-version = 2023-06-01
  URL.headers.content-type     = application/json
```

#### 2. SAP API Business Hub (Sandbox)
```
BTP App → Destination Service → Internet → sandbox.api.sap.com
```

**Setup:**
```
Name:           S4HANA_SANDBOX
Type:           HTTP
URL:            https://sandbox.api.sap.com/s4hanacloud
Authentication: NoAuthentication
Additional Properties:
  URL.headers.APIKey = your-sandbox-api-key-from-api.sap.com
```
Get your sandbox API key at: https://api.sap.com → Log in → Your Name → Show API Key

#### 3. On-Premise SAP System (via Cloud Connector)
```
BTP App → Connectivity Service → Cloud Connector → On-Premise SAP ERP
```

**Setup:**
First install Cloud Connector on a machine in your on-premise network.
Connect it to your BTP subaccount (Administration → Connectivity → Cloud Connectors).
Add a System Mapping in Cloud Connector:
```
Back-end Type:    SAP System
Protocol:         HTTPS
Internal Host:    sap-erp.company.local
Internal Port:    443
Virtual Host:     sap-erp-virtual   ← this is what BTP sees
Virtual Port:     443
```

Then create a Destination in BTP Cockpit:
```
Name:           ON_PREMISE_ERP
Type:           HTTP
URL:            https://sap-erp-virtual:443
ProxyType:      OnPremise           ← KEY: this tells BTP to route via Cloud Connector
Authentication: BasicAuthentication
User/Password:  your-SAP-credentials
```

### Using Destinations in Your Code

```bash
npm install @sap-cloud-sdk/http-client
```

```javascript
const { getDestination, executeHttpRequest } = require('@sap-cloud-sdk/http-client');

// Call Anthropic via BTP Destination
async function callAI(body) {
    const destination = await getDestination({ destinationName: 'ANTHROPIC_AI' });
    const response = await executeHttpRequest(destination, {
        method: 'POST',
        url: '/v1/messages',
        data: body
    });
    return response.data;
}

// Call On-Premise SAP via Destination + Cloud Connector
async function getSAPEmployee(employeeId) {
    const destination = await getDestination({ destinationName: 'ON_PREMISE_ERP' });
    const response = await executeHttpRequest(destination, {
        method: 'GET',
        url: `/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner('${employeeId}')`
    });
    return response.data;
}
```

---

## OData V4 — Free Query Power

CAP gives you OData V4 for free. Every entity you expose supports:

| Query Option | Example | What it does |
|---|---|---|
| `$filter` | `?$filter=status eq 'Active'` | WHERE clause |
| `$expand` | `?$expand=department` | JOIN related entity |
| `$select` | `?$select=firstName,email` | SELECT specific columns |
| `$orderby` | `?$orderby=startDate desc` | ORDER BY |
| `$top` | `?$top=10` | LIMIT |
| `$skip` | `?$skip=20` | OFFSET (pagination) |
| `$count` | `?$count=true` | Include total count |

**Combined example:**
```
GET /hr/Employees
  ?$filter=department/name eq 'Engineering' and status eq 'Active'
  &$expand=department,manager
  &$select=firstName,lastName,email,jobTitle
  &$orderby=lastName
  &$top=5
  &$count=true
```

---

## BTP Deployment Steps (Summary)

```bash
# Prerequisites
npm install -g mbt          # MTA Build Tool
cf install-plugin multiapps # CF MTA plugin
cf login -a https://api.cf.your-region.hana.ondemand.com

# Build the MTA archive
mbt build

# Deploy to BTP Cloud Foundry
cf deploy mta_archives/mybtpcapmaiproject_1.0.0.mtar

# View logs
cf logs mybtpcapmaiproject-srv --recent

# Set environment variables (if not using MTA parameter references)
cf set-env mybtpcapmaiproject-srv ANTHROPIC_API_KEY sk-ant-your-key
cf restage mybtpcapmaiproject-srv
```

---

## AI Features Summary

| Feature | Endpoint | What it does |
|---|---|---|
| Job Description | `POST /hr/generateJobDescription` | AI writes a professional job posting |
| Resume Screening | `POST /hr/screenApplication` | AI scores candidate vs job requirements |
| Performance Analysis | `POST /hr/analyzePerformanceReview` | AI generates insights from review data |
| HR Chatbot | `POST /hr/chat` | Conversational AI for HR questions |
| Payroll Anomalies | `POST /hr/detectPayrollAnomalies` | AI flags unusual payroll entries |
| Employee Summary | `POST /hr/generateEmployeeSummary` | AI writes employee profile blurb |
