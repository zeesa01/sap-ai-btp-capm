sap.ui.define([
    "hr/fiori/controller/BaseController",
    "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/TextArea",
    "sap/m/Select", "sap/ui/core/Item", "sap/m/Label", "sap/m/StepInput",
    "sap/m/Text", "sap/m/Panel",
    "sap/ui/layout/form/SimpleForm",
    "sap/ui/model/json/JSONModel"
], function (BaseController, Dialog, Button, Input, TextArea,
             Select, Item, Label, StepInput, Text, Panel, SimpleForm, JSONModel) {
    "use strict";

    return BaseController.extend("hr.fiori.controller.Performance", {

        onInit: function () {
            this.getRouter().getRoute("performance").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var oBinding = this.byId("perfTable").getBinding("items");
            if (oBinding) oBinding.refresh();
        },

        onRefresh: function () {
            this.byId("perfTable").getBinding("items").refresh();
        },

        onNewReview: function () {
            var that = this;
            Promise.all([
                this.loadData("Employees?$select=ID,firstName,lastName&$filter=status eq 'Active'&$orderby=firstName")
            ]).then(function (results) {
                var aEmps = results[0];

                var oEmpSelect = new Select({ width: "100%" });
                var oRevSelect = new Select({ width: "100%" });
                aEmps.forEach(function (e) {
                    var oItem = new Item({ key: e.ID, text: e.firstName + " " + e.lastName });
                    oEmpSelect.addItem(oItem.clone());
                    oRevSelect.addItem(oItem);
                });

                var fields = {
                    period:    new Input({ placeholder: "e.g. Q2 2025" }),
                    technical: new StepInput({ value: 3, min: 1, max: 5, step: 1 }),
                    comms:     new StepInput({ value: 3, min: 1, max: 5, step: 1 }),
                    teamwork:  new StepInput({ value: 3, min: 1, max: 5, step: 1 }),
                    leadership:new StepInput({ value: 3, min: 1, max: 5, step: 1 }),
                    strengths: new TextArea({ rows: 3, width: "100%", placeholder: "Key strengths..." }),
                    improve:   new TextArea({ rows: 3, width: "100%", placeholder: "Areas to improve..." }),
                    goals:     new TextArea({ rows: 3, width: "100%", placeholder: "Goals for next period..." })
                };

                var oDialog = new Dialog({
                    title: "New Performance Review",
                    contentWidth: "520px",
                    verticalScrolling: true,
                    content: [
                        new SimpleForm({
                            editable: true,
                            layout: "ResponsiveGridLayout",
                            content: [
                                new Label({ text: "Employee",     required: true }), oEmpSelect,
                                new Label({ text: "Reviewer",     required: true }), oRevSelect,
                                new Label({ text: "Review Period",required: true }), fields.period,
                                new Label({ text: "Technical Skills (1-5)" }), fields.technical,
                                new Label({ text: "Communication (1-5)" }),    fields.comms,
                                new Label({ text: "Teamwork (1-5)" }),         fields.teamwork,
                                new Label({ text: "Leadership (1-5)" }),       fields.leadership,
                                new Label({ text: "Strengths" }),              fields.strengths,
                                new Label({ text: "Areas for Improvement" }),  fields.improve,
                                new Label({ text: "Goals" }),                  fields.goals
                            ]
                        })
                    ],
                    beginButton: new Button({
                        text: "Save Review",
                        type: "Emphasized",
                        press: function () {
                            var avg = ((fields.technical.getValue() + fields.comms.getValue() +
                                        fields.teamwork.getValue() + fields.leadership.getValue()) / 4).toFixed(1);
                            var oBody = {
                                employee_ID:        oEmpSelect.getSelectedKey(),
                                reviewer_ID:        oRevSelect.getSelectedKey(),
                                reviewPeriod:       fields.period.getValue(),
                                reviewDate:         new Date().toISOString().split("T")[0],
                                technicalScore:     fields.technical.getValue(),
                                communicationScore: fields.comms.getValue(),
                                teamworkScore:      fields.teamwork.getValue(),
                                leadershipScore:    fields.leadership.getValue(),
                                overallScore:       parseFloat(avg),
                                strengths:          fields.strengths.getValue(),
                                improvements:       fields.improve.getValue(),
                                goals:              fields.goals.getValue(),
                                status:             "Submitted"
                            };
                            if (!oBody.employee_ID || !oBody.reviewPeriod) {
                                that.showError("Employee and Review Period are required");
                                return;
                            }
                            fetch("/hr/PerformanceReviews", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", Accept: "application/json" },
                                body: JSON.stringify(oBody)
                            })
                            .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw d.error; return d; }); })
                            .then(function () {
                                oDialog.close(); oDialog.destroy();
                                that.showSuccess("Review submitted");
                                that.byId("perfTable").getBinding("items").refresh();
                            })
                            .catch(function (e) { that.showError((e && e.message) || "Failed to save review"); });
                        }
                    }),
                    endButton: new Button({ text: "Cancel", press: function () { oDialog.close(); oDialog.destroy(); } })
                });

                that.getView().addDependent(oDialog);
                oDialog.open();
            });
        },

        onAnalyzeReview: function (oEvent) {
            var oRow = oEvent.getSource().getParent().getParent();
            var sId  = oRow.getBindingContext().getProperty("ID");
            var that = this;
            this.setBusy(true);

            this.callAction("analyzePerformanceReview", { reviewId: sId })
                .then(function (result) {
                    // Show AI insights in a dialog
                    var oDialog = new Dialog({
                        title: "AI Performance Insights",
                        contentWidth: "600px",
                        verticalScrolling: true,
                        content: [
                            new Panel({ headerText: "AI Analysis", content: [
                                new Text({ text: result.insights, wrapping: true }).addStyleClass("sapUiSmallMargin")
                            ]}),
                            new Panel({ headerText: "Suggested Rating", content: [
                                new Text({ text: result.suggestedRating }).addStyleClass("sapUiSmallMargin")
                            ]})
                        ],
                        endButton: new Button({ text: "Close", press: function () { oDialog.close(); oDialog.destroy(); } })
                    });
                    that.getView().addDependent(oDialog);
                    oDialog.open();
                    that.byId("perfTable").getBinding("items").refresh();
                })
                .finally(function () { that.setBusy(false); });
        }
    });
});
