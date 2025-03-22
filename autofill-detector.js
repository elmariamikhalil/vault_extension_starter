// autofill-detector.js
// Enhanced script to detect password fields and forms on any website

// Find login forms on the page with improved detection
function findLoginForms() {
  const forms = [];

  try {
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
      const passwordFields = document.querySelectorAll(
        'input[type="password"]'
      );

      for (const passwordField of passwordFields) {
        // For each password field, try to find its container
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
            shadowRoots = shadowRoots.concat(
              getAllShadowRoots(childShadowHosts)
            );
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
  } catch (e) {
    console.error("Error finding login forms:", e);
  }

  return forms;
}

// Enhanced username field detection
function findUsernameField(container) {
  try {
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
        const type = input.type ? input.type.toLowerCase() : "";
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
  } catch (e) {
    console.error("Error finding username field:", e);
  }

  return null;
}

// Improved form container detection
function findFormContainer(passwordField) {
  try {
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
      const elementId = parent.id ? parent.id.toLowerCase() : "";
      const elementClass = parent.className
        ? parent.className.toLowerCase()
        : "";

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
  } catch (e) {
    console.error("Error finding form container:", e);
    return passwordField.parentElement; // Fallback to direct parent
  }
}

// Enhanced visibility check
function isVisible(element) {
  if (!element) return false;

  try {
    // Check if element or any parent has display:none, visibility:hidden, or opacity:0
    let currentElement = element;
    while (currentElement) {
      const style = window.getComputedStyle(currentElement);

      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0" ||
        parseFloat(style.opacity) === 0
      ) {
        return false;
      }

      currentElement = currentElement.parentElement;
    }

    // Check element dimensions
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

    return true;
  } catch (e) {
    console.error("Error checking element visibility:", e);
    return false;
  }
}

// Detect login forms and notify the extension
(function () {
  // Wait a brief moment for dynamic content to load
  setTimeout(() => {
    try {
      const forms = findLoginForms();

      if (forms.length > 0) {
        console.log(
          `SecureVault detected ${forms.length} login forms on ${window.location.hostname}`
        );

        // Notify extension that login forms were found
        chrome.runtime.sendMessage(
          {
            action: "loginFormDetected",
            formsCount: forms.length,
            url: window.location.href,
            domain: window.location.hostname,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              // This is normal when the extension can't establish connection
              console.log(
                "Communication with extension not established:",
                chrome.runtime.lastError.message
              );
            } else {
              console.log("Message sent successfully:", response);
            }
          }
        );
      }
    } catch (error) {
      console.error("Error in SecureVault autofill detector:", error);
    }
  }, 1000); // Increased delay to ensure dynamic content is loaded
})();

// Setup mutation observer to detect dynamically added forms
try {
  const observer = new MutationObserver(function (mutations) {
    // Debounce the handler to avoid excessive processing
    if (observer.timeout) {
      clearTimeout(observer.timeout);
    }

    observer.timeout = setTimeout(() => {
      try {
        const forms = findLoginForms();
        if (forms.length > 0) {
          // Notify extension about newly detected forms
          chrome.runtime.sendMessage({
            action: "loginFormDetected",
            formsCount: forms.length,
            url: window.location.href,
            domain: window.location.hostname,
          });
        }
      } catch (error) {
        console.error("Error in mutation observer handler:", error);
      }
    }, 500);
  });

  // Start observing the document with the configured parameters
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });
} catch (e) {
  console.error("Error setting up mutation observer:", e);
}
