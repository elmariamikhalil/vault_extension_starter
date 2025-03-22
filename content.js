// content.js - Enhanced content script for SecureVault with improved form detection

// Global array to keep track of all added indicators
let autofillIndicators = [];

// Function to clear all existing indicators
function clearAutofillIndicators() {
  // Remove all existing indicators from the DOM
  autofillIndicators.forEach((indicator) => {
    if (indicator && indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
  });

  // Reset the array
  autofillIndicators = [];

  // Remove event listeners for scroll and resize
  window.removeEventListener("scroll", updateIndicatorPositions);
  window.removeEventListener("resize", updateIndicatorPositions);
}

// Function to update all indicator positions
function updateIndicatorPositions() {
  autofillIndicators.forEach((indicator) => {
    if (indicator && indicator.fieldRef) {
      const field = indicator.fieldRef;
      if (!isVisible(field)) {
        indicator.style.display = "none";
        return;
      }

      const fieldRect = field.getBoundingClientRect();
      indicator.style.top = `${
        window.scrollY + fieldRect.top + fieldRect.height / 2 - 10
      }px`;
      indicator.style.left = `${window.scrollX + fieldRect.right + 5}px`;
      indicator.style.display = "flex";
    }
  });
}

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.log("Content script received message:", message.action);

  if (message.action === "fillCredentials") {
    const result = fillCredentials(message.username, message.password);
    sendResponse({ success: result });
  } else if (message.action === "showCredentialPicker") {
    showCredentialPicker(message.domain);
    sendResponse({ success: true });
  } else if (message.action === "showPasswordGenerator") {
    showPasswordGenerator();
    sendResponse({ success: true });
  } else if (message.action === "checkContentScriptActive") {
    // This just confirms the content script is running
    sendResponse({ active: true });
  }
  return true; // Keep the message channel open for async responses
});

// Function to find and fill username/password fields
function fillCredentials(username, password) {
  // Find form fields
  const forms = findLoginForms();

  if (forms.length === 0) {
    console.log("No login forms found on page");
    showNotification("No login form found on this page", "error");
    return false;
  }

  // Use the first form that has both username and password fields
  let filledForm = false;

  for (const form of forms) {
    const { usernameField, passwordField } = form;

    // Fill username if available
    if (usernameField && username) {
      setFieldValue(usernameField, username);
    }

    // Fill password if available
    if (passwordField && password) {
      setFieldValue(passwordField, password);
    }

    // Mark as filled if at least one field was populated
    if ((usernameField && username) || (passwordField && password)) {
      filledForm = true;

      // Focus on the submit button or next input field
      const submitButton = findSubmitButton(form.element);
      if (submitButton) {
        submitButton.focus();
      }

      // Show success notification
      showNotification("Credentials filled successfully", "success");

      // Remove indicators after successful autofill
      clearAutofillIndicators();

      // Only fill one form
      break;
    }
  }

  return filledForm;
}

// Find all login forms on the page with improved detection
function findLoginForms() {
  const forms = [];

  // First approach: Find standard forms with password fields
  document.querySelectorAll("form").forEach((formElement) => {
    const passwordField = formElement.querySelector('input[type="password"]');

    if (passwordField) {
      const usernameField = findUsernameField(formElement);

      forms.push({
        element: formElement,
        usernameField: usernameField,
        passwordField: passwordField,
      });
    }
  });

  // Second approach: Find standalone password fields
  if (forms.length === 0) {
    const passwordFields = document.querySelectorAll('input[type="password"]');

    for (const passwordField of passwordFields) {
      // Find the closest container that might act as a form
      const container = findFormContainer(passwordField);

      if (container) {
        const usernameField = findUsernameField(container);

        forms.push({
          element: container,
          usernameField: usernameField,
          passwordField: passwordField,
        });
      }
    }
  }

  // Third approach: Find shadow DOM elements (for modern web apps)
  try {
    // Get all shadow roots
    const getAllShadowRoots = (elements) => {
      let shadowRoots = [];

      elements.forEach((element) => {
        if (element.shadowRoot) {
          shadowRoots.push(element.shadowRoot);
          // Recursively get shadow roots from shadow DOM
          const childShadowHosts = Array.from(
            element.shadowRoot.querySelectorAll("*")
          );
          shadowRoots = shadowRoots.concat(getAllShadowRoots(childShadowHosts));
        }
      });

      return shadowRoots;
    };

    // Get all shadow roots in the document
    const shadowRoots = getAllShadowRoots(
      Array.from(document.querySelectorAll("*"))
    );

    // Check each shadow root for password fields
    shadowRoots.forEach((root) => {
      const passwordFields = root.querySelectorAll('input[type="password"]');

      passwordFields.forEach((passwordField) => {
        // Find a container for this password field
        let container = passwordField.parentElement;
        while (container && container !== root) {
          container = container.parentElement;
        }

        if (container) {
          const usernameField = findUsernameField(container);

          forms.push({
            element: container,
            usernameField: usernameField,
            passwordField: passwordField,
            isShadowDom: true,
          });
        }
      });
    });
  } catch (error) {
    console.error("Error searching shadow DOM:", error);
  }

  return forms;
}

