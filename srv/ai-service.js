// =============================================================================
// FILE: srv/ai-service.js
// PURPOSE: AI integration layer — all AI calls are isolated here.
//
// WHY SEPARATE FILE?
//   Keeps hr-service.js focused on business logic.
//   If you ever want to swap AI providers, only this file changes.
//
// CONFIGURATION:
//   Set ANTHROPIC_API_KEY in your .env file (local dev)
//   or as an environment variable in your BTP app (production).
//
// BTP BEST PRACTICE:
//   Store the API key in a BTP Destination (see README.md Section 10).
//   Never commit API keys to git.
// =============================================================================

const Anthropic = require('@anthropic-ai/sdk');

// Reads ANTHROPIC_API_KEY automatically from environment variables
const anthropic = new Anthropic();

const AI_MODEL = 'claude-sonnet-4-6';

// =============================================================================
// HELPER: callAI — single message call
// =============================================================================
async function callClaude(systemPrompt, userMessage, maxTokens = 1024) {
    try {
        const response = await anthropic.messages.create({
            model: AI_MODEL,
            max_tokens: maxTokens,

            // "system" prompt = instructions for the AI (its persona/rules)
            system: systemPrompt,

            // "messages" = the conversation. Each has a role and content.
            messages: [
                { role: 'user', content: userMessage }
            ]
        });

        // response.content is an array of content blocks.
        // For text responses, we want the first text block's text.
        return response.content[0].text;

    } catch (error) {
        // Log the error but throw a user-friendly message
        console.error('AI Service Error:', error.message);
        throw new Error(`AI service unavailable: ${error.message}`);
    }
}

// =============================================================================
// HELPER: callClaudeWithHistory
// For the chatbot — sends the full conversation history so AI remembers context.
// =============================================================================
async function callClaudeWithHistory(systemPrompt, conversationHistory, maxTokens = 2048) {
    try {
        const response = await anthropic.messages.create({
            model: AI_MODEL,
            max_tokens: maxTokens,
            system: systemPrompt,
            // Pass all previous messages — Claude sees the whole conversation
            messages: conversationHistory
        });

        return response.content[0].text;

    } catch (error) {
        console.error('AI Chat Error:', error.message);
        throw new Error(`AI chat unavailable: ${error.message}`);
    }
}

// =============================================================================
// AI FUNCTION 1: generateJobDescription
// Takes job details → returns a professional job posting description.
// =============================================================================
async function generateJobDescription(jobTitle, department, requirements, salaryRange) {
    const system = `You are an expert HR professional and talent acquisition specialist.
    Write compelling, inclusive, and professional job descriptions.
    Always include: role overview, key responsibilities (bullet points),
    required qualifications, nice-to-have skills, and what the company offers.
    Keep the tone professional but approachable.`;

    const userMessage = `Write a complete job description for the following position:

Job Title: ${jobTitle}
Department: ${department}
Key Requirements: ${requirements}
Salary Range: ${salaryRange || 'Competitive'}

Format it as a proper job posting with clear sections.`;

    // maxTokens: 2048 because job descriptions can be long
    return await callClaude(system, userMessage, 2048);
}

// =============================================================================
// AI FUNCTION 2: screenApplication
// Compares candidate resume against job requirements → gives a match score.
// =============================================================================
async function screenApplication(jobTitle, jobDescription, jobRequirements, resumeText, coverLetter) {
    const system = `You are an expert HR recruiter screening job applications.
    Analyze candidates objectively and fairly. Focus on skills, experience, and potential.
    Always respond with valid JSON only — no markdown, no explanation outside the JSON.`;

    const userMessage = `Screen this job application and return a JSON response.

JOB TITLE: ${jobTitle}

JOB REQUIREMENTS:
${jobRequirements}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE RESUME:
${resumeText}

COVER LETTER:
${coverLetter || 'Not provided'}

Return this exact JSON structure:
{
  "score": <number 0-100>,
  "summary": "<2-3 paragraph analysis of the candidate>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "recommendation": "<Strongly Recommend | Recommend | Consider | Pass>",
  "interviewQuestions": ["<question 1>", "<question 2>", "<question 3>"]
}`;

    const rawResponse = await callClaude(system, userMessage, 1500);

    try {
        // Parse the JSON response from the AI
        return JSON.parse(rawResponse);
    } catch {
        // If AI returned non-JSON (shouldn't happen), return structured error
        return {
            score: 0,
            summary: rawResponse,
            strengths: [],
            gaps: [],
            recommendation: 'Manual Review Required',
            interviewQuestions: []
        };
    }
}

// =============================================================================
// AI FUNCTION 3: analyzePerformanceReview
// Reads performance scores and written feedback → generates deep insights.
// =============================================================================
async function analyzePerformanceReview(reviewData) {
    const system = `You are an experienced HR business partner specializing in performance management.
    Provide constructive, fair, and actionable performance insights.
    Be specific. Avoid vague statements. Connect patterns between scores and written feedback.
    Always respond with valid JSON only.`;

    const userMessage = `Analyze this performance review and provide insights.

EMPLOYEE: ${reviewData.employeeName}
REVIEW PERIOD: ${reviewData.reviewPeriod}

SCORES (out of 5):
- Technical Skills: ${reviewData.technicalScore}/5
- Communication: ${reviewData.communicationScore}/5
- Teamwork: ${reviewData.teamworkScore}/5
- Leadership: ${reviewData.leadershipScore}/5
- Overall: ${reviewData.overallScore}/5

WRITTEN FEEDBACK:
Strengths: ${reviewData.strengths}
Areas for Improvement: ${reviewData.improvements}
Goals: ${reviewData.goals}

Return this exact JSON:
{
  "insights": "<3-4 paragraph deep analysis connecting scores with written feedback>",
  "suggestedRating": "<Exceeds Expectations | Meets Expectations | Below Expectations>",
  "keyStrengths": ["<strength 1>", "<strength 2>"],
  "developmentAreas": ["<area 1>", "<area 2>"],
  "suggestedActions": ["<action 1>", "<action 2>", "<action 3>"],
  "riskAssessment": "<Low | Medium | High flight risk based on review>"
}`;

    const rawResponse = await callClaude(system, userMessage, 2000);

    try {
        return JSON.parse(rawResponse);
    } catch {
        return {
            insights: rawResponse,
            suggestedRating: 'Meets Expectations',
            keyStrengths: [],
            developmentAreas: [],
            suggestedActions: [],
            riskAssessment: 'Unknown'
        };
    }
}

