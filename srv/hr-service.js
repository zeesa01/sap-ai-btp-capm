// =============================================================================
// FILE: srv/hr-service.js
// PURPOSE: Business logic handlers for the HRService.
//
// HOW CAP EVENT HANDLERS WORK:
//   CAP uses an event-driven model. Every OData operation triggers an event.
//   You "register" handlers for those events using srv.on() / srv.before() / srv.after()
//
//   srv.before('CREATE', 'Employees', handler)  → runs BEFORE the insert
//   srv.on('CREATE', 'Employees', handler)       → runs INSTEAD of default insert
//   srv.after('READ', 'Employees', handler)      → runs AFTER the read, can modify results
//
// EVENTS: READ, CREATE, UPDATE, DELETE, and custom action/function names
//
// THE "req" OBJECT (every handler gets this):
//   req.data    → the request body (for CREATE/UPDATE)
//   req.params  → URL parameters (entity key, e.g. { ID: 'abc-123' })
//   req.query   → the CQL query being executed
//   req.user    → authenticated user info (from BTP XSUAA)
//   req.error() → throw a user-facing error
//   req.reject()→ reject the operation
// =============================================================================

const cds = require('@sap/cds');
const aiService = require('./ai-service');

// "module.exports" exports a function — CAP calls it with the service instance
module.exports = class HRService extends cds.ApplicationService {

    // "init" is called once when the service starts. Register all handlers here.
    async init() {

        // Get references to DB entities so we can query them
        const {
            Employees, Departments, LeaveRequests, LeaveTypes,
            PerformanceReviews, JobPostings, JobApplications,
            PayrollRecords, AIConversations
        } = this.entities;

        // =====================================================================
        // BEFORE HANDLERS — validation before data is written
        // =====================================================================

        // Validate employee data before creating
        this.before('CREATE', 'Employees', async (req) => {
            const { firstName, lastName, email } = req.data;

            // Basic validation
            if (!firstName?.trim()) return req.reject(400, 'First name is required');
            if (!lastName?.trim()) return req.reject(400, 'Last name is required');
            if (!email?.trim()) return req.reject(400, 'Email is required');

            // Email format check
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) return req.reject(400, 'Invalid email format');

            // Check email uniqueness
            // cds.ql: CAP's query builder — SELECT.from(Entity).where({field: value})
            const existing = await SELECT.one.from(Employees).where({ email: email.toLowerCase() });
            if (existing) return req.reject(409, `Employee with email ${email} already exists`);

            // Normalize email to lowercase
            req.data.email = email.toLowerCase();

            // Auto-generate employee ID if not provided
            if (!req.data.employeeId) {
                const count = await SELECT.one`count(*) as total`.from(Employees);
                req.data.employeeId = `EMP-${String((count?.total || 0) + 1).padStart(4, '0')}`;
            }
        });

        // Validate leave request dates
        this.before('CREATE', 'LeaveRequests', async (req) => {
            const { startDate, endDate, employee_ID, leaveType_ID } = req.data;

            if (!startDate || !endDate) return req.reject(400, 'Start date and end date are required');

            const start = new Date(startDate);
            const end = new Date(endDate);

            if (start > end) return req.reject(400, 'Start date cannot be after end date');
            if (start < new Date()) return req.reject(400, 'Cannot apply for leave in the past');

            // Calculate total days (business days would be better, but keeping simple)
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            req.data.totalDays = diffDays;

            // Check for overlapping leave requests
            const overlap = await SELECT.one.from(LeaveRequests).where`
                employee_ID = ${employee_ID}
                and status != 'Rejected'
                and status != 'Cancelled'
                and startDate <= ${endDate}
                and endDate >= ${startDate}
            `;
            if (overlap) return req.reject(409, 'Employee already has a leave request for overlapping dates');
        });

        // Validate payroll before creating — ensure no duplicate for same month/year/employee
        this.before('CREATE', 'PayrollRecords', async (req) => {
            const { employee_ID, month, year } = req.data;

            if (month < 1 || month > 12) return req.reject(400, 'Month must be between 1 and 12');
            if (year < 2000 || year > 2100) return req.reject(400, 'Invalid year');

            const existing = await SELECT.one.from(PayrollRecords)
                .where({ employee_ID, month, year });

            if (existing) return req.reject(409, `Payroll record for employee already exists for ${month}/${year}`);
        });

        // =====================================================================
        // AFTER HANDLERS — enrich data after reading
        // =====================================================================

        // After reading employees, add a virtual "fullName" field
        // (Note: in .cds you'd add a virtual element, but this is another way)
        // We won't do this to keep the example clean, but the pattern is:
        // this.after('READ', 'Employees', (employees) => {
        //     if (Array.isArray(employees)) {
        //         employees.forEach(e => e.fullName = `${e.firstName} ${e.lastName}`);
        //     }
        // });

        // =====================================================================
        // CUSTOM ACTIONS: Leave Management
        // =====================================================================

        // Action: approveLeave
        // Called via: POST /hr/approveLeave
        this.on('approveLeave', async (req) => {
            const { leaveRequestId, comments } = req.data;

            // Find the leave request
            const leaveReq = await SELECT.one.from(LeaveRequests).where({ ID: leaveRequestId });
            if (!leaveReq) return req.reject(404, 'Leave request not found');
            if (leaveReq.status !== 'Pending') return req.reject(400, `Cannot approve a ${leaveReq.status} request`);

            // Update the status
            // UPDATE entity SET {fields} WHERE {condition}
            await UPDATE(LeaveRequests).set({
                status: 'Approved',
                comments: comments || '',
                approvedAt: new Date().toISOString()
                // approvedBy would be set from req.user.id in a real app with auth
            }).where({ ID: leaveRequestId });

            return `Leave request approved successfully`;
        });

        // Action: rejectLeave
        this.on('rejectLeave', async (req) => {
            const { leaveRequestId, comments } = req.data;

            const leaveReq = await SELECT.one.from(LeaveRequests).where({ ID: leaveRequestId });
            if (!leaveReq) return req.reject(404, 'Leave request not found');
            if (leaveReq.status !== 'Pending') return req.reject(400, `Cannot reject a ${leaveReq.status} request`);

            if (!comments) return req.reject(400, 'Comments are required when rejecting a leave request');

            await UPDATE(LeaveRequests).set({
                status: 'Rejected',
                comments,
                approvedAt: new Date().toISOString()
            }).where({ ID: leaveRequestId });

            return `Leave request rejected`;
        });

        // Function: getLeaveBalance
        // Returns how many leave days an employee has left this year
        this.on('getLeaveBalance', async (req) => {
            const { employeeId, leaveTypeId, year } = req.data;
            const targetYear = year || new Date().getFullYear();

            // Get the leave type's maximum days
            const leaveType = await SELECT.one.from(LeaveTypes).where({ ID: leaveTypeId });
            if (!leaveType) return req.reject(404, 'Leave type not found');

            // Count days used this year for this employee and leave type
            // We use aggregate SELECT with WHERE on year extracted from startDate
            const used = await SELECT.one`sum(totalDays) as usedDays`.from(LeaveRequests).where`
                employee_ID = ${employeeId}
                and leaveType_ID = ${leaveTypeId}
                and status = 'Approved'
                and year(startDate) = ${targetYear}
            `;

            const usedDays = used?.usedDays || 0;
            return leaveType.maxDaysPerYear - usedDays;
        });


        // =====================================================================
        // CUSTOM ACTION: Payroll Calculation
        // =====================================================================

        this.on('calculatePayroll', async (req) => {
            const { payrollRecordId } = req.data;

            const record = await SELECT.one.from(PayrollRecords).where({ ID: payrollRecordId });
            if (!record) return req.reject(404, 'Payroll record not found');
            if (record.status === 'Paid') return req.reject(400, 'Payroll already paid');

            const baseSalary = record.baseSalary || 0;
            const bonus = record.bonus || 0;
            const deductions = record.deductions || 0;

            // Simple tax calculation (20% of base + bonus)
            // In reality this would be a complex tax table lookup
            const grossPay = baseSalary + bonus;
            const tax = Math.round(grossPay * 0.20 * 100) / 100;
            const netPay = Math.round((grossPay - deductions - tax) * 100) / 100;

            await UPDATE(PayrollRecords).set({
                tax,
                netPay,
                status: 'Processed'
            }).where({ ID: payrollRecordId });

            const breakdown = JSON.stringify({
                baseSalary,
                bonus,
                grossPay,
                deductions,
                tax,
                netPay
            });

            return { netPay, breakdown };
        });


        // =====================================================================
        // AI ACTIONS
        // =====================================================================

        // AI Action 1: Generate Job Description
        this.on('generateJobDescription', async (req) => {
            const { jobTitle, department, requirements, salaryRange } = req.data;

            if (!jobTitle) return req.reject(400, 'Job title is required');

            console.log(`[AI] Generating job description for: ${jobTitle}`);
            const description = await aiService.generateJobDescription(
                jobTitle, department, requirements, salaryRange
            );
            return description;
        });

        // AI Action 2: Screen Application
        this.on('screenApplication', async (req) => {
            const { applicationId } = req.data;

            // Load the application WITH the related job posting (using JOIN-like expand)
            // CAP supports this natively — just query with associations
            const app = await SELECT.one.from(JobApplications).where({ ID: applicationId });
            if (!app) return req.reject(404, 'Application not found');

            const job = await SELECT.one.from(JobPostings).where({ ID: app.jobPosting_ID });
            if (!job) return req.reject(404, 'Job posting not found');

            if (!app.resumeText) return req.reject(400, 'No resume text to screen');

            console.log(`[AI] Screening application ${applicationId} for job: ${job.title}`);

            const result = await aiService.screenApplication(
                job.title,
                job.description,
                job.requirements,
                app.resumeText,
                app.coverLetter
            );

            // Save AI results back to the application record
            await UPDATE(JobApplications).set({
                aiScore: result.score,
                aiScreeningSummary: result.summary,
                aiRecommendation: result.recommendation,
                status: 'Screening'
            }).where({ ID: applicationId });

            return {
                score: result.score,
                summary: result.summary,
                recommendation: result.recommendation
            };
        });

        // AI Action 3: Analyze Performance Review
        this.on('analyzePerformanceReview', async (req) => {
            const { reviewId } = req.data;

            // Load review and related employee
            const review = await SELECT.one.from(PerformanceReviews).where({ ID: reviewId });
            if (!review) return req.reject(404, 'Performance review not found');

            const employee = await SELECT.one.from(Employees).where({ ID: review.employee_ID });

            const reviewData = {
                ...review,
                employeeName: employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown'
            };

            console.log(`[AI] Analyzing performance review for: ${reviewData.employeeName}`);

            const result = await aiService.analyzePerformanceReview(reviewData);

            // Save AI insights back to the review
            await UPDATE(PerformanceReviews).set({
                aiInsights: result.insights,
                aiRating: result.suggestedRating
            }).where({ ID: reviewId });

            return {
                insights: result.insights,
                suggestedRating: result.suggestedRating
            };
        });

        // AI Action 4: HR Chatbot
        this.on('chat', async (req) => {
            const { sessionId, employeeId, message, context } = req.data;

            if (!message?.trim()) return req.reject(400, 'Message cannot be empty');
            if (!sessionId) return req.reject(400, 'Session ID is required');

            // Load employee info if provided
            let employeeInfo = null;
            if (employeeId) {
                const emp = await SELECT.one.from(Employees).where({ ID: employeeId });
                if (emp) {
                    const dept = await SELECT.one.from(Departments).where({ ID: emp.department_ID });
                    employeeInfo = {
                        name: `${emp.firstName} ${emp.lastName}`,
                        jobTitle: emp.jobTitle,
                        department: dept?.name || 'Unknown'
                    };
                }
            }

            // Load conversation history for this session
            // We send the last 10 messages to avoid hitting token limits
            const history = await SELECT.from(AIConversations)
                .where({ sessionId })
                .orderBy({ createdAt: 'asc' })
                .limit(10);

            // Format history for the Anthropic API
            const conversationHistory = history.map(h => ({
                role: h.role,
                content: h.message
            }));

            // Add the current user message
            conversationHistory.push({ role: 'user', content: message });

            console.log(`[AI Chat] Session ${sessionId}, message: "${message.substring(0, 50)}..."`);

            const aiResponse = await aiService.hrChatbot(conversationHistory, employeeInfo, context);

            // Save both user message and AI response to conversation history
            // INSERT.into(Entity).entries([...]) — batch insert
            await INSERT.into(AIConversations).entries([
                {
                    sessionId,
                    employee_ID: employeeId || null,
                    role: 'user',
                    message,
                    context: context || 'general'
                },
                {
                    sessionId,
                    employee_ID: employeeId || null,
                    role: 'assistant',
                    message: aiResponse,
                    context: context || 'general'
                }
            ]);

            return aiResponse;
        });

        // AI Action 5: Detect Payroll Anomalies
        this.on('detectPayrollAnomalies', async (req) => {
            const { month, year } = req.data;

            // Load all payroll records for the month with employee names
            // This is a JOIN using CAP associations
            const records = await SELECT.from(PayrollRecords)
                .columns('ID', 'baseSalary', 'bonus', 'deductions', 'tax', 'netPay',
                         'employee.firstName', 'employee.lastName', 'employee.employeeId')
                .where({ month, year });

            if (records.length === 0) {
                return req.reject(404, `No payroll records found for ${month}/${year}`);
            }

            // Format for AI analysis
            const payrollData = records.map(r => ({
                employeeId: r.ID,
                name: `${r['employee.firstName']} ${r['employee.lastName']}`,
                baseSalary: r.baseSalary,
                bonus: r.bonus,
                deductions: r.deductions,
                tax: r.tax,
                netPay: r.netPay
            }));

            console.log(`[AI] Analyzing ${records.length} payroll records for ${month}/${year}`);

            const result = await aiService.detectPayrollAnomalies(payrollData);

            // Update flagged records in DB
            for (const anomaly of result.anomalies || []) {
                await UPDATE(PayrollRecords).set({
                    aiAnomalyFlag: true,
                    aiAnomalyNote: anomaly.anomaly
                }).where({ ID: anomaly.employeeId });
            }

            return result.anomalies || [];
        });

        // AI Action 6: Generate Employee Summary
        this.on('generateEmployeeSummary', async (req) => {
            const { employeeId } = req.data;

            const emp = await SELECT.one.from(Employees).where({ ID: employeeId });
            if (!emp) return req.reject(404, 'Employee not found');

            const dept = await SELECT.one.from(Departments).where({ ID: emp.department_ID });

            const employeeData = {
                ...emp,
                departmentName: dept?.name || 'Unknown'
            };

            const summary = await aiService.generateEmployeeSummary(employeeData);

            // Save the summary to the employee record
            await UPDATE(Employees).set({ aiSummary: summary }).where({ ID: employeeId });

            return summary;
        });

        // =====================================================================
        // REPORTING FUNCTIONS
        // =====================================================================

        this.on('getDepartmentStats', async () => {
            // Complex query using CAP's SELECT with aggregation
            const departments = await SELECT.from(Departments);
            const result = [];

            for (const dept of departments) {
                // Count employees in this department
                const empCount = await SELECT.one`count(*) as total`.from(Employees)
                    .where({ department_ID: dept.ID, status: 'Active' });

                // Average salary
                const avgSal = await SELECT.one`avg(baseSalary) as avg`.from(Employees)
                    .where({ department_ID: dept.ID, status: 'Active' });

                // Count open/pending leaves
                const openLeaves = await SELECT.one`count(*) as total`.from(LeaveRequests)
                    .where`
                        status = 'Pending'
                        and employee.department_ID = ${dept.ID}
                    `;

                result.push({
                    departmentName: dept.name,
                    headcount: empCount?.total || 0,
                    avgSalary: Math.round(avgSal?.avg || 0),
                    openLeaves: openLeaves?.total || 0
                });
            }

            return result;
        });

        this.on('getUpcomingLeaves', async (req) => {
            const { days } = req.data;
            const lookAheadDays = days || 7;

            const today = new Date();
            const futureDate = new Date();
            futureDate.setDate(today.getDate() + lookAheadDays);

            const todayStr = today.toISOString().split('T')[0];
            const futureDateStr = futureDate.toISOString().split('T')[0];

            const leaves = await SELECT.from(LeaveRequests)
                .columns(
                    'employee.firstName', 'employee.lastName',
                    'leaveType.name as leaveTypeName',
                    'startDate', 'endDate', 'totalDays'
                )
                .where`
                    status = 'Approved'
                    and startDate >= ${todayStr}
                    and startDate <= ${futureDateStr}
                `
                .orderBy('startDate');

            return leaves.map(l => ({
                employeeName: `${l['employee.firstName']} ${l['employee.lastName']}`,
                leaveType: l.leaveTypeName,
                startDate: l.startDate,
                endDate: l.endDate,
                totalDays: l.totalDays
            }));
        });

        // IMPORTANT: Always call super.init() at the end to register default handlers
        // (CRUD operations, $metadata, etc.)
        return super.init();
    }
};
