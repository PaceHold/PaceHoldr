// =========================
// 1. FIREBASE CONFIG
// =========================
const firebaseConfig = {
  apiKey: "AIzaSyAvfyYoeooY5bx1Z-SGdcEWA-G_zGFY5B8",
  authDomain: "pacehold-4c7b2.firebaseapp.com",
  projectId: "pacehold-4c7b2",
  storageBucket: "pacehold-4c7b2.firebasestorage.app",
  messagingSenderId: "45898843261",
  appId: "1:45898843261:web:4df9b7cb59dd5a1c699d14"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();


// =========================
// 2. SIGN UP USER
// =========================
async function registerUser() {
  const email = document.getElementById("regEmail").value;
  const password = document.getElementById("regPassword").value;
  const role = document.getElementById("regRole").value; // buyer, seller, rider

  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Save role in Firestore
    await db.collection("users").doc(user.uid).set({
      email,
      role
    });

    alert("Account created successfully!");
    window.location.href = "index.html";
  } catch (error) {
    alert(error.message);
  }
}


// =========================
// 3. LOGIN USER
// =========================
async function loginUser() {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Get role from Firestore
    const doc = await db.collection("users").doc(user.uid).get();
    const role = doc.data().role;

    // Redirect based on role
    if (role === "buyer") window.location.href = "buyer.html";
    if (role === "seller") window.location.href = "seller.html";
    if (role === "rider") window.location.href = "rider.html";

  } catch (error) {
    alert(error.message);
  }
}


// =========================
// 4. SESSION CHECK
// =========================
auth.onAuthStateChanged(async (user) => {
  const protectedPages = ["dashboard.html", "buyer.html", "seller.html", "rider.html"];

  if (protectedPages.includes(location.pathname.split("/").pop())) {
    if (!user) {
      window.location.href = "index.html";
    }
  }
});


// =========================
// 5. LOGOUT
// =========================
function logoutUser() {
  auth.signOut();
  window.location.href = "index.html";
}
