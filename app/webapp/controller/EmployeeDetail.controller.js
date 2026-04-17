sap.ui.define([
    "hr/fiori/controller/BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    return BaseController.extend("hr.fiori.controller.EmployeeDetail", {

        onInit: function () {
            // Listen for route pattern matched — extracts the {employeeId} URL param
            this.getRouter().getRoute("employeeDetail").attachPatternMatched(this._onRouteMatched, this);

            // Set empty models
            this.getView().setModel(new JSONModel({}), "empDetail");
            this.getView().setModel(new JSONModel([]), "empLeave");
            this.getView().setModel(new JSONModel([]), "empPerf");
            this.getView().setModel(new JSONModel([]), "empPayroll");
        },

        _onRouteMatched: function (oEvent) {
            // Extract the employee ID from the URL
            // manifest.json route pattern: "employees/{employeeId}"
            var sEmployeeId = decodeURIComponent(oEvent.getParameter("arguments").employeeId);
            this._loadEmployee(sEmployeeId);
        },

        _loadEmployee: function (sId) {
            var that = this;
            this.setBusy(true);

            // Load employee with department expanded (one-call JOIN)
            fetch("/hr/Employees('" + sId + "')?$expand=department", {
                headers: { Accept: "application/json" }
            })
            .then(function (r) { return r.json(); })
            .then(function (emp) {
                var oModel = that.getView().getModel("empDetail");
                oModel.setData({
                    ...emp,
                    fullName: emp.firstName + " " + emp.lastName,
                    departmentName: emp.department ? emp.department.name : "—"
                });

                // Load sub-data in parallel
                return Promise.all([
                    that._loadLeaveHistory(sId),
                    that._loadPerformance(sId),
                    that._loadPayroll(sId)
                ]);
            })
            .catch(function (e) { that.showError("Could not load employee"); })
            .finally(function () { that.setBusy(false); });
        },

        _loadLeaveHistory: function (sId) {
            var that = this;
            return fetch("/hr/LeaveRequests?$filter=employee_ID eq '" + sId + "'&$expand=leaveType&$orderby=startDate desc", {
                headers: { Accept: "application/json" }
            })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                var aLeaves = (d.value || []).map(function (l) {
                    return { ...l, leaveTypeName: l.leaveType ? l.leaveType.name : "—" };
                });
                that.getView().getModel("empLeave").setData(aLeaves);
            });
        },

        _loadPerformance: function (sId) {
            var that = this;
            return fetch("/hr/PerformanceReviews?$filter=employee_ID eq '" + sId + "'&$orderby=reviewDate desc", {
                headers: { Accept: "application/json" }
            })
            .then(function (r) { return r.json(); })
            .then(function (d) { that.getView().getModel("empPerf").setData(d.value || []); });
        },

        _loadPayroll: function (sId) {
            var that = this;
            return fetch("/hr/PayrollRecords?$filter=employee_ID eq '" + sId + "'&$orderby=year desc,month desc", {
                headers: { Accept: "application/json" }
            })
            .then(function (r) { return r.json(); })
            .then(function (d) { that.getView().getModel("empPayroll").setData(d.value || []); });
        },

        // ── AI: Generate Summary ──────────────────────────────────────

        onGenerateSummary: function () {
            var sId = this.getView().getModel("empDetail").getProperty("/ID");
            var that = this;
            this.setBusy(true);

            this.callAction("generateEmployeeSummary", { employeeId: sId })
                .then(function (sSummary) {
                    that.getView().getModel("empDetail").setProperty("/aiSummary", sSummary);
                    that.showSuccess("AI summary generated");
                })
                .finally(function () { that.setBusy(false); });
        },

        onNavBack: function () { this.navBack(); }
    });
});
