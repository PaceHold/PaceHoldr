// auth.js — registration, login, safe session handling (compat)
(function(){
  if(!window.firebase) return console.error('Firebase not loaded');

  // DOM
  const roleButtons = document.querySelectorAll('.role-btn');
  const authModal = document.getElementById('authModal');
  const closeModal = document.getElementById('closeModal');
  const modalTitle = document.getElementById('modalTitle');
  const authForm = document.getElementById('authForm');
  const fullNameInput = document.getElementById('fullName');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const roleSelect = document.getElementById('roleSelect');
  const roleContainer = document.getElementById('roleContainer');
  const openLogin = document.getElementById('openLogin');
  const switchModeLine = document.getElementById('switchModeLine');

  let chosenRole = 'buyer';
  let isSignupMode = true;

  // open modal for chosen role
  roleButtons.forEach(btn => btn.addEventListener('click', (e)=>{
    chosenRole = e.currentTarget.dataset.role || 'buyer';
    openAuthModal(true);
  }));

  openLogin && openLogin.addEventListener('click', (e)=> { e.preventDefault(); openAuthModal(false); });

  function openAuthModal(signup = true) {
    isSignupMode = signup;
    authModal.setAttribute('aria-hidden','false');
    modalTitle.innerText = signup ? 'Create account' : 'Login';
    roleContainer.style.display = signup ? 'block' : 'none';
    roleSelect.value = chosenRole;
    fullNameInput.style.display = signup ? 'block' : 'none';
    switchModeLine.innerHTML = signup ? 'Already have an account? <a href="#" id="switchToLogin">Login</a>' : 'New here? <a href="#" id="switchToLogin">Create account</a>';
  }

  closeModal && closeModal.addEventListener('click', ()=> authModal.setAttribute('aria-hidden','true'));
  authModal.addEventListener('click', (ev)=> {
    if(ev.target && ev.target.id === 'switchToLogin'){ ev.preventDefault(); isSignupMode = !isSignupMode; openAuthModal(isSignupMode); }
  });

  // AUTH FORM SUBMIT
  authForm && authForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = (fullNameInput.value || '').trim();
    const email = (emailInput.value || '').trim();
    const password = (passwordInput.value || '').trim();
    const role = roleSelect.value || chosenRole || 'buyer';
    if(isSignupMode){
      if(!name) return alert('Enter name/business name');
      try {
        const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
        await db.collection('users').doc(cred.user.uid).set({
          uid: cred.user.uid, name, email, role, balance: 0, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // set session only after auth confirmed to avoid flashes
        sessionStorage.setItem('pacehold_user', JSON.stringify({ uid: cred.user.uid, name, role }));
        window.location.href = role + '.html';
      } catch(err){ alert(err.message); }
    } else {
      // login
      try {
        const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
        const ud = await db.collection('users').doc(cred.user.uid).get();
        const u = ud.exists ? ud.data() : { name: cred.user.displayName || '', role: 'buyer' };
        sessionStorage.setItem('pacehold_user', JSON.stringify({ uid: cred.user.uid, name: u.name, role: u.role }));
        window.location.href = u.role + '.html';
      } catch(err){ alert(err.message); }
    }
  });

  // safe onAuthStateChanged to set session when returning
  firebase.auth().onAuthStateChanged(async (user)=>{
    if(user){
      if(!sessionStorage.getItem('pacehold_user')){
        const ud = await db.collection('users').doc(user.uid).get();
        const u = ud.exists ? ud.data() : { name: user.displayName || '', role: 'buyer' };
        sessionStorage.setItem('pacehold_user', JSON.stringify({ uid: user.uid, name: u.name, role: u.role }));
      }
    } else {
      sessionStorage.removeItem('pacehold_user');
    }
  });

})();
