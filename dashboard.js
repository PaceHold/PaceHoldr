// Switch Tabs
const tabButtons = document.querySelectorAll(".tab-btn");
const pages = document.querySelectorAll(".page");

tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        tabButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        pages.forEach(page => page.classList.remove("active"));
        document.getElementById(btn.dataset.tab).classList.add("active");
    });
});

// Firebase Auth Example
firebase.auth().onAuthStateChanged(user => {
    if (user) {
        document.getElementById("userEmail").textContent = user.email;
        getWalletBalance(user.uid);
        loadTransactions(user.uid);
        loadEscrows(user.uid);
    } else {
        window.location.href = "login.html";
    }
});

// Example placeholders
function getWalletBalance(uid) {
    document.getElementById("walletAmount").textContent = "₦50,000";
}

function loadTransactions(uid) {
    document.getElementById("transactionList").innerHTML =
        "<li>No recent transactions</li>";
}

function loadEscrows(uid) {
    document.getElementById("escrowList").innerHTML =
        "<li>No escrow yet</li>";
}

function logout() {
    firebase.auth().signOut();
}
