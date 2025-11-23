// ============================
// DASHBOARD.JS  (UPDATED)
// ============================

// Firebase initialization (keep your existing config)
const auth = firebase.auth();
const db = firebase.firestore();

// Detect current user
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    const uid = user.uid;

    // Fetch logged-in user data
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();

    const userRole = userData.role;
    const username = userData.username;
    const userUID = userData.uid;

    // Display user details
    document.getElementById("usernameDisplay").innerText = username;
    document.getElementById("roleDisplay").innerText = userRole.toUpperCase();
    document.getElementById("uidDisplay").innerText = userUID;

    // Load search based on role
    loadSearchList(userRole);
});


// ===========================
// ROLE-BASED USER SEARCH
// ===========================

async function loadSearchList(role) {
    const listContainer = document.getElementById("searchResults");

    // Clear existing
    listContainer.innerHTML = "";

    // ❌ RIDER SHOULD NOT SEE BUYERS OR SELLERS
    if (role === "rider") {
        listContainer.innerHTML =
            `<p style="color:#8899AA; font-size:14px; text-align:center;">
                Riders cannot search for buyers or sellers.
            </p>`;
        return; // ⛔ STOP HERE
    }

    // ✅ BUYER → should see only SELLERS
    // ✅ SELLER → should see only BUYERS
    let targetRole = "";

    if (role === "buyer") targetRole = "seller";
    if (role === "seller") targetRole = "buyer";

    const usersSnap = await db.collection("users")
        .where("role", "==", targetRole)
        .get();

    if (usersSnap.empty) {
        listContainer.innerHTML =
            `<p style="color:#8899AA; text-align:center;">No users found.</p>`;
        return;
    }

    usersSnap.forEach(doc => {
        const data = doc.data();
        const userItem = document.createElement("div");

        userItem.className = "search-item";

        userItem.innerHTML = `
            <strong style="font-size:15px;">${data.username}</strong>
            <p style="font-size:12px; color:#7a8a9a;">UID: ${data.uid}</p>
        `;

        // Click → open chat
        userItem.addEventListener("click", () => {
            openChatWith(data.uid, data.username);
        });

        listContainer.appendChild(userItem);
    });
}


// ===========================
// CHAT SYSTEM
// (Your existing chat logic remains the same)
// ===========================

async function openChatWith(targetUID, targetName) {
    document.getElementById("chatName").innerText = targetName;
    document.getElementById("chatBox").style.display = "flex";
    loadMessages(targetUID);
}

async function sendMessage() {
    const message = document.getElementById("messageInput").value.trim();
    if (message === "") return;

    const user = auth.currentUser;
    const sender = user.uid;

    const chatRef = db.collection("messages").doc();
    await chatRef.set({
        senderUID: sender,
        message: message,
        timestamp: Date.now()
    });

    document.getElementById("messageInput").value = "";
}

function loadMessages(targetUID) {
    // Your existing chat loading logic remains untouched
}


// ===========================
// LOGOUT
// ===========================
function logout() {
    auth.signOut();
}
