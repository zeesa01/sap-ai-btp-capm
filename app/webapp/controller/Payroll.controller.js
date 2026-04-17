sap.ui.define([
    "hr/fiori/controller/BaseController",
    "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Select",
    "sap/ui/core/Item", "sap/m/Label", "sap/m/List", "sap/m/StandardListItem",
    "sap/ui/layout/form/SimpleForm",
    "sap/ui/model/json/JSONModel"
], function (BaseController, Dialog, Button, Input, Select, Item, Label,
             List, StandardListItem, SimpleForm, JSONModel) {
    "use strict";

    return BaseController.extend("hr.fiori.controller.Payroll", {

        onInit: function () {
            this.getRouter().getRoute("payroll").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var oBinding = this.byId("payrollTable").getBinding("items");
            if (oBinding) oBinding.refresh();
        },

        onRefresh: function () {
            this.byId("payrollTable").getBinding("items").refresh();
        },

        onNewRecord: function () {
            var that = this;
            this.loadData("Employees?$select=ID,firstName,lastName&$filter=status eq 'Active'&$orderby=firstName")
                .then(function (aEmps) {
                    var oEmpSelect = new Select({ width: "100%" });
                    aEmps.forEach(function (e) {
                        oEmpSelect.addItem(new Item({ key: e.ID, text: e.firstName + " " + e.lastName }));
                    });

                    var now = new Date();
                    var fields = {
                        month: new Input({ type: "Number", value: now.getMonth() + 1, placeholder: "1-12" }),
                        year:  new Input({ type: "Number", value: now.getFullYear() }),
                        base:  new Input({ type: "Number", placeholder: "Base salary" }),
                        bonus: new Input({ type: "Number", value: "0", placeholder: "Bonus amount" }),
                        deductions: new Input({ type: "Number", value: "0", placeholder: "Deductions" })
                    };

                    var oDialog = new Dialog({
                        title: "New Payroll Record",
                        contentWidth: "400px",
                        content: [
                            new SimpleForm({
                                editable: true,
                                layout: "ResponsiveGridLayout",
                                content: [
                                    new Label({ text: "Employee", required: true }), oEmpSelect,
                                    new Label({ text: "Month (1-12)", required: true }), fields.month,
                                    new Label({ text: "Year", required: true }),         fields.year,
                                    new Label({ text: "Base Salary" }),                  fields.base,
                                    new Label({ text: "Bonus" }),                        fields.bonus,
                                    new Label({ text: "Deductions" }),                   fields.deductions
                                ]
                            })
                        ],
                        beginButton: new Button({
                            text: "Create",
                            type: "Emphasized",
                            press: function () {
                                var oBody = {
                                    employee_ID: oEmpSelect.getSelectedKey(),
                                    month:       parseInt(fields.month.getValue()),
                                    year:        parseInt(fields.year.getValue()),
                                    baseSalary:  parseFloat(fields.base.getValue()) || 0,
                                    bonus:       parseFloat(fields.bonus.getValue()) || 0,
                                    deductions:  parseFloat(fields.deductions.getValue()) || 0,
                                    currency:    "USD",
                                    status:      "Draft"
                                };
                                fetch("/hr/PayrollRecords", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", Accept: "application/json" },
                                    body: JSON.stringify(oBody)
                                })
                                .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw d.error; return d; }); })
                                .then(function () {
                                    oDialog.close(); oDialog.destroy();
                                    that.showSuccess("Payroll record created");
                                    that.byId("payrollTable").getBinding("items").refresh();
                                })
                                .catch(function (e) { that.showError((e && e.message) || "Failed to create record"); });
                            }
                        }),
                        endButton: new Button({ text: "Cancel", press: function () { oDialog.close(); oDialog.destroy(); } })
                    });

                    that.getView().addDependent(oDialog);
                    oDialog.open();
                });
        },

        onCalculate: function (oEvent) {
            var oRow = oEvent.getSource().getParent().getParent();
            var sId  = oRow.getBindingContext().getProperty("ID");
            var that = this;
            this.setBusy(true);

            this.callAction("calculatePayroll", { payrollRecordId: sId })
                .then(function (result) {
                    that.showSuccess("Net pay calculated: " + result.netPay + " USD");
                    that.byId("payrollTable").getBinding("items").refresh();
                })
                .finally(function () { that.setBusy(false); });
        },

        onDetectAnomalies: function () {
            var now = new Date();
            var that = this;
            this.setBusy(true);

            this.callAction("detectPayrollAnomalies", {
                month: now.getMonth() + 1,
                year:  now.getFullYear()
            })
            .then(function (aAnomalies) {
                if (!aAnomalies || aAnomalies.length === 0) {
                    that.showSuccess("No anomalies detected in current month's payroll");
                    return;
                }
                var oList = new List({
                    items: aAnomalies.map(function (a) {
                        return new StandardListItem({
                            title:       a.employeeName || "Unknown",
                            description: a.anomaly,
                            icon:        "sap-icon://alert",
                            iconInset:   false
                        });
                    })
                });

                var oDialog = new Dialog({
                    title: "Payroll Anomalies Detected (" + aAnomalies.length + ")",
                    contentWidth: "600px",
                    content: [oList],
                    endButton: new Button({
                        text: "Close",
                        press: function () { oDialog.close(); oDialog.destroy(); }
                    })
                });

                that.getView().addDependent(oDialog);
                oDialog.open();
                that.byId("payrollTable").getBinding("items").refresh();
            })
            .finally(function () { that.setBusy(false); });
        }
    });
});
