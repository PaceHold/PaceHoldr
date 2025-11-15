// dashboard.js (module imports are not used — file is lightweight and uses global firebase)
const sessionRaw = sessionStorage.getItem('pacehold_user');
if(!sessionRaw) { window.location.href = 'index.html'; throw new Error('Not signed in'); }
const sessionUser = JSON.parse(sessionRaw);

const PLATFORM_FEE_PERCENT = 4;

const welcomeName = document.getElementById('welcomeName');
const roleLabel = document.getElementById('roleLabel');
const topUser = document.getElementById('topUser');
const logoutBtn = document.getElementById('logoutBtn');
const userList = document.getElementById('userList');
const searchInput = document.getElementById('searchInput');
const refreshBtn = document.getElementById('refreshBtn');
const searchResults = document.getElementById('searchResults');
const chatBox = document.getElementById('chatBox');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const roleSpecificArea = document.getElementById('roleSpecificArea');
const txList = document.getElementById('txList');

let currentUser = null;
let wallet = { balance:0, escrowHeld:0 };
let usersCache = [];
let currentChatPartner = null;
let chatUnsub = null;

(function init(){
  // load user doc and wallet
  db.collection('users').doc(sessionUser.uid).get().then(snap=>{
    if(!snap.exists){
      // create
      db.collection('users').doc(sessionUser.uid).set({ uid: sessionUser.uid, name: sessionUser.name, role: sessionUser.role, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      currentUser = { uid: sessionUser.uid, name: sessionUser.name, role: sessionUser.role };
    } else currentUser = snap.data();

    welcomeName.innerText = `Welcome, ${currentUser.name}`;
    roleLabel.innerText = `Role: ${currentUser.role}`;
    topUser.innerText = currentUser.name || currentUser.uid;

    // wallet
    db.collection('wallets').doc(currentUser.uid).get().then(ws=>{
      if(!ws.exists) db.collection('wallets').doc(currentUser.uid).set({ uid: currentUser.uid, balance:0, escrowHeld:0 });
      else wallet = ws.data();
      renderRoleArea();
    });

    attachUserList();
    startTxListener();
  });

  // tabs
  document.querySelectorAll('.tabBtn').forEach(b=>{
    b.addEventListener('click', ()=> {
      document.querySelectorAll('.tabBtn').forEach(x=>x.classList.remove('active'));
      document.querySelectorAll('.tabPanel').forEach(p=>p.classList.remove('active'));
      b.classList.add('active');
      document.getElementById(b.dataset.tab).classList.add('active');
    });
  });

  // search handlers
  refreshBtn && refreshBtn.addEventListener('click', ()=> renderUserList(usersCache));
  searchInput && searchInput.addEventListener('input', (e)=>{
    const q = (e.target.value||'').trim().toLowerCase();
    if(!q) return renderUserList(usersCache);
    const filtered = usersCache.filter(u => ((u.name||'') + ' ' + (u.email||'')).toLowerCase().includes(q));
    renderUserList(filtered);
  });

  sendBtn && sendBtn.addEventListener('click', async ()=>{
    const txt = (chatInput.value||'').trim();
    if(!txt || !currentChatPartner) return;
    const chatId = [currentUser.uid, currentChatPartner.uid].sort().join('_');
    await db.collection('chats').doc(chatId).collection('messages').add({
      text: txt, from: currentUser.uid, fromName: currentUser.name, to: currentChatPartner.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    chatInput.value = '';
  });

  logoutBtn && logoutBtn.addEventListener('click', async ()=>{
    try { await firebase.auth().signOut(); } catch(e){}
    sessionStorage.removeItem('pacehold_user');
    window.location.href = 'index.html';
  });

})();

function renderRoleArea(){
  roleSpecificArea.innerHTML = '';
  if(currentUser.role === 'buyer'){
    roleSpecificArea.innerHTML = `
      <div class="boxes fade">
        <div class="box"><div class="label">Active Holds</div><div id="buyerActive" class="amount">0</div></div>
        <div class="box"><div class="label">Wallet Balance</div><div id="buyerBalance" class="amount">₦${formatNGN(wallet.balance)}</div></div>
      </div>
      <div style="margin-top:12px">
        <div class="card fade"><h3>Activity Feed</h3><div id="buyerFeed" class="hint">No activity yet</div></div>
        <div class="card fade" style="margin-top:12px"><button id="confirmRelease" class="primary">Confirm Delivery & Release Funds</button></div>
      </div>`;
    document.getElementById('confirmRelease').addEventListener('click', ()=> alert('Use the transaction list to confirm specific deliveries.'));
  }

  if(currentUser.role === 'seller'){
    roleSpecificArea.innerHTML = `
      <div class="boxes fade">
        <div class="box"><div class="label">Pending shipment</div><div id="pendingShip" class="amount">0</div></div>
        <div class="box"><div class="label">Awaiting confirmations</div><div id="awaitingConf" class="amount">0</div></div>
        <div class="box"><div class="label">New orders</div><div id="newOrders" class="amount">0</div></div>
      </div>
      <div style="margin-top:12px">
        <div class="card fade"><h3>Activity</h3><div id="sellerActivity" class="hint">No activity yet</div></div>
        <div class="card fade" style="margin-top:12px"><h4>Weekly sales (placeholder)</h4><div class="hint">[small chart]</div><h4 style="margin-top:8px">Payout History</h4><div id="payoutHistory" class="hint">No payouts yet</div></div>
      </div>`;
  }

  if(currentUser.role === 'rider'){
    roleSpecificArea.innerHTML = `
      <div class="boxes fade">
        <div class="box"><div class="label">Today's Earnings</div><div id="riderEarnings" class="amount">₦0</div></div>
        <div class="box"><div class="label">Active Tasks</div><div id="riderTasks" class="amount">0</div></div>
      </div>
      <div style="margin-top:12px">
        <div class="card fade"><h3>Next deliveries</h3><div id="riderList" class="hint">No tasks assigned</div></div>
        <div class="card fade" style="margin-top:12px"><h3>Map (placeholder)</h3><div style="height:160px;background:var(--soft);border-radius:8px;display:flex;align-items:center;justify-content:center">Map placeholder — add Google Maps API later</div></div>
      </div>`;
  }
}

function attachUserList(){
  const target = (currentUser.role === 'buyer') ? 'seller' : (currentUser.role === 'seller') ? 'rider' : 'seller';
  const q = db.collection('users').where('role','==',target);
  q.onSnapshot = q.onSnapshot || function(cb){ // compat helper
    q.get().then(snap=>cb(snap)); // fallback
  };
  db.collection('users').where('role','==',target).onSnapshot(snap=>{
    usersCache = [];
    snap.forEach(d => usersCache.push({ id: d.id, ...d.data() }));
    renderUserList(usersCache);
  });
}

function renderUserList(list){
  if(!list || list.length === 0){ userList.innerHTML = `<div style="color:#bbb;text-align:center;padding:10px">No users found</div>`; return; }
  userList.innerHTML = list.map(u => `<div class="user-row" data-id="${u.uid || u.id}"><div><div class="user-name">${escapeHtml(u.name||u.email)}</div><div class="small muted">${escapeHtml(u.role)}</div></div><div class="label-pill">${escapeHtml(u.email||'')}</div></div>`).join('');
  document.querySelectorAll('.user-row').forEach(el=>{
    el.addEventListener('click', ()=> {
      const uid = el.dataset.id;
      const selected = usersCache.find(x => (x.uid||x.id) === uid);
      if(selected) openChatWith(selected);
    });
  });
}

function openChatWith(user){
  currentChatPartner = user;
  document.getElementById('chatWith').innerText = `Chat — ${user.name}`;
  document.querySelectorAll('.tabBtn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tabPanel').forEach(p=>p.classList.remove('active'));
  document.querySelector('[data-tab="chatTab"]').classList.add('active');
  document.getElementById('chatTab').classList.add('active');

  const chatId = [currentUser.uid, user.uid].sort().join('_');
  const messagesRef = db.collection('chats').doc(chatId).collection('messages').orderBy('createdAt','asc');

  if(chatUnsub) chatUnsub();
  chatUnsub = messagesRef.onSnapshot ? messagesRef.onSnapshot(snap=>{
    chatBox.innerHTML = '';
    snap.forEach(m => {
      const msg = m.data();
      const div = document.createElement('div');
      div.className = 'message ' + (msg.from === currentUser.uid ? 'you' : 'them');
      div.innerText = `${msg.fromName || ''}: ${msg.text}`;
      chatBox.appendChild(div);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  }) : messagesRef.get().then(snap=>{
    chatBox.innerHTML='';
    snap.forEach(m=>{ const msg=m.data(); const div=document.createElement('div'); div.className='message '+(msg.from===currentUser.uid?'you':'them'); div.innerText=`${msg.fromName||''}: ${msg.text}`; chatBox.appendChild(div); });
  });
}

function startTxListener(){
  db.collection('transactions').where('participants','array-contains', sessionUser.uid).onSnapshot(snap=>{
    const items = [];
    snap.forEach(d=> items.push({ id: d.id, ...d.data() }));
    renderTxList(items);
  });
}

function renderTxList(list){
  if(!list || list.length===0) return txList.innerHTML = '<div style="color:#bbb">No transactions</div>';
  txList.innerHTML = list.map(t=>{
    const isBuyer = t.buyerId === sessionUser.uid;
    const isSeller = t.sellerId === sessionUser.uid;
    const isRider = t.riderId === sessionUser.uid;
    return `<div class="tx-row"><div><strong>${formatNGN(t.amount)}</strong> — ${escapeHtml(t.status)}</div>
      <div class="hint">Buyer: ${short(t.buyerId)} • Seller: ${short(t.sellerId)} • Rider: ${short(t.riderId||'Unassigned')}</div>
      <div style="margin-top:8px">${txActions(t,isBuyer,isSeller,isRider)}</div></div>`;
  }).join('');
}

function txActions(t,isBuyer,isSeller,isRider){
  const parts=[];
  if(isSeller && t.status === 'held') parts.push(`<button class="small" onclick="openRiderPicker('${t.id}')">Assign Rider</button>`);
  if(isRider && !t.riderConfirmed && (t.status === 'in_transit' || t.status === 'awaiting_confirmation')) parts.push(`<button class="small" onclick="riderConfirm('${t.id}')">Confirm Arrival</button>`);
  if(isBuyer && !t.buyerConfirmed && t.status === 'awaiting_confirmation') parts.push(`<button class="small" onclick="buyerConfirm('${t.id}')">Confirm Received</button>`);
  if(t.status === 'released') parts.push(`<span style="color:#9fe29f">Released</span>`);
  return parts.join(' ');
}

// open rider picker (simplified UI)
window.openRiderPicker = async function(txId){
  const snap = await db.collection('users').where('role','==','rider').get();
  if(snap.empty) return alert('No riders found');
  const rDoc = snap.docs[0];
  const r = rDoc.data();
  if(confirm(`Assign rider ${r.name || r.email}?`)) {
    await db.collection('transactions').doc(txId).update({ riderId: rDoc.id, status: 'in_transit', updatedAt: firebase.firestore.FieldValue.serverTimestamp(), participants: firebase.firestore.FieldValue.arrayUnion(rDoc.id) });
    alert('Rider assigned');
  }
};

window.riderConfirm = async function(txId){
  await db.collection('transactions').doc(txId).update({ riderConfirmed: true, status: 'awaiting_confirmation', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  // attempt release
  await window.tryAutoRelease(txId);
  alert('Rider confirmed arrival.');
};

window.buyerConfirm = async function(txId){
  await db.collection('transactions').doc(txId).update({ buyerConfirmed: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  await window.tryAutoRelease(txId);
  alert('Buyer confirmed received.');
};

function formatNGN(n){ const v = Number(n||0); return v.toLocaleString('en-NG', { minimumFractionDigits: 0 }); }
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function short(uid){ if(!uid) return '-'; return (uid||'').slice(0,6); }