// Enhanced username field detection
function findUsernameField(container) {
  // Common username selectors, ordered by priority
  const selectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[id="email"]',
    'input[autocomplete="username"]',
    'input[autocomplete="email"]',
    'input[name*="email"]',
    'input[id*="email"]',
    'input[name="username"]',
    'input[id="username"]',
    'input[name*="username"]',
    'input[id*="username"]',
    'input[name*="user"]',
    'input[id*="user"]',
    'input[name*="login"]',
    'input[id*="login"]',
    'input[name*="account"]',
    'input[id*="account"]',
  ];

  // Try each selector
  for (const selector of selectors) {
    const matches = container.querySelectorAll(selector);
    for (const match of matches) {
      if (isVisible(match)) {
        return match;
      }
    }
  }

  // If no specific field found, try to find the first visible text input that appears before the password field
  const passwordField = container.querySelector('input[type="password"]');
  if (passwordField) {
    // Get all inputs in the container
    const allInputs = Array.from(container.querySelectorAll("input"));
    // Find the index of the password field
    const passwordIndex = allInputs.indexOf(passwordField);

    // Check inputs that come before the password field
    for (let i = 0; i < passwordIndex; i++) {
      const input = allInputs[i];
      const type = input.type.toLowerCase();
      if (
        type !== "password" &&
        type !== "hidden" &&
        type !== "submit" &&
        type !== "button" &&
        type !== "checkbox" &&
        type !== "radio" &&
        isVisible(input)
      ) {
        return input;
      }
    }
  }

  // Last resort: any visible text-like input
  const textInputs = container.querySelectorAll(
    'input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])'
  );
  for (const input of textInputs) {
    if (isVisible(input)) {
      return input;
    }
  }

  return null;
}

// Improved form container detection
function findFormContainer(passwordField) {
  // Common form container selectors
  const containerId = [
    "loginForm",
    "login-form",
    "login_form",
    "signin",
    "sign-in",
    "auth",
    "authForm",
    "login-container",
    "credentials",
  ];

  const containerClass = [
    "login",
    "signin",
    "sign-in",
    "auth",
    "form",
    "login-form",
    "login_form",
    "login-container",
    "credentials",
  ];

  // First check parents with matching IDs
  for (const id of containerId) {
    const container = document.getElementById(id);
    if (container && container.contains(passwordField)) {
      return container;
    }
  }

  // Then check parents with matching classes
  for (const className of containerClass) {
    const containers = document.getElementsByClassName(className);
    for (const container of containers) {
      if (container.contains(passwordField)) {
        return container;
      }
    }
  }

  // Improved ancestor walk-up logic
  let parent = passwordField.parentElement;
  let bestContainer = null;
  let bestScore = 0;

  while (parent && parent !== document.body) {
    let score = 0;

    // Check for form
    if (parent.tagName === "FORM") {
      score += 10;
    }

    // Check for inputs
    const inputs = parent.querySelectorAll("input");
    const hasText = Array.from(inputs).some(
      (input) =>
        (input.type === "text" || input.type === "email") && isVisible(input)
    );
    const hasPassword = Array.from(inputs).some(
      (input) => input.type === "password" && isVisible(input)
    );

    if (hasText) score += 5;
    if (hasPassword) score += 5;

    // Check for submit button
    const hasSubmit =
      parent.querySelector('button[type="submit"], input[type="submit"]') !==
      null;
    if (hasSubmit) score += 3;

    // Check if this container has login-related classes/ids
    const elementId = parent.id.toLowerCase();
    const elementClass = parent.className ? parent.className.toLowerCase() : "";

    if (
      elementId.includes("login") ||
      elementId.includes("auth") ||
      elementClass.includes("login") ||
      elementClass.includes("auth")
    ) {
      score += 5;
    }

    // Update best container if this one has a higher score
    if (score > bestScore) {
      bestScore = score;
      bestContainer = parent;
    }

    // Move up the DOM tree
    parent = parent.parentElement;
  }

  // Return the best container found, or the password field's parent as a fallback
  return bestContainer || passwordField.parentElement;
}

