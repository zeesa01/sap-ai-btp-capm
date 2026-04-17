sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, History, MessageToast, MessageBox) {
    "use strict";

    /*
     * BaseController.js
     * =================
     * A base class that ALL other controllers extend.
     *
     * WHY A BASE CONTROLLER?
     * Every controller needs the same helper functions:
     *   - getRouter()         → navigate between pages
     *   - getModel()          → access the OData or i18n model
     *   - getText()           → read from i18n.properties
     *   - navBack()           → go back in history
     *   - showError/Success() → toast and dialog helpers
     *   - callAction()        → POST to a CAP OData action
     *
     * Instead of copy-pasting these into every controller,
     * we define them once here and each controller does:
     *   Controller.extend("hr.fiori.controller.Employees", { ... })
     *   → which extends BaseController
     *
     * INHERITANCE CHAIN:
     *   sap.ui.core.mvc.Controller
     *       ↑
     *   BaseController (this file)
     *       ↑
     *   Employees.controller.js / LeaveRequests.controller.js / etc.
     */
    return Controller.extend("hr.fiori.controller.BaseController", {

        // ── ROUTER ──────────────────────────────────────────────────────

        getRouter: function () {
            // getOwnerComponent() returns the Component.js instance.
            // getRouter() returns the router configured in manifest.json.
            return this.getOwnerComponent().getRouter();
        },

        navTo: function (sRoute, oParams) {
            // Navigate to a named route (defined in manifest.json routing.routes)
            // e.g. this.navTo("employeeDetail", { employeeId: "emp-1" })
            this.getRouter().navTo(sRoute, oParams || {});
        },

        navBack: function () {
            // Go back in browser history, or fall back to home if no history
            var oHistory = History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();
            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.navTo("home");
            }
        },

        // ── MODELS ──────────────────────────────────────────────────────

        getModel: function (sName) {
            // Get a named model. No name = default OData model.
            // getView().getModel() checks the view first, then walks up to component.
            return this.getView().getModel(sName);
        },

        setModel: function (oModel, sName) {
            return this.getView().setModel(oModel, sName);
        },

        getResourceBundle: function () {
            // Returns the i18n resource bundle from the i18n model
            return this.getOwnerComponent().getModel("i18n").getResourceBundle();
        },

        getText: function (sKey, aArgs) {
            // Read a translated text from i18n.properties by key.
            // e.g. this.getText("employeeCreated") → "Employee created successfully"
            // aArgs is an optional array for placeholders: {0}, {1} in the text
            return this.getResourceBundle().getText(sKey, aArgs);
        },

        // ── NOTIFICATIONS ───────────────────────────────────────────────

        showSuccess: function (sMessage) {
            // Small toast notification at the bottom — for non-critical success
            MessageToast.show(sMessage, { duration: 3000 });
        },

        showError: function (sMessage) {
            // Modal error dialog — for critical errors the user must acknowledge
            MessageBox.error(sMessage);
        },

        showConfirm: function (sMessage, fnConfirm) {
            // Confirmation dialog with OK/Cancel
            MessageBox.confirm(sMessage, {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        fnConfirm();
                    }
                }
            });
        },

        // ── BUSY STATE ──────────────────────────────────────────────────

        setBusy: function (bBusy) {
            // Show/hide a loading spinner overlay on the current view
            this.getView().setBusy(bBusy);
        },

        // ── API HELPERS ─────────────────────────────────────────────────

        /*
         * callAction(sActionPath, oBody)
         * ==============================
         * Calls a CAP OData ACTION via HTTP POST.
         *
         * WHY NOT USE UI5 OData V4 MODEL FOR ACTIONS?
         * UI5 V4 model actions require complex binding setup.
         * For custom actions (non-CRUD), using fetch() is simpler and clearer.
         *
         * sActionPath: the action path relative to /hr/
         *   e.g. "generateJobDescription" → POST /hr/generateJobDescription
         *        "approveLeave"            → POST /hr/approveLeave
         *
         * Returns: parsed JSON response or throws on error
         */
        callAction: function (sActionPath, oBody) {
            var that = this;
            return fetch("/hr/" + sActionPath, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(oBody || {})
            })
            .then(function (res) {
                return res.json().then(function (data) {
                    if (!res.ok) {
                        // CAP returns errors in { error: { message: "..." } } format
                        var sMsg = (data.error && data.error.message) || "Request failed";
                        throw new Error(sMsg);
                    }
                    // CAP wraps action return values in { value: ... }
                    return data.value !== undefined ? data.value : data;
                });
            })
            .catch(function (err) {
                that.showError(err.message || "An error occurred");
                throw err;
            });
        },

        /*
         * callFunction(sFunctionPath)
         * ===========================
         * Calls a CAP OData FUNCTION via HTTP GET.
         * Functions are read-only and don't modify data.
         *
         * sFunctionPath: e.g. "getDepartmentStats()" or "getLeaveBalance(employeeId='...',year=2025)"
         */
        callFunction: function (sFunctionPath) {
            var that = this;
            return fetch("/hr/" + sFunctionPath, {
                headers: { "Accept": "application/json" }
            })
            .then(function (res) {
                return res.json().then(function (data) {
                    if (!res.ok) {
                        var sMsg = (data.error && data.error.message) || "Request failed";
                        throw new Error(sMsg);
                    }
                    return data.value !== undefined ? data.value : data;
                });
            })
            .catch(function (err) {
                that.showError(err.message || "An error occurred");
                throw err;
            });
        },

        /*
         * loadData(sEntityPath)
         * =====================
         * Simple GET request for entity data. Returns parsed JSON.
         * sEntityPath: e.g. "Employees?$expand=department&$orderby=firstName"
         */
        loadData: function (sEntityPath) {
            return fetch("/hr/" + sEntityPath, {
                headers: { "Accept": "application/json" }
            })
            .then(function (res) { return res.json(); })
            .then(function (data) { return data.value || data; });
        }

    });
});
