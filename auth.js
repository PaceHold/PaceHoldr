// auth.js - handles signup, login, and redirects to role selection
(function(){
  if(!window.auth || !window.db) {
    console.error('firebase-config.js not loaded or firebase missing.');
    return;
  }

  const openSignup = document.getElementById('openSignup');
  const openLogin = document.getElementById('openLogin');
  const authModal = document.getElementById('authModal');
  const closeModal = document.getElementById('closeModal');
  const modalTitle = document.getElementById('modalTitle');
  const authForm = document.getElementById('authForm');
  const fullNameInput = document.getElementById('fullName');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const authSubmit = document.getElementById('authSubmit');
  const switchToLogin = document.getElementById('switchToLogin');

  let signupMode = true;

  function openModal(mode){
    signupMode = !!mode;
    modalTitle.innerText = signupMode ? 'Create account' : 'Login';
    authModal.classList.add('visible');
  }
  function close(){
    authModal.classList.remove('visible');
  }

  openSignup.addEventListener('click', ()=> openModal(true));
  openLogin.addEventListener('click', ()=> openModal(false));
  closeModal.addEventListener('click', close);
  switchToLogin.addEventListener('click', ()=> openModal(!signupMode));

  authForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = fullNameInput.value && fullNameInput.value.trim();
    const email = emailInput.value && emailInput.value.trim();
    const password = passwordInput.value && passwordInput.value.trim();

    if(signupMode){
      if(!name) return alert('Enter a name or business name');
      try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
        // Do NOT set role yet (Option B). Redirect user to role selection.
        // Create minimal user doc (role will be set on role page)
        await db.collection('users').doc(cred.user.uid).set({
          uid: cred.user.uid,
          name,
          email,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        sessionStorage.setItem('pacehold_user', JSON.stringify({ uid: cred.user.uid }));
        window.location.href = 'role.html';
      } catch(err){ alert(err.message); }
    } else {
      // login
      try {
        const cred = await auth.signInWithEmailAndPassword(email, password);
        // check if role exists
        const udoc = await db.collection('users').doc(cred.user.uid).get();
        const data = udoc.exists ? udoc.data() : null;
        sessionStorage.setItem('pacehold_user', JSON.stringify({ uid: cred.user.uid }));
        if(data && data.role) window.location.href = 'dashboard.html';
        else window.location.href = 'role.html';
      } catch(err){ alert(err.message); }
    }
  });

  // on auth change keep session up to date
  auth.onAuthStateChanged(async user=>{
    if(user){
      sessionStorage.setItem('pacehold_user', JSON.stringify({ uid: user.uid }));
    } else {
      sessionStorage.removeItem('pacehold_user');
    }
  });

})();
