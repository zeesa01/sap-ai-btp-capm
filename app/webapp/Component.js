sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device"
], function (UIComponent, Device) {
    "use strict";

    /*
     * Component.js — The application component.
     *
     * WHAT IS A COMPONENT?
     * In UI5, a "Component" is the self-contained root of your application.
     * It reads manifest.json to set up:
     *   - the root view (App.view.xml)
     *   - all models (OData, i18n, JSON)
     *   - the router (for navigation between pages)
     *
     * Think of it like the "main class" of your UI5 app.
     * UI5 creates exactly one instance of this when the app starts.
     *
     * LIFECYCLE:
     *   1. UIComponent.extend() → define the class
     *   2. init()               → called once on startup
     *      - super.init()       → reads manifest.json, creates models, creates root view
     *      - getRouter().init() → activates URL-based routing
     */
    return UIComponent.extend("hr.fiori.Component", {

        // metadata.manifest: "json" tells UI5 to read manifest.json automatically
        metadata: {
            manifest: "json"
        },

        init: function () {
            // Always call the parent init first.
            // This is where UI5 reads manifest.json, creates all models,
            // creates the root view (App.view.xml), and wires everything up.
            UIComponent.prototype.init.apply(this, arguments);

            // Initialize the router.
            // The router reads the "routing" section from manifest.json
            // and starts listening to URL hash changes (e.g. #/employees)
            // When the hash changes, it loads the matching view into the NavContainer.
            this.getRouter().initialize();
        },

        // getContentDensityClass is a helper that returns:
        //   "sapUiSizeCompact"  → for desktop (smaller, denser UI)
        //   "sapUiSizeCozy"     → for touch/mobile (larger tap targets)
        // Applied to the root view so all controls inside inherit the density.
        getContentDensityClass: function () {
            if (!this._sContentDensityClass) {
                this._sContentDensityClass = Device.support.touch ? "sapUiSizeCozy" : "sapUiSizeCompact";
            }
            return this._sContentDensityClass;
        }
    });
});
