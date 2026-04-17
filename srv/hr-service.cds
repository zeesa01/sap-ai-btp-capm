// =============================================================================
// FILE: srv/hr-service.cds
// PURPOSE: This is the SERVICE layer — it defines your OData API.
//
// CONCEPT: In CAP, you don't expose your DB entities directly to the outside.
// You define a SERVICE that selects what to expose and how.
// Think of it like a ViewModel — it sits between your DB and the UI/API consumers.
//
// This file answers: "What can callers DO with your app?"
// The .js file answers: "HOW does each operation work?"
//
// ODATA vs REST:
//   CAP generates OData V4 by default (used by SAP Fiori, SAP UI5).
//   OData gives you filtering, pagination, $expand (joins), $select for FREE.
//   Example: GET /hr/Employees?$filter=department/name eq 'Engineering'&$expand=department
// =============================================================================

using { hr } from '../db/schema'; // Import all entities from our schema

// =============================================================================
// SERVICE: HRService
// Exposed at: /hr (configurable in package.json)
// All entities and actions defined inside are part of this OData service.
// =============================================================================
service HRService @(path: '/hr') {

    // =========================================================================
    // EXPOSING ENTITIES
    // "entity X as projection on hr.X" = expose the DB entity as-is.
    // You can rename fields, restrict columns, or add virtual fields here.
    //
    // ANNOTATIONS:
    //   @readonly   = only GET is allowed (no POST/PUT/DELETE)
    //   @insertonly = only POST allowed
    //   (no annotation) = full CRUD
    // =========================================================================

    // --- Departments ---
    entity Departments      as projection on hr.Departments;

    // --- Employees ---
    // Full CRUD — HR admins can create, read, update, delete employees
    entity Employees        as projection on hr.Employees;

    // --- Leave Management ---
    entity LeaveTypes       as projection on hr.LeaveTypes;
    entity LeaveRequests    as projection on hr.LeaveRequests;

    // --- Performance ---
    entity PerformanceReviews as projection on hr.PerformanceReviews;

    // --- Recruitment ---
    entity JobPostings      as projection on hr.JobPostings;
    entity JobApplications  as projection on hr.JobApplications;

    // --- Payroll ---
    entity PayrollRecords   as projection on hr.PayrollRecords;

    // --- AI Chat History ---
    entity AIConversations  as projection on hr.AIConversations;


    // =========================================================================
    // ACTIONS vs FUNCTIONS (OData Concepts)
    //
    // ACTION:   modifies data, called with HTTP POST
    //           → use for AI operations that write results back to DB
    //
    // FUNCTION: read-only, called with HTTP GET
    //           → use for calculations, summaries, AI queries without saving
    //
    // "bound" = attached to a specific entity instance (like a method on an object)
    //   e.g. approveLeave(leaveRequestId) → bound to LeaveRequests
    //
    // "unbound" = global action on the service
    //   e.g. chat(message) → not tied to a specific record
    // =========================================================================

    // =========================================================================
    // LEAVE MANAGEMENT ACTIONS
    // =========================================================================

    // Approve a leave request (manager calls this)
    // Bound to LeaveRequests entity — POST /hr/LeaveRequests(id)/HRService.approveLeave
    action approveLeave(
        leaveRequestId  : UUID,
        comments        : String
    ) returns String;

    // Reject a leave request
    action rejectLeave(
        leaveRequestId  : UUID,
        comments        : String
    ) returns String;

    // Calculate how many leave days an employee has left this year
    // Returns a number, not a record — good use case for a function
    function getLeaveBalance(
        employeeId  : UUID,
        leaveTypeId : UUID,
        year        : Integer
    ) returns Integer;


    // =========================================================================
    // PAYROLL ACTIONS
    // =========================================================================

    // Calculate net pay for a payroll record and save it
    action calculatePayroll(
        payrollRecordId : UUID
    ) returns {
        netPay      : Decimal;
        breakdown   : String; // JSON string with details
    };


    // =========================================================================
    // AI ACTIONS — These call the AI (Claude/Anthropic API)
    // =========================================================================

    // 1. Generate a job description using AI
    //    POST /hr/HRService.generateJobDescription
    //    Sends job title + requirements to AI → returns professional description
    action generateJobDescription(
        jobTitle        : String,
        department      : String,
        requirements    : String,
        salaryRange     : String
    ) returns String; // Returns the AI-generated description

    // 2. Screen a job application with AI
    //    Compares resume against job requirements → returns score + analysis
    action screenApplication(
        applicationId   : UUID   // We read the application + job from DB
    ) returns {
        score           : Integer;     // 0-100 match score
        summary         : String;      // AI analysis
        recommendation  : String;      // "Strongly Recommend" / "Recommend" / "Pass"
    };

    // 3. Analyze a performance review with AI
    //    Reads scores + text → generates insights and suggested rating
    action analyzePerformanceReview(
        reviewId        : UUID
    ) returns {
        insights        : String;
        suggestedRating : String;
    };

    // 4. HR Chatbot — ask the AI anything about HR
    //    Maintains conversation context via sessionId
    //    POST /hr/HRService.chat
    action chat(
        sessionId       : String,       // Group messages into conversations
        employeeId      : UUID,         // Which employee is asking (optional)
        message         : String,       // The user's question
        context         : String        // Topic hint: "leave", "payroll", "general"
    ) returns String; // AI's response

    // 5. Detect payroll anomalies for a specific month
    action detectPayrollAnomalies(
        month   : Integer,
        year    : Integer
    ) returns array of {
        employeeId  : UUID;
        employeeName: String;
        anomaly     : String;
    };

    // 6. Generate employee summary (AI writes a profile blurb)
    action generateEmployeeSummary(
        employeeId  : UUID
    ) returns String;


    // =========================================================================
    // REPORTING FUNCTIONS (read-only, no AI)
    // =========================================================================

    // Get department headcount summary
    function getDepartmentStats() returns array of {
        departmentName  : String;
        headcount       : Integer;
        avgSalary       : Decimal;
        openLeaves      : Integer;
    };

    // Get upcoming leave schedule (who is off in the next N days)
    function getUpcomingLeaves(
        days    : Integer   // How many days ahead to look
    ) returns array of {
        employeeName    : String;
        leaveType       : String;
        startDate       : Date;
        endDate         : Date;
        totalDays       : Integer;
    };
}
