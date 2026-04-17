sap.ui.define([
    "hr/fiori/controller/BaseController",
    "sap/m/HBox",
    "sap/m/VBox",
    "sap/m/Text",
    "sap/m/Panel",
    "sap/m/Avatar",
    "sap/m/BusyIndicator"
], function (BaseController, HBox, VBox, Text, Panel, Avatar, BusyIndicator) {
    "use strict";

    return BaseController.extend("hr.fiori.controller.AIAssistant", {

        // Unique session ID for this conversation (groups messages on the server)
        _sessionId: null,

        onInit: function () {
            this.getRouter().getRoute("aiAssistant").attachPatternMatched(this._onRouteMatched, this);
            // Generate a session ID once — persists for the entire browser session
            this._sessionId = "session-" + Date.now() + "-" + Math.random().toString(36).slice(2);
        },

        _onRouteMatched: function () {
            // Focus the input field whenever the user navigates to this page
            var oInput = this.byId("chatInput");
            if (oInput) {
                setTimeout(function () { oInput.focus(); }, 300);
            }
        },

        // ── SEND MESSAGE ─────────────────────────────────────────────

        onSendMessage: function () {
            var oInput  = this.byId("chatInput");
            var sMessage = oInput.getValue().trim();
            if (!sMessage) return;

            // Clear input immediately for good UX
            oInput.setValue("");

            // Add user message bubble to the chat
            this._addMessageBubble("user", sMessage);

            // Show a typing indicator
            var oBusyItem = this._addTypingIndicator();

            // Disable send button while waiting
            this.byId("sendButton").setEnabled(false);

            var that = this;

            // Call the CAP chat action on the server
            // The server handles: loading conversation history, calling AI, saving response
            this.callAction("chat", {
                sessionId:  this._sessionId,
                message:    sMessage,
                context:    "general"
                // employeeId: omitted — would be set from logged-in user in real app
            })
            .then(function (sResponse) {
                // Remove typing indicator and show AI response
                that._removeTypingIndicator(oBusyItem);
                that._addMessageBubble("assistant", sResponse);
            })
            .catch(function () {
                that._removeTypingIndicator(oBusyItem);
                that._addMessageBubble("assistant", that.getText("aiErrorMsg"));
            })
            .finally(function () {
                that.byId("sendButton").setEnabled(true);
                oInput.focus();
                // Scroll to bottom after rendering
                setTimeout(function () { that._scrollToBottom(); }, 100);
            });

            // Scroll to bottom to show user's message immediately
            setTimeout(function () { that._scrollToBottom(); }, 50);
        },

        // ── UI HELPERS ───────────────────────────────────────────────

        /*
         * _addMessageBubble(role, text)
         * Creates a message row and appends it to the chat VBox.
         * User messages appear right-aligned.
         * Assistant messages appear left-aligned with an avatar.
         */
        _addMessageBubble: function (sRole, sText) {
            var oChatMessages = this.byId("chatMessages");
            var bIsUser = (sRole === "user");

            // Create message bubble panel
            var oPanel = new Panel({
                width: "75%",
                content: [
                    new Text({
                        text: sText,
                        wrapping: true
                    }).addStyleClass("sapUiSmallMargin")
                ]
            });

            // Style based on role
            if (bIsUser) {
                oPanel.addStyleClass("hrUserMessage");
            } else {
                oPanel.addStyleClass("hrAssistantMessage");
            }

            var oRow;
            if (bIsUser) {
                // User: right-aligned, no avatar
                oRow = new HBox({
                    justifyContent: "End",
                    items: [oPanel]
                }).addStyleClass("sapUiSmallMarginBottom");
            } else {
                // Assistant: left-aligned, with HR avatar
                var oAvatar = new Avatar({
                    initials: "HR",
                    displaySize: "S",
                    backgroundColor: "Accent5"
                }).addStyleClass("sapUiSmallMarginEnd sapUiSmallMarginTop");

                oRow = new HBox({
                    items: [oAvatar, oPanel]
                }).addStyleClass("sapUiSmallMarginBottom");
            }

            oRow.data("chatRole", sRole);
            oChatMessages.addItem(oRow);
            return oRow;
        },

        _addTypingIndicator: function () {
            var oChatMessages = this.byId("chatMessages");
            var oAvatar = new Avatar({
                initials: "HR", displaySize: "S", backgroundColor: "Accent5"
            }).addStyleClass("sapUiSmallMarginEnd sapUiSmallMarginTop");

            var oBusy = new BusyIndicator({ size: "0.8rem" }).addStyleClass("sapUiSmallMargin");

            var oRow = new HBox({
                items: [
                    oAvatar,
                    new Panel({ width: "150px", content: [oBusy] })
                ]
            }).addStyleClass("sapUiSmallMarginBottom");

            oRow.data("typing", true);
            oChatMessages.addItem(oRow);
            return oRow;
        },

        _removeTypingIndicator: function (oRow) {
            var oChatMessages = this.byId("chatMessages");
            oChatMessages.removeItem(oRow);
            oRow.destroy();
        },

        _scrollToBottom: function () {
            var oScroll = this.byId("chatScrollContainer");
            if (oScroll) {
                oScroll.scrollTo(0, 99999, 300); // x, y, duration ms
            }
        },

        // ── CLEAR CHAT ───────────────────────────────────────────────

        onClearChat: function () {
            var oChatMessages = this.byId("chatMessages");

            // Remove all messages except the welcome message (id="welcomeMsg")
            var aItems = oChatMessages.getItems().slice(); // copy array
            aItems.forEach(function (oItem) {
                if (oItem.getId() !== "welcomeMsg") {
                    oChatMessages.removeItem(oItem);
                    oItem.destroy();
                }
            });

            // Generate a new session ID so history starts fresh
            this._sessionId = "session-" + Date.now() + "-" + Math.random().toString(36).slice(2);

            this.showSuccess("Conversation cleared");
        }
    });
});
