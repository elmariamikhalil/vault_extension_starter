document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  const vaultSection = document.getElementById("vault");
  const vaultList = document.getElementById("vault-list");
  const logoutBtn = document.getElementById("logout");

  async function loadVault() {
    const token = localStorage.getItem("token");
    if (!token) return;

    const res = await fetch("https://kael.es/api/vault", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const vaultItems = await res.json();

    document.getElementById("login-section").style.display = "none";
    vaultSection.style.display = "block";
    vaultList.innerHTML = "";

    vaultItems.forEach((item, index) => {
      const div = document.createElement("div");
      div.className = "vault-card";
      const passwordId = `pw-${index}`;
      const toggleId = `toggle-${index}`;
      div.innerHTML = `
        <div class="vault-site">${item.site}</div>
        <div class="vault-username">${item.username}</div>
        <div class="vault-password">
          <input type="password" value="${item.password}" readonly id="${passwordId}" />
          <button id="${toggleId}" class="show-btn">Show</button>
        </div>
      `;
      vaultList.appendChild(div);

      setTimeout(() => {
        const pwInput = document.getElementById(passwordId);
        const toggleBtn = document.getElementById(toggleId);
        toggleBtn.addEventListener("click", () => {
          const isHidden = pwInput.type === "password";
          pwInput.type = isHidden ? "text" : "password";
          toggleBtn.textContent = isHidden ? "Hide" : "Show";
        });
      }, 0);
    });
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = loginForm.email.value;
    const password = loginForm.password.value;

    const res = await fetch("https://kael.es/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (data.token) {
      localStorage.setItem("token", data.token);
      loadVault();
    } else {
      alert("Login failed");
    }
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("token");
    location.reload();
  });
  document.getElementById("add-btn").addEventListener("click", async () => {
    const site = document.getElementById("new-site").value;
    const username = document.getElementById("new-username").value;
    const password = document.getElementById("new-password").value;
    const token = localStorage.getItem("token");

    if (!site || !username || !password)
      return alert("All fields are required!");

    const res = await fetch("https://kael.es/api/vault", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ site, username, password }),
    });

    if (res.ok) {
      document.getElementById("new-site").value = "";
      document.getElementById("new-username").value = "";
      document.getElementById("new-password").value = "";
      loadVault(); // Refresh list
    } else {
      alert("Failed to add password.");
    }
  });

  if (localStorage.getItem("token")) {
    loadVault();
  }
});