// Find the submit button for a form
function findSubmitButton(formElement) {
  // Try explicit submit buttons first
  const submitButton = formElement.querySelector(
    'button[type="submit"], input[type="submit"]'
  );
  if (submitButton) return submitButton;

  // Look for buttons with submit-related text
  const buttons = formElement.querySelectorAll('button, input[type="button"]');
  const submitKeywords = [
    "login",
    "log in",
    "sign in",
    "signin",
    "submit",
    "continue",
    "next",
  ];

  for (const button of buttons) {
    const buttonText = button.textContent
      ? button.textContent.toLowerCase()
      : "";
    if (submitKeywords.some((keyword) => buttonText.includes(keyword))) {
      return button;
    }
  }

  // Look for elements that look like buttons
  const clickables = formElement.querySelectorAll("a, div, span");
  for (const element of clickables) {
    const text = element.textContent ? element.textContent.toLowerCase() : "";
    if (submitKeywords.some((keyword) => text.includes(keyword))) {
      return element;
    }
  }

  return null;
}

// Improved method to set field value and trigger events
function setFieldValue(field, value) {
  try {
    // Save original properties
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    );

    // Set field value both directly and through the prototype
    field.value = value;

    // If possible, use the setter from the property descriptor
    if (descriptor && descriptor.set) {
      descriptor.set.call(field, value);
    }

    // Trigger a comprehensive set of events to ensure the page recognizes the change
    try {
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      field.dispatchEvent(new Event("blur", { bubbles: true }));

      // For React and other frameworks that might use different event handling
      field.dispatchEvent(new InputEvent("input", { bubbles: true }));
    } catch (eventError) {
      console.warn("Error dispatching field events:", eventError);
    }

    // Focus the field briefly
    field.focus();

    // Some sites need a delay before moving to the next field
    setTimeout(() => {
      field.blur();
    }, 50);

    return true;
  } catch (error) {
    console.error("Error setting field value:", error);
    return false;
  }
}

// Enhanced visibility check
function isVisible(element) {
  if (!element) return false;

  // Check if element or any parent has display:none, visibility:hidden, or opacity:0
  let currentElement = element;
  while (currentElement) {
    try {
      const style = window.getComputedStyle(currentElement);

      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0" ||
        parseFloat(style.opacity) === 0
      ) {
        return false;
      }
    } catch (e) {
      // Some elements might not have computed style
      console.warn("Error getting computed style:", e);
    }

    currentElement = currentElement.parentElement;
  }

  // Check element dimensions
  try {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      return false;
    }

    // Check if element is within viewport
    const viewportWidth =
      window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;

    // Element is considered visible if at least part of it is in the viewport
    if (
      rect.right < 0 ||
      rect.bottom < 0 ||
      rect.left > viewportWidth ||
      rect.top > viewportHeight
    ) {
      return false;
    }
  } catch (e) {
    console.warn("Error checking element dimensions:", e);
    return false;
  }

  return true;
}

