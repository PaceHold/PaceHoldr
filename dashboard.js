// dashboard.js (compat) — central dashboard logic (tabbed, role-aware, search + paystack)
// Assumes firebase-config.js already loaded (so window.auth, window.db available)

// ---------- helpers ----------
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function debounce(fn, delay=300){ let t; return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), delay); }; }

// DOM
const welcomeName = document.getElementById('welcomeName');
const roleLabel = document.getElementById('roleLabel');
const topUser = document.getElementById('topUser');
const logoutBtn = document.getElementById('logoutBtn');
const userList = document.getElementById('userList');
const searchInput = document.getElementById('searchInput');
const refreshUsersBtn = document.getElementById('refreshUsers');
const roleArea = document.getElementById('roleArea');
const createEscrowBtn = document.getElementById('createEscrowBtn');
const fundWalletBtn = document.getElementById('fundWalletBtn');
const chatFab = document.getElementById('chatFab');
const chatPanel = document.getElementById('chatPanel');
const chatBadge = document.getElementById('chatBadge');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');

// state
let currentUser = null;
let usersCache = []; // cached list of counterpart users
let txUnsub = null;

// ---------- auth guard & initial load ----------
auth.onAuthStateChanged(async user=>{
  if(!user) return window.location.href = 'index.html';
  // load user doc
  const udoc = await db.collection('users').doc(user.uid).get();
  if(!udoc.exists || !udoc.data().role) return window.location.href = 'role.html';
  currentUser = { uid: user.uid, ...(udoc.data()||{}) };
  welcomeName.innerText = `Hi, ${currentUser.name || 'User'}`;
  roleLabel.innerText = `Role: ${currentUser.role || '-'}`;
  topUser.innerText = currentUser.name || user.email || user.uid;

  attachUserList();
  attachSearch();
  listenTransactions();
  renderRoleArea(currentUser.role);
});

// logout
logoutBtn.addEventListener('click', ()=> auth.signOut().then(()=> window.location.href='index.html') );

// refresh list
if(refreshUsersBtn) refreshUsersBtn.addEventListener('click', ()=> attachUserList() );

// chat toggle
function toggleChatPanel(){ chatPanel.style.display = chatPanel.style.display === 'none' ? 'flex' : 'none'; }
function closeChatPanel(){ chatPanel.style.display = 'none'; }
window.toggleChatPanel = toggleChatPanel; window.closeChatPanel = closeChatPanel;

// send chat (placeholder - simple writes to 'chats' collection)
sendMessageBtn.addEventListener('click', async ()=>{
  const txt = messageInput.value && messageInput.value.trim();
  if(!txt) return;
  const now = firebase.firestore.FieldValue.serverTimestamp();
  await db.collection('chats').add({
    from: currentUser.uid,
    text: txt,
    ts: now
  });
  messageInput.value = '';
  alert('Message sent (chat UI is a placeholder).');
});

// ---------- user list (counterpart selection) ----------
function getTargetRole(role){
  if(role === 'buyer') return 'seller';
  if(role === 'seller') return 'rider';
  if(role === 'rider') return 'seller';
  return 'seller';
}

function attachUserList(){
  const target = getTargetRole(currentUser.role);
  // load small set first then realtime listener
  db.collection('users').where('role','==',target).limit(200).get().then(snap=>{
    usersCache = [];
    snap.forEach(d=> usersCache.push({ id:d.id, uid:d.id, ...d.data() }));
    renderUserList(usersCache);
  });
  // live updates
  db.collection('users').where('role','==',target).onSnapshot(snap=>{
    usersCache = [];
    snap.forEach(d=> usersCache.push({ id:d.id, uid:d.id, ...d.data() }));
    renderUserList(usersCache);
  });
}

