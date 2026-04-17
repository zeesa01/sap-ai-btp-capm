sap.ui.define([
    "hr/fiori/controller/BaseController"
], function (BaseController) {
    "use strict";

    return BaseController.extend("hr.fiori.controller.App", {

        onInit: function () {
            // onInit runs once when the App view is created.
            // We attach a routeMatched handler to highlight the correct
            // side nav item whenever navigation happens.
            this.getRouter().attachRouteMatched(this.onRouteMatched, this);
        },

        // Called whenever a route matches (user navigates to a page).
        // We use the route name to select the correct side nav item.
        onRouteMatched: function (oEvent) {
            var sRouteName = oEvent.getParameter("name");
            var oSideNav = this.byId("sideNavigation");

            // Map route names to NavigationListItem keys
            var mRouteToKey = {
                "home":           "home",
                "employees":      "employees",
                "employeeDetail": "employees",
                "leaveRequests":  "leaveRequests",
                "performance":    "performance",
                "recruitment":    "recruitment",
                "payroll":        "payroll",
                "aiAssistant":    "aiAssistant"
            };

            var sKey = mRouteToKey[sRouteName] || "home";

            // Find the NavigationListItem with the matching key and select it
            var oNavList = oSideNav.getItem();
            this._selectNavItem(oNavList, sKey);
        },

        // Recursively find and select the nav item with the given key
        _selectNavItem: function (oNavList, sKey) {
            var aItems = oNavList.getItems();
            aItems.forEach(function (oItem) {
                if (oItem.getKey() === sKey) {
                    oItem.setSelected(true);
                } else {
                    oItem.setSelected(false);
                }
            });
        },

        // Toggle the side navigation expanded/collapsed
        onToggleSideNav: function () {
            var oToolPage = this.byId("toolPage");
            oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
        },

        // Called when a side nav item is clicked
        onNavItemSelect: function (oEvent) {
            var sKey = oEvent.getParameter("item").getKey();
            // Navigate to the route matching the key
            this.navTo(sKey);
        }

    });
});
