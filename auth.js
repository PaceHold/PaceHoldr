// auth.js (modular Firebase SDK v10)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

/* ===== REPLACE THIS WITH YOUR FIREBASE CONFIG ===== */
const firebaseConfig = {
  apiKey: "AIzaSyAvfyYoeooY5bx1Z-SGdcEWA-G_zGFY5B8",
  authDomain: "pacehold-4c7b2.firebaseapp.com",
  projectId: "pacehold-4c7b2",
  storageBucket: "pacehold-4c7b2.firebasestorage.app",
  messagingSenderId: "45898843261",
  appId: "1:45898843261:web:4df9b7cb59dd5a1c699d14"
};
/* ================================================== */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM
const roleButtons = document.querySelectorAll('.role-btn');
const authModal = document.getElementById('authModal');
const closeModal = document.getElementById('closeModal');
const modalTitle = document.getElementById('modalTitle');
const authForm = document.getElementById('authForm');
const fullNameInput = document.getElementById('fullName');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const roleContainer = document.getElementById('roleContainer');
const roleSelect = document.getElementById('roleSelect');
const authSubmit = document.getElementById('authSubmit');
const switchToLogin = document.getElementById('switchToLogin');
const openLogin = document.getElementById('openLogin');

let chosenRole = 'buyer';
let isSignupMode = true;

// show modal with role preselected
roleButtons.forEach(b => b.addEventListener('click', (e) => {
  chosenRole = e.currentTarget.dataset.role || 'buyer';
  openAuthModal(true);
}));

openLogin && openLogin.addEventListener('click', (e) => { e.preventDefault(); openAuthModal(false); });

// modal controls
function openAuthModal(signup=true){
  isSignupMode = signup;
  authModal.setAttribute('aria-hidden','false');
  modalTitle.innerText = signup ? 'Create account' : 'Login';
  roleContainer.style.display = signup ? 'block' : 'none';
  roleSelect.value = chosenRole;
  fullNameInput.style.display = signup ? 'block' : 'none';
  switchToLogin.innerHTML = signup ? 'Already have an account? <a href="#" id="switchToLogin">Login</a>' : 'New here? <a href="#" id="switchToLogin">Create account</a>';
}
closeModal && closeModal.addEventListener('click', ()=> authModal.setAttribute('aria-hidden','true'));

// toggle between signup/login inside modal
authModal.addEventListener('click', (ev) => {
  if(ev.target && ev.target.id === 'switchToLogin'){ ev.preventDefault(); isSignupMode = !isSignupMode; openAuthModal(isSignupMode); }
});

// form submit
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = fullNameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  const role = roleSelect.value || chosenRole || 'buyer';

  try {
    if(isSignupMode){
      if(!name) return alert('Please enter your name or business name');
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      // create user doc
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        name,
        email,
        role,
        balance: 0,
        createdAt: new Date()
      });
      // session - single source of truth
      sessionStorage.setItem('pacehold_user', JSON.stringify({ uid: cred.user.uid, name, role }));
      window.location.href = 'dashboard.html';
    } else {
      // login
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // load user doc
      const ud = await getDoc(doc(db,'users',cred.user.uid));
      const udata = ud.exists() ? ud.data() : { name: cred.user.displayName || '', role: 'buyer' };
      sessionStorage.setItem('pacehold_user', JSON.stringify({ uid: cred.user.uid, name: udata.name, role: udata.role }));
      window.location.href = 'dashboard.html';
    }
  } catch(err){
    alert(err.message);
  }
});

// if already signed in (page refresh / direct open), redirect safely
onAuthStateChanged(auth, async (user) => {
  // user is either null or the logged in user
  if(user){
    // ensure session is set (one-time)
    if(!sessionStorage.getItem('pacehold_user')){
      const ud = await getDoc(doc(db,'users', user.uid));
      const udata = ud.exists() ? ud.data() : { name: user.displayName || '', role: 'buyer' };
      sessionStorage.setItem('pacehold_user', JSON.stringify({ uid: user.uid, name: udata.name, role: udata.role }));
    }
    // redirect to dashboard (only if not already)
    if(!window.location.href.includes('dashboard.html')) window.location.href = 'dashboard.html';
  } else {
    // keep at landing page (no redirect to login)
  }
});
