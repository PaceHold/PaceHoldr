// ----------------------------
// FIREBASE CONFIG
// ----------------------------
const firebaseConfig = {
  apiKey: "AIzaSyAvfyYoeooY5bx1Z-SGdcEWA-G_zGFY5B8",
  authDomain: "pacehold-4c7b2.firebaseapp.com",
  projectId: "pacehold-4c7b2",
  storageBucket: "pacehold-4c7b2.firebasestorage.app",
  messagingSenderId: "45898843261",
  appId: "1:45898843261:web:4df9b7cb59dd5a1c699d14"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ----------------------------
// AUTH CHECK
// ----------------------------
firebase.auth().onAuthStateChanged(user => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    getWalletBalance(user.uid);
  }
});

// ----------------------------
// FUND WALLET (PAYSTACK)
// ----------------------------
function fundWallet() {
  let amount = prompt("Enter amount to fund (₦):");

  if (!amount || isNaN(amount)) {
    alert("Enter a valid amount");
    return;
  }

  amount = amount * 100; // convert to kobo

  const user = firebase.auth().currentUser;
  if (!user) return alert("Not logged in");

  let handler = PaystackPop.setup({
    key: "pk_live_xxxxxxxxxxxxxxx", // <-- Replace with your REAL Paystack PUBLIC KEY
    email: user.email,
    amount: amount,
    currency: "NGN",

    callback: function (response) {
      savePaymentToFirestore(user.uid, amount / 100, response.reference);
    },

    onClose: function () {
      alert("Payment closed");
    }
  });

  handler.openIframe();
}

// ----------------------------
// SAVE PAYSTACK PAYMENT
// ----------------------------
function savePaymentToFirestore(uid, amount, reference) {
  const paymentRef = db.collection("users").doc(uid)
    .collection("payments").doc(reference);

  paymentRef.set({
    amount: amount,
    reference: reference,
    status: "successful",
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  })
  .then(() => {
    updateWalletBalance(uid, amount);
  });
}

// ----------------------------
// UPDATE FIRESTORE WALLET
// ----------------------------
function updateWalletBalance(uid, amount) {
  const walletRef = db.collection("users").doc(uid)
    .collection("wallet").doc("balance");

  walletRef.get().then(doc => {
    if (doc.exists) {
      walletRef.update({ amount: doc.data().amount + amount });
    } else {
      walletRef.set({ amount: amount });
    }
  })
  .then(() => {
    alert("Wallet funded successfully!");
  });
}

// ----------------------------
// REAL-TIME WALLET LISTENER
// ----------------------------
function getWalletBalance(uid) {
  const walletRef = db.collection("users").doc(uid)
    .collection("wallet").doc("balance");

  walletRef.onSnapshot(doc => {
    if (doc.exists) {
      document.getElementById("walletAmount").textContent =
        "₦" + doc.data().amount.toLocaleString();
    } else {
      document.getElementById("walletAmount").textContent = "₦0.00";
    }
  });
}

// ----------------------------
// LOGOUT
// ----------------------------
function logout() {
  firebase.auth().signOut().then(() => {
    window.location.href = "index.html";
  });
}