function renderUserList(list){
  if(!list || list.length===0){
    userList.innerHTML = `<div style="color:#bbb;text-align:center;padding:10px">No users found</div>`;
    return;
  }
  userList.innerHTML = list.map(u=>`
    <div class="user-row" data-id="${u.uid || u.id}">
      <div>
        <div style="font-weight:700">${escapeHtml(u.name||u.email||'Unnamed')}</div>
        <div class="small muted">${escapeHtml(u.role||'')}</div>
      </div>
      <div class="small">${escapeHtml(u.email||'')}</div>
    </div>
  `).join('');
  document.querySelectorAll('.user-row').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id = el.dataset.id;
      const picked = usersCache.find(x=> (x.uid||x.id) === id ) || { uid:id };
      if(picked) openChatWith(picked);
    });
  });
}

// open chat with a user (simple placeholder)
function openChatWith(user){
  document.getElementById('chatWith').innerText = user.name || user.email || user.uid;
  chatPanel.style.display = 'flex';
}

// ---------- SEARCH (debounced Firestore prefix + local fallback) ----------
async function searchUsersForQuery(q) {
  const targetRole = getTargetRole(currentUser.role);
  q = (q || '').trim().toLowerCase();
  if(!q) {
    return renderUserList(usersCache);
  }
  userList.innerHTML = `<div style="color:#bbb;text-align:center;padding:10px">Searching…</div>`;
  try {
    const start = q;
    const end = q + '\uf8ff';
    // name prefix
    let snap = await db.collection('users')
      .where('role','==', targetRole)
      .orderBy('name')
      .startAt(start)
      .endAt(end)
      .limit(30)
      .get();

    let results = [];
    snap.forEach(d => results.push({ id:d.id, uid:d.id, ...d.data() }));

    // email prefix fallback
    if(results.length === 0) {
      let snap2 = await db.collection('users')
        .where('role','==', targetRole)
        .orderBy('email')
        .startAt(start)
        .endAt(end)
        .limit(30)
        .get();
      snap2.forEach(d => results.push({ id:d.id, uid:d.id, ...d.data() }));
    }

    if(results.length > 0) return renderUserList(results);

    // last fallback: local cache substring match
    const filtered = usersCache.filter(u=>{
      const hay = ((u.name||'') + ' ' + (u.email||'') + ' ' + (u.uid||'')).toLowerCase();
      return hay.includes(q);
    }).slice(0,50);
    return renderUserList(filtered);
  } catch(err){
    console.warn('Search error (index may be required):', err);
    // fallback local
    const filtered = usersCache.filter(u=>{
      const hay = ((u.name||'') + ' ' + (u.email||'') + ' ' + (u.uid||'')).toLowerCase();
      return hay.includes(q);
    }).slice(0,50);
    return renderUserList(filtered);
  }
}

function attachSearch(){
  if(!searchInput) return;
  const onChange = debounce((e)=>{
    const q = e.target.value.trim().toLowerCase();
    if(!q) { renderUserList(usersCache); return; }
    searchUsersForQuery(q);
  }, 300);
  searchInput.removeEventListener('input', onChange);
  searchInput.addEventListener('input', onChange);
}

// ---------- Dashboard rendering (role-specific) ----------
function renderRoleArea(role){
  roleArea.innerHTML = '';
  if(role === 'buyer') renderBuyer();
  else if(role === 'seller') renderSeller();
  else if(role === 'rider') renderRider();
}

