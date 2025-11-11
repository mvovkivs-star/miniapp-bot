const API = "http://127.0.0.1:8000"; 
let token = null;

document.getElementById("loginBtn").onclick = async () => {
  const username = document.getElementById("user").value;
  const password = document.getElementById("pass").value;
  const res = await fetch(`${API}/login?username=${username}&password=${password}`, { method: "POST" });
  const data = await res.json();
  if (res.ok) {
    token = data.token;
    document.getElementById("loginInfo").textContent = `OK, роль: ${data.role}`;
    document.getElementById("userOps").style.display = "block";
  } else {
    document.getElementById("loginInfo").textContent = data.detail || "Помилка";
  }
};

document.getElementById("fetchBtn").onclick = async () => {
  const telegram_id = document.getElementById("tgid").value;
  const res = await fetch(`${API}/users/${telegram_id}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  document.getElementById("userInfo").textContent = await res.text();
};

document.getElementById("deltaBtn").onclick = async () => {
  const telegram_id = document.getElementById("tgid").value;
  const amount = parseFloat(document.getElementById("delta").value);
  const reason = document.getElementById("reasonDelta").value;
  const res = await fetch(`${API}/balance/delta?telegram_id=${telegram_id}&amount=${amount}&reason=${reason}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` }
  });
  document.getElementById("userInfo").textContent = await res.text();
};

document.getElementById("setBtn").onclick = async () => {
  const telegram_id = document.getElementById("tgid").value;
  const balance = parseFloat(document.getElementById("setBal").value);
  const reason = document.getElementById("reasonSet").value;
  const res = await fetch(`${API}/balance/set?telegram_id=${telegram_id}&balance=${balance}&reason=${reason}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` }
  });
  document.getElementById("userInfo").textContent = await res.text();
};

document.getElementById("blockBtn").onclick = async () => {
  const telegram_id = document.getElementById("tgid").value;
  const reason = document.getElementById("reasonBlock").value;
  const res = await fetch(`${API}/block?telegram_id=${telegram_id}&reason=${reason}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` }
  });
  document.getElementById("userInfo").textContent = await res.text();
};

document.getElementById("unblockBtn").onclick = async () => {
  const telegram_id = document.getElementById("tgid").value;
  const reason = document.getElementById("reasonBlock").value;
  const res = await fetch(`${API}/unblock?telegram_id=${telegram_id}&reason=${reason}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` }
  });
  document.getElementById("userInfo").textContent = await res.text();
};
