// background.js - Fixed Service Worker compatible background script

// On install listener
chrome.runtime.onInstalled.addListener(function (details) {
  console.log("SecureVault extension installed or updated:", details.reason);

  // Open onboarding page on install
  if (details.reason === "install") {
    chrome.tabs.create({ url: "onboarding.html" });
  }
});

// Message handler
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.action === "getVaultItems") {
    console.log("Background received getVaultItems request");

    // Get auth token
    chrome.storage.local.get(["token"], function (result) {
      if (!result.token) {
        console.log("No token found, not logged in");
        sendResponse({ success: false, error: "Not logged in" });
        return;
      }

      console.log("Token found, fetching vault items");

      // Fetch vault items from API
      fetch("https://kael.es/api/vault", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${result.token}`,
          "Content-Type": "application/json",
        },
      })
        .then((response) => {
          console.log("API response status:", response.status);
          if (!response.ok) {
            // Handle different error statuses
            if (response.status === 401) {
              throw new Error("Authentication expired. Please log in again.");
            } else if (response.status === 403) {
              throw new Error("You don't have permission to access the vault.");
            } else if (response.status === 404) {
              throw new Error("Vault not found.");
            } else {
              throw new Error(`API error: ${response.status}`);
            }
          }
          return response.json();
        })
        .then((data) => {
          console.log("API data received:", data ? "data exists" : "no data");
          if (data && data.vaultItems) {
            console.log("Number of vault items:", data.vaultItems.length);
          }
          sendResponse({ success: true, data: data });
        })
        .catch((error) => {
          console.error("API fetch error:", error);
          sendResponse({
            success: false,
            error: error.message || "Failed to fetch vault items",
          });
        });
    });

    return true; // Indicate async response
  } else if (message.action === "getVaultItemsForDomain") {
    // Handle domain-specific vault items
    console.log(
      "Background received getVaultItemsForDomain request for:",
      message.domain
    );

    if (!message.domain) {
      sendResponse({
        success: false,
        error: "No domain specified",
        vaultItems: [],
      });
      return true;
    }

    // Get auth token
    chrome.storage.local.get(["token"], function (result) {
      if (!result.token) {
        console.log("No token found, not logged in");
        sendResponse({
          success: false,
          error: "Not logged in",
          vaultItems: [],
        });
        return;
      }

      // Clean domain for API request
      const cleanDomain = message.domain.trim().toLowerCase();

      // Fetch domain-specific vault items
      fetch(
        `https://kael.es/api/vault/domain/${encodeURIComponent(cleanDomain)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${result.token}`,
            "Content-Type": "application/json",
          },
        }
      )
        .then((response) => {
          console.log("Domain API response status:", response.status);
          if (!response.ok) {
            if (response.status === 401) {
              throw new Error("Authentication expired. Please log in again.");
            } else {
              throw new Error(`API error: ${response.status}`);
            }
          }
          return response.json();
        })
        .then((data) => {
          console.log("Domain API data received for", cleanDomain);
          if (data && data.vaultItems) {
            console.log(
              "Number of domain vault items:",
              data.vaultItems.length
            );
          }

          // Even if no items found, return an empty array instead of null
          const responseData = {
            success: true,
            domain: cleanDomain,
            vaultItems: data && data.vaultItems ? data.vaultItems : [],
          };

          sendResponse(responseData);
        })
        .catch((error) => {
          console.error("Domain API fetch error:", error);
          sendResponse({
            success: false,
            error: error.message || "Failed to fetch domain items",
            domain: cleanDomain,
            vaultItems: [], // Always include empty array for consistent handling
          });
        });
    });

    return true; // Indicate async response
  }
});

// We need to declare context menus in a self-executing function
(function () {
  try {
    // Only create context menus if the API is available
    if (chrome.contextMenus) {
      // Remove existing menus to avoid duplicates
      chrome.contextMenus.removeAll(function () {
        // Create new context menus
        chrome.contextMenus.create({
          id: "secureVault",
          title: "SecureVault",
          contexts: ["page", "editable"],
        });

        chrome.contextMenus.create({
          id: "fillCredentials",
          parentId: "secureVault",
          title: "Fill Login Details",
          contexts: ["page", "editable"],
        });

        chrome.contextMenus.create({
          id: "generatePassword",
          parentId: "secureVault",
          title: "Generate Password",
          contexts: ["page", "editable"],
        });
      });
    }
  } catch (e) {
    console.error("Error setting up context menus:", e);
  }
})();

// Handle context menu clicks
if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "fillCredentials") {
      // Extract domain from current tab
      try {
        const url = new URL(tab.url);
        const domain = url.hostname;

        chrome.tabs.sendMessage(tab.id, {
          action: "showCredentialPicker",
          domain: domain,
        });
      } catch (error) {
        console.error("Error parsing URL:", error);
      }
    } else if (info.menuItemId === "generatePassword") {
      // Send message to content script to show password generator popup
      chrome.tabs.sendMessage(tab.id, {
        action: "showPasswordGenerator",
      });
    }
  });
}

// Handle tab updates for autofill detection
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    !tab.url.startsWith("chrome://") &&
    !tab.url.startsWith("chrome-extension://")
  ) {
    // Check if user is logged in first
    chrome.storage.local.get(["token", "encryptionKey"], function (result) {
      if (result.token && result.encryptionKey) {
        // Only inject if user is logged in and has encryption key
        try {
          chrome.scripting
            .executeScript({
              target: { tabId: tabId },
              files: ["autofill-detector.js"],
            })
            .catch((err) =>
              console.error("Failed to inject autofill detector:", err)
            );
        } catch (e) {
          console.error("Error executing script:", e);
        }
      }
    });
  }
});
