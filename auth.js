// auth.js — signup / login + post-signup role selection
// Requires firebase-config.js (auth & db)

(function(){
  // DOM
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

  const roleModal = document.getElementById('roleModal');
  const roleBuyer = document.getElementById('roleBuyer');
  const roleSeller = document.getElementById('roleSeller');
  const roleRider = document.getElementById('roleRider');

  let justSignedUpUser = null; // store auth user after signup so role selection can finish

  function openAuthModal(isSignup = true){
    authModal.classList.add('visible');
    modalTitle.innerText = isSignup ? 'Create account' : 'Login';
    authSubmit.innerText = isSignup ? 'Create account' : 'Login';
  }
  openSignup.addEventListener('click', ()=> openAuthModal(true));
  openLogin.addEventListener('click', ()=> openAuthModal(false));
  closeModal.addEventListener('click', ()=> authModal.classList.remove('visible'));
  switchToLogin.addEventListener('click', ()=> openAuthModal(false));

  authForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = fullNameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const isSignup = (modalTitle.innerText || '').toLowerCase().includes('create');

    if(isSignup){
      if(!name) return alert('Enter your name');
      try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
        // store minimal user doc without role yet
        await db.collection('users').doc(cred.user.uid).set({
          uid: cred.user.uid,
          name,
          email,
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge:true });
        // create wallet doc
        await db.collection('wallets').doc(cred.user.uid).set({ uid: cred.user.uid, balance: 0, escrowHeld: 0 }, { merge:true });
        justSignedUpUser = cred.user;
        // close auth modal and show role modal
        authModal.classList.remove('visible');
        showRoleModal();
      } catch(err){
        alert(err.message);
      }
    } else {
      try {
        await auth.signInWithEmailAndPassword(email, password);
        // after login, redirect to dashboard
        window.location.href = 'dashboard.html';
      } catch(err){
        alert(err.message);
      }
    }
  });

  function showRoleModal(){
    roleModal.classList.add('visible');
  }
  function hideRoleModal(){
    roleModal.classList.remove('visible');
  }

  async function setRoleForLastSignup(role){
    if(!justSignedUpUser) return alert('No signup in progress');
    const uid = justSignedUpUser.uid;
    // set role once; if a role already exists do not overwrite
    const doc = await db.collection('users').doc(uid).get();
    if(doc.exists && doc.data().role){
      // role exists (somehow) — just redirect
      hideRoleModal();
      window.location.href = 'dashboard.html';
      return;
    }
    await db.collection('users').doc(uid).set({ role, name: justSignedUpUser.displayName || '', email: justSignedUpUser.email || '' }, { merge:true });
    hideRoleModal();
    window.location.href = 'dashboard.html';
  }

  roleBuyer.addEventListener('click', ()=> setRoleForLastSignup('buyer'));
  roleSeller.addEventListener('click', ()=> setRoleForLastSignup('seller'));
  roleRider.addEventListener('click', ()=> setRoleForLastSignup('rider'));

  // If user somehow signs up but closes the role modal, we still redirect and they will have no role.
  // But normal flow sets a role immediately.
})();
