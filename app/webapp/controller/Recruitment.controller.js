sap.ui.define([
    "hr/fiori/controller/BaseController",
    "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/TextArea",
    "sap/m/Select", "sap/ui/core/Item", "sap/m/Label", "sap/m/CheckBox",
    "sap/m/Text", "sap/m/Panel", "sap/m/Table", "sap/m/Column",
    "sap/m/ColumnListItem", "sap/m/ObjectStatus", "sap/m/ObjectNumber",
    "sap/ui/layout/form/SimpleForm",
    "sap/ui/model/json/JSONModel"
], function (BaseController, Dialog, Button, Input, TextArea,
             Select, Item, Label, CheckBox, Text, Panel,
             Table, Column, ColumnListItem, ObjectStatus, ObjectNumber,
             SimpleForm, JSONModel) {
    "use strict";

    return BaseController.extend("hr.fiori.controller.Recruitment", {

        onInit: function () {
            this.getRouter().getRoute("recruitment").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var oBinding = this.byId("jobTable").getBinding("items");
            if (oBinding) oBinding.refresh();
        },

        onRefresh: function () {
            this.byId("jobTable").getBinding("items").refresh();
        },

        onJobPress: function () { /* could expand to detail */ },

        // ── NEW JOB POSTING ──────────────────────────────────────────

        onNewJobPosting: function () {
            var that = this;
            this.loadData("Departments?$select=ID,name&$orderby=name").then(function (aDepts) {

                var oDeptSelect = new Select({ width: "100%" });
                aDepts.forEach(function (d) { oDeptSelect.addItem(new Item({ key: d.ID, text: d.name })); });

                var fields = {
                    title:    new Input({ placeholder: "e.g. Senior SAP Developer", width: "100%" }),
                    location: new Input({ placeholder: "City, Country", width: "100%" }),
                    remote:   new CheckBox({ text: "Remote Work Available" }),
                    req:      new TextArea({ rows: 4, width: "100%", placeholder: "Required skills and experience..." }),
                    salMin:   new Input({ type: "Number", placeholder: "Min salary", width: "100%" }),
                    salMax:   new Input({ type: "Number", placeholder: "Max salary", width: "100%" }),
                    closing:  new Input({ type: "Date", width: "100%" })
                };

                var oDialog = new Dialog({
                    title: "New Job Posting",
                    contentWidth: "520px",
                    verticalScrolling: true,
                    content: [
                        new SimpleForm({
                            editable: true,
                            layout: "ResponsiveGridLayout",
                            content: [
                                new Label({ text: "Job Title",    required: true }), fields.title,
                                new Label({ text: "Department" }), oDeptSelect,
                                new Label({ text: "Location" }),   fields.location,
                                new Label({ text: "" }),           fields.remote,
                                new Label({ text: "Requirements" }), fields.req,
                                new Label({ text: "Min Salary (USD)" }), fields.salMin,
                                new Label({ text: "Max Salary (USD)" }), fields.salMax,
                                new Label({ text: "Closing Date" }),     fields.closing
                            ]
                        })
                    ],
                    beginButton: new Button({
                        text: "Create Posting",
                        type: "Emphasized",
                        press: function () {
                            var oBody = {
                                title:          fields.title.getValue(),
                                department_ID:  oDeptSelect.getSelectedKey(),
                                location:       fields.location.getValue(),
                                isRemote:       fields.remote.getSelected(),
                                requirements:   fields.req.getValue(),
                                salary_min:     parseFloat(fields.salMin.getValue()) || 0,
                                salary_max:     parseFloat(fields.salMax.getValue()) || 0,
                                currency:       "USD",
                                closingDate:    fields.closing.getValue(),
                                status:         "Open"
                            };
                            if (!oBody.title) { that.showError("Job title is required"); return; }
                            fetch("/hr/JobPostings", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", Accept: "application/json" },
                                body: JSON.stringify(oBody)
                            })
                            .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw d.error; return d; }); })
                            .then(function () {
                                oDialog.close(); oDialog.destroy();
                                that.showSuccess("Job posting created");
                                that.byId("jobTable").getBinding("items").refresh();
                            })
                            .catch(function (e) { that.showError((e && e.message) || "Failed to create posting"); });
                        }
                    }),
                    endButton: new Button({ text: "Cancel", press: function () { oDialog.close(); oDialog.destroy(); } })
                });

                that.getView().addDependent(oDialog);
                oDialog.open();
            });
        },

        // ── AI: Generate Job Description ─────────────────────────────

        onGenerateDescription: function (oEvent) {
            oEvent.stopPropagation();
            var oRow = oEvent.getSource().getParent().getParent();
            var oCtx = oRow.getBindingContext();
            var that = this;

            this.setBusy(true);
            this.callAction("generateJobDescription", {
                jobTitle:    oCtx.getProperty("title"),
                department:  oCtx.getProperty("department/name") || "",
                requirements: oCtx.getProperty("requirements") || "",
                salaryRange: oCtx.getProperty("salary_min") + " - " + oCtx.getProperty("salary_max") + " USD"
            })
            .then(function (sDesc) {
                var oDialog = new Dialog({
                    title: "AI-Generated Job Description",
                    contentWidth: "700px",
                    verticalScrolling: true,
                    content: [
                        new TextArea({
                            value: sDesc,
                            rows: 20,
                            width: "100%",
                            editable: true
                        }).addStyleClass("sapUiSmallMargin")
                    ],
                    beginButton: new Button({
                        text: "Save to Posting",
                        type: "Emphasized",
                        press: function () {
                            var sId = oCtx.getProperty("ID");
                            fetch("/hr/JobPostings('" + sId + "')", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ description: sDesc, aiGeneratedDescription: sDesc })
                            }).then(function () {
                                oDialog.close(); oDialog.destroy();
                                that.showSuccess("Job description saved");
                                that.byId("jobTable").getBinding("items").refresh();
                            });
                        }
                    }),
                    endButton: new Button({ text: "Close", press: function () { oDialog.close(); oDialog.destroy(); } })
                });
                that.getView().addDependent(oDialog);
                oDialog.open();
            })
            .finally(function () { that.setBusy(false); });
        },

        // ── View Applications + AI Screen ────────────────────────────

        onViewApplications: function (oEvent) {
            oEvent.stopPropagation();
            var oRow = oEvent.getSource().getParent().getParent();
            var sJobId  = oRow.getBindingContext().getProperty("ID");
            var sJobTitle = oRow.getBindingContext().getProperty("title");
            var that = this;

            this.loadData("JobApplications?$filter=jobPosting_ID eq '" + sJobId + "'&$orderby=appliedAt desc")
                .then(function (aApps) {
                    var oAppModel = new JSONModel(aApps);

                    var oAppTable = new Table({
                        items: {
                            path: "/",
                            model: "apps",
                            template: new ColumnListItem({
                                cells: [
                                    new Text({ text: "{apps>candidateName}" }),
                                    new Text({ text: "{apps>candidateEmail}" }),
                                    new ObjectStatus({ text: "{apps>status}" }),
                                    new ObjectNumber({ number: "{apps>aiScore}", unit: "/100" }),
                                    new ObjectStatus({
                                        text: "{= ${apps>aiRecommendation} ? ${apps>aiRecommendation} : 'Not Screened'}",
                                        state: "{= ${apps>aiRecommendation} === 'Strongly Recommend' ? 'Success' : ${apps>aiRecommendation} === 'Pass' ? 'Error' : 'None'}"
                                    }),
                                    new Button({
                                        icon: "sap-icon://da",
                                        type: "Transparent",
                                        tooltip: "Screen with AI",
                                        press: function (oEv) {
                                            var sAppId = oEv.getSource().getBindingContext("apps").getProperty("ID");
                                            that.setBusy(true);
                                            that.callAction("screenApplication", { applicationId: sAppId })
                                                .then(function (result) {
                                                    oAppModel.refresh();
                                                    that.showSuccess("AI score: " + result.score + " — " + result.recommendation);
                                                })
                                                .finally(function () { that.setBusy(false); });
                                        }
                                    })
                                ]
                            })
                        },
                        columns: [
                            new Column({ header: new Text({ text: "Candidate" }) }),
                            new Column({ header: new Text({ text: "Email" }) }),
                            new Column({ header: new Text({ text: "Status" }) }),
                            new Column({ header: new Text({ text: "AI Score" }) }),
                            new Column({ header: new Text({ text: "AI Recommendation" }) }),
                            new Column({ header: new Text({ text: "Screen" }) })
                        ],
                        noDataText: "No applications yet"
                    });

                    // Also add "New Application" area
                    var oCandidateName  = new Input({ placeholder: "Full Name", width: "100%" });
                    var oCandidateEmail = new Input({ type: "Email", placeholder: "email@example.com", width: "100%" });
                    var oResume = new TextArea({ rows: 6, width: "100%", placeholder: "Paste resume text here..." });
                    var oCover  = new TextArea({ rows: 4, width: "100%", placeholder: "Cover letter..." });

                    var oDialog = new Dialog({
                        title: "Applications: " + sJobTitle,
                        contentWidth: "800px",
                        verticalScrolling: true,
                        content: [
                            new Panel({
                                headerText: "Existing Applications",
                                content: [oAppTable]
                            }),
                            new Panel({
                                headerText: "Add New Application",
                                expandable: true,
                                expanded: false,
                                content: [
                                    new SimpleForm({
                                        editable: true,
                                        layout: "ResponsiveGridLayout",
                                        content: [
                                            new Label({ text: "Candidate Name", required: true }), oCandidateName,
                                            new Label({ text: "Email", required: true }),           oCandidateEmail,
                                            new Label({ text: "Resume / CV" }),                     oResume,
                                            new Label({ text: "Cover Letter" }),                    oCover
                                        ]
                                    })
                                ]
                            })
                        ],
                        beginButton: new Button({
                            text: "Submit Application",
                            type: "Emphasized",
                            press: function () {
                                if (!oCandidateName.getValue() || !oCandidateEmail.getValue()) {
                                    that.showError("Candidate name and email are required"); return;
                                }
                                fetch("/hr/JobApplications", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", Accept: "application/json" },
                                    body: JSON.stringify({
                                        jobPosting_ID:   sJobId,
                                        candidateName:   oCandidateName.getValue(),
                                        candidateEmail:  oCandidateEmail.getValue(),
                                        resumeText:      oResume.getValue(),
                                        coverLetter:     oCover.getValue(),
                                        appliedAt:       new Date().toISOString()
                                    })
                                })
                                .then(function (r) { return r.json(); })
                                .then(function (d) {
                                    aApps.push(d);
                                    oAppModel.setData(aApps);
                                    that.showSuccess("Application submitted");
                                });
                            }
                        }),
                        endButton: new Button({ text: "Close", press: function () { oDialog.close(); oDialog.destroy(); } })
                    });

                    oDialog.setModel(oAppModel, "apps");
                    that.getView().addDependent(oDialog);
                    oDialog.open();
                });
        }
    });
});
