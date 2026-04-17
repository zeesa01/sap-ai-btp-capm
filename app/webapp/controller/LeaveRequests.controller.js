sap.ui.define([
    "hr/fiori/controller/BaseController",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Input",
    "sap/m/TextArea",
    "sap/m/Select",
    "sap/ui/core/Item",
    "sap/m/Label",
    "sap/m/DatePicker",
    "sap/ui/layout/form/SimpleForm",
    "sap/ui/model/json/JSONModel"
], function (BaseController, Filter, FilterOperator, Dialog, Button, Input,
             TextArea, Select, Item, Label, DatePicker, SimpleForm, JSONModel) {
    "use strict";

    return BaseController.extend("hr.fiori.controller.LeaveRequests", {

        onInit: function () {
            this.getRouter().getRoute("leaveRequests").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var oTable = this.byId("leaveTable");
            if (oTable && oTable.getBinding("items")) {
                oTable.getBinding("items").refresh();
            }
        },

        // ── TAB FILTER ────────────────────────────────────────────────

        onTabSelect: function (oEvent) {
            var sKey = oEvent.getParameter("key");
            var oBinding = this.byId("leaveTable").getBinding("items");
            if (sKey === "all") {
                oBinding.filter([]);
            } else {
                oBinding.filter([new Filter("status", FilterOperator.EQ, sKey)]);
            }
        },

        onRefresh: function () {
            this.byId("leaveTable").getBinding("items").refresh();
        },

        // ── NEW LEAVE REQUEST ─────────────────────────────────────────

        onNewLeaveRequest: function () {
            var that = this;

            // Load employees and leave types for the dropdowns
            Promise.all([
                this.loadData("Employees?$select=ID,firstName,lastName&$filter=status eq 'Active'&$orderby=firstName"),
                this.loadData("LeaveTypes?$select=ID,name")
            ]).then(function (results) {
                var aEmployees = results[0];
                var aLeaveTypes = results[1];

                var oEmpSelect = new Select({ width: "100%" });
                aEmployees.forEach(function (e) {
                    oEmpSelect.addItem(new Item({ key: e.ID, text: e.firstName + " " + e.lastName }));
                });

                var oTypeSelect = new Select({ width: "100%" });
                aLeaveTypes.forEach(function (t) {
                    oTypeSelect.addItem(new Item({ key: t.ID, text: t.name }));
                });

                var oStartDate = new DatePicker({ valueFormat: "yyyy-MM-dd", displayFormat: "dd MMM yyyy" });
                var oEndDate   = new DatePicker({ valueFormat: "yyyy-MM-dd", displayFormat: "dd MMM yyyy" });
                var oReason    = new TextArea({ rows: 3, width: "100%", placeholder: "Reason for leave..." });

                var oDialog = new Dialog({
                    title: "New Leave Request",
                    contentWidth: "450px",
                    content: [
                        new SimpleForm({
                            editable: true,
                            layout: "ResponsiveGridLayout",
                            content: [
                                new Label({ text: "Employee", required: true }), oEmpSelect,
                                new Label({ text: "Leave Type", required: true }), oTypeSelect,
                                new Label({ text: "Start Date", required: true }), oStartDate,
                                new Label({ text: "End Date",   required: true }), oEndDate,
                                new Label({ text: "Reason" }),                     oReason
                            ]
                        })
                    ],
                    beginButton: new Button({
                        text: "Submit",
                        type: "Emphasized",
                        press: function () {
                            var oBody = {
                                employee_ID:  oEmpSelect.getSelectedKey(),
                                leaveType_ID: oTypeSelect.getSelectedKey(),
                                startDate:    oStartDate.getValue(),
                                endDate:      oEndDate.getValue(),
                                reason:       oReason.getValue()
                            };
                            if (!oBody.employee_ID || !oBody.leaveType_ID || !oBody.startDate || !oBody.endDate) {
                                that.showError("Please fill all required fields");
                                return;
                            }
                            that._submitLeaveRequest(oBody, oDialog);
                        }
                    }),
                    endButton: new Button({
                        text: "Cancel",
                        press: function () { oDialog.close(); oDialog.destroy(); }
                    })
                });

                that.getView().addDependent(oDialog);
                oDialog.open();
            });
        },

        _submitLeaveRequest: function (oBody, oDialog) {
            var that = this;
            fetch("/hr/LeaveRequests", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(oBody)
            })
            .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw d.error; return d; }); })
            .then(function () {
                oDialog.close();
                oDialog.destroy();
                that.showSuccess("Leave request submitted successfully");
                that.byId("leaveTable").getBinding("items").refresh();
            })
            .catch(function (e) {
                that.showError((e && e.message) || "Failed to submit leave request");
            });
        },

        // ── APPROVE / REJECT ──────────────────────────────────────────

        onApproveLeave: function (oEvent) {
            oEvent.stopPropagation();
            var oRow = oEvent.getSource().getParent().getParent();
            var sId = oRow.getBindingContext().getProperty("ID");
            var that = this;

            this.callAction("approveLeave", { leaveRequestId: sId, comments: "Approved" })
                .then(function () {
                    that.showSuccess("Leave request approved");
                    that.byId("leaveTable").getBinding("items").refresh();
                });
        },

        onRejectLeave: function (oEvent) {
            oEvent.stopPropagation();
            var oRow = oEvent.getSource().getParent().getParent();
            var sId = oRow.getBindingContext().getProperty("ID");
            var that = this;

            // Ask for reject comment via input dialog
            var oCommentInput = new TextArea({ rows: 3, width: "100%", placeholder: "Reason for rejection (required)..." });
            var oDialog = new Dialog({
                title: "Reject Leave Request",
                content: [oCommentInput],
                beginButton: new Button({
                    text: "Reject",
                    type: "Reject",
                    press: function () {
                        if (!oCommentInput.getValue().trim()) {
                            that.showError("Please provide a reason for rejection");
                            return;
                        }
                        oDialog.close();
                        oDialog.destroy();
                        that.callAction("rejectLeave", { leaveRequestId: sId, comments: oCommentInput.getValue() })
                            .then(function () {
                                that.showSuccess("Leave request rejected");
                                that.byId("leaveTable").getBinding("items").refresh();
                            });
                    }
                }),
                endButton: new Button({
                    text: "Cancel",
                    press: function () { oDialog.close(); oDialog.destroy(); }
                })
            });

            this.getView().addDependent(oDialog);
            oDialog.open();
        }
    });
});
