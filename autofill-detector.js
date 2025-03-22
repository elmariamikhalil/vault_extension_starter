// autofill-detector.js
// This script is injected by the background script to detect password fields

// Find login forms on the page
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

// Detect login forms and notify the extension
(function () {
  const forms = findLoginForms();

  if (forms.length > 0) {
    // Notify extension that the page has login forms
    chrome.runtime.sendMessage({
      action: "loginFormDetected",
      formsCount: forms.length,
      url: window.location.href,
      domain: window.location.hostname,
    });
  }
})();
