// popup-inline.js - External script for any remaining inline scripts in popup.html

document.addEventListener("DOMContentLoaded", function () {
  // Debug panel toggle with click counter
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

      fetch("https://kael.es/api/vault", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
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
  }

  if (clearStorageBtn) {
    clearStorageBtn.addEventListener("click", function () {
      chrome.storage.local.clear(function () {
        debugOutput.innerHTML = '<p class="success">✅ Storage cleared</p>';
      });
    });
  }
});