// Show notification popup
function showNotification(message, type = "info") {
  // Create notification element if it doesn't exist
  let notification = document.getElementById("securevault-notification");

  if (!notification) {
    notification = document.createElement("div");
    notification.id = "securevault-notification";
    notification.style.position = "fixed";
    notification.style.bottom = "20px";
    notification.style.left = "50%";
    notification.style.transform = "translateX(-50%)";
    notification.style.padding = "10px 20px";
    notification.style.borderRadius = "4px";
    notification.style.fontSize = "14px";
    notification.style.fontWeight = "bold";
    notification.style.color = "white";
    notification.style.zIndex = "99999";
    notification.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.2)";
    document.body.appendChild(notification);
  }

  // Set notification type
  if (type === "success") {
    notification.style.backgroundColor = "#4CAF50";
  } else if (type === "error") {
    notification.style.backgroundColor = "#F44336";
  } else {
    notification.style.backgroundColor = "#2196F3";
  }

  // Set message
  notification.textContent = message;

  // Show notification
  notification.style.display = "block";

  // Hide after 3 seconds
  setTimeout(() => {
    notification.style.display = "none";
  }, 3000);
}

// Function to show credential picker
function showCredentialPicker(domain) {
  // Check if picker already exists and remove it
  const existingPicker = document.getElementById(
    "securevault-credential-picker"
  );
  if (existingPicker) {
    existingPicker.remove();
  }

  // Request credentials for this domain from the background script
  chrome.runtime.sendMessage(
    { action: "getVaultItemsForDomain", domain: domain },
    function (response) {
      if (
        response &&
        response.success &&
        response.vaultItems &&
        response.vaultItems.length > 0
      ) {
        createCredentialPicker(response.vaultItems, domain);
      } else {
        showNotification("No saved credentials found for this site", "info");
      }
    }
  );
}

