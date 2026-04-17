// =============================================================================
// FILE: db/schema.cds
// PURPOSE: This is the DATA MODEL layer — it defines your database tables.
//
// HOW CAP WORKS (Mental Model):
//   db/schema.cds   → Database tables (entities = tables, elements = columns)
//   srv/*.cds       → OData/REST API (what you expose to the outside world)
//   srv/*.js        → Business logic (handlers that run on CRUD events)
//
// DATABASE SWITCHING:
//   - Development:  SQLite (file-based, zero config, auto-created)
//   - BTP/Prod:     SAP HANA Cloud (see package.json and README for how to switch)
//   CAP generates the exact same SQL DDL for both — you just change config.
// ============================================================================= 

namespace hr; // All entities live under the "hr" namespace → table names become hr_Employees, etc.

// -----------------------------------------------------------------------------
// ASPECT: managed
// CAP has built-in "aspects" (mixins) you can reuse across entities.
// "managed" automatically fills createdAt, createdBy, modifiedAt, modifiedBy.
// You never need to set these manually — CAP does it on insert/update. 
// -----------------------------------------------------------------------------
using { managed, cuid } from '@sap/cds/common';
// cuid = auto-generated UUID primary key (best practice for BTP apps)
// managed = audit fields (createdAt, createdBy, modifiedAt, modifiedBy)

// =============================================================================
// ENTITY: Departments
// A department belongs to the company. Employees are assigned to departments.
// =============================================================================
entity Departments : cuid, managed {
    name        : String(100) not null;       // e.g. "Human Resources"
    description : String(500);
    costCenter  : String(20);                 // SAP cost center code
    manager     : Association to Employees;   // Who manages this department (set after Employees defined)
    employees   : Composition of many Employees on employees.department = $self; // All employees in dept
}

// =============================================================================
// ENTITY: Employees
// Core entity — represents a person working at the company.
// =============================================================================
entity Employees : cuid, managed {
    // --- Personal Info ---
    firstName       : String(50)  not null;
    lastName        : String(50)  not null;
    email           : String(100) not null;   // Should be unique — enforced in service layer
    phone           : String(20);
    dateOfBirth     : Date;
    gender          : String(10);             // e.g. Male / Female / Other

    // --- Employment Info ---
    employeeId      : String(20);             // Company-assigned ID e.g. "EMP-0042"
    jobTitle        : String(100);
    employmentType  : String(20) default 'Full-Time'; // Full-Time, Part-Time, Contract
    startDate       : Date;
    endDate         : Date;                   // null = still active
    status          : String(20) default 'Active'; // Active, On Leave, Terminated

    // --- Relationships ---
    department      : Association to Departments; // Many employees → one department
    manager         : Association to Employees;   // Self-referencing: who is this person's boss?

    // --- Salary (basic, full payroll is in PayrollRecords) ---
    baseSalary      : Decimal(15,2);
    currency        : String(3) default 'USD';

    // --- AI-generated field ---
    aiSummary       : String(2000);           // AI-generated employee profile summary

    // --- Back-links (virtual, not stored in DB) ---
    leaveRequests   : Composition of many LeaveRequests on leaveRequests.employee = $self;
    reviews         : Composition of many PerformanceReviews on reviews.employee = $self;
}

// =============================================================================
// ENTITY: LeaveTypes
// Reference data — types of leave available (Annual, Sick, Maternity, etc.)
// =============================================================================
entity LeaveTypes : cuid {
    name            : String(50) not null;    // e.g. "Annual Leave"
    code            : String(10) not null;    // e.g. "AL"
    maxDaysPerYear  : Integer default 20;
    isPaid          : Boolean default true;
    description     : String(500);
}

// =============================================================================
// ENTITY: LeaveRequests
// An employee submits a leave request → manager approves/rejects.
// This is a workflow entity — status moves through stages.
// =============================================================================
entity LeaveRequests : cuid, managed {
    employee        : Association to Employees not null;
    leaveType       : Association to LeaveTypes not null;
    startDate       : Date not null;
    endDate         : Date not null;
    totalDays       : Integer;                // Calculated in service handler
    reason          : String(500);
    status          : String(20) default 'Pending'; // Pending, Approved, Rejected, Cancelled
    approvedBy      : Association to Employees;     // Manager who approved/rejected
    approvedAt      : DateTime;
    comments        : String(500);            // Manager's comments on decision

    // AI-generated risk assessment
    aiRiskFlag      : Boolean default false;  // AI flagged this as unusual
    aiRiskReason    : String(500);
}

