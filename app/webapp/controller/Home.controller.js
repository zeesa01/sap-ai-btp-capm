sap.ui.define([
    "hr/fiori/controller/BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    return BaseController.extend("hr.fiori.controller.Home", {

        onInit: function () {
            // onInit fires when this view is FIRST created (once per app session).
            // Set empty models so the view doesn't show binding errors before data loads.
            this.getView().setModel(new JSONModel({ totalEmployees: "-", pendingLeaves: "-", openPositions: "-", pendingReviews: "-" }), "kpi");
            this.getView().setModel(new JSONModel([]), "deptStats");
            this.getView().setModel(new JSONModel([]), "upcomingLeaves");

            // Listen for when this route is navigated to (even on return visits)
            this.getRouter().getRoute("home").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            // Called every time the user navigates to the home page.
            // Reload all dashboard data fresh.
            this._loadKPIs();
            this._loadDeptStats();
            this._loadUpcomingLeaves();
        },

        _loadKPIs: function () {
            var that = this;
            // Use Promise.all to fire all 4 requests in parallel — faster than sequential
            Promise.all([
                this.loadData("Employees?$filter=status eq 'Active'&$count=true&$top=0"),
                this.loadData("LeaveRequests?$filter=status eq 'Pending'&$count=true&$top=0"),
                this.loadData("JobPostings?$filter=status eq 'Open'&$count=true&$top=0"),
                this.loadData("PerformanceReviews?$filter=status eq 'Draft'&$count=true&$top=0")
            ]).then(function (results) {
                // Each result from $count=true&$top=0 returns an object with "@odata.count"
                // We need to fetch raw so we get the count header
                // Simpler: just load all and count client-side for now
            }).catch(function () {});

            // Simpler approach — load entities and count them
            var oKpi = this.getView().getModel("kpi");

            fetch("/hr/Employees?$filter=status eq 'Active'&$select=ID", { headers: { Accept: "application/json" } })
                .then(r => r.json()).then(d => oKpi.setProperty("/totalEmployees", (d.value || []).length));

            fetch("/hr/LeaveRequests?$filter=status eq 'Pending'&$select=ID", { headers: { Accept: "application/json" } })
                .then(r => r.json()).then(d => oKpi.setProperty("/pendingLeaves", (d.value || []).length));

            fetch("/hr/JobPostings?$filter=status eq 'Open'&$select=ID", { headers: { Accept: "application/json" } })
                .then(r => r.json()).then(d => oKpi.setProperty("/openPositions", (d.value || []).length));

            fetch("/hr/PerformanceReviews?$filter=status eq 'Draft'&$select=ID", { headers: { Accept: "application/json" } })
                .then(r => r.json()).then(d => oKpi.setProperty("/pendingReviews", (d.value || []).length));
        },

        _loadDeptStats: function () {
            var that = this;
            this.callFunction("getDepartmentStats()")
                .then(function (aData) {
                    that.getView().getModel("deptStats").setData(aData || []);
                })
                .catch(function () {});
        },

        _loadUpcomingLeaves: function () {
            var that = this;
            this.callFunction("getUpcomingLeaves(days=14)")
                .then(function (aData) {
                    that.getView().getModel("upcomingLeaves").setData(aData || []);
                })
                .catch(function () {});
        },

        // ── Quick Action Button Handlers ──────────────────────────────
        onNavigateEmployees:   function () { this.navTo("employees"); },
        onNavigateLeave:       function () { this.navTo("leaveRequests"); },
        onNavigateRecruitment: function () { this.navTo("recruitment"); },
        onNavigatePerformance: function () { this.navTo("performance"); },
        onAddEmployee:         function () { this.navTo("employees"); },
        onSubmitLeave:         function () { this.navTo("leaveRequests"); },
        onNewJobPosting:       function () { this.navTo("recruitment"); },
        onOpenAIAssistant:     function () { this.navTo("aiAssistant"); }
    });
});