// Create credential picker UI
function createCredentialPicker(vaultItems, domain) {
  // Create picker container
  const picker = document.createElement("div");
  picker.id = "securevault-credential-picker";
  picker.style.position = "fixed";
  picker.style.top = "20px";
  picker.style.right = "20px";
  picker.style.width = "300px";
  picker.style.backgroundColor = "white";
  picker.style.borderRadius = "8px";
  picker.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.3)";
  picker.style.zIndex = "99999";
  picker.style.overflow = "hidden";
  picker.style.fontFamily = "Arial, sans-serif";

  // Create header
  const header = document.createElement("div");
  header.style.padding = "12px 15px";
  header.style.backgroundColor = "#1a478d";
  header.style.color = "white";
  header.style.fontWeight = "bold";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.innerHTML = `
        <span>SecureVault - ${domain}</span>
        <button id="securevault-close-btn" style="background: none; border: none; color: white; cursor: pointer; font-size: 16px;">×</button>
      `;
  picker.appendChild(header);

  // Create content area
  const content = document.createElement("div");
  content.style.maxHeight = "300px";
  content.style.overflowY = "auto";

  // Add items
  if (vaultItems.length === 0) {
    content.innerHTML = `
          <div style="padding: 15px; text-align: center;">
            <p style="margin-bottom: 10px;">No saved credentials found for this site.</p>
            <button id="securevault-add-btn" style="padding: 8px 12px; background-color: #1a478d; color: white; border: none; border-radius: 4px; cursor: pointer;">
              Add Password
            </button>
          </div>
        `;
  } else {
    vaultItems.forEach((item, index) => {
      const itemElement = document.createElement("div");
      itemElement.className = "securevault-item";
      itemElement.style.padding = "12px 15px";
      itemElement.style.borderBottom = "1px solid #eee";
      itemElement.style.cursor = "pointer";
      itemElement.style.display = "flex";
      itemElement.style.alignItems = "center";

      // Try to get a meaningful name
      let displayName = "Unknown Site";
      let username = "";

      // If we have metadata with encrypted data, we need to decrypt it
      if (item.encryptedData) {
        // Request decryption from background/popup
        chrome.runtime.sendMessage(
          { action: "getDecryptedItem", itemId: item._id },
          function (decryptedItem) {
            if (decryptedItem && decryptedItem.success) {
              // Update the display with decrypted information
              const data = decryptedItem.data;
              displayName =
                data.metadata?.name ||
                (data.url ? new URL(data.url).hostname : "Website");
              username = data.username || "";

              // Update the HTML content with decrypted data
              itemElement.innerHTML = `
                  <div style="margin-right: 10px; width: 32px; height: 32px; background-color: #1a478d; color: white; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-weight: bold;">
                    ${displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style="font-weight: bold;">${displayName}</div>
                    <div style="color: #666; font-size: 12px;">${username}</div>
                  </div>
                `;
            }
          }
        );
      } else {
        // Fallback if no encryption or metadata available
        displayName = domain || "Website";
        itemElement.innerHTML = `
            <div style="margin-right: 10px; width: 32px; height: 32px; background-color: #1a478d; color: white; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-weight: bold;">
              ${displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style="font-weight: bold;">${displayName}</div>
              <div style="color: #666; font-size: 12px;">Click to autofill</div>
            </div>
          `;
      }

      // Add click handler to autofill
      itemElement.addEventListener("click", function () {
        chrome.runtime.sendMessage(
          { action: "getDecryptedItem", itemId: item._id },
          function (response) {
            if (response && response.success) {
              // Autofill with decrypted credentials
              fillCredentials(response.data.username, response.data.password);
              // Close the picker
              picker.remove();
            } else {
              showNotification("Failed to decrypt credentials", "error");
            }
          }
        );
      });

      content.appendChild(itemElement);
    });
  }

  picker.appendChild(content);

  // Create footer
  const footer = document.createElement("div");
  footer.style.padding = "10px 15px";
  footer.style.borderTop = "1px solid #eee";
  footer.style.textAlign = "center";
  footer.innerHTML = `
      <a href="https://kael.es/vault" target="_blank" style="color: #1a478d; text-decoration: none; font-size: 12px;">
        Open SecureVault
      </a>
    `;
  picker.appendChild(footer);

  // Add to document
  document.body.appendChild(picker);

  // Add close button functionality
  document
    .getElementById("securevault-close-btn")
    .addEventListener("click", function () {
      picker.remove();
    });

  // Add event listener for add button if present
  const addBtn = document.getElementById("securevault-add-btn");
  if (addBtn) {
    addBtn.addEventListener("click", function () {
      chrome.runtime.sendMessage({
        action: "openVaultAddPage",
        domain: domain,
      });
      picker.remove();
    });
  }

  // Close when clicking outside
  document.addEventListener("click", function (e) {
    if (picker && !picker.contains(e.target)) {
      picker.remove();
    }
  });
}

