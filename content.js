// content.js - Enhanced content script for SecureVault with improved form detection

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.action === "fillCredentials") {
    fillCredentials(message.username, message.password);
    sendResponse({ success: true });
  } else if (message.action === "showCredentialPicker") {
    showCredentialPicker(message.domain);
    sendResponse({ success: true });
  } else if (message.action === "showPasswordGenerator") {
    showPasswordGenerator();
    sendResponse({ success: true });
  }
  return true;
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

      // Only fill one form
      break;
    }
  }

  return filledForm;
}

// Find all login forms on the page
function findLoginForms() {
  const forms = [];

  // First check for actual <form> elements
  document.querySelectorAll("form").forEach((formElement) => {
    const passwordField = formElement.querySelector('input[type="password"]');

    // Only consider forms with password fields
    if (passwordField) {
      // Find the username field in the same form
      const usernameField = findUsernameField(formElement);

      forms.push({
        element: formElement,
        usernameField: usernameField,
        passwordField: passwordField,
      });
    }
  });

  // If no forms with password fields were found, look for password fields outside forms
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

  return forms;
}

// Find a username field in a container
function findUsernameField(container) {
  // First, try to find fields with specific attributes
  const selectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[id="email"]',
    'input[name*="email"]',
    'input[id*="email"]',
    'input[name="username"]',
    'input[id="username"]',
    'input[name*="username"]',
    'input[id*="username"]',
    'input[autocomplete="username"]',
    'input[autocomplete="email"]',
  ];

  for (const selector of selectors) {
    const field = container.querySelector(selector);
    if (field) return field;
  }

  // If no specific fields found, try to find the first visible text input
  const textInputs = container.querySelectorAll('input[type="text"]');
  for (const input of textInputs) {
    if (isVisible(input)) return input;
  }

  // Last resort: any input that's not a password, hidden, or submit type
  const allInputs = container.querySelectorAll("input");
  for (const input of allInputs) {
    const type = input.type.toLowerCase();
    if (
      type !== "password" &&
      type !== "hidden" &&
      type !== "submit" &&
      type !== "button" &&
      isVisible(input)
    ) {
      return input;
    }
  }

  return null;
}

// Find a container that might act as a form
function findFormContainer(passwordField) {
  // Try to find common container elements
  const containerId = [
    "loginForm",
    "login-form",
    "login_form",
    "signin",
    "sign-in",
    "auth",
  ];
  const containerClass = ["login", "signin", "sign-in", "auth", "form"];

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

  // If no specific container found, walk up the DOM tree to find a suitable parent
  let parent = passwordField.parentElement;
  while (parent && parent !== document.body) {
    // If the parent contains both a non-password input and our password field, it's likely a form
    const inputs = parent.querySelectorAll("input");
    let hasText = false;
    let hasPassword = false;

    for (const input of inputs) {
      if (input.type === "password") hasPassword = true;
      if (input.type === "text" || input.type === "email") hasText = true;
    }

    if (hasText && hasPassword) {
      return parent;
    }

    parent = parent.parentElement;
  }

  // Last resort: return the immediate parent
  return passwordField.parentElement;
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
    const buttonText = button.textContent.toLowerCase();
    if (submitKeywords.some((keyword) => buttonText.includes(keyword))) {
      return button;
    }
  }

  // Look for elements that look like buttons
  const clickables = formElement.querySelectorAll("a, div, span");
  for (const element of clickables) {
    const text = element.textContent.toLowerCase();
    if (submitKeywords.some((keyword) => text.includes(keyword))) {
      return element;
    }
  }

  return null;
}

// Function to set value and trigger events
function setFieldValue(field, value) {
  // Store original properties
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  );
  const originalValue = field.value;

  // Set field value
  field.value = value;

  // Trigger events to notify the page that the field was updated
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("blur", { bubbles: true }));

  // Focus the field
  field.focus();
}

// Check if an element is visible
function isVisible(element) {
  if (!element) return false;

  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    element.offsetWidth > 0 &&
    element.offsetHeight > 0
  );
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

      // Continuing from the previous content.js snippet

      // Try to get a meaningful name
      let displayName = "Unknown Site";
      let username = "";

      // If we have metadata with encrypted data, we need to decrypt it
      if (item.encryptedData) {
        // Request decryption from background/popup
        chrome.runtime.sendMessage(
          { action: "decryptVaultItem", itemId: item._id },
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
}

// Detect password fields on page load and add indicators
(function detectPasswordFields() {
  const forms = findLoginForms();

  if (forms.length > 0) {
    // Notify extension that the page has login forms
    chrome.runtime.sendMessage({
      action: "loginFormDetected",
      formsCount: forms.length,
    });

    // Add autofill indicators for each form
    forms.forEach((form, index) => {
      if (form.usernameField) {
        addAutofillIndicator(form.usernameField, "username");
      }

      if (form.passwordField) {
        addAutofillIndicator(form.passwordField, "password");
      }
    });
  }
})();

// Add autofill indicator next to a field
function addAutofillIndicator(field, type) {
  // Only add if the field is visible
  if (!isVisible(field)) return;

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

  // Reposition indicator on scroll and resize
  window.addEventListener("scroll", updateIndicatorPosition);
  window.addEventListener("resize", updateIndicatorPosition);

  // Update indicator position
  function updateIndicatorPosition() {
    const updatedRect = field.getBoundingClientRect();
    indicator.style.top = `${
      window.scrollY + updatedRect.top + updatedRect.height / 2 - 10
    }px`;
    indicator.style.left = `${window.scrollX + updatedRect.right + 5}px`;

    // Hide indicator if field is not visible
    if (!isVisible(field)) {
      indicator.style.display = "none";
    } else {
      indicator.style.display = "flex";
    }
  }
}
