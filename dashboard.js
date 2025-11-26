import { 
    auth, 
    db 
} from "./script.js";

import { 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// -------------------------------
// WAIT FOR USER AUTH STATE
// -------------------------------
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // Not logged in → go back to login
        window.location.href = "index.html";
        return;
    }

    const uid = user.uid;

    try {
        // -------------------------------
        // FETCH USER DOCUMENT
        // -------------------------------
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            console.error("User document missing in Firestore");
            return;
        }

        const userData = userSnap.data();

        // -------------------------------
        // UPDATE USER INFO
        -------------------------------
        document.getElementById("username").innerText = userData.username || "N/A";
        document.getElementById("email").innerText = userData.email || "N/A";
        document.getElementById("role").innerText = userData.role || "N/A";
        document.getElementById("uid").innerText = uid;

        // Format createdAt timestamp
        if (userData.createdAt && userData.createdAt.toDate) {
            document.getElementById("createdAt").innerText =
                userData.createdAt.toDate().toLocaleString();
        } else {
            document.getElementById("createdAt").innerText = "N/A";
        }

        // -------------------------------
        // LOAD WALLET DOCUMENT
        // -------------------------------
        const walletRef = doc(db, "wallets", uid);
        const walletSnap = await getDoc(walletRef);

        if (walletSnap.exists()) {
            const wallet = walletSnap.data();
            document.getElementById("balance").innerText = wallet.balance ?? 0;
            document.getElementById("escrowHeld").innerText = wallet.escrowHeld ?? 0;
        } else {
            // Wallet not created yet
            document.getElementById("balance").innerText = 0;
            document.getElementById("escrowHeld").innerText = 0;
        }

    } catch (error) {
        console.error("Error loading dashboard:", error);
    }
});
