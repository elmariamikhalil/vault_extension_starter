// background.js - Fixed Service Worker compatible background script

// On install listener
chrome.runtime.onInstalled.addListener(function (details) {
  console.log("SecureVault extension installed or updated:", details.reason);

  // Open onboarding page on install
  if (details.reason === "install") {
    chrome.tabs.create({ url: "onboarding.html" });
  }
});

// Token refresh handler - Added to fix 401 errors
async function refreshAuthToken() {
  try {
    const result = await chrome.storage.local.get(["refreshToken"]);

    if (!result.refreshToken) {
      console.error("No refresh token available");
      return null;
    }

    const response = await fetch("https://kael.es/api/auth/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken: result.refreshToken }),
    });

    if (!response.ok) {
      throw new Error(`Refresh token error: ${response.status}`);
    }

    const data = await response.json();

    // Save the new token
    await chrome.storage.local.set({
      token: data.token,
      refreshToken: data.refreshToken || result.refreshToken,
    });

    console.log("Auth token refreshed successfully");
    return data.token;
  } catch (error) {
    console.error("Failed to refresh token:", error);
    return null;
  }
}

// Helper function to handle API requests with token refresh
async function authenticatedFetch(url, options = {}) {
  let result = await chrome.storage.local.get(["token"]);
  let token = result.token;

  if (!token) {
    throw new Error("Not authenticated");
  }

  // Ensure headers are set
  options.headers = options.headers || {};
  options.headers["Authorization"] = `Bearer ${token}`;
  options.headers["Content-Type"] = "application/json";

  // Make the request
  let response = await fetch(url, options);

  // If unauthorized, try to refresh the token
  if (response.status === 401) {
    console.log("Token expired, attempting refresh");
    const newToken = await refreshAuthToken();

    if (newToken) {
      // Update the authorization header
      options.headers["Authorization"] = `Bearer ${newToken}`;

      // Retry the request
      response = await fetch(url, options);
    } else {
      throw new Error("Authentication expired. Please log in again.");
    }
  }

  return response;
}

