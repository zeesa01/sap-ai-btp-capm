sap.ui.define([
    "hr/fiori/controller/BaseController",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Input",
    "sap/m/Select",
    "sap/ui/core/Item",
    "sap/m/Label",
    "sap/ui/layout/form/SimpleForm",
    "sap/ui/model/json/JSONModel"
], function (BaseController, Filter, FilterOperator, Dialog, Button, Input,
             Select, Item, Label, SimpleForm, JSONModel) {
    "use strict";

    return BaseController.extend("hr.fiori.controller.Employees", {

        onInit: function () {
            this.getRouter().getRoute("employees").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            // Refresh the OData binding when navigating back to this page
            var oTable = this.byId("employeeTable");
            if (oTable && oTable.getBinding("items")) {
                oTable.getBinding("items").refresh();
            }
        },

        // ── SEARCH ────────────────────────────────────────────────────

        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            var oTable = this.byId("employeeTable");
            var oBinding = oTable.getBinding("items");

            var aFilters = [];
            if (sQuery) {
                // OR filter across multiple fields using FilterOperator.Contains
                // sap.ui.model.Filter with aFilters array and bAnd=false = OR logic
                aFilters.push(new Filter({
                    filters: [
                        new Filter("firstName",  FilterOperator.Contains, sQuery),
                        new Filter("lastName",   FilterOperator.Contains, sQuery),
                        new Filter("email",      FilterOperator.Contains, sQuery),
                        new Filter("jobTitle",   FilterOperator.Contains, sQuery)
                    ],
                    and: false  // OR — match any field
                }));
            }

            // Apply status filter too if set
            var sStatus = this.byId("statusFilter").getSelectedKey();
            if (sStatus) {
                aFilters.push(new Filter("status", FilterOperator.EQ, sStatus));
            }

            // Push filters to the OData binding — CAP translates to $filter query parameter
            oBinding.filter(aFilters);
        },

        onFilterChange: function () {
            // Re-trigger search with current search text + new status filter
            this.onSearch({ getParameter: function () { return this.byId("employeeSearch").getValue(); }.bind(this) });
        },

        onRefresh: function () {
            this.byId("employeeTable").getBinding("items").refresh();
        },

        // ── NAVIGATION ────────────────────────────────────────────────

        onEmployeePress: function (oEvent) {
            // Get the binding context of the clicked row
            // The binding context holds the data path like /Employees('emp-1')
            var oContext = oEvent.getSource().getBindingContext();
            var sId = oContext.getProperty("ID");
            this.navTo("employeeDetail", { employeeId: encodeURIComponent(sId) });
        },

        // ── CREATE EMPLOYEE DIALOG ─────────────────────────────────────

        onCreateEmployee: function () {
            this._openEmployeeDialog(null);
        },

        onEditEmployee: function (oEvent) {
            // Stop the row press event from also firing
            oEvent.stopPropagation();
            var oContext = oEvent.getSource().getParent().getParent().getBindingContext();
            this._openEmployeeDialog(oContext.getObject());
        },

        _openEmployeeDialog: function (oEmployee) {
            var that = this;
            var bCreate = !oEmployee;

            // Build a JSON model for the form — isolated from OData model
            var oFormModel = new JSONModel(oEmployee || {
                firstName: "", lastName: "", email: "", phone: "",
                jobTitle: "", employmentType: "Full-Time",
                baseSalary: 0, currency: "USD", status: "Active"
            });

            // Load departments for the select dropdown
            this.loadData("Departments?$select=ID,name&$orderby=name").then(function (aDepts) {

                var oDeptSelect = new Select({ selectedKey: oEmployee ? oEmployee.department_ID : "" });
                aDepts.forEach(function (d) {
                    oDeptSelect.addItem(new Item({ key: d.ID, text: d.name }));
                });

                var oDialog = new Dialog({
                    title: bCreate ? "Create Employee" : "Edit Employee",
                    contentWidth: "500px",
                    content: [
                        new SimpleForm({
                            editable: true,
                            layout: "ResponsiveGridLayout",
                            content: [
                                new Label({ text: "First Name", required: true }),
                                new Input({ value: "{form>/firstName}", placeholder: "First Name" }),
                                new Label({ text: "Last Name", required: true }),
                                new Input({ value: "{form>/lastName}", placeholder: "Last Name" }),
                                new Label({ text: "Email", required: true }),
                                new Input({ value: "{form>/email}", type: "Email", placeholder: "email@company.com" }),
                                new Label({ text: "Phone" }),
                                new Input({ value: "{form>/phone}", type: "Tel" }),
                                new Label({ text: "Job Title" }),
                                new Input({ value: "{form>/jobTitle}" }),
                                new Label({ text: "Department" }),
                                oDeptSelect,
                                new Label({ text: "Employment Type" }),
                                new Select({
                                    selectedKey: "{form>/employmentType}",
                                    items: [
                                        new Item({ key: "Full-Time", text: "Full-Time" }),
                                        new Item({ key: "Part-Time", text: "Part-Time" }),
                                        new Item({ key: "Contract", text: "Contract" })
                                    ]
                                }),
                                new Label({ text: "Base Salary (USD)" }),
                                new Input({ value: "{form>/baseSalary}", type: "Number" })
                            ]
                        })
                    ],
                    beginButton: new Button({
                        text: bCreate ? "Create" : "Save",
                        type: "Emphasized",
                        press: function () {
                            var oData = oFormModel.getData();
                            oData.department_ID = oDeptSelect.getSelectedKey();
                            that._saveEmployee(oData, oEmployee ? oEmployee.ID : null, oDialog);
                        }
                    }),
                    endButton: new Button({
                        text: "Cancel",
                        press: function () { oDialog.close(); oDialog.destroy(); }
                    }),
                    afterClose: function () { oDialog.destroy(); }
                });

                oDialog.setModel(oFormModel, "form");
                that.getView().addDependent(oDialog);
                oDialog.open();
            });
        },

        _saveEmployee: function (oData, sId, oDialog) {
            var that = this;
            var sMethod = sId ? "PATCH" : "POST";
            var sUrl = "/hr/Employees" + (sId ? "('" + sId + "')" : "");

            fetch(sUrl, {
                method: sMethod,
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(oData)
            })
            .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw d.error; return d; }); })
            .then(function () {
                oDialog.close();
                oDialog.destroy();
                that.showSuccess(sId ? "Employee updated successfully" : "Employee created successfully");
                that.byId("employeeTable").getBinding("items").refresh();
            })
            .catch(function (e) {
                that.showError((e && e.message) || "Failed to save employee");
            });
        },

        // ── DELETE ─────────────────────────────────────────────────────

        onDeleteEmployee: function (oEvent) {
            oEvent.stopPropagation();
            var oContext = oEvent.getSource().getParent().getParent().getBindingContext();
            var sId = oContext.getProperty("ID");
            var sName = oContext.getProperty("firstName") + " " + oContext.getProperty("lastName");
            var that = this;

            this.showConfirm("Delete employee " + sName + "? This cannot be undone.", function () {
                fetch("/hr/Employees('" + sId + "')", { method: "DELETE" })
                    .then(function (r) {
                        if (r.ok || r.status === 204) {
                            that.showSuccess("Employee deleted");
                            that.byId("employeeTable").getBinding("items").refresh();
                        } else {
                            r.json().then(function (d) { that.showError((d.error && d.error.message) || "Delete failed"); });
                        }
                    });
            });
        },

        onSelectionChange: function () {}
    });
});
