# HR Management Portal — SAP BTP CAP + AI + Fiori

## Table of Contents
1. [What is This App?](#1-what-is-this-app)
2. [How to Run It](#2-how-to-run-it)
3. [Project Structure](#3-project-structure)
4. [Layer 1 — Database (`db/`)](#4-layer-1--database-db)
5. [Layer 2 — Service (`srv/`)](#5-layer-2--service-srv)
6. [Layer 3 — UI (`app/`)](#6-layer-3--ui-app)
7. [Key CDS Concepts Explained](#7-key-cds-concepts-explained)
8. [Actions vs Functions — Full Explanation](#8-actions-vs-functions--full-explanation)
9. [Database Switching: SQLite → SAP HANA](#9-database-switching-sqlite--sap-hana)
10. [BTP Destinations — Connecting to External Systems](#10-btp-destinations--connecting-to-external-systems)
11. [On-Premise Connectivity via Cloud Connector](#11-on-premise-connectivity-via-cloud-connector)
12. [OData V4 — Query Power for Free](#12-odata-v4--query-power-for-free)
13. [AI Features Explained](#13-ai-features-explained)
14. [BTP Deployment](#14-btp-deployment)
15. [Every File Explained](#15-every-file-explained)

---

## 1. What is This App?

A full-stack HR Management application built on:

| Layer | Technology | Purpose |
|---|---|---|
| **Database** | SQLite (dev) / SAP HANA (prod) | Store all HR data |
| **Backend API** | SAP CAP (Node.js) | OData V4 REST API + business logic |
| **AI Service** | AI via REST API | Job descriptions, resume screening, chatbot, anomaly detection |
| **Frontend** | SAP UI5 / Fiori | Enterprise-grade web UI |
| **Platform** | SAP Business Technology Platform (BTP) | Cloud deployment, auth, connectivity |

### Features
- Employee management (CRUD)
- Leave request workflow (submit → approve/reject)
- Performance reviews with AI analysis
- Job postings and candidate screening with AI
- Payroll records with AI anomaly detection
- AI HR Chatbot (branded as "Smart HR Assistant")
- Dashboard with live KPIs

---

## 2. How to Run It

```bash
# Step 1: Install dependencies
npm install

# Step 2: Set your AI API key in .env file
# (edit .env and replace the placeholder with your real key)

# Step 3: Run the development server
npm run dev
# OR
node node_modules/@sap/cds/bin/serve.js --project .

# Step 4: Open the app
# http://localhost:4004/webapp/index.html   ← Fiori UI
# http://localhost:4004/hr                  ← OData API browser
# http://localhost:4004/hr/$metadata        ← OData schema
```

---

## 3. Project Structure

```
mybtpcapmaiproject/
│
├── db/                          ← DATABASE LAYER (what data exists)
│   ├── schema.cds               ← Entity definitions = database tables
│   └── data/                    ← CSV seed data (auto-loaded on startup)
│       ├── hr-Employees.csv
│       ├── hr-Departments.csv
│       └── hr-LeaveTypes.csv
│
├── srv/                         ← SERVICE LAYER (what the API exposes)
│   ├── hr-service.cds           ← OData API definition
│   ├── hr-service.js            ← Business logic handlers
│   └── ai-service.js            ← AI integration
│
├── app/                         ← UI LAYER (what the user sees)
│   ├── index.html               ← Redirect to webapp
│   └── webapp/                  ← SAP UI5 / Fiori application
│       ├── index.html           ← UI5 bootstrap entry point
│       ├── manifest.json        ← App config, routing, models
│       ├── Component.js         ← App root component
│       ├── i18n/
│       │   └── i18n.properties  ← All UI text (translatable)
│       ├── view/                ← XML views (what you see)
│       │   ├── App.view.xml     ← Shell: header + side nav + content area
│       │   ├── Home.view.xml    ← Dashboard with KPI tiles
│       │   ├── Employees.view.xml
│       │   ├── EmployeeDetail.view.xml
│       │   ├── LeaveRequests.view.xml
│       │   ├── Performance.view.xml
│       │   ├── Recruitment.view.xml
│       │   ├── Payroll.view.xml
│       │   └── AIAssistant.view.xml
│       └── controller/          ← JS controllers (what happens)
│           ├── BaseController.js     ← Shared helper methods
│           ├── App.controller.js
│           ├── Home.controller.js
│           ├── Employees.controller.js
│           ├── EmployeeDetail.controller.js
│           ├── LeaveRequests.controller.js
│           ├── Performance.controller.js
│           ├── Recruitment.controller.js
│           ├── Payroll.controller.js
│           └── AIAssistant.controller.js
│
├── .env                         ← Local secrets (API keys) — NOT committed
├── .cdsrc.json                  ← CAP environment config (dev vs prod)
├── .gitignore
├── mta.yaml                     ← BTP deployment descriptor
├── xs-security.json             ← Role definitions (HRAdmin/Manager/Employee)
└── package.json                 ← Dependencies + CDS config
```

---

## 4. Layer 1 — Database (`db/`)

### What is a `.cds` file?

CDS stands for **Core Data Services**. It is SAP's domain-specific language (DSL) for defining:
- Data models (like SQL CREATE TABLE, but more powerful)
- Services (like API definitions)
- Annotations (metadata, UI hints, security)

CDS is **database-agnostic** — the same `.cds` definition generates SQL for SQLite AND HANA without any code changes.

### `db/schema.cds` — The Data Model

This file defines all your **entities** (= database tables).

```cds
namespace hr;

entity Employees : cuid, managed {
    firstName  : String(50)  not null;
    email      : String(100) not null;
    department : Association to Departments;  // foreign key
}
```

**Breaking this down:**

| Syntax | Meaning |
|---|---|
| `namespace hr` | All entities are prefixed `hr.` → table name becomes `hr_Employees` |
| `entity Employees` | Defines a database table called Employees |
| `: cuid` | Aspect (mixin) — adds auto-generated UUID `ID` column |
| `: managed` | Aspect — adds `createdAt`, `createdBy`, `modifiedAt`, `modifiedBy` columns |
| `String(50)` | VARCHAR(50) column |
| `not null` | Database NOT NULL constraint |
| `Association to X` | Foreign key relationship — CDS handles the join automatically |

### Aspects — Reusable Column Groups

Instead of repeating common columns in every entity, CDS has **aspects** (mixins):

```cds
using { managed, cuid } from '@sap/cds/common';
```

- **`cuid`** — Adds: `ID : UUID` (auto-generated, primary key)
- **`managed`** — Adds: `createdAt`, `createdBy`, `modifiedAt`, `modifiedBy` (filled automatically)

You never write these fields in your entities — CAP fills them for you on every insert/update.

### Associations vs Compositions

| Type | Meaning | Example |
|---|---|---|
| `Association to X` | Simple foreign key reference | Employee → Department |
| `Composition of many X` | Parent-child ownership (cascade delete) | Department → Employees |

**Association** = "refers to" (like a pointer)
**Composition** = "owns" (like a nested object; deleting parent deletes children)

### `db/data/` — Seed Data

CSV files named `namespace-EntityName.csv` are **automatically loaded** into the database when you run `cds watch`.

Format: first row = field names, subsequent rows = data.

```csv
ID,firstName,lastName,email
emp-1,Sarah,Johnson,sarah.johnson@company.com
```

The `ID` values here are fixed strings (not UUIDs) so we can reference them in other CSV files (e.g., `department_ID` in Employees CSV).

---

## 5. Layer 2 — Service (`srv/`)

### `srv/hr-service.cds` — API Definition

This file defines your **OData service** — the API that clients (UI, other apps) can call.

```cds
service HRService @(path: '/hr') {

    // Expose the DB entity as an API endpoint
    entity Employees as projection on hr.Employees;

    // Define a custom action
    action approveLeave(leaveRequestId: UUID) returns String;

    // Define a custom function
    function getLeaveBalance(employeeId: UUID) returns Integer;
}
```

**`projection on hr.Employees`** means:
- Expose the `hr.Employees` table through this service
- CAP generates: `GET /hr/Employees`, `POST /hr/Employees`, `PATCH /hr/Employees(id)`, `DELETE /hr/Employees(id)`
- You get filtering, pagination, sorting, expand for FREE — no code needed

**`@(path: '/hr')`** sets the service URL to `/hr`.

### `srv/hr-service.js` — Business Logic

This is a Node.js class that handles events. CAP uses an event-driven model:

```
OData Request
     ↓
CAP Router
     ↓
Event: "before CREATE Employees"  → your validation handler runs
     ↓
Event: "on CREATE Employees"      → your custom handler (or CAP's default INSERT)
     ↓
Event: "after CREATE Employees"   → your post-processing handler
     ↓
OData Response
```

**Key methods:**

```javascript
// Run BEFORE the database operation (for validation)
this.before('CREATE', 'Employees', (req) => {
    if (!req.data.email) return req.reject(400, 'Email required');
});

// Run INSTEAD of the default operation (override)
this.on('CREATE', 'Employees', async (req) => {
    // custom logic
    return await INSERT.into(Employees).entries(req.data);
});

// Run AFTER the database operation (for enrichment)
this.after('READ', 'Employees', (results) => {
    results.forEach(e => e.fullName = e.firstName + ' ' + e.lastName);
});
```

**The `req` object** (request):
| Property | What it contains |
|---|---|
| `req.data` | Request body (for CREATE/UPDATE) |
| `req.params` | URL key values (e.g. entity ID) |
| `req.query` | The CQL query being run |
| `req.user` | Logged-in user (from XSUAA token) |
| `req.reject(status, msg)` | Return HTTP error to client |

**CAP Query Language (CQL):**

CAP has a JavaScript-native query API:

```javascript
// SELECT
const emp = await SELECT.one.from(Employees).where({ ID: 'emp-1' });
const emps = await SELECT.from(Employees).where`status = 'Active'`;

// INSERT
await INSERT.into(Employees).entries({ firstName: 'John', ... });

// UPDATE
await UPDATE(Employees).set({ status: 'Inactive' }).where({ ID: 'emp-1' });

// DELETE
await DELETE.from(Employees).where({ ID: 'emp-1' });
```

### `srv/ai-service.js` — AI Integration

Wraps the AI REST API and exposes clean functions:

```javascript
generateJobDescription(title, dept, requirements, salary) → String
screenApplication(jobTitle, description, requirements, resumeText) → Object
analyzePerformanceReview(reviewData) → Object
hrChatbot(conversationHistory, employeeInfo) → String
detectPayrollAnomalies(payrollData) → Object
generateEmployeeSummary(employeeData) → String
```

The AI is called with a **system prompt** (gives the AI its persona) and a **user message** (the actual request). The AI responds with structured JSON or plain text depending on the function.

---

## 6. Layer 3 — UI (`app/`)

### How SAP UI5 / Fiori Works

SAP UI5 is a JavaScript framework (like React/Angular, but from SAP) for building enterprise web applications.

**Fiori** is SAP's design system — a set of UI patterns and guidelines. UI5 implements these patterns.

### Model-View-Controller (MVC) Pattern

UI5 uses strict MVC:

```
Model (data)      ←→     View (XML)     ←→    Controller (JS)
  OData model             layout/UI            event handlers
  JSON model              controls             API calls
  i18n model              bindings             navigation
```

- **Model** = where data lives (OData model talks to CAP; JSON model for local state)
- **View** = XML file that describes what the UI looks like
- **Controller** = JS file that handles user interactions

### `app/webapp/index.html` — The Entry Point

Loads the UI5 framework from SAP's CDN and mounts the `Component.js`.

```html
<script src="https://ui5.sap.com/resources/sap-ui-core.js"
    data-sap-ui-theme="sap_horizon"
    data-sap-ui-resourceroots='{"hr.fiori": "./"}'>
</script>
```

- **`data-sap-ui-theme`**: The visual theme (`sap_horizon` = latest Fiori Next)
- **`data-sap-ui-resourceroots`**: Maps `"hr.fiori"` to `"./"` — so `hr.fiori.view.Home` resolves to `./view/Home.view.xml`

### `app/webapp/manifest.json` — App Configuration

The manifest is the **brain of the UI5 app**. It configures:

```json
{
  "sap.app": {
    "dataSources": {
      "HRService": { "uri": "/hr/", "type": "OData", "settings": { "odataVersion": "4.0" } }
    }
  },
  "sap.ui5": {
    "rootView": { "viewName": "hr.fiori.view.App" },
    "models": {
      "": { "dataSource": "HRService" },
      "i18n": { "type": "sap.ui.model.resource.ResourceModel" }
    },
    "routing": {
      "routes": [
        { "name": "home", "pattern": "", "target": "home" },
        { "name": "employees", "pattern": "employees", "target": "employees" }
      ]
    }
  }
}
```

- **`dataSources`**: Declares the OData backend URL — everything routes through `/hr/`
- **`models[""]`**: The **default model** is the OData V4 model pointing to HRService
- **`routing`**: Maps URL hash patterns to view targets

### `app/webapp/Component.js` — The App Root

Every UI5 app has one `Component.js`. It:
1. Reads `manifest.json` and creates all models
2. Creates the root view (`App.view.xml`)
3. Initializes the router for URL-based navigation

### `app/webapp/view/App.view.xml` — The Shell

This is the persistent outer frame. It uses `sap.tnt.ToolPage`:

```
sap.tnt.ToolPage
├── header → sap.tnt.ToolHeader (the blue top bar)
├── sideContent → sap.tnt.SideNavigation (left nav menu)
└── mainContents → sap.m.NavContainer (pages swap in here)
```

The `NavContainer` is the placeholder where the router loads pages.

### XML Views — How Bindings Work

In XML views, `{...}` is a binding expression:

```xml
<!-- Binds text to the "firstName" property from the default OData model -->
<Text text="{firstName}"/>

<!-- Binds to a named model "empDetail" -->
<Text text="{empDetail>/firstName}"/>

<!-- Binds a list to the /Employees entity set -->
<Table items="{/Employees}">

<!-- Expression binding — JavaScript-like expression -->
<ObjectStatus state="{= ${status} === 'Active' ? 'Success' : 'Error'}"/>

<!-- i18n binding — reads from i18n.properties -->
<Title text="{i18n>appTitle}"/>
```

### `app/webapp/controller/BaseController.js` — Shared Helpers

All controllers extend `BaseController`. It provides:

| Method | What it does |
|---|---|
| `navTo(route, params)` | Navigate to a route |
| `navBack()` | Go back in history |
| `getModel(name)` | Get named model |
| `getText(key)` | Read i18n text |
| `showSuccess(msg)` | Toast notification |
| `showError(msg)` | Error dialog |
| `showConfirm(msg, fn)` | Confirmation dialog |
| `callAction(path, body)` | POST to a CAP action |
| `callFunction(path)` | GET a CAP function |
| `loadData(path)` | GET entity data |

### `app/webapp/i18n/i18n.properties` — UI Text

All text labels are stored here as `key=value`:
```
appTitle=HR Management Portal
employeeCreated=Employee created successfully
```

In views: `text="{i18n>appTitle}"`
In controllers: `this.getText("appTitle")`

To translate to German: create `i18n_de.properties` with the same keys but German values. UI5 picks the right file automatically based on browser language.

---

## 7. Key CDS Concepts Explained

### Namespace

```cds
namespace hr;
```

All entity names are prefixed. `entity Employees` → full name is `hr.Employees` → database table `hr_Employees`.

### Elements (Columns)

```cds
entity Employees {
    ID        : UUID;          // UUID type — for primary keys
    name      : String(100);   // VARCHAR(100)
    salary    : Decimal(15,2); // DECIMAL with 15 digits, 2 decimal places
    isActive  : Boolean;       // BOOLEAN
    hireDate  : Date;          // DATE (no time component)
    lastLogin : DateTime;      // DATETIME (with time)
    notes     : LargeString;   // CLOB / TEXT (unlimited length)
}
```

### Associations — Relationships Between Entities

```cds
entity Employees {
    // Many-to-one: each employee has one department
    department : Association to Departments;
    // This adds a "department_ID" column in the DB

    // Self-referencing: manager is also an Employee
    manager : Association to Employees;
    // This adds a "manager_ID" column in the DB
}

entity Departments {
    // One-to-many: a department has many employees
    // "on employees.department = $self" means:
    // "employees where their department points back to me"
    employees : Composition of many Employees on employees.department = $self;
}
```

When you `$expand` an association in OData: `GET /hr/Employees?$expand=department`
CAP generates a JOIN query: `SELECT e.*, d.* FROM hr_Employees e LEFT JOIN hr_Departments d ON e.department_ID = d.ID`

### Projections — Customizing What's Exposed

```cds
// Full exposure — same as the DB entity
entity Employees as projection on hr.Employees;

// Partial — only expose certain fields
entity EmployeeBasic as projection on hr.Employees {
    ID, firstName, lastName, email
    // salary is NOT included — callers can't see it
};

// With a virtual calculated field
entity EmployeeWithFullName as projection on hr.Employees {
    *,  // include all fields
    firstName || ' ' || lastName as fullName : String  // computed
};
```

---

## 8. Actions vs Functions — Full Explanation

This is one of the most important concepts in OData and CAP.

### The Rule
| | Action | Function |
|---|---|---|
| **HTTP Method** | POST | GET |
| **Modifies data?** | Yes | No |
| **Can have side effects?** | Yes | No |
| **Use when** | Writing, processing, triggering workflows | Reading, calculating, querying |

### Unbound vs Bound

**Unbound** = operates on the service, not a specific record

```cds
// Unbound action — no "for" clause
action generateJobDescription(jobTitle: String) returns String;
// Called as: POST /hr/generateJobDescription
```

**Bound** = operates on a specific entity instance

```cds
// Bound action — attached to LeaveRequests entity
action approveLeave(leaveRequestId: UUID) returns String;
// Called as: POST /hr/approveLeave (with ID in body)
// In OData bound form: POST /hr/LeaveRequests('id')/HRService.approveLeave
```

### Our Actions (in `hr-service.cds`)

| Action/Function | Type | What it does |
|---|---|---|
| `approveLeave` | Action | Updates status to 'Approved', triggers notification |
| `rejectLeave` | Action | Updates status to 'Rejected', requires comments |
| `calculatePayroll` | Action | Calculates tax + net pay, updates record |
| `generateJobDescription` | Action | Calls AI, returns text (no DB write) |
| `screenApplication` | Action | Calls AI, writes score + recommendation back to DB |
| `analyzePerformanceReview` | Action | Calls AI, writes insights back to DB |
| `chat` | Action | Calls AI, saves conversation to DB |
| `detectPayrollAnomalies` | Action | Calls AI, flags anomalous records in DB |
| `generateEmployeeSummary` | Action | Calls AI, writes summary back to Employee |
| `getLeaveBalance` | Function | Calculates remaining leave days (read-only) |
| `getDepartmentStats` | Function | Aggregates headcount + salary data (read-only) |
| `getUpcomingLeaves` | Function | Queries approved leaves in next N days (read-only) |

### How to Call Them

**From the UI (JavaScript):**
```javascript
// Action (POST)
fetch('/hr/generateJobDescription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobTitle: 'Engineer', department: 'Tech', ... })
});

// Function (GET) — parameters go in the URL
fetch('/hr/getLeaveBalance(employeeId=\'emp-1\',year=2025)');
```

**From Postman or curl:**
```bash
# Action
curl -X POST http://localhost:4004/hr/approveLeave \
  -H "Content-Type: application/json" \
  -d '{"leaveRequestId": "leave-uuid-here", "comments": "Approved"}'

# Function
curl http://localhost:4004/hr/getDepartmentStats()
```

### Handler Registration in `hr-service.js`

```javascript
// Register handler for the action
this.on('approveLeave', async (req) => {
    const { leaveRequestId, comments } = req.data;  // req.data = POST body
    await UPDATE(LeaveRequests).set({ status: 'Approved', comments })
        .where({ ID: leaveRequestId });
    return 'Approved successfully';  // returned as { value: 'Approved successfully' }
});

// Register handler for the function
this.on('getDepartmentStats', async () => {
    const departments = await SELECT.from(Departments);
    return departments.map(d => ({ name: d.name, headcount: 10 }));
    // returned as { value: [...] }
});
```

---

## 9. Database Switching: SQLite → SAP HANA

### Why Two Databases?

| | SQLite | SAP HANA Cloud |
|---|---|---|
| **Purpose** | Local development only | Production on BTP |
| **Setup** | Zero — auto-created | BTP subscription required |
| **File** | `hr-app.db` in project folder | Cloud database on BTP |
| **Code changes** | None | None |
| **Performance** | Fast for dev | High-performance columnar DB |

### The Magic: CAP Abstracts the Database

Your `hr-service.js` code uses CQL (CAP Query Language):
```javascript
const emps = await SELECT.from(Employees).where({ status: 'Active' });
```

CAP translates this to the right SQL dialect automatically:
- SQLite: `SELECT * FROM hr_Employees WHERE status = 'Active'`
- HANA: `SELECT * FROM "HR_EMPLOYEES" WHERE "STATUS" = 'Active'`

**Zero code changes needed when switching databases.**

### Step-by-Step: Switch to SAP HANA

**Step 1: Install the HANA adapter**
```bash
npm install @cap-js/hana
```

**Step 2: Get HANA credentials from BTP Cockpit**
1. BTP Cockpit → Your Subaccount → Services → Service Marketplace
2. Search "SAP HANA Cloud" → Create instance (or use existing)
3. Click the instance → Create Service Key → Download JSON

The JSON contains:
```json
{
  "host": "your-instance.hanacloud.ondemand.com",
  "port": 443,
  "user": "DBADMIN",
  "password": "your-password",
  "database": "HDB"
}
```

**Step 3: Configure `.cdsrc.json` for local HANA testing**
```json
{
  "[development]": {
    "requires": {
      "db": {
        "kind": "hana",
        "credentials": {
          "host": "your-instance.hanacloud.ondemand.com",
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

**Step 4: Deploy schema to HANA**
```bash
# Build generates .hdbtable files from your .cds entities
cds build --production

# Deploy schema to HANA HDI container
cds deploy --to hana
```

**What is an HDI Container?**

HDI = HANA Deployment Infrastructure. It's an isolated schema in HANA Cloud that belongs exclusively to your app. When you deploy, CAP sends your `.hdbtable` files to HDI, which creates/updates the actual tables. This ensures:
- Your app's tables are separate from other apps
- Schema changes are versioned and reversible
- No manual `ALTER TABLE` — HDI handles it

**Step 5: On BTP Cloud Foundry (automatic)**

When deployed to BTP, the HANA credentials come from the `VCAP_SERVICES` environment variable (injected by the platform). The `mta.yaml` binds the HANA service to your app, so credentials are injected automatically — no code changes.

---

## 10. BTP Destinations — Connecting to External Systems

### What is a Destination?

A "Destination" is a **named connection configuration** stored in the BTP Destination Service.

Instead of hardcoding in your code:
```javascript
// BAD — hardcoded URL and API key
const response = await fetch('https://api.external-service.com', {
    headers: { 'Authorization': 'Bearer sk-hardcoded-key' }
});
```

You create a Destination named `MY_SERVICE` in BTP Cockpit, and your code becomes:
```javascript
// GOOD — destination name only, key stored securely in BTP
const destination = await getDestination({ destinationName: 'MY_SERVICE' });
const response = await executeHttpRequest(destination, { method: 'GET', url: '/data' });
```

**Benefits:**
- API keys never in your code
- Change the key in BTP Cockpit without redeploying
- Audit logs for all calls
- Works with Cloud Connector for on-premise systems
- One destination can be reused by multiple apps

### How to Create a Destination in BTP Cockpit

1. Log into BTP Cockpit → Your Subaccount
2. Click "Connectivity" → "Destinations"
3. Click "New Destination"
4. Fill in the form

### Destination Types

#### Type 1: Internet HTTP Destination (e.g., AI Service API)

```
Name:           AI_SERVICE
Type:           HTTP
URL:            https://api.your-ai-provider.com
Authentication: NoAuthentication

Additional Properties:
  URL.headers.Authorization = Bearer sk-your-api-key-here
  URL.headers.Content-Type  = application/json
```

#### Type 2: SAP API Hub Sandbox

Get your API key from https://api.sap.com (free sandbox for testing SAP APIs):

```
Name:           S4HANA_SANDBOX
Type:           HTTP
URL:            https://sandbox.api.sap.com/s4hanacloud
Authentication: NoAuthentication

Additional Properties:
  URL.headers.APIKey = your-sandbox-api-key-from-api.sap.com
```

This lets you call S/4HANA APIs (employees, business partners, etc.) without a real S/4HANA system.

#### Type 3: On-Premise SAP (ProxyType: OnPremise)

```
Name:           ON_PREMISE_SAP
Type:           HTTP
URL:            http://your-virtual-host:port
ProxyType:      OnPremise           ← THIS IS THE KEY
Authentication: BasicAuthentication
User:           your-sap-user
Password:       your-sap-password
```

The `ProxyType: OnPremise` tells BTP to route through the Cloud Connector.

### Using Destinations in Code

```bash
npm install @sap-cloud-sdk/http-client @sap-cloud-sdk/connectivity
```

```javascript
const { getDestination, executeHttpRequest } = require('@sap-cloud-sdk/http-client');

// Call an internet API via BTP Destination
async function callAIService(payload) {
    const destination = await getDestination({ destinationName: 'AI_SERVICE' });
    const response = await executeHttpRequest(destination, {
        method: 'POST',
        url: '/v1/messages',
        data: payload
    });
    return response.data;
}

// Read SAP S/4HANA employee data via sandbox Destination
async function getS4Employee(employeeId) {
    const destination = await getDestination({ destinationName: 'S4HANA_SANDBOX' });
    const response = await executeHttpRequest(destination, {
        method: 'GET',
        url: `/sap/opu/odata/sap/API_EMPLOYEE_SRV/A_Employee('${employeeId}')`
    });
    return response.data;
}
```

---

## 11. On-Premise Connectivity via Cloud Connector

### Architecture

```
Your BTP App
    ↓ (HTTPS)
BTP Connectivity Service
    ↓ (encrypted tunnel)
SAP Cloud Connector (installed on-premise)
    ↓ (internal network HTTP/RFC)
On-Premise SAP ERP / SAP S/4HANA
```

The Cloud Connector creates a **secure tunnel** from your on-premise network to BTP. Your on-premise system never needs to open inbound ports — the Cloud Connector initiates the connection outward.

### Setup Steps

**Step 1: Install Cloud Connector**
Download from SAP: https://tools.hana.ondemand.com/#cloud
Install on a Windows/Linux machine in your on-premise network.

**Step 2: Connect to your BTP Subaccount**
1. Open Cloud Connector admin UI: `https://localhost:8443`
2. Log in (default: Administrator/Manager)
3. Add Subaccount: enter your BTP region + subaccount ID + your BTP login

**Step 3: Add a System Mapping (exposes your SAP system)**
In Cloud Connector → Cloud To On-Premise → Access Control:

```
Back-end Type:    SAP System
Protocol:         HTTPS
Internal Host:    sap-erp.company.local    ← your actual server hostname
Internal Port:    443
Virtual Host:     sap-erp-virtual          ← what BTP sees (can be different)
Virtual Port:     443
```

The virtual host/port is what appears in your BTP Destination.

**Step 4: Create Destination in BTP Cockpit**

```
Name:          ON_PREMISE_SAP
Type:          HTTP
URL:           https://sap-erp-virtual:443
ProxyType:     OnPremise
Authentication: BasicAuthentication
User/Password: SAP credentials
```

**Step 5: Bind services in `mta.yaml`**

The app needs both `connectivity` and `destination` services bound (see `mta.yaml`).

---

## 12. OData V4 — Query Power for Free

CAP generates a full OData V4 API from your `.cds` entities. Every entity you expose supports these query options automatically — no code needed.

### Query Options

| Option | HTTP Example | SQL Equivalent |
|---|---|---|
| `$filter` | `?$filter=status eq 'Active'` | `WHERE status = 'Active'` |
| `$expand` | `?$expand=department` | `LEFT JOIN Departments` |
| `$select` | `?$select=firstName,email` | `SELECT firstName, email` |
| `$orderby` | `?$orderby=lastName asc` | `ORDER BY lastName ASC` |
| `$top` | `?$top=10` | `LIMIT 10` |
| `$skip` | `?$skip=20` | `OFFSET 20` |
| `$count` | `?$count=true` | Returns total count in `@odata.count` |
| `$search` | `?$search=John` | Full-text search |

### OData Filter Operators

```
eq  = equals              status eq 'Active'
ne  = not equals          status ne 'Terminated'
lt  = less than           salary lt 100000
gt  = greater than        salary gt 50000
le  = less than or equal  startDate le 2024-01-01
ge  = greater than/equal  overallScore ge 4
and = both conditions     status eq 'Active' and department/name eq 'IT'
or  = either condition    status eq 'Active' or status eq 'On Leave'
not = negation            not (status eq 'Terminated')
```

### Complex Real Examples

```
# Get all active engineers in Engineering dept, sorted by salary desc
GET /hr/Employees
  ?$filter=status eq 'Active' and department/name eq 'Engineering'
  &$orderby=baseSalary desc
  &$expand=department
  &$select=firstName,lastName,jobTitle,baseSalary

# Get pending leave requests with employee and leave type details
GET /hr/LeaveRequests
  ?$filter=status eq 'Pending'
  &$expand=employee($select=firstName,lastName),leaveType($select=name)
  &$orderby=createdAt desc
  &$top=5

# Count how many employees per department
GET /hr/Employees?$apply=groupby((department/name),aggregate($count as count))
```

---

## 13. AI Features Explained

The AI features are in `srv/ai-service.js`. They work by:

1. **Constructing a prompt** with structured HR context
2. **Calling the AI API** (POST to the messages endpoint)
3. **Parsing the response** (JSON or plain text)
4. **Saving results** back to the database (for most features)

### AI Feature Map

| Feature | Input | Output | Saved to DB |
|---|---|---|---|
| Generate Job Description | Job title, dept, requirements | Professional job posting text | `JobPostings.description` |
| Screen Application | Resume text vs job requirements | Score 0-100 + analysis | `JobApplications.aiScore`, `aiRecommendation` |
| Analyze Performance Review | Scores + feedback text | Insights + suggested rating | `PerformanceReviews.aiInsights`, `aiRating` |
| HR Chatbot | User message + conversation history | AI response text | `AIConversations` table |
| Detect Payroll Anomalies | All payroll records for a month | List of flagged employees | `PayrollRecords.aiAnomalyFlag` |
| Generate Employee Summary | Employee details | 2-3 sentence profile | `Employees.aiSummary` |

### The Chat System (Conversation Memory)

The chatbot remembers conversation context by:

1. Each message is saved to `AIConversations` table with a `sessionId`
2. On each new message, we load the last 10 messages for that session
3. We send the entire history to the AI API
4. The AI uses all previous messages as context for the current reply

```javascript
// Load history
const history = await SELECT.from(AIConversations).where({ sessionId }).limit(10);

// Format for AI API
const conversationHistory = history.map(h => ({ role: h.role, content: h.message }));
conversationHistory.push({ role: 'user', content: newMessage });

// Send full history to AI
const response = await callAI(systemPrompt, conversationHistory);
```

---

## 14. BTP Deployment

### Prerequisites

```bash
npm install -g mbt                    # MTA Build Tool
cf install-plugin multiapps           # CF MultiApps plugin
cf login -a https://api.cf.your-region.hana.ondemand.com
```

### Build and Deploy

```bash
# 1. Build the project
cds build --production

# 2. Build the MTA archive (creates .mtar file)
mbt build

# 3. Deploy to BTP Cloud Foundry
cf deploy mta_archives/mybtpcapmaiproject_1.0.0.mtar

# 4. Check status
cf apps
cf logs mybtpcapmaiproject-srv --recent
```

### What Happens During Deployment

1. `mbt build` compiles `mta.yaml` → packages everything into a `.mtar` archive
2. `cf deploy` sends the `.mtar` to BTP
3. BTP creates:
   - HANA HDI container (deploys your schema)
   - XSUAA service instance (for authentication)
   - Destination service instance
   - Connectivity service instance
4. BTP deploys your Node.js app and binds all services
5. `VCAP_SERVICES` env var is injected with all service credentials
6. App starts — CAP reads `VCAP_SERVICES` and connects to HANA automatically

### Environment Variables

| Variable | Value | Purpose |
|---|---|---|
| `NODE_ENV` | `production` | Tells CAP to use HANA, XSUAA, etc. |
| `AI_API_KEY` | your-key | Set in BTP as env var or via Destination |
| `VCAP_SERVICES` | JSON (auto-injected) | All bound service credentials |

---

## 15. Every File Explained

| File | Purpose |
|---|---|
| `db/schema.cds` | Defines all 8 database tables (entities) as CDS |
| `db/data/hr-Employees.csv` | 5 sample employees seeded on startup |
| `db/data/hr-Departments.csv` | 5 departments seeded on startup |
| `db/data/hr-LeaveTypes.csv` | 6 leave types seeded on startup |
| `srv/hr-service.cds` | OData V4 API: exposes all entities + 9 actions + 3 functions |
| `srv/hr-service.js` | All business logic: validation, workflow, AI action handlers |
| `srv/ai-service.js` | AI API wrapper: 6 functions (generate, screen, analyze, chat, detect, summarize) |
| `app/index.html` | Redirect page → sends browser to `/webapp/index.html` |
| `app/webapp/index.html` | UI5 bootstrap: loads SAP UI5 framework, mounts the Component |
| `app/webapp/manifest.json` | App config: OData source, models, routing rules, dependencies |
| `app/webapp/Component.js` | App root: reads manifest, creates models, inits router |
| `app/webapp/i18n/i18n.properties` | All UI text labels (translatable) |
| `app/webapp/view/App.view.xml` | Shell: top header + side navigation + NavContainer |
| `app/webapp/view/Home.view.xml` | Dashboard: KPI tiles + quick actions + dept stats + upcoming leaves |
| `app/webapp/view/Employees.view.xml` | Employee list table with search, filter, avatar |
| `app/webapp/view/EmployeeDetail.view.xml` | Employee profile with tabbed sections (info, leave, performance, payroll) |
| `app/webapp/view/LeaveRequests.view.xml` | Leave list with tab filter + approve/reject buttons per row |
| `app/webapp/view/Performance.view.xml` | Performance review table with AI analysis button |
| `app/webapp/view/Recruitment.view.xml` | Job postings with AI description generator + applications viewer |
| `app/webapp/view/Payroll.view.xml` | Payroll records with calculate + AI anomaly detection |
| `app/webapp/view/AIAssistant.view.xml` | Chat UI branded as "Smart HR Assistant" |
| `app/webapp/controller/BaseController.js` | Base class: shared helpers (navigate, API calls, notifications) |
| `app/webapp/controller/App.controller.js` | Shell controller: side nav toggle + route highlight sync |
| `app/webapp/controller/Home.controller.js` | Dashboard: loads KPIs, dept stats, upcoming leaves in parallel |
| `app/webapp/controller/Employees.controller.js` | Employee CRUD, search/filter via OData $filter |
| `app/webapp/controller/EmployeeDetail.controller.js` | Load employee + sub-data (leave, perf, payroll), AI summary |
| `app/webapp/controller/LeaveRequests.controller.js` | Leave submit, approve/reject with comment dialog |
| `app/webapp/controller/Performance.controller.js` | Create review with StepInput scores, AI analysis dialog |
| `app/webapp/controller/Recruitment.controller.js` | Job posting creation, AI description, application management + AI screen |
| `app/webapp/controller/Payroll.controller.js` | Payroll record creation, calculate net pay, AI anomaly detection |
| `app/webapp/controller/AIAssistant.controller.js` | Chat session management, dynamic message bubble creation, scroll |
| `.env` | Local secrets: AI API key, NODE_ENV (never committed to git) |
| `.cdsrc.json` | CAP per-environment config: dev=SQLite, prod=HANA |
| `mta.yaml` | BTP deployment: modules (srv, db-deployer) + resources (HANA, XSUAA, Destination, Connectivity) |
| `xs-security.json` | XSUAA roles: HRAdmin (full), Manager (approve leave, view team), Employee (self-service) |
| `package.json` | Node.js dependencies + CDS default DB config |
| `.gitignore` | Excludes: node_modules, .env, gen/, *.sqlite, mta_archives/ |
