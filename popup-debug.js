// popup-debug.js - External script for debug functionality
// This replaces the inline script in popup.html to avoid CSP violations

document.addEventListener("DOMContentLoaded", function () {
    const debugCounter = document.getElementById("debug-counter");
    const debugPanel = document.getElementById("debug-panel");
    const closeDebugBtn = document.getElementById("close-debug-btn");
    const testConnectionBtn = document.getElementById("test-connection-btn");
    const clearStorageBtn = document.getElementById("clear-storage-btn");
    const debugOutput = document.getElementById("debug-output");
  
    let clickCount = 0;
  
    if (debugCounter) {
      debugCounter.addEventListener("click", function () {
        clickCount++;
        if (clickCount >= 5) {
          debugPanel.classList.add("visible");
          clickCount = 0;
        }
      });
    }
  
    if (closeDebugBtn) {
      closeDebugBtn.addEventListener("click", function () {
        debugPanel.classList.remove("visible");
      });
    }
  
    if (testConnectionBtn) {
      testConnectionBtn.addEventListener("click", function () {
        debugOutput.innerHTML = "<p>Testing API connection...</p>";
  
        chrome.storage.local.get(["token"], function(result) {
          if (!result.token) {
            debugOutput.innerHTML += '<p class="error">❌ No authentication token found</p>';
            return;
          }
  
          fetch("https://kael.es/api/vault", {
            method: "GET",
            headers: {
              Authorization: `Bearer ${result.token}`,
              "Content-Type": "application/json",
            },
          })
            .then((response) => {
              if (response.ok) {
                debugOutput.innerHTML +=
                  '<p class="success">✅ API connection successful</p>';
                return response.json();
              } else {
                throw new Error(`API responded with status: ${response.status}`);
              }
            })
            .then((data) => {
              if (data && data.vaultItems) {
                debugOutput.innerHTML += `<p class="success">✅ Retrieved ${data.vaultItems.length} vault items</p>`;
              } else {
                debugOutput.innerHTML +=
                  '<p class="error">⚠️ No vault items in response</p>';
              }
            })
            .catch((error) => {
              debugOutput.innerHTML += `<p class="error">❌ Error: ${error.message}</p>`;
            });
        });
      });
    }
  
    if (clearStorageBtn) {
      clearStorageBtn.addEventListener("click", function () {
        chrome.storage.local.clear(function () {
          debugOutput.innerHTML = '<p class="success">✅ Storage cleared</p>';
        });
      });
    }
  
    // Add storage info button
    const storageInfoBtn = document.createElement("button");
    storageInfoBtn.id = "storage-info-btn";
    storageInfoBtn.className = "secondary-btn";
    storageInfoBtn.textContent = "Storage Info";
    
    if (testConnectionBtn && testConnectionBtn.parentNode) {
      testConnectionBtn.parentNode.insertBefore(storageInfoBtn, clearStorageBtn);
    }
    
    storageInfoBtn.addEventListener("click", function() {
      chrome.storage.local.get(null, function(items) {
        debugOutput.innerHTML = "<p>Current Storage:</p>";
        
        for (const key in items) {
          let value = items[key];
          if (key === 'token' || key === 'refreshToken' || key === 'encryptionKey') {
            // Show only first few characters of sensitive data
            value = typeof value === 'string' ? value.substring(0, 10) + '...' : '[complex value]';
          } else if (typeof value === 'object') {
            value = '[object]';
          }
          
          debugOutput.innerHTML += `<p><strong>${key}:</strong> ${value}</p>`;
        }
      });
    });
  });