// Function to show password generator
function showPasswordGenerator() {
  // Check if generator already exists and remove it
  const existingGenerator = document.getElementById(
    "securevault-password-generator"
  );
  if (existingGenerator) {
    existingGenerator.remove();
  }

  // Create generator container
  const generator = document.createElement("div");
  generator.id = "securevault-password-generator";
  generator.style.position = "fixed";
  generator.style.top = "20px";
  generator.style.right = "20px";
  generator.style.width = "300px";
  generator.style.backgroundColor = "white";
  generator.style.borderRadius = "8px";
  generator.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.3)";
  generator.style.zIndex = "99999";
  generator.style.overflow = "hidden";
  generator.style.fontFamily = "Arial, sans-serif";

  // Create header
  const header = document.createElement("div");
  header.style.padding = "12px 15px";
  header.style.backgroundColor = "#1a478d";
  header.style.color = "white";
  header.style.fontWeight = "bold";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.innerHTML = `
      <span>Password Generator</span>
      <button id="securevault-close-generator-btn" style="background: none; border: none; color: white; cursor: pointer; font-size: 16px;">×</button>
    `;
  generator.appendChild(header);

  // Create content area
  const content = document.createElement("div");
  content.style.padding = "15px";

  // Password display
  const passwordDisplay = document.createElement("div");
  passwordDisplay.style.position = "relative";
  passwordDisplay.style.marginBottom = "15px";

  const passwordInput = document.createElement("input");
  passwordInput.id = "securevault-generated-password";
  passwordInput.type = "password";
  passwordInput.readOnly = true;
  passwordInput.style.width = "100%";
  passwordInput.style.padding = "10px 70px 10px 10px";
  passwordInput.style.border = "1px solid #ddd";
  passwordInput.style.borderRadius = "4px";
  passwordInput.style.fontFamily = "monospace";

  const passwordActions = document.createElement("div");
  passwordActions.style.position = "absolute";
  passwordActions.style.right = "5px";
  passwordActions.style.top = "50%";
  passwordActions.style.transform = "translateY(-50%)";
  passwordActions.style.display = "flex";
  passwordActions.style.gap = "5px";

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "securevault-toggle-password";
  toggleBtn.style.background = "none";
  toggleBtn.style.border = "none";
  toggleBtn.style.color = "#666";
  toggleBtn.style.cursor = "pointer";
  toggleBtn.innerHTML = '<span style="font-size: 16px;">👁️</span>';

  const copyBtn = document.createElement("button");
  copyBtn.id = "securevault-copy-password";
  copyBtn.style.background = "none";
  copyBtn.style.border = "none";
  copyBtn.style.color = "#666";
  copyBtn.style.cursor = "pointer";
  copyBtn.innerHTML = '<span style="font-size: 16px;">📋</span>';

  passwordActions.appendChild(toggleBtn);
  passwordActions.appendChild(copyBtn);
  passwordDisplay.appendChild(passwordInput);
  passwordDisplay.appendChild(passwordActions);
  content.appendChild(passwordDisplay);

  // Options
  const options = document.createElement("div");
  options.style.marginBottom = "15px";

  // Length slider
  const lengthOption = document.createElement("div");
  lengthOption.style.marginBottom = "15px";

  const lengthLabel = document.createElement("label");
  lengthLabel.htmlFor = "securevault-password-length";
  lengthLabel.style.display = "block";
  lengthLabel.style.marginBottom = "5px";
  lengthLabel.innerHTML =
    'Length: <span id="securevault-length-value">16</span>';

  const lengthSlider = document.createElement("input");
  lengthSlider.id = "securevault-password-length";
  lengthSlider.type = "range";
  lengthSlider.min = "8";
  lengthSlider.max = "32";
  lengthSlider.value = "16";
  lengthSlider.style.width = "100%";

  lengthOption.appendChild(lengthLabel);
  lengthOption.appendChild(lengthSlider);
  options.appendChild(lengthOption);

  // Character type checkboxes
  const charTypes = [
    { id: "uppercase", label: "Uppercase Letters (A-Z)", checked: true },
    { id: "lowercase", label: "Lowercase Letters (a-z)", checked: true },
    { id: "numbers", label: "Numbers (0-9)", checked: true },
    { id: "symbols", label: "Special Characters (!@#$%^&*)", checked: true },
  ];

  charTypes.forEach((type) => {
    const charTypeOption = document.createElement("div");
    charTypeOption.style.display = "flex";
    charTypeOption.style.alignItems = "center";
    charTypeOption.style.marginBottom = "10px";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `securevault-include-${type.id}`;
    checkbox.checked = type.checked;
    checkbox.style.marginRight = "8px";

    const label = document.createElement("label");
    label.htmlFor = `securevault-include-${type.id}`;
    label.textContent = type.label;

    charTypeOption.appendChild(checkbox);
    charTypeOption.appendChild(label);
    options.appendChild(charTypeOption);
  });

  content.appendChild(options);

  // Generate button
  const generateBtn = document.createElement("button");
  generateBtn.id = "securevault-generate-btn";
  generateBtn.textContent = "Generate Password";
  generateBtn.style.width = "100%";
  generateBtn.style.padding = "10px";
  generateBtn.style.backgroundColor = "#1a478d";
  generateBtn.style.color = "white";
  generateBtn.style.border = "none";
  generateBtn.style.borderRadius = "4px";
  generateBtn.style.cursor = "pointer";
  generateBtn.style.fontWeight = "bold";

  content.appendChild(generateBtn);
  generator.appendChild(content);

  // Add to document
  document.body.appendChild(generator);

  // Generate initial password
  generatePassword();

  // Add event listeners
  document
    .getElementById("securevault-close-generator-btn")
    .addEventListener("click", function () {
      generator.remove();
    });

  document
    .getElementById("securevault-toggle-password")
    .addEventListener("click", function () {
      const passwordInput = document.getElementById(
        "securevault-generated-password"
      );
      passwordInput.type =
        passwordInput.type === "password" ? "text" : "password";
    });

  document
    .getElementById("securevault-copy-password")
    .addEventListener("click", function () {
      const passwordInput = document.getElementById(
        "securevault-generated-password"
      );
      navigator.clipboard
        .writeText(passwordInput.value)
        .then(() => showNotification("Password copied to clipboard", "success"))
        .catch(() => showNotification("Failed to copy password", "error"));
    });

  document
    .getElementById("securevault-password-length")
    .addEventListener("input", function () {
      document.getElementById("securevault-length-value").textContent =
        this.value;
    });

  document
    .getElementById("securevault-generate-btn")
    .addEventListener("click", generatePassword);

  // Close when clicking outside
  document.addEventListener("click", function (e) {
    if (generator && !generator.contains(e.target)) {
      generator.remove();
    }
  });
}