// Message handler
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.action === "getVaultItems") {
    console.log("Background received getVaultItems request");

    // Using the new authenticated fetch with token refresh
    (async () => {
      try {
        const response = await authenticatedFetch("https://kael.es/api/vault");

        if (!response.ok) {
          // Handle other error statuses
          if (response.status === 403) {
            throw new Error("You don't have permission to access the vault.");
          } else if (response.status === 404) {
            throw new Error("Vault not found.");
          } else {
            throw new Error(`API error: ${response.status}`);
          }
        }

        const data = await response.json();
        console.log("API data received:", data ? "data exists" : "no data");
        if (data && data.vaultItems) {
          console.log("Number of vault items:", data.vaultItems.length);
        }
        sendResponse({ success: true, data: data });
      } catch (error) {
        console.error("API fetch error:", error);
        sendResponse({
          success: false,
          error: error.message || "Failed to fetch vault items",
        });
      }
    })();

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

    // Using the new authenticated fetch with token refresh
    (async () => {
      try {
        const cleanDomain = message.domain.trim().toLowerCase();
        const response = await authenticatedFetch(
          `https://kael.es/api/vault/domain/${encodeURIComponent(cleanDomain)}`
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        console.log("Domain API data received for", cleanDomain);
        if (data && data.vaultItems) {
          console.log("Number of domain vault items:", data.vaultItems.length);
        }

        // Even if no items found, return an empty array instead of null
        const responseData = {
          success: true,
          domain: cleanDomain,
          vaultItems: data && data.vaultItems ? data.vaultItems : [],
        };

        sendResponse(responseData);
      } catch (error) {
        console.error("Domain API fetch error:", error);
        sendResponse({
          success: false,
          error: error.message || "Failed to fetch domain items",
          domain: message.domain,
          vaultItems: [], // Always include empty array for consistent handling
        });
      }
    })();

    return true; // Indicate async response
  } else if (message.action === "getDecryptedItem") {
    // Get specified vault item and decrypt it
    (async () => {
      try {
        if (!message.itemId) {
          throw new Error("No item ID specified");
        }

        const result = await chrome.storage.local.get([
          "token",
          "encryptionKey",
        ]);
        if (!result.token || !result.encryptionKey) {
          throw new Error("Not authenticated or missing encryption key");
        }

        const response = await authenticatedFetch(
          `https://kael.es/api/vault/item/${message.itemId}`
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const item = await response.json();

        if (!item || !item.encryptedData) {
          throw new Error("Invalid item data returned from API");
        }

        // Decrypt the item data
        const decryptedData = await decryptData(
          item.encryptedData,
          result.encryptionKey
        );

        sendResponse({
          success: true,
          data: decryptedData,
        });
      } catch (error) {
        console.error("Error getting decrypted item:", error);
        sendResponse({
          success: false,
          error: error.message || "Failed to decrypt item",
        });
      }
    })();

    return true; // Indicate async response
  } else if (message.action === "loginFormDetected") {
    console.log("Login form detected on:", message.domain || message.url);

    // If we have domain info, fetch credentials for autofill suggestions
    if (message.domain) {
      chrome.storage.local.get(["token"], function (result) {
        if (result.token) {
          // Optional: Notify the user that credentials are available
          chrome.action.setBadgeText({
            text: "🔑",
            tabId: sender.tab?.id,
          });
          chrome.action.setBadgeBackgroundColor({
            color: "#1a478d",
            tabId: sender.tab?.id,
          });

          // Send success response to content script
          sendResponse({ success: true });
        }
      });
      return true; // Indicates async response
    }
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
  // Only act when the page is fully loaded
  if (changeInfo.status === "complete" && tab.url) {
    // Skip chrome:// and chrome-extension:// URLs which can't be injected
    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("about:") ||
      tab.url.startsWith("edge://") ||
      tab.url.startsWith("brave://")
    ) {
      return;
    }

    // Check if user is logged in
    chrome.storage.local.get(["token", "encryptionKey"], function (result) {
      if (result.token && result.encryptionKey) {
        try {
          // Inject the autofill detector script
          chrome.scripting
            .executeScript({
              target: { tabId: tabId },
              files: ["autofill-detector.js"],
            })
            .catch((err) => {
              // This is generally expected for restricted URLs, so only log if it's an unexpected error
              if (!err.message.includes("Cannot access")) {
                console.error("Failed to inject autofill detector:", err);
              }
            });
        } catch (e) {
          // This is expected for some URLs, so only log if it's an unexpected error
          if (!e.message.includes("Cannot access")) {
            console.error("Error executing script:", e);
          }
        }
      }
    });
  }
});

// Encryption/Decryption Utilities
// Base64 conversion functions
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error("Invalid base64 string:", e);
    throw new Error("Invalid encryption data format");
  }
}

// Fixed decryption function with better error handling
async function decryptData(encryptedData, encryptionKeyBase64) {
  try {
    if (!encryptedData || typeof encryptedData !== "string") {
      throw new Error("Invalid encrypted data format");
    }

    // Convert Base64 key to CryptoKey
    const encryptionKeyBuffer = base64ToArrayBuffer(encryptionKeyBase64);

    // Import the key for AES-GCM decryption
    const encryptionKey = await window.crypto.subtle.importKey(
      "raw",
      encryptionKeyBuffer,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    // Convert encrypted data to buffer
    const encryptedBuffer = base64ToArrayBuffer(encryptedData);

    // Validation check
    if (encryptedBuffer.length <= 12) {
      throw new Error("Invalid encrypted data: too short");
    }

    // Extract IV (first 12 bytes)
    const iv = encryptedBuffer.slice(0, 12);

    // Extract encrypted data (remaining bytes)
    const dataBuffer = encryptedBuffer.slice(12);

    // Decrypt
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      encryptionKey,
      dataBuffer
    );

    // Convert to string
    const decoder = new TextDecoder();
    const decryptedString = decoder.decode(decryptedBuffer);

    // Parse JSON
    try {
      return JSON.parse(decryptedString);
    } catch (e) {
      // If JSON parsing fails, return the raw string
      return decryptedString;
    }
  } catch (error) {
    console.error("Error decrypting data:", error);
    throw error;
  }
}