// =============================================================================
// AI FUNCTION 4: hrChatbot
// Conversational AI for HR questions. Knows HR policies, leave rules, etc.
// conversationHistory = array of { role: "user"|"assistant", content: "..." }
// =============================================================================
async function hrChatbot(conversationHistory, employeeInfo, hrContext) {
    const system = `You are the Smart HR Assistant for this company.
    Never mention or reveal what AI technology or provider you use.
    If asked "what AI are you?" respond: "I am the Smart HR Assistant, your company's HR intelligence system."
    You are an intelligent HR Assistant for a company.
    You help employees and HR staff with questions about:
    - Leave policies and how to apply for leave
    - Payroll questions and salary information
    - Performance review process
    - Company HR policies
    - Onboarding information
    - Benefits and compensation

    ${employeeInfo ? `You are currently assisting: ${employeeInfo.name} (${employeeInfo.jobTitle}, ${employeeInfo.department})` : 'You are assisting an HR administrator.'}

    ${hrContext ? `Current context: ${hrContext}` : ''}

    Be helpful, professional, and concise. If you don't know something specific about
    the company's policies, say so and suggest contacting HR directly.
    Never make up specific numbers (like exact salary figures) you don't have.`;

    return await callClaudeWithHistory(system, conversationHistory, 1024);
}

// =============================================================================
// AI FUNCTION 5: detectPayrollAnomalies
// Reviews all payroll records for a given month and flags unusual entries.
// =============================================================================
async function detectPayrollAnomalies(payrollData) {
    const system = `You are a payroll audit specialist.
    Analyze payroll data for anomalies, errors, and unusual patterns.
    Be precise and flag only genuine concerns. Respond with valid JSON only.`;

    const userMessage = `Review this payroll data for the month and identify any anomalies.

PAYROLL DATA:
${JSON.stringify(payrollData, null, 2)}

Look for:
- Unusually high or low net pay compared to base salary
- Missing deductions or taxes
- Salaries significantly above/below department average
- Duplicate entries
- Employees with zero pay

Return this JSON:
{
  "anomalies": [
    {
      "employeeId": "<id>",
      "employeeName": "<name>",
      "anomaly": "<description of the issue>",
      "severity": "<High | Medium | Low>"
    }
  ],
  "summary": "<overall payroll health summary>",
  "totalFlagged": <number>
}`;

    const rawResponse = await callClaude(system, userMessage, 1500);

    try {
        return JSON.parse(rawResponse);
    } catch {
        return { anomalies: [], summary: rawResponse, totalFlagged: 0 };
    }
}

// =============================================================================
// AI FUNCTION 6: generateEmployeeSummary
// Creates a professional bio/profile summary for an employee.
// =============================================================================
async function generateEmployeeSummary(employeeData) {
    const system = `You are an HR professional writing employee profiles.
    Write professional, positive, and factual summaries.
    Keep it to 2-3 sentences. Focus on role and tenure.`;

    const userMessage = `Write a brief professional profile summary for this employee:

Name: ${employeeData.firstName} ${employeeData.lastName}
Job Title: ${employeeData.jobTitle}
Department: ${employeeData.departmentName}
Start Date: ${employeeData.startDate}
Employment Type: ${employeeData.employmentType}

Write 2-3 professional sentences as a profile description.`;

    return await callClaude(system, userMessage, 300);
}

// =============================================================================
// PRODUCTION BEST PRACTICE: Using BTP Destinations for API Keys
// =============================================================================
// In production on SAP BTP, store the API key in a BTP Destination instead
// of environment variables. See README.md Section 10 for full setup guide.
//
// STEP 1: Create Destination in BTP Cockpit → Connectivity → Destinations
//   Name:           AI_SERVICE
//   Type:           HTTP
//   URL:            https://api.your-ai-provider.com
//   Authentication: NoAuthentication
//   Additional Properties:
//     URL.headers.x-api-key        = your-api-key
//     URL.headers.Content-Type     = application/json
//
// STEP 2: Use SAP Cloud SDK to call via Destination:
//
//   const { getDestination, executeHttpRequest } = require('@sap-cloud-sdk/http-client');
//
//   async function callAIViaDestination(body) {
//       const dest = await getDestination({ destinationName: 'AI_SERVICE' });
//       const response = await executeHttpRequest(dest, {
//           method: 'POST', url: '/v1/messages', data: body
//       });
//       return response.data;
//   }
//
// Benefits:
//   ✓ API key never in your code or git history
//   ✓ Rotate the key in BTP cockpit without redeploying the app
//   ✓ Audit logs for all AI calls via BTP monitoring
//   ✓ Same pattern works for on-premise AI via Cloud Connector

// Export all AI functions for use in hr-service.js
module.exports = {
    generateJobDescription,
    screenApplication,
    analyzePerformanceReview,
    hrChatbot,
    detectPayrollAnomalies,
    generateEmployeeSummary
};