// Generate a random password
function generatePassword() {
  try {
    const length = parseInt(
      document.getElementById("securevault-password-length").value
    );
    const includeUppercase = document.getElementById(
      "securevault-include-uppercase"
    ).checked;
    const includeLowercase = document.getElementById(
      "securevault-include-lowercase"
    ).checked;
    const includeNumbers = document.getElementById(
      "securevault-include-numbers"
    ).checked;
    const includeSymbols = document.getElementById(
      "securevault-include-symbols"
    ).checked;

    // Build character set
    let charset = "";
    if (includeUppercase) charset += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (includeLowercase) charset += "abcdefghijklmnopqrstuvwxyz";
    if (includeNumbers) charset += "0123456789";
    if (includeSymbols) charset += "!@#$%^&*()_-+={}[]|:;<>,.?/~";

    if (charset === "") {
      showNotification("Please select at least one character type", "error");
      return;
    }

    // Generate password
    let password = "";
    const randomValues = new Uint32Array(length);
    window.crypto.getRandomValues(randomValues);

    for (let i = 0; i < length; i++) {
      password += charset[randomValues[i] % charset.length];
    }

    // Set password in input field
    document.getElementById("securevault-generated-password").value = password;
  } catch (error) {
    console.error("Error generating password:", error);
    showNotification("Error generating password", "error");
  }
}

// Add autofill indicator next to a field
function addAutofillIndicator(field, type) {
  try {
    // Only add if the field is visible
    if (!isVisible(field)) return;

    // Check if we already have an indicator for this field
    const existingIndicator = autofillIndicators.find(
      (indicator) => indicator.fieldRef === field
    );

    if (existingIndicator) {
      // If it exists, just update its position
      const fieldRect = field.getBoundingClientRect();
      existingIndicator.style.top = `${
        window.scrollY + fieldRect.top + fieldRect.height / 2 - 10
      }px`;
      existingIndicator.style.left = `${
        window.scrollX + fieldRect.right + 5
      }px`;
      return;
    }

    // Calculate position
    const fieldRect = field.getBoundingClientRect();

    // Create indicator button
    const indicator = document.createElement("div");
    indicator.className = "securevault-autofill-indicator";
    indicator.style.position = "absolute";
    indicator.style.zIndex = "99999";
    indicator.style.width = "20px";
    indicator.style.height = "20px";
    indicator.style.background = "#1a478d";
    indicator.style.color = "white";
    indicator.style.borderRadius = "50%";
    indicator.style.display = "flex";
    indicator.style.alignItems = "center";
    indicator.style.justifyContent = "center";
    indicator.style.fontSize = "12px";
    indicator.style.cursor = "pointer";
    indicator.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";
    indicator.innerHTML = "🔑";
    indicator.title = "Autofill with SecureVault";

    // Store reference to the field for position updates
    indicator.fieldRef = field;

    // Position the indicator
    indicator.style.top = `${
      window.scrollY + fieldRect.top + fieldRect.height / 2 - 10
    }px`;
    indicator.style.left = `${window.scrollX + fieldRect.right + 5}px`;

    // Add click handler
    indicator.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();

      // Get the domain
      const domain = window.location.hostname;

      // Show credential picker
      showCredentialPicker(domain);
    });

    // Add to document
    document.body.appendChild(indicator);

    // Add to our tracking array
    autofillIndicators.push(indicator);

    // If this is our first indicator, set up global listeners
    if (autofillIndicators.length === 1) {
      // Set up listeners for scroll and resize to update all indicators
      window.addEventListener("scroll", updateIndicatorPositions);
      window.addEventListener("resize", updateIndicatorPositions);
    }
  } catch (error) {
    console.error("Error adding autofill indicator:", error);
  }
}

