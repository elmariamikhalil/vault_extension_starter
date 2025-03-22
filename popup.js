// popup.js - SecureVault browser extension with direct API access

document.addEventListener("DOMContentLoaded", function () {
  console.log("SecureVault extension initialized");

  // DOM Elements
  const loginContainer = document.getElementById("login-container");
  const vaultContainer = document.getElementById("vault-container");
  const passwordGeneratorContainer = document.getElementById(
    "password-generator-container"
  );
  const loginForm = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const masterPasswordInput = document.getElementById("master-password");
  const rememberEmailCheckbox = document.getElementById("remember-email");
  const logoutBtn = document.getElementById("logout-btn");
  const generatePasswordBtn = document.getElementById("generate-password-btn");
  const backToVaultBtn = document.getElementById("back-to-vault-btn");
  const generateBtn = document.getElementById("generate-btn");
  const passwordLengthInput = document.getElementById("password-length");
  const lengthValue = document.getElementById("length-value");
  const generatedPasswordInput = document.getElementById("generated-password");
  const copyPasswordBtn = document.getElementById("copy-password-btn");
  const showPasswordBtn = document.getElementById("show-password-btn");
  const searchInput = document.getElementById("search-input");
  const vaultItemsContainer = document.getElementById("vault-items");
  const recordsCount = document.getElementById("records-count");
  const addNewBtn = document.getElementById("add-new-btn");
  const settingsBtn = document.getElementById("settings-btn");
  const nextBtn = document.getElementById("next-btn");

  // API configuration
  const API_URL = "https://kael.es/api"; // Your actual API URL

  // Global variables
  let passwordVisible = false;
  let settingsMenuVisible = false;
  let vaultItems = [];
  let currentDomain = "";

  // Check if user is logged in
  chrome.storage.local.get(
    ["token", "encryptionKey", "rememberedEmail"],
    function (result) {
      // Load remembered email if available
      if (result.rememberedEmail && emailInput) {
        emailInput.value = result.rememberedEmail;
        rememberEmailCheckbox.checked = true;
      }

      if (result.token) {
        showVault();
        fixedLoadVaultItems();
        getCurrentTabInfo();
      } else {
        showLogin();
      }
    }
  );

  // Add event listeners
  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }

  if (generatePasswordBtn) {
    generatePasswordBtn.addEventListener("click", showPasswordGenerator);
  }

  if (backToVaultBtn) {
    backToVaultBtn.addEventListener("click", showVault);
  }

  if (generateBtn) {
    generateBtn.addEventListener("click", generatePassword);
  }

  if (passwordLengthInput) {
    passwordLengthInput.addEventListener("input", updateLengthValue);
    // Initialize display
    if (lengthValue) {
      lengthValue.textContent = passwordLengthInput.value;
    }
  }

  if (copyPasswordBtn) {
    copyPasswordBtn.addEventListener("click", copyGeneratedPassword);
  }

  if (showPasswordBtn) {
    showPasswordBtn.addEventListener("click", togglePasswordVisibility);
  }

  if (searchInput) {
    searchInput.addEventListener("input", filterVaultItems);
  }

  if (addNewBtn) {
    addNewBtn.addEventListener("click", handleAddNewItem);
  }

  if (settingsBtn) {
    settingsBtn.addEventListener("click", toggleSettingsMenu);
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (emailInput && emailInput.value) {
        masterPasswordInput.focus();
      }
    });
  }

  // Helper functions
  function showLogin() {
    if (loginContainer) loginContainer.classList.remove("hidden");
    if (vaultContainer) vaultContainer.classList.add("hidden");
    if (passwordGeneratorContainer)
      passwordGeneratorContainer.classList.add("hidden");
  }

  function showVault() {
    if (loginContainer) loginContainer.classList.add("hidden");
    if (vaultContainer) vaultContainer.classList.remove("hidden");
    if (passwordGeneratorContainer)
      passwordGeneratorContainer.classList.add("hidden");

    // Generate password on initial page load if not already generated
    if (
      passwordGeneratorContainer &&
      generatedPasswordInput &&
      !generatedPasswordInput.value
    ) {
      generatePassword();
    }
  }

  function showPasswordGenerator() {
    if (loginContainer) loginContainer.classList.add("hidden");
    if (vaultContainer) vaultContainer.classList.add("hidden");
    if (passwordGeneratorContainer)
      passwordGeneratorContainer.classList.remove("hidden");

    // Generate password if not already generated
    if (generatedPasswordInput && !generatedPasswordInput.value) {
      generatePassword();
    }
  }

  function handleLogin(e) {
    e.preventDefault();

    const email = emailInput.value;
    const password = masterPasswordInput.value;
    const rememberEmail = rememberEmailCheckbox.checked;

    // Simple validation
    if (!email || !password) {
      showNotification("Please enter both email and password", "error");
      return;
    }

    // Show loading state
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.textContent;
    submitBtn.textContent = "Signing in...";
    submitBtn.disabled = true;

    // Store remember email preference
    if (rememberEmail) {
      chrome.storage.local.set({ rememberedEmail: email });
    } else {
      chrome.storage.local.remove("rememberedEmail");
    }

    // Use the login function from your auth service
    login(email, password)
      .then((response) => {
        // Store token and encryption key
        chrome.storage.local.set(
          {
            token: response.token,
            refreshToken: response.refreshToken,
            user: JSON.stringify(response.user),
            encryptionKey: response.encryptionKey,
          },
          function () {
            showVault();
            fixedLoadVaultItems();
            showNotification("Logged in successfully", "success");
          }
        );
      })
      .catch((error) => {
        console.error("Login error:", error);
        showNotification(
          error.message || "Login failed. Please check your credentials.",
          "error"
        );
      })
      .finally(() => {
        // Reset button state
        submitBtn.textContent = originalBtnText;
        submitBtn.disabled = false;
      });
  }

  async function login(email, password) {
    try {
      // First request basic authentication from your backend
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Login failed");
      }

      const data = await response.json();

      // Check if MFA is required (handle if your app uses MFA)
      if (data.mfaRequired) {
        // Show MFA form and handle that flow
        throw new Error(
          "MFA required - feature not yet implemented in extension"
        );
      }

      // Derive encryption key using your encryption util
      const salt = data.encryptionParams.salt;
      const iterations = data.encryptionParams.iterations;

      // Convert base64 salt to ArrayBuffer
      const saltBuffer = base64ToArrayBuffer(salt);

      // Derive encryption key using Web Crypto API
      const encoder = new TextEncoder();
      const passwordBuffer = encoder.encode(password);

      // Import master password as a key
      const masterPasswordKey = await window.crypto.subtle.importKey(
        "raw",
        passwordBuffer,
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
      );

      // Derive encryption key
      const encryptionKey = await window.crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: saltBuffer,
          iterations: iterations,
          hash: "SHA-256",
        },
        masterPasswordKey,
        { name: "AES-GCM", length: 256 },
        true, // extractable
        ["encrypt", "decrypt"]
      );

      // Export key as base64 string
      const encryptionKeyExported = await window.crypto.subtle.exportKey(
        "raw",
        encryptionKey
      );

      const encryptionKeyBase64 = arrayBufferToBase64(encryptionKeyExported);

      // Return authentication data along with encryption key
      return {
        token: data.token,
        refreshToken: data.refreshToken,
        user: data.user,
        encryptionKey: encryptionKeyBase64,
      };
    } catch (error) {
      console.error("Login function error:", error);
      throw error;
    }
  }

  function handleLogout() {
    // Call the logout API endpoint if needed
    chrome.storage.local.get(
      ["token", "refreshToken"],
      async function (result) {
        if (result.token && result.refreshToken) {
          try {
            await fetch(`${API_URL}/auth/logout`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${result.token}`,
              },
              body: JSON.stringify({ refreshToken: result.refreshToken }),
            });
          } catch (error) {
            console.error("Logout API error:", error);
          }
        }

        // Clear storage and reset UI
        chrome.storage.local.remove(
          ["token", "refreshToken", "user", "encryptionKey"],
          function () {
            showLogin();
            showNotification("Logged out successfully", "success");
          }
        );
      }
    );
  }

  // Improved direct vault items loading
  function fixedLoadVaultItems() {
    if (!vaultItemsContainer) return;

    // Display loading state
    vaultItemsContainer.innerHTML =
      '<div class="loading">Loading vault items...</div>';

    // Get user auth token
    chrome.storage.local.get(["token", "encryptionKey"], function (result) {
      if (!result.token) {
        vaultItemsContainer.innerHTML = `
          <div class="empty-state">
            <p>Please log in to view your vault items.</p>
            <button id="go-to-login-btn" class="primary-btn">Log In</button>
          </div>`;
        return;
      }

      // Directly fetch vault items with the token
      fetch(`${API_URL}/vault`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${result.token}`,
          "Content-Type": "application/json",
        },
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          console.log("Vault data received:", data);

          if (!data.vaultItems || !Array.isArray(data.vaultItems)) {
            throw new Error(
              "Invalid data structure: vaultItems not found or not an array"
            );
          }

          // Store items for filtering
          vaultItems = data.vaultItems;

          if (data.vaultItems.length === 0) {
            vaultItemsContainer.innerHTML = `
            <div class="empty-state">
              <p>Your vault is empty. Add your first password to get started.</p>
              <button id="add-first-btn" class="primary-btn">Add Your First Password</button>
            </div>`;

            // Add event listener for the button
            const addFirstBtn = document.getElementById("add-first-btn");
            if (addFirstBtn) {
              addFirstBtn.addEventListener("click", handleAddNewItem);
            }

            if (recordsCount) {
              recordsCount.textContent = "0 Suggested Records";
            }
            return;
          }

          // Successfully got vault items, now try to decrypt them
          tryDecryptVaultItems(data.vaultItems, result.encryptionKey);
        })
        .catch((error) => {
          console.error("Error loading vault items:", error);
          vaultItemsContainer.innerHTML = `
          <div class="error">
            <p>Failed to load vault items: ${error.message}</p>
            <button id="retry-btn" class="retry-btn">Try Again</button>
          </div>`;

          const retryBtn = document.getElementById("retry-btn");
          if (retryBtn) {
            retryBtn.addEventListener("click", fixedLoadVaultItems);
          }
        });
    });
  }

  // Function to attempt decryption of vault items
  async function tryDecryptVaultItems(items, encryptionKeyBase64) {
    try {
      // Get current tab domain to prioritize relevant items
      getCurrentTabInfo();

      const decryptedItems = [];

      // Process each item
      for (const item of items) {
        try {
          // Try to decrypt
          if (encryptionKeyBase64) {
            const decryptedData = await decryptData(
              item.encryptedData,
              encryptionKeyBase64
            );

            // Create a complete item with decrypted data
            decryptedItems.push({
              id: item._id,
              ...decryptedData,
              itemType: item.itemType,
              metadata: item.metadata,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              favicon: getFaviconUrl(decryptedData.url),
            });
          } else {
            // If no encryption key, just use metadata
            decryptedItems.push({
              id: item._id,
              failedToDecrypt: true,
              itemType: item.itemType,
              metadata: item.metadata,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            });
          }
        } catch (error) {
          console.error(`Failed to decrypt item ${item._id}:`, error);
          // Add with failed decrypt flag
          decryptedItems.push({
            id: item._id,
            failedToDecrypt: true,
            itemType: item.itemType,
            metadata: item.metadata,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          });
        }
      }

      // Update global vault items
      vaultItems = decryptedItems;

      // Update records count
      if (recordsCount) {
        recordsCount.textContent = `${vaultItems.length} Suggested Records`;
      }

      // Render the items
      renderVaultItems(vaultItems);
    } catch (error) {
      console.error("Error processing vault items:", error);
      vaultItemsContainer.innerHTML = `
        <div class="error">
          <p>Failed to process vault items: ${error.message}</p>
          <button id="retry-btn" class="retry-btn">Try Again</button>
        </div>`;

      const retryBtn = document.getElementById("retry-btn");
      if (retryBtn) {
        retryBtn.addEventListener("click", fixedLoadVaultItems);
      }
    }
  }

  // Get favicon URL
  function getFaviconUrl(url) {
    try {
      if (!url) return null;
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch (e) {
      return null;
    }
  }

  function renderVaultItems(items) {
    if (!vaultItemsContainer) return;

    // Clear container
    vaultItemsContainer.innerHTML = "";

    if (items.length === 0) {
      vaultItemsContainer.innerHTML = `
        <div class="empty-state">
          <p>No vault items found. Click "+" to add a new item.</p>
          <button id="add-new-empty-btn" class="primary-btn">Add Password</button>
        </div>`;

      // Add event listener for the button
      const addNewEmptyBtn = document.getElementById("add-new-empty-btn");
      if (addNewEmptyBtn) {
        addNewEmptyBtn.addEventListener("click", handleAddNewItem);
      }
      return;
    }

    // Sort items
    const sortedItems = sortVaultItems(items);

    // Create item elements
    sortedItems.forEach((item) => {
      const itemElement = document.createElement("div");
      itemElement.className = "vault-item";
      itemElement.dataset.id = item.id;

      // Get domain from URL or use name
      let displayName = item.failedToDecrypt
        ? item.metadata?.name || "Website"
        : item.metadata?.name ||
          (item.url
            ? new URL(item.url).hostname.replace("www.", "")
            : "Website");

      // Username to display
      const displayUsername = item.failedToDecrypt ? "" : item.username || "";

      // Create HTML for item
      itemElement.innerHTML = `
        <div class="item-icon">
          ${
            item.favicon && !item.failedToDecrypt
              ? `<img src="${
                  item.favicon
                }" alt="${displayName}" onerror="this.outerHTML='<div class=\\'default-icon\\'>${displayName
                  .charAt(0)
                  .toUpperCase()}</div>';">`
              : `<div class="default-icon">${displayName
                  .charAt(0)
                  .toUpperCase()}</div>`
          }
        </div>
        <div class="item-details">
          <div class="item-name">${displayName}</div>
          <div class="item-username">${displayUsername}</div>
        </div>
      `;

      // Add click event to copy credentials or fill form
      itemElement.addEventListener("click", () => {
        handleItemClick(item);
      });

      vaultItemsContainer.appendChild(itemElement);
    });
  }

  // Sort vault items by relevance and recency
  function sortVaultItems(items) {
    return items.sort((a, b) => {
      // First sort by domain relevance
      const aIsRelevant =
        !a.failedToDecrypt &&
        a.url &&
        currentDomain &&
        a.url.includes(currentDomain);
      const bIsRelevant =
        !b.failedToDecrypt &&
        b.url &&
        currentDomain &&
        b.url.includes(currentDomain);

      if (aIsRelevant && !bIsRelevant) return -1;
      if (!aIsRelevant && bIsRelevant) return 1;

      // Then sort by timestamp (newest first)
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
  }

  function filterVaultItems(e) {
    const searchTerm = e.target.value.toLowerCase();
    let filteredItems = vaultItems;

    if (searchTerm) {
      filteredItems = vaultItems.filter((item) => {
        if (item.failedToDecrypt) {
          // Search only metadata for failed items
          const itemName = item.metadata?.name?.toLowerCase() || "";
          const itemDomain = item.metadata?.domain?.toLowerCase() || "";
          return (
            itemName.includes(searchTerm) || itemDomain.includes(searchTerm)
          );
        } else {
          // Search all fields for decrypted items
          const itemName = item.metadata?.name?.toLowerCase() || "";
          const itemUsername = item.username?.toLowerCase() || "";
          const itemUrl = item.url?.toLowerCase() || "";
          return (
            itemName.includes(searchTerm) ||
            itemUsername.includes(searchTerm) ||
            itemUrl.includes(searchTerm)
          );
        }
      });
    }

    renderVaultItems(filteredItems);

    // Update records count
    if (recordsCount) {
      recordsCount.textContent = `${filteredItems.length} ${
        searchTerm ? "Matching" : "Suggested"
      } Records`;
    }
  }

  function handleItemClick(item) {
    // Create menu with options
    const menu = document.createElement("div");
    menu.className = "item-menu";

    if (item.failedToDecrypt) {
      menu.innerHTML = `
        <div class="menu-option" data-action="edit">View Details</div>
      `;
    } else {
      menu.innerHTML = `
        <div class="menu-option" data-action="autofill">Autofill</div>
        <div class="menu-option" data-action="copyUsername">Copy Username</div>
        <div class="menu-option" data-action="copyPassword">Copy Password</div>
        <div class="menu-option" data-action="edit">Edit</div>
        <div class="menu-option" data-action="view">View Details</div>
      `;
    }

    // Get current open menu and remove it if exists
    const currentMenu = document.querySelector(".item-menu");
    if (currentMenu) {
      currentMenu.remove();
    }

    // Add menu to document
    document.body.appendChild(menu);

    // Position menu near the clicked item
    const itemElement = document.querySelector(
      `.vault-item[data-id="${item.id}"]`
    );
    const itemRect = itemElement.getBoundingClientRect();

    menu.style.top = `${itemRect.bottom}px`;
    menu.style.left = `${itemRect.left}px`;

    // Add event listeners for menu options
    menu.addEventListener("click", (e) => {
      const action = e.target.dataset.action;

      switch (action) {
        case "autofill":
          if (!item.failedToDecrypt) {
            autofillCredentials(item);
          }
          break;
        case "copyUsername":
          if (!item.failedToDecrypt && item.username) {
            copyToClipboard(item.username);
            showNotification("Username copied to clipboard", "success");
          }
          break;
        case "copyPassword":
          if (!item.failedToDecrypt && item.password) {
            copyToClipboard(item.password);
            showNotification("Password copied to clipboard", "success");
          }
          break;
        case "edit":
          editVaultItem(item);
          break;
        case "view":
          viewVaultItemDetails(item);
          break;
      }

      menu.remove();
    });

    // Close menu when clicking outside
    document.addEventListener(
      "click",
      (e) => {
        if (!menu.contains(e.target) && !itemElement.contains(e.target)) {
          menu.remove();
        }
      },
      { once: true }
    );
  }

  function getCurrentTabInfo() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs && tabs[0] && tabs[0].url) {
        try {
          const url = new URL(tabs[0].url);
          currentDomain = url.hostname;

          // Reorder vault items based on current domain
          if (vaultItems.length > 0) {
            renderVaultItems(vaultItems);
          }
        } catch (error) {
          console.error("Error parsing URL:", error);
        }
      }
    });
  }

  function autofillCredentials(item) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            action: "fillCredentials",
            username: item.username,
            password: item.password,
          },
          function (response) {
            if (response && response.success) {
              showNotification("Credentials filled successfully", "success");
            } else {
              showNotification("Could not find login form on page", "error");
            }
          }
        );
      }
    });
  }

  function generatePassword() {
    const length = passwordLengthInput
      ? parseInt(passwordLengthInput.value)
      : 16;
    const includeUppercase =
      document.getElementById("include-uppercase")?.checked ?? true;
    const includeLowercase =
      document.getElementById("include-lowercase")?.checked ?? true;
    const includeNumbers =
      document.getElementById("include-numbers")?.checked ?? true;
    const includeSymbols =
      document.getElementById("include-symbols")?.checked ?? true;

    // Generate password using Web Crypto API
    const charset = [
      ...(includeLowercase ? "abcdefghijklmnopqrstuvwxyz" : []),
      ...(includeUppercase ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : []),
      ...(includeNumbers ? "0123456789" : []),
      ...(includeSymbols ? "!@#$%^&*()_-+=[]{}|;:,.<>?/" : []),
    ].join("");

    if (charset.length === 0) {
      showNotification("Please select at least one character type", "error");
      return;
    }

    const randomValues = new Uint32Array(length);
    window.crypto.getRandomValues(randomValues);

    let password = "";
    for (let i = 0; i < length; i++) {
      password += charset[randomValues[i] % charset.length];
    }

    if (generatedPasswordInput) {
      generatedPasswordInput.value = password;
      generatedPasswordInput.type = passwordVisible ? "text" : "password";
    }
  }

  function updateLengthValue(e) {
    if (lengthValue) {
      lengthValue.textContent = e.target.value;
    }
  }

  function copyGeneratedPassword() {
    if (!generatedPasswordInput || !generatedPasswordInput.value) {
      showNotification("No password to copy", "error");
      return;
    }

    copyToClipboard(generatedPasswordInput.value);
    showNotification("Password copied to clipboard", "success");

    // Visual feedback
    const originalText = copyPasswordBtn.textContent;
    copyPasswordBtn.textContent = "Copied!";
    setTimeout(() => {
      copyPasswordBtn.textContent = originalText;
    }, 2000);
  }

  function togglePasswordVisibility() {
    passwordVisible = !passwordVisible;

    if (generatedPasswordInput) {
      generatedPasswordInput.type = passwordVisible ? "text" : "password";
    }

    if (showPasswordBtn) {
      showPasswordBtn.innerHTML = passwordVisible
        ? '<i class="fas fa-eye-slash"></i>'
        : '<i class="fas fa-eye"></i>';
    }
  }

  function handleAddNewItem() {
    // Get current tab info to pre-fill form
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs && tabs[0] && tabs[0].url) {
        // Open the vault app in a new tab with pre-filled URL
        const vaultURL = `https://kael.es/vault?action=add&url=${encodeURIComponent(
          tabs[0].url
        )}`;
        chrome.tabs.create({ url: vaultURL });
      } else {
        // Just open the vault app
        chrome.tabs.create({ url: `https://kael.es/vault?action=add` });
      }
    });
  }

  function toggleSettingsMenu() {
    settingsMenuVisible = !settingsMenuVisible;

    const settingsMenu = document.getElementById("settings-menu");
    if (settingsMenu) {
      settingsMenu.classList.toggle("hidden", !settingsMenuVisible);
    } else {
      // Create settings menu if it doesn't exist
      const menu = document.createElement("div");
      menu.id = "settings-menu";
      menu.className = settingsMenuVisible
        ? "settings-menu"
        : "settings-menu hidden";
      menu.innerHTML = `
        <div class="menu-option" data-action="viewVault">Open Vault</div>
        <div class="menu-option" data-action="accountSettings">Account Settings</div>
        <div class="menu-option" data-action="lockVault">Lock Vault</div>
        <div class="menu-option" data-action="about">About</div>
      `;

      // Add event listeners
      menu.addEventListener("click", (e) => {
        const action = e.target.dataset.action;

        switch (action) {
          case "viewVault":
            chrome.tabs.create({ url: `https://kael.es/vault` });
            break;
          case "accountSettings":
            chrome.tabs.create({ url: `https://kael.es/settings` });
            break;
          case "lockVault":
            handleLogout();
            break;
          case "about":
            chrome.tabs.create({ url: `https://kael.es/about` });
            break;
        }

        menu.classList.add("hidden");
        settingsMenuVisible = false;
      });

      // Append to body
      document.body.appendChild(menu);

      // Position menu
      const settingsRect = settingsBtn.getBoundingClientRect();
      menu.style.top = `${settingsRect.bottom}px`;
      menu.style.right = `${window.innerWidth - settingsRect.right}px`;
    }

    // Close menu when clicking outside
    if (settingsMenuVisible) {
      document.addEventListener(
        "click",
        (e) => {
          if (
            !document.getElementById("settings-menu")?.contains(e.target) &&
            e.target !== settingsBtn
          ) {
            document.getElementById("settings-menu")?.classList.add("hidden");
            settingsMenuVisible = false;
          }
        },
        { once: true }
      );
    }
  }

  function editVaultItem(item) {
    // Open the vault app in a new tab to edit item
    chrome.tabs.create({
      url: `https://kael.es/vault?action=edit&id=${item.id}`,
    });
  }

  function viewVaultItemDetails(item) {
    // Create modal to show item details
    const modal = document.createElement("div");
    modal.className = "modal";

    // Different display based on whether decryption succeeded
    if (item.failedToDecrypt) {
      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h2>${item.metadata?.name || "Item Details"}</h2>
            <span class="close">&times;</span>
          </div>
          <div class="modal-body">
            <div class="detail-row">
              <div class="detail-label">Status</div>
              <div class="detail-value" style="color: #e53935;">Failed to decrypt</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">Item Type</div>
              <div class="detail-value">${item.itemType || "Unknown"}</div>
            </div>
            <p>This item could not be decrypted. You may need to log out and log back in to refresh your encryption key.</p>
          </div>
          <div class="modal-footer">
            <button class="close-btn">Close</button>
          </div>
        </div>
      `;
    } else {
      // Fully decrypted item display
      const siteUrl = item.url ? new URL(item.url).hostname : "";

      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h2>${item.metadata?.name || siteUrl}</h2>
            <span class="close">&times;</span>
          </div>
          <div class="modal-body">
            <div class="detail-row">
              <div class="detail-label">URL</div>
              <div class="detail-value">${item.url}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">Username</div>
              <div class="detail-value">
                ${item.username}
                <button class="copy-btn" data-value="${
                  item.username
                }">Copy</button>
              </div>
            </div>
            <div class="detail-row">
              <div class="detail-label">Password</div>
              <div class="detail-value">
                <input type="password" value="${
                  item.password
                }" readonly class="password-field">
                <button class="toggle-btn">Show</button>
                <button class="copy-btn" data-value="${
                  item.password
                }">Copy</button>
              </div>
            </div>
            ${
              item.notes
                ? `
            <div class="detail-row">
              <div class="detail-label">Notes</div>
              <div class="detail-value">${item.notes}</div>
            </div>
            `
                : ""
            }
          </div>
          <div class="modal-footer">
            <button class="edit-btn">Edit</button>
            <button class="close-btn">Close</button>
          </div>
        </div>
      `;
    }

    // Add modal to document
    document.body.appendChild(modal);

    // Add event listeners
    modal.querySelector(".close").addEventListener("click", () => {
      modal.remove();
    });

    modal.querySelector(".close-btn").addEventListener("click", () => {
      modal.remove();
    });

    const editBtn = modal.querySelector(".edit-btn");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        editVaultItem(item);
        modal.remove();
      });
    }

    const copyBtns = modal.querySelectorAll(".copy-btn");
    if (copyBtns.length > 0) {
      copyBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          copyToClipboard(btn.dataset.value);
          btn.textContent = "Copied!";
          setTimeout(() => {
            btn.textContent = "Copy";
          }, 2000);
        });
      });
    }

    const passwordField = modal.querySelector(".password-field");
    const toggleBtn = modal.querySelector(".toggle-btn");
    if (passwordField && toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const isPassword = passwordField.type === "password";
        passwordField.type = isPassword ? "text" : "password";
        toggleBtn.textContent = isPassword ? "Hide" : "Show";
      });
    }

    // Close when clicking outside
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  function showNotification(message, type = "info") {
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.textContent = message;

    // Remove existing notifications
    document.querySelectorAll(".notification").forEach((n) => n.remove());

    // Add to document
    document.body.appendChild(notification);

    // Remove after delay
    setTimeout(() => {
      notification.classList.add("fade-out");
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch((err) => {
      console.error("Could not copy text: ", err);
    });
  }

  // Utility functions for encryption/decryption
  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  // Decryption utilities
  async function decryptData(encryptedData, encryptionKeyBase64) {
    try {
      // Convert Base64 key to CryptoKey
      const encryptionKeyBuffer = base64ToArrayBuffer(encryptionKeyBase64);
      const encryptionKey = await window.crypto.subtle.importKey(
        "raw",
        encryptionKeyBuffer,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );

      // Convert encrypted data to buffer
      const encryptedBuffer = base64ToArrayBuffer(encryptedData);

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
        return decryptedString;
      }
    } catch (error) {
      console.error("Error decrypting data:", error);
      throw error;
    }
  }
});
