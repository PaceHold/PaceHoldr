// dashboard.js (modular SDK)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, onSnapshot, addDoc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

/* ===== REPLACE WITH YOUR FIREBASE CONFIG ===== */
const firebaseConfig = {
  apiKey: "AIzaSyAvfyYoeooY5bx1Z-SGdcEWA-G_zGFY5B8",
  authDomain: "pacehold-4c7b2.firebaseapp.com",
  projectId: "pacehold-4c7b2",
  storageBucket: "pacehold-4c7b2.firebasestorage.app",
  messagingSenderId: "45898843261",
  appId: "1:45898843261:web:4df9b7cb59dd5a1c699d14"
};
/* ============================================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth ? getAuth(app) : null; // we just use signOut
const db = getFirestore(app);

const PLATFORM_FEE_PERCENT = 4; // 4%

// DOM refs
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
const balanceDisplay = document.getElementById('balanceDisplay');
const escrowDisplay = document.getElementById('escrowDisplay');
const fundAmount = document.getElementById('fundAmount');
const fundBtn = document.getElementById('fundBtn');
const txList = document.getElementById('txList');

// tabs
document.querySelectorAll('.tabBtn').forEach(b=>{
  b.addEventListener('click', ()=> {
    document.querySelectorAll('.tabBtn').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.tabPanel').forEach(p=>p.classList.remove('active'));
    b.classList.add('active');
    document.getElementById(b.dataset.tab).classList.add('active');
  });
});

// session guard
const sessionUserRaw = sessionStorage.getItem('pacehold_user');
if(!sessionUserRaw){
  // not signed in — force logout to landing
  window.location.href = 'index.html';
  throw new Error('Not signed in');
}
const sessionUser = JSON.parse(sessionUserRaw);
topUser.innerText = sessionUser.name || sessionUser.uid;

// load current user doc & wallet
let currentUser = null;
let currentWallet = { balance:0, escrowHeld:0 };

(async function init(){
  try {
    const userSnap = await getDoc(doc(db,'users',sessionUser.uid));
    if(!userSnap.exists()) {
      // safety: create basic user doc
      await setDoc(doc(db,'users',sessionUser.uid), { uid: sessionUser.uid, name: sessionUser.name, role: sessionUser.role, balance:0, createdAt: serverTimestamp() });
      currentUser = { uid: sessionUser.uid, name: sessionUser.name, role: sessionUser.role };
    } else {
      currentUser = userSnap.data();
    }

    welcomeName.innerText = `Welcome, ${currentUser.name}`;
    roleLabel.innerText = `Role: ${currentUser.role}`;

    // ensure wallet doc exists
    const wRef = doc(db,'wallets', currentUser.uid);
    const wSnap = await getDoc(wRef);
    if(!wSnap.exists()){
      await setDoc(wRef, { uid: currentUser.uid, balance: 0, escrowHeld: 0, updatedAt: serverTimestamp() });
      currentWallet = { balance:0, escrowHeld:0 };
    } else {
      currentWallet = wSnap.data();
    }
    updateWalletUI();

    // start listeners
    attachUserListListener();
    startChatListenerIfAny(); // none until connect
    startTxListener();

  } catch(err){
    console.error('init err', err);
  }
})();

function updateWalletUI(){
  balanceDisplay.innerText = formatNGN(currentWallet.balance || 0);
  escrowDisplay.innerText = formatNGN(currentWallet.escrowHeld || 0);
}

// --- LIST USERS (search / left panel) ---
let usersCache = [];
async function attachUserListListener(){
  const targetRole = getTargetRole(currentUser.role);
  const q = query(collection(db,'users'), where('role','==',targetRole));
  onSnapshot(q, snap=>{
    usersCache = [];
    snap.forEach(d=> usersCache.push({ id: d.id, ...d.data() }));
    renderUserList(usersCache);
  });
}

function renderUserList(list){
  if(!list || list.length===0){
    userList.innerHTML = `<div style="color:#bbb;text-align:center;padding:10px">No users found</div>`;
    return;
  }
  userList.innerHTML = list.map(u => {
    return `<div class="user-row" data-id="${u.uid}">
      <div>
        <div class="user-name">${escapeHtml(u.name || u.email)}</div>
        <div class="small muted">${escapeHtml(u.role)}</div>
      </div>
      <div class="label-pill">${escapeHtml(u.email || '')}</div>
    </div>`;
  }).join('');
  // attach click handlers
  document.querySelectorAll('.user-row').forEach(el=>{
    el.addEventListener('click', ()=> {
      const uid = el.dataset.id;
      const selected = usersCache.find(x=>x.uid===uid);
      if(selected) openChatWith(selected);
    });
  });
}

// search box (left panel)
refreshBtn && refreshBtn.addEventListener('click', ()=> renderUserList(usersCache));
searchInput && searchInput.addEventListener('input', (e)=>{
  const q = (e.target.value||'').trim().toLowerCase();
  if(!q) return renderUserList(usersCache);
  const filtered = usersCache.filter(u => ((u.name||'') + ' ' + (u.email||'')).toLowerCase().includes(q));
  renderUserList(filtered);
});

// search results tab (detailed)
async function runSearchGlobal(term){
  const qTerm = term.trim().toLowerCase();
  if(!qTerm) { searchResults.innerText = 'Enter a name to search'; return; }
  const target = getTargetRole(currentUser.role);
  const q = query(collection(db,'users'), where('role','==',target));
  const snap = await getDocs(q);
  const matches = [];
  snap.forEach(d=>{
    const data = d.data();
    if(((data.name||'') + ' ' + (data.email||'')).toLowerCase().includes(qTerm)) matches.push({ id: d.id, ...data });
  });
  if(matches.length===0) searchResults.innerHTML = '<div style="color:#bbb">No results</div>';
  else searchResults.innerHTML = matches.map(m=>`<div class="user-row"><strong>${escapeHtml(m.name)}</strong><div class="small muted">${escapeHtml(m.email)}</div><div><button class="small" onclick="openChatFromSearch('${m.uid}')">Chat</button></div></div>`).join('');
}
window.openChatFromSearch = function(uid){
  const user = usersCache.find(u=>u.uid===uid);
  if(user) openChatWith(user);
}

// --- CHAT logic ---
let currentChatPartner = null;
let currentChatUnsub = null;
function openChatWith(user){
  currentChatPartner = user;
  document.getElementById('chatWith').innerText = `Chat — ${user.name}`;
  // open chat tab
  document.querySelectorAll('.tabBtn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tabPanel').forEach(p=>p.classList.remove('active'));
  document.querySelector('[data-tab="chatTab"]').classList.add('active');
  document.getElementById('chatTab').classList.add('active');

  const chatId = createChatId(currentUser.uid, user.uid);
  const messagesRef = collection(db,'chats',chatId,'messages');

  if(currentChatUnsub) currentChatUnsub();

  currentChatUnsub = onSnapshot(messagesRef, snap=>{
    chatBox.innerHTML = '';
    snap.forEach(m => {
      const msg = m.data();
      const div = document.createElement('div');
      div.className = 'message ' + (msg.from === currentUser.uid ? 'you' : 'them');
      div.innerText = `${msg.fromName || ''}: ${msg.text}`;
      chatBox.appendChild(div);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  });
}

sendBtn.addEventListener('click', async ()=>{
  const text = (chatInput.value||'').trim();
  if(!text || !currentChatPartner) return;
  const chatId = createChatId(currentUser.uid, currentChatPartner.uid);
  await addDoc(collection(db,'chats',chatId,'messages'), {
    text,
    from: currentUser.uid,
    fromName: currentUser.name,
    to: currentChatPartner.uid,
    createdAt: serverTimestamp()
  });
  chatInput.value = '';
});

// --- ESCROW & WALLET logic ---
fundBtn.addEventListener('click', async ()=>{
  const amt = Number((fundAmount.value||'').replace(/[^0-9.-]+/g,''));
  if(isNaN(amt) || amt<=0) return alert('Enter a valid amount');
  const wRef = doc(db,'wallets', currentUser.uid);
  await runTransaction(db, async (tx)=>{
    const wSnap = await tx.get(wRef);
    const old = wSnap.exists() ? wSnap.data() : { balance:0, escrowHeld:0 };
    tx.set(wRef, { uid: currentUser.uid, balance: (Number(old.balance||0) + amt), escrowHeld: Number(old.escrowHeld||0) }, { merge:true });
  }).then(()=>{
    // refresh local
    getDoc(doc(db,'wallets',currentUser.uid)).then(s => { currentWallet = s.data(); updateWalletUI(); alert('Wallet funded (test)'); });
  }).catch(e=> alert('Fund failed: ' + e.message));
});

// create Hold (buyer pays into escrow) — called from UI when buyer chooses seller
window.createHold = async function(sellerId, amount){
  const amt = Number(amount);
  if(isNaN(amt) || amt <= 0) return alert('Invalid amount');

  // create tx id
  const txRef = doc(collection(db,'transactions'));
  try{
    await runTransaction(db, async tx=>{
      const buyerWRef = doc(db,'wallets', currentUser.uid);
      const buyerW = await tx.get(buyerWRef);
      if(!buyerW.exists()) throw new Error('Buyer wallet missing');
      const bal = Number(buyerW.data().balance || 0);
      if(bal < amt) throw new Error('Insufficient balance');

      // deduct buyer balance, increase escrowHeld
      tx.update(buyerWRef, { balance: bal - amt, escrowHeld: (Number(buyerW.data().escrowHeld || 0) + amt) });

      tx.set(txRef, {
        buyerId: currentUser.uid,
        sellerId,
        riderId: null,
        amount: amt,
        status: 'held',
        buyerConfirmed: false,
        riderConfirmed: false,
        participants: [currentUser.uid, sellerId],
        createdAt: serverTimestamp()
      });
    });
    alert('Funds held in escrow');
    startTxListener();
  } catch(err){
    alert('Hold failed: ' + (err.message || err));
  }
};

// assign rider (seller action)
window.assignRiderToTx = async function(txId, riderId){
  const txRef = doc(db,'transactions', txId);
  try{
    await updateDoc(txRef, { riderId, status: 'in_transit', updatedAt: serverTimestamp(), participants: [...new Set([ ...( (await (await getDoc(txRef)).data()).participants || [] ), riderId ]) ] });
    alert('Rider assigned');
  } catch(e){ alert('Assign failed: ' + e.message); }
};

// confirmations
window.riderConfirm = async function(txId){
  await updateDoc(doc(db,'transactions',txId), { riderConfirmed: true, status: 'awaiting_confirmation', updatedAt: serverTimestamp() });
  tryAutoRelease(txId);
};
window.buyerConfirm = async function(txId){
  await updateDoc(doc(db,'transactions',txId), { buyerConfirmed: true, updatedAt: serverTimestamp() });
  tryAutoRelease(txId);
};

async function tryAutoRelease(txId){
  const trRef = doc(db,'transactions',txId);
  const trSnap = await getDoc(trRef);
  if(!trSnap.exists()) return;
  const t = trSnap.data();
  if(t.buyerConfirmed && t.riderConfirmed && t.status !== 'released'){
    // compute fee and transfer using Firestore transaction
    const fee = Math.round((PLATFORM_FEE_PERCENT/100) * t.amount * 100)/100;
    const sellerAmount = Math.round((t.amount - fee) * 100)/100;

    await runTransaction(db, async tx=>{
      const buyerWRef = doc(db,'wallets', t.buyerId);
      const sellerWRef = doc(db,'wallets', t.sellerId);
      const platformRef = doc(db,'wallets','_platform'); // platform account

      const bSnap = await tx.get(buyerWRef);
      const sSnap = await tx.get(sellerWRef);
      const pSnap = await tx.get(platformRef);

      const buyerEsc = Number(bSnap.exists() ? bSnap.data().escrowHeld || 0 : 0);
      const sellerBal = Number(sSnap.exists() ? sSnap.data().balance || 0 : 0);
      const platformBal = Number(pSnap.exists() ? pSnap.data().balance || 0 : 0);

      tx.update(buyerWRef, { escrowHeld: Math.max(0, buyerEsc - t.amount) });
      tx.update(sellerWRef, { balance: sellerBal + sellerAmount });
      tx.set(platformRef, { uid: '_platform', balance: platformBal + fee }, { merge:true });
      tx.update(trRef, { status: 'released', fee, sellerAmount, releasedAt: serverTimestamp() });
    });
    alert('Escrow released: seller credited');
  }
}

// transaction listener to show seller/buyer actions
function startTxListener(){
  // get transactions where user participates
  const q = query(collection(db,'transactions'), where('participants','array-contains', currentUser.uid));
  onSnapshot(q, snap=>{
    const items = [];
    snap.forEach(d => {
      const t = d.data();
      items.push({ id: d.id, ...t });
    });
    renderTxList(items);
  });
}

function renderTxList(list){
  if(!list || list.length===0) return txList.innerHTML = '<div style="color:#bbb">No transactions</div>';
  txList.innerHTML = list.map(t=>{
    const buyer = t.buyerId === currentUser.uid ? 'You' : t.buyerId;
    const seller = t.sellerId === currentUser.uid ? 'You' : t.sellerId;
    const rider = t.riderId || 'Unassigned';
    return `<div class="tx-row">
      <div><strong>${formatNGN(t.amount)}</strong> — ${t.status}</div>
      <div style="font-size:13px;color:#9fb2d9">Buyer: ${buyer} • Seller: ${seller} • Rider: ${rider}</div>
      <div style="margin-top:8px">
        ${renderTxActions(t)}
      </div>
    </div>`;
  }).join('');
}

function renderTxActions(t){
  const isSeller = currentUser.uid === t.sellerId;
  const isBuyer = currentUser.uid === t.buyerId;
  const isRider = currentUser.uid === t.riderId;
  let actions = '';
  if(isSeller && t.status === 'held'){
    actions += `<button class="small" onclick="openRiderPicker('${t.id}')">Assign Rider</button>`;
  }
  if(isRider && !t.riderConfirmed && (t.status === 'in_transit' || t.status === 'awaiting_confirmation')){
    actions += `<button class="small" onclick="riderConfirm('${t.id}')">Confirm Arrival</button>`;
  }
  if(isBuyer && !t.buyerConfirmed && t.status === 'awaiting_confirmation'){
    actions += `<button class="small" onclick="buyerConfirm('${t.id}')">Confirm Received</button>`;
  }
  if(t.status === 'released') actions += `<span style="color:#9fe29f">Released</span>`;
  return actions || '<em class="muted">No actions</em>';
}

// rider picker simple modal (loads riders and choose)
window.openRiderPicker = async function(txId){
  const snap = await getDocs(query(collection(db,'users'), where('role','==','rider')));
  const riders = [];
  snap.forEach(d=> riders.push({ id:d.id, ...d.data() }));
  if(riders.length===0) return alert('No riders found');
  const r = riders[0]; // simple: pick first (you can expand UI)
  if(confirm(`Assign rider ${r.name || r.email} to transaction?`)){
    await assignRiderToTx(txId, r.id);
  }
};

async function assignRiderToTx(txId, riderId){
  await updateDoc(doc(db,'transactions',txId), { riderId, status: 'in_transit', updatedAt: serverTimestamp(), participants: Array.from(new Set([...( (await (await getDoc(doc(db,'transactions',txId))).data()).participants || []), riderId])) });
  alert('Rider assigned');
}

// helper: chat id
function createChatId(a,b){ return [a,b].sort().join('_'); }

// helper: target role mapping
function getTargetRole(role){
  if(role === 'buyer') return 'seller';
  if(role === 'seller') return 'rider';
  if(role === 'rider') return 'seller';
  return 'seller';
}

// helper: format
function formatNGN(n){
  const v = Number(n||0);
  return v.toLocaleString('en-NG', { style:'currency', currency:'NGN' });
}
function escapeHtml(s){ if(!s) return ''; return s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// logout button
logoutBtn.addEventListener('click', async ()=>{
  try {
    // sign out firebase auth if present
    if(typeof signOut === 'function') {
      await signOut(typeof auth !== 'undefined' ? auth : { signOut: ()=>Promise.resolve() });
    }
  } catch(e){}
  sessionStorage.removeItem('pacehold_user');
  window.location.href = 'index.html';
});

// populate a few helper functions
function startChatListenerIfAny(){ /* intentionally empty until chat opened */ }