function renderBuyer(){
  roleArea.innerHTML = `
    <div class="card">
      <h3>Buyer — Tracking</h3>
      <div class="boxes">
        <div class="box"><div class="label">Wallet</div><div id="buyerWallet" class="amount">₦0</div></div>
        <div class="box"><div class="label">Active Holds</div><div id="buyerEscrow" class="amount">0</div></div>
      </div>

      <div style="margin-top:12px" id="buyerFeedArea">
        <div class="small muted">Activity feed loading…</div>
      </div>

      <div style="margin-top:12px">
        <input id="createEscrowSellerInput" placeholder="Seller UID" />
        <input id="createEscrowAmountInput" placeholder="Amount (₦)" />
        <button class="primary" id="createEscrowSubmit">Create Escrow (Paystack)</button>
      </div>
    </div>
  `;
  // wallet listener
  db.collection('wallets').doc(currentUser.uid).onSnapshot(s=>{
    if(s.exists) document.getElementById('buyerWallet').innerText = '₦' + (s.data().balance || 0).toLocaleString();
    else document.getElementById('buyerWallet').innerText = '₦0';
    if(s.exists) document.getElementById('buyerEscrow').innerText = (s.data().escrowHeld||0).toLocaleString();
  });

  document.getElementById('createEscrowSubmit').addEventListener('click', ()=> {
    const sellerUid = document.getElementById('createEscrowSellerInput').value.trim();
    const amount = Number(document.getElementById('createEscrowAmountInput').value);
    if(!sellerUid) return alert('Enter seller UID');
    if(!amount || amount <= 0) return alert('Enter valid amount');
    // Use Paystack inline to accept buyer payment before creating transaction
    const handler = PaystackPop.setup({
      key: 'PAYSTACK_PUBLIC_KEY_HERE', // <-- Replace with your Paystack public key
      email: (auth.currentUser && auth.currentUser.email) || '',
      amount: Math.round(amount * 100),
      currency: 'NGN',
      callback: async function(response){
        // create transaction doc with reference
        const txRef = db.collection('transactions').doc(response.reference);
        await txRef.set({
          id: response.reference,
          buyer_uid: currentUser.uid,
          seller_uid: sellerUid,
          rider_uid: null,
          amount: amount,
          description: 'Escrow payment',
          reference: response.reference,
          status: 'paid',
          created_at: firebase.firestore.FieldValue.serverTimestamp(),
          participants: [currentUser.uid, sellerUid]
        });
        alert('Payment successful — transaction created: ' + response.reference);
      },
      onClose: function(){ alert('Payment cancelled'); }
    });
    handler.openIframe();
  });
}

function renderSeller(){
  roleArea.innerHTML = `
    <div class="card">
      <h3>Seller — Business Hub</h3>
      <div class="boxes">
        <div class="box"><div class="label">Pending shipment</div><div id="pendingShip" class="amount">0</div></div>
        <div class="box"><div class="label">Awaiting confirmations</div><div id="awaitingConf" class="amount">0</div></div>
        <div class="box"><div class="label">New orders</div><div id="newOrders" class="amount">0</div></div>
      </div>
      <div style="margin-top:12px" id="sellerActivity">Activity loading…</div>
    </div>
  `;
  const uid = currentUser.uid;
  db.collection('transactions').where('seller_uid','==',uid).onSnapshot(snap=>{
    let pending=0, awaiting=0, newOrders=0;
    snap.forEach(d=>{
      const t = d.data();
      if(t.status === 'paid') pending++;
      if(t.status === 'awaiting_buyer') awaiting++;
      if(t.status === 'in_transit') newOrders++;
    });
    document.getElementById('pendingShip').innerText = pending;
    document.getElementById('awaitingConf').innerText = awaiting;
    document.getElementById('newOrders').innerText = newOrders;
  });
}

function renderRider(){
  roleArea.innerHTML = `
    <div class="card">
      <h3>Rider — Task Manager</h3>
      <div class="boxes">
        <div class="box"><div class="label">Today's Earnings</div><div id="riderEarnings" class="amount">₦0</div></div>
        <div class="box"><div class="label">Active Tasks</div><div id="riderTasksCount" class="amount">0</div></div>
      </div>
      <div style="margin-top:12px" id="riderList">No tasks assigned</div>
      <div style="margin-top:12px" id="mapPlaceholder" class="card">Map placeholder (Google API will be added later)</div>
    </div>
  `;
  const uid = currentUser.uid;
  db.collection('transactions').where('rider_uid','==',uid).onSnapshot(snap=>{
    const tasks = [];
    snap.forEach(d=> tasks.push({ id:d.id, ...d.data() }));
    document.getElementById('riderTasksCount').innerText = tasks.length;
    document.getElementById('riderList').innerHTML = tasks.map(t=>`
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between">
          <div>
            <div style="font-weight:700">${t.description||t.id}</div>
            <div class="small muted">Amount: ₦${Number(t.amount).toLocaleString()}</div>
            <div class="small muted">Status: ${t.status}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${t.status !== 'delivered' ? `<button class="primary" onclick="riderConfirm('${t.id}')">Mark Delivered</button>` : '<span style="color:#9fe29f">Delivered</span>'}
          </div>
        </div>
      </div>
    `).join('');
  });
}