// =============================================================================
// ENTITY: PerformanceReviews
// Annual/quarterly review of an employee.
// =============================================================================
entity PerformanceReviews : cuid, managed {
    employee        : Association to Employees not null;
    reviewer        : Association to Employees not null; // Usually the manager
    reviewPeriod    : String(20);             // e.g. "Q1 2025", "Annual 2024"
    reviewDate      : Date;

    // Scores (1-5 scale)
    technicalScore      : Integer;
    communicationScore  : Integer;
    teamworkScore       : Integer;
    leadershipScore     : Integer;
    overallScore        : Decimal(3,1);       // Calculated average

    // Qualitative feedback
    strengths       : String(2000);
    improvements    : String(2000);
    goals           : String(2000);           // Goals for next period

    status          : String(20) default 'Draft'; // Draft, Submitted, Acknowledged

    // AI-generated fields
    aiInsights      : String(3000);           // AI analysis of the review
    aiRating        : String(20);             // AI-suggested rating: Exceeds/Meets/Below Expectations
}

// =============================================================================
// ENTITY: JobPostings
// Open positions the company is hiring for.
// =============================================================================
entity JobPostings : cuid, managed {
    title           : String(100) not null;
    department      : Association to Departments;
    description     : String(5000);           // Full job description
    requirements    : String(3000);           // Required skills/experience
    salary_min      : Decimal(15,2);
    salary_max      : Decimal(15,2);
    currency        : String(3) default 'USD';
    location        : String(100);
    isRemote        : Boolean default false;
    status          : String(20) default 'Open'; // Open, Closed, On Hold
    closingDate     : Date;

    // AI-generated
    aiGeneratedDescription : String(5000);    // AI wrote the job description

    // Back-link to applications
    applications    : Composition of many JobApplications on applications.jobPosting = $self;
}

// =============================================================================
// ENTITY: JobApplications
// A candidate applies for a job posting.
// =============================================================================
entity JobApplications : cuid, managed {
    jobPosting      : Association to JobPostings not null;

    // Candidate info (external person, not in Employees table yet)
    candidateName   : String(100) not null;
    candidateEmail  : String(100) not null;
    candidatePhone  : String(20);
    resumeText      : String(10000);          // Paste resume text (in real app: file attachment)
    coverLetter     : String(5000);

    status          : String(30) default 'Applied';
    // Applied → Screening → Interview → Offer → Hired / Rejected

    appliedAt       : DateTime;

    // AI screening results
    aiScore         : Integer;                // 0-100 match score vs job requirements
    aiScreeningSummary : String(3000);        // AI's analysis of the candidate
    aiRecommendation   : String(20);          // Strongly Recommend / Recommend / Pass
}

// =============================================================================
// ENTITY: PayrollRecords
// Monthly payroll snapshot for each employee.
// =============================================================================
entity PayrollRecords : cuid, managed {
    employee        : Association to Employees not null;
    month           : Integer not null;       // 1-12
    year            : Integer not null;

    baseSalary      : Decimal(15,2);
    bonus           : Decimal(15,2) default 0;
    deductions      : Decimal(15,2) default 0;
    tax             : Decimal(15,2) default 0;
    netPay          : Decimal(15,2);          // Calculated: base + bonus - deductions - tax

    currency        : String(3) default 'USD';
    status          : String(20) default 'Draft'; // Draft, Processed, Paid
    paidAt          : DateTime;

    // AI anomaly detection
    aiAnomalyFlag   : Boolean default false;
    aiAnomalyNote   : String(500);
}

// =============================================================================
// ENTITY: AIConversations
// Stores chat history with the HR AI assistant.
// Each row is one message in a conversation.
// =============================================================================
entity AIConversations : cuid, managed {
    sessionId       : String(100);            // Groups messages into one conversation
    employee        : Association to Employees; // Which employee is chatting (null = HR admin)
    role            : String(10);             // "user" or "assistant"
    message         : String(10000);
    context         : String(100);            // What topic: "leave", "payroll", "general"
}
