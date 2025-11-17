// dashboard.js — loads user, renders role-specific dashboard, search, chat and listens to transactions

(function(){
  if(!window.auth || !window.db) return console.error('firebase-config.js missing');

  const welcomeName = document.getElementById('welcomeName');
  const roleLabel = document.getElementById('roleLabel');
  const topUser = document.getElementById('topUser');
  const logoutBtn = document.getElementById('logoutBtn');
  const userList = document.getElementById('userList');
  const searchInput = document.getElementById('searchInput');
  const roleArea = document.getElementById('roleArea');

  let currentUser = null;
  let usersCache = [];

  // session guard
  auth.onAuthStateChanged(async user=>{
    if(!user) return window.location.href = 'index.html';
    const udoc = await db.collection('users').doc(user.uid).get();
    if(!udoc.exists) return window.location.href = 'role.html';
    currentUser = udoc.data();
    welcomeName.innerText = `Hi, ${currentUser.name || 'User'}`;
    roleLabel.innerText = `Role: ${currentUser.role || '-'}`;
    topUser.innerText = currentUser.name || currentUser.email || user.uid;

    renderRoleArea(currentUser.role);
    attachUserList();
    listenTransactions();
    attachSearch();
  });

  logoutBtn.addEventListener('click', async ()=>{
    try { await auth.signOut(); } catch(e){}
    sessionStorage.removeItem('pacehold_user');
    window.location.href = 'index.html';
  });

  // attach list of counterpart users (buyer->seller, seller->rider, rider->seller)
  function getTargetRole(role){
    if(role === 'buyer') return 'seller';
    if(role === 'seller') return 'rider';
    if(role === 'rider') return 'seller';
    return 'seller';
  }

  function attachUserList(){
    const target = getTargetRole(currentUser.role);
    db.collection('users').where('role','==',target).onSnapshot(snap=>{
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
        const picked = usersCache.find(x => (x.uid||x.id) === id);
        if(picked) openChatWith(picked);
      });
    });
  }

  // search
  function attachSearch(){
    searchInput.addEventListener('input', (e)=>{
      const q = (e.target.value||'').trim().toLowerCase();
      if(!q) return renderUserList(usersCache);
      const filtered = usersCache.filter(u => (((u.name||'') + ' ' + (u.email||'')).toLowerCase().includes(q)));
      renderUserList(filtered);
    });
  }

  // render role area
  function renderRoleArea(role){
    roleArea.innerHTML = '';
    if(role === 'buyer') renderBuyer();
    if(role === 'seller') renderSeller();
    if(role === 'rider') renderRider();
  }

  function renderBuyer(){
    roleArea.innerHTML = `
      <div class="card">
        <h3>Tracking / Activity</h3>
        <div class="boxes">
          <div class="box"><div class="label">Active Holds</div><div id="buyerActive" class="amount">0</div></div>
          <div class="box"><div class="label">Wallet</div><div id="buyerWallet" class="amount">₦0</div></div>
        </div>
        <div style="margin-top:12px" id="buyerFeedArea">
          <div class="small muted">Activity feed loading…</div>
        </div>
        <div style="margin-top:12px">
          <input id="createEscrowSeller" placeholder="Enter seller UID to pay into escrow" />
          <input id="createEscrowAmount" placeholder="Amount (₦)" />
          <button class="primary" id="createEscrowBtn">Create Escrow</button>
        </div>
      </div>
    `;
    document.getElementById('createEscrowBtn').addEventListener('click', async ()=>{
      const sellerUid = document.getElementById('createEscrowSeller').value.trim();
      const amount = Number(document.getElementById('createEscrowAmount').value);
      if(!sellerUid) return alert('Enter seller UID');
      if(!amount || amount <=0) return alert('Enter amount');
      // createHold in escrow.js
      createHold(sellerUid, amount);
    });
    // wallet listener
    const uid = auth.currentUser.uid;
    db.collection('wallets').doc(uid).onSnapshot(s=>{
      if(s.exists){
        document.getElementById('buyerWallet').innerText = `₦${(s.data().balance||0).toLocaleString()}`;
        document.getElementById('buyerActive').innerText = (s.data().escrowHeld||0).toLocaleString();
      }
    });
  }

  function renderSeller(){
    roleArea.innerHTML = `
      <div class="card">
        <h3>Business Hub</h3>
        <div class="boxes">
          <div class="box"><div class="label">Pending shipment</div><div id="pendingShip" class="amount">0</div></div>
          <div class="box"><div class="label">Awaiting confirmations</div><div id="awaitingConf" class="amount">0</div></div>
          <div class="box"><div class="label">New orders</div><div id="newOrders" class="amount">0</div></div>
        </div>
        <div style="margin-top:12px">
          <div id="sellerActivity" class="small muted">Activity loading…</div>
        </div>
      </div>
    `;
    // load seller metrics
    const uid = auth.currentUser.uid;
    db.collection('transactions').where('sellerId','==',uid).onSnapshot(snap=>{
      let pending=0, awaiting=0, newOrders=0;
      snap.forEach(d=>{
        const t = d.data();
        if(t.status === 'held') pending++;
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
        <h3>Task Manager</h3>
        <div class="boxes">
          <div class="box"><div class="label">Today's Earnings</div><div id="riderEarnings" class="amount">₦0</div></div>
          <div class="box"><div class="label">Active Tasks</div><div id="riderTasks" class="amount">0</div></div>
        </div>
        <div style="margin-top:12px">
          <div id="riderList" class="small muted">No tasks assigned</div>
        </div>
      </div>
    `;
    const uid = auth.currentUser.uid;
    db.collection('transactions').where('riderId','==',uid).onSnapshot(snap=>{
      const tasks = [];
      snap.forEach(d=> tasks.push({ id:d.id, ...d.data() }));
      document.getElementById('riderTasks').innerText = tasks.length;
      document.getElementById('riderList').innerHTML = tasks.map(t=>`<div style="padding:8px;margin-bottom:8px;background:rgba(255,255,255,0.02);border-radius:8px">
        <div><strong>${t.id}</strong> — ${t.amount}</div>
        <div class="small muted">Status: ${t.status}</div>
        <div style="margin-top:8px">
          ${t.status !== 'released' ? `<button class="primary" onclick="riderConfirm('${t.id}')">Confirm Arrival</button>` : '<span style="color:#9fe29f">Released</span>'}
        </div></div>`).join('');
    });

    // earnings (sum of released sellerAmount where rider participated) — placeholder
    db.collection('transactions').where('riderId','==',uid).where('status','==','released').onSnapshot(snap=>{
      let sum=0;
      snap.forEach(d=> sum += Number(d.data().sellerAmount || 0));
      document.getElementById('riderEarnings').innerText = `₦${sum.toLocaleString()}`;
    });
  }

  // chat open (simple)
  function openChatWith(user){
    alert('Chat with ' + (user.name || user.email || user.uid) + ' — chat UI not expanded here');
  }

  let txUnsub = null;
  function listenTransactions(){
    const uid = auth.currentUser.uid;
    txUnsub = db.collection('transactions').where('participants','array-contains', uid)
      .onSnapshot(snap=>{
        // minimal handling: update counts in role area if needed
        // you can expand this to show list etc.
      });
  }

  // helper
  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

})();