// Initialize detection on page load
document.addEventListener("DOMContentLoaded", function () {
  // Clear any existing indicators first
  clearAutofillIndicators();

  // Then detect forms and notify the extension
  const forms = findLoginForms();

  if (forms.length > 0) {
    console.log(`Found ${forms.length} login forms on the page`);

    // Notify extension about the forms
    chrome.runtime.sendMessage({
      action: "loginFormDetected",
      formsCount: forms.length,
      url: window.location.href,
      domain: window.location.hostname,
    });

    // Add autofill indicators for each form
    forms.forEach((form) => {
      if (form.usernameField) {
        addAutofillIndicator(form.usernameField, "username");
      }

      if (form.passwordField) {
        addAutofillIndicator(form.passwordField, "password");
      }
    });
  }
});

// Detect password fields even after DOM load for dynamically created forms
const observer = new MutationObserver(function (mutations) {
  // Use a debounce to avoid too many checks
  if (observer.timeout) {
    clearTimeout(observer.timeout);
  }

  observer.timeout = setTimeout(() => {
    mutations.forEach(function (mutation) {
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        // Check if any of the added nodes contain password fields
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node.nodeType === 1) {
            // ELEMENT_NODE
            // Check if the node itself is a password field
            if (node.tagName === "INPUT" && node.type === "password") {
              handleNewPasswordField(node);
            }
            // Check if the node contains password fields
            const passwordFields = node.querySelectorAll(
              'input[type="password"]'
            );
            if (passwordFields.length > 0) {
              passwordFields.forEach((field) => handleNewPasswordField(field));
            }
          }
        }
      }
    });
  }, 500); // Debounce for 500ms
});

// Configure the observer to watch for changes in the entire document
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

// Handle newly detected password fields
function handleNewPasswordField(passwordField) {
  try {
    const container = findFormContainer(passwordField);
    if (container) {
      const usernameField = findUsernameField(container);

      // Add autofill indicators
      if (usernameField) {
        addAutofillIndicator(usernameField, "username");
      }
      addAutofillIndicator(passwordField, "password");

      // Notify the extension
      chrome.runtime.sendMessage({
        action: "loginFormDetected",
        formsCount: 1,
        url: window.location.href,
        domain: window.location.hostname,
      });
    }
  } catch (error) {
    console.error("Error handling new password field:", error);
  }
}

// Cleanup function to remove indicators when navigating away
window.addEventListener("beforeunload", function () {
  clearAutofillIndicators();
});

// Add a check to handle login state changes
function checkLoginState() {
  // Clear any existing timeout
  if (window.loginCheckTimeout) {
    clearTimeout(window.loginCheckTimeout);
  }

  // Try to find login forms
  const forms = findLoginForms();
  const hasLoginForms = forms.length > 0;

  // If we don't find forms but have indicators, clear them
  if (!hasLoginForms && autofillIndicators.length > 0) {
    clearAutofillIndicators();
  }

  // If we don't have indicators but have forms, add them
  if (hasLoginForms && autofillIndicators.length === 0) {
    forms.forEach((form) => {
      if (form.usernameField) {
        addAutofillIndicator(form.usernameField, "username");
      }
      if (form.passwordField) {
        addAutofillIndicator(form.passwordField, "password");
      }
    });
  }

  // Check again after some time
  window.loginCheckTimeout = setTimeout(checkLoginState, 5000);
}

// Start the login state check
checkLoginState();