// ---------- transactions listener (optional) ----------
function listenTransactions(){
  const uid = currentUser.uid;
  if(txUnsub) txUnsub();
  txUnsub = db.collection('transactions').where('participants','array-contains', uid)
    .onSnapshot(snap=>{
      // minimal: you can expand to notify UI
      // show badge if unread (placeholder)
      let cnt = 0;
      snap.forEach(d=>{
        const t = d.data();
        if(t.status && (t.status === 'in_transit' || t.status === 'delivered')) cnt++;
      });
      chatBadge.style.display = cnt ? 'flex' : 'none';
      if(cnt) chatBadge.innerText = cnt;
    });
}

// ---------- fund wallet (paystack) ----------
fundWalletBtn.addEventListener('click', ()=>{
  const amt = prompt('Enter amount to fund (₦):');
  if(!amt || isNaN(amt)) return alert('Enter valid amount');
  const amountKobo = Math.round(Number(amt) * 100);
  const user = auth.currentUser;
  if(!user) return alert('Not logged in');
  let handler = PaystackPop.setup({
    key: 'PAYSTACK_PUBLIC_KEY_HERE', // <-- Replace with your Paystack public key
    email: user.email,
    amount: amountKobo,
    currency: 'NGN',
    callback: function(response){
      // Save payment and update wallet in Firestore
      const uid = user.uid;
      const payRef = db.collection('users').doc(uid).collection('payments').doc(response.reference);
      payRef.set({
        amount: Number(amt),
        reference: response.reference,
        status: 'successful',
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      }).then(()=>{
        // update wallet doc
        const walletRef = db.collection('wallets').doc(uid);
        walletRef.get().then(doc=>{
          if(doc.exists) walletRef.update({ balance: (Number(doc.data().balance||0) + Number(amt)) });
          else walletRef.set({ balance: Number(amt), escrowHeld: 0 });
        });
        alert('Wallet funded successfully!');
      });
    },
    onClose: function(){ alert('Payment cancelled'); }
  });
  handler.openIframe();
});

// ---------- simple openChatWith wiring already used above ----------
window.openChatWith = openChatWith;

// ---------- wire create escrow button (quick open small flow) ----------
createEscrowBtn.addEventListener('click', ()=> {
  // scroll to buyer create area if buyer; otherwise show instruction
  if(currentUser.role === 'buyer'){
    const el = document.getElementById('createEscrowSellerInput');
    if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
  } else {
    alert('Only buyers can create escrows. Switch to a buyer account.');
  }
});

// attach search after user load
// attachUserList(); // called earlier in auth.onAuthStateChanged
// attachSearch(); // called earlier

// ---------- small global operations used by escrow.js (riderConfirm etc.) ----------
window.buyerConfirm = async function(txId){
  try {
    await db.collection('transactions').doc(txId).update({ buyerConfirmed:true, updated_at: firebase.firestore.FieldValue.serverTimestamp() });
    // attempt auto release if escrow.js tryAutoRelease is available
    if(window.tryAutoRelease) tryAutoRelease(txId).catch(()=>{});
    alert('You confirmed receipt.');
  } catch(e){ alert(e.message); }
};

window.riderConfirm = async function(txId){
  try {
    await db.collection('transactions').doc(txId).update({ riderConfirmed:true, status:'delivered', updated_at: firebase.firestore.FieldValue.serverTimestamp() });
    if(window.tryAutoRelease) tryAutoRelease(txId).catch(()=>{});
    alert('Rider confirmed delivery.');
  } catch(e){ alert(e.message); }
};

// End of dashboard.js
