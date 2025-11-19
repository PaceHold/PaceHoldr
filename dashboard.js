// dashboard.js — main logic (role-locked, search, chat wiring, escrows, UI)
(async function(){
  const welcomeName = document.getElementById('welcomeName');
  const roleLabel = document.getElementById('roleLabel');
  const topUser = document.getElementById('topUser');
  const logoutBtn = document.getElementById('logoutBtn');
  const userList = document.getElementById('userList');
  const searchInput = document.getElementById('searchInput');
  const refreshUsersBtn = document.getElementById('refreshUsers');
  const roleArea = document.getElementById('roleArea');
  const showBuyerTab = document.getElementById('showBuyerTab');
  const showSellerTab = document.getElementById('showSellerTab');
  const showRiderTab = document.getElementById('showRiderTab');

  let currentUser = null;
  let usersCache = [];

  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function debounce(fn, delay=300){ let t; return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), delay); }; }

  function getTargetRole(role){
    if(role === 'buyer') return 'seller';
    if(role === 'seller') return 'rider';
    if(role === 'rider') return 'seller';
    return 'seller';
  }

  // attach user list and realtime updates for the counterpart role
  function attachUserList(){
    const target = getTargetRole(currentUser.role);
    document.getElementById('searchRoleLabel').innerText = target;
    db.collection('users').where('role','==',target).limit(200).get().then(snap=>{
      usersCache = [];
      snap.forEach(d => usersCache.push({ id:d.id, uid:d.id, ...d.data() }));
      renderUserList(usersCache);
    });
    db.collection('users').where('role','==',target).onSnapshot(snap=>{
      usersCache = [];
      snap.forEach(d => usersCache.push({ id:d.id, uid:d.id, ...d.data() }));
      renderUserList(usersCache);
    });
  }

  // render shows name + uid (no email)
  function renderUserList(list){
    if(!list || list.length === 0) return userList.innerHTML = `<div style="color:#bbb;text-align:center;padding:10px">No users found</div>`;
    userList.innerHTML = list.map(u => `
      <div class="user-row" data-id="${u.uid || u.id}">
        <div>
          <div style="font-weight:700">${escapeHtml(u.name || 'Unnamed')}</div>
          <div class="small muted">UID: ${escapeHtml(u.uid || u.id)}</div>
        </div>
        <div class="small muted">${escapeHtml(u.role || '')}</div>
      </div>
    `).join('');
    document.querySelectorAll('.user-row').forEach(el=>{
      el.addEventListener('click', async ()=>{
        const id = el.dataset.id;
        const picked = usersCache.find(x=> (x.uid||x.id) === id ) || { uid: id };
        if(picked) openChatWith(picked);
      });
    });
  }

  // search (prefix + fallback)
  async function searchUsersForQuery(q){
    const targetRole = getTargetRole(currentUser.role);
    q = (q||'').trim().toLowerCase();
    if(!q) return renderUserList(usersCache);
    userList.innerHTML = `<div style="color:#bbb;text-align:center;padding:10px">Searching…</div>`;
    try {
      const start = q; const end = q + '\uf8ff';
      let snap = await db.collection('users').where('role','==',targetRole).orderBy('name').startAt(start).endAt(end).limit(30).get();
      let results = [];
      snap.forEach(d=> results.push({ id:d.id, uid:d.id, ...d.data() }));
      if(results.length === 0){
        // fallback substring local
        const filtered = usersCache.filter(u=>{
          const hay = ((u.name||'') + ' ' + (u.uid||'')).toLowerCase();
          return hay.includes(q);
        }).slice(0,50);
        return renderUserList(filtered);
      }
      return renderUserList(results);
    } catch(err){
      console.warn('search error', err);
      const filtered = usersCache.filter(u=>{
        const hay = ((u.name||'') + ' ' + (u.uid||'')).toLowerCase();
        return hay.includes(q);
      }).slice(0,50);
      return renderUserList(filtered);
    }
  }

  const debouncedSearch = debounce((e)=> searchUsersForQuery(e.target.value), 300);

  function attachSearch(){
    searchInput.removeEventListener('input', debouncedSearch);
    searchInput.addEventListener('input', debouncedSearch);
  }

  // render buyer UI
  function renderBuyerUI(){
    roleArea.innerHTML = `
      <div class="card">
        <h3>Buyer — Tracking</h3>
        <div class="notice">Service fee: <span class="badge">4%</span> — shown here and deducted when released</div>
        <div class="boxes">
          <div class="box"><div class="label">Wallet</div><div id="buyerWallet" class="amount">₦0</div></div>
          <div class="box"><div class="label">Active Holds</div><div id="buyerEscrowCount" class="amount">0</div></div>
        </div>

        <div style="margin-top:12px">
          <h4>Create Escrow</h4>
          <input id="escrowSellerUid" placeholder="Seller UID (copy from their profile)" />
          <input id="escrowAmount" type="number" placeholder="Amount (₦)" />
          <div class="small muted">Service fee 4% will be shown and stored.</div>
          <button id="createEscrowBtn" class="primary">Create Escrow (Paystack)</button>
        </div>

        <div style="margin-top:12px" id="buyerTxList"><div class="small muted">Loading your transactions…</div></div>
      </div>
    `;
    // wallet listener
    db.collection('wallets').doc(currentUser.uid).onSnapshot(s=>{
      if(s.exists) document.getElementById('buyerWallet').innerText = '₦' + (s.data().balance || 0).toLocaleString();
      else document.getElementById('buyerWallet').innerText = '₦0';
    });

    // create escrow
    document.getElementById('createEscrowBtn').addEventListener('click', async ()=>{
      const sellerUid = document.getElementById('escrowSellerUid').value.trim();
      const amount = Number(document.getElementById('escrowAmount').value);
      if(!sellerUid) return alert('Enter seller UID');
      if(!amount || amount <= 0) return alert('Enter valid amount');
      const handler = PaystackPop.setup({
        key: 'PAYSTACK_PUBLIC_KEY_HERE',
        email: auth.currentUser.email,
        amount: Math.round(amount * 100),
        currency: 'NGN',
        callback: async function(response){
          await createTransaction({ buyerUid: currentUser.uid, sellerUid, amount, reference: response.reference, description: 'Escrow payment' });
          alert('Escrow created. Seller notified.');
        },
        onClose: function(){ alert('Payment cancelled'); }
      });
      handler.openIframe();
    });

    // buyer transaction list
    db.collection('transactions').where('buyer_uid','==', currentUser.uid).orderBy('created_at','desc').onSnapshot(snap=>{
      if(snap.empty) return document.getElementById('buyerTxList').innerHTML = `<div class="small muted">No transactions</div>`;
      const arr = [];
      snap.forEach(d=> arr.push({ id:d.id, ...d.data() }));
      document.getElementById('buyerTxList').innerHTML = arr.map(tx=> `
        <div class="card" style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between">
            <div>
              <div style="font-weight:700">${escapeHtml(tx.description || tx.id)}</div>
              <div class="small muted">Seller: ${escapeHtml(tx.seller_uid)}</div>
              <div class="small muted">Amount: ₦${Number(tx.amount).toLocaleString()} (Fee: ₦${Number(tx.fee||0).toLocaleString()})</div>
              <div class="small muted">Status: ${escapeHtml(tx.status)}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${tx.status === 'delivered' && !tx.buyerConfirmed ? `<button class="primary" data-id="${tx.id}" data-action="buyer-arrived">Rider Arrived (Confirm)</button>` : ''}
            </div>
          </div>
        </div>
      `).join('');
      document.querySelectorAll('button[data-action="buyer-arrived"]').forEach(b=>{
        b.onclick = async ()=> {
          const id = b.dataset.id;
          await buyerConfirmArrived(id);
          alert('You confirmed rider arrival. If rider already confirmed, funds will be released.');
        };
      });
    });
  }

  // render seller UI
  function renderSellerUI(){
    roleArea.innerHTML = `
      <div class="card">
        <h3>Seller — Business Hub</h3>
        <div id="sellerNotifications" class="notice small muted">Notifications will appear here</div>
        <div id="sellerOrdersList" style="margin-top:12px"><div class="small muted">Loading orders…</div></div>
      </div>
    `;
    db.collection('transactions').where('seller_uid','==', currentUser.uid).onSnapshot(snap=>{
      const arr = [];
      snap.forEach(d=> arr.push({ id:d.id, ...d.data() }));
      document.getElementById('sellerOrdersList').innerHTML = arr.length ? arr.map(tx=> `
        <div class="card" style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between">
            <div>
              <div style="font-weight:700">${escapeHtml(tx.description||tx.id)}</div>
              <div class="small muted">Amount: ₦${Number(tx.amount).toLocaleString()} (Fee: ₦${Number(tx.fee||0)})</div>
              <div class="small muted">Status: ${escapeHtml(tx.status)}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${tx.status === 'paid' ? `<button class="primary" data-id="${tx.id}" data-action="request-rider">Request Rider</button>` : ''}
              ${tx.status === 'rider_assigned' ? `<div class="small muted">Rider: ${escapeHtml(tx.rider_uid||'')}</div>` : ''}
            </div>
          </div>
        </div>
      `).join('') : `<div class="small muted">No orders</div>`;
      document.querySelectorAll('button[data-action="request-rider"]').forEach(b=>{
        b.onclick = async ()=> {
          const txId = b.dataset.id;
          const pickup = prompt('Enter pickup details (address or note):') || '';
          await sellerRequestRider(txId, currentUser.uid, { pickup });
          alert('Rider request created. Riders will be notified.');
        };
      });
    });

    db.collection('notifications').where('to','==', currentUser.uid).orderBy('created_at','desc').limit(10)
      .onSnapshot(snap=>{
        const arr=[]; snap.forEach(d=> arr.push(d.data()));
        if(arr.length === 0) document.getElementById('sellerNotifications').innerText = 'No notifications';
        else document.getElementById('sellerNotifications').innerHTML = arr.map(n=>`<div class="notice small">${escapeHtml(n.type)} — ${escapeHtml(n.txId||'')}</div>`).join('');
      });
  }

  // render rider UI
  function renderRiderUI(){
    roleArea.innerHTML = `
      <div class="card">
        <h3>Rider — Task Manager</h3>
        <div class="boxes">
          <div class="box"><div class="label">Active Tasks</div><div id="riderTasksCount" class="amount">0</div></div>
          <div class="box"><div class="label">Completed</div><div id="riderCompleted" class="amount">0</div></div>
        </div>
        <div style="margin-top:12px" id="riderTaskList">Loading tasks…</div>
        <div style="margin-top:12px" id="mapBox" class="card"><div id="mapPlaceholder" class="map-placeholder">Map placeholder — Google Maps integration goes here</div></div>
      </div>
    `;
    db.collection('riderRequests').where('status','==','open').onSnapshot(snap=>{
      const arr=[]; snap.forEach(d=> arr.push({ id:d.id, ...d.data() }));
      // show open requests (riders can accept)
      document.getElementById('riderTaskList').innerHTML = arr.length ? arr.map(r=>`
        <div class="card" style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between">
            <div>
              <div style="font-weight:700">Request ${escapeHtml(r.id)}</div>
              <div class="small muted">Tx: ${escapeHtml(r.txId||'')}</div>
              <div class="small muted">Pickup: ${escapeHtml((r.pickupDetails && r.pickupDetails.pickup) || '')}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <button class="primary" data-id="${r.id}" data-action="accept-request">Accept</button>
            </div>
          </div>
        </div>
      `).join('') : `<div class="small muted">No open requests</div>`;
      document.querySelectorAll('button[data-action="accept-request"]').forEach(b=>{
        b.onclick = async ()=> {
          const reqId = b.dataset.id;
          const reqDoc = (await db.collection('riderRequests').doc(reqId).get()).data();
          if(!reqDoc) return alert('Request not found');
          const txId = reqDoc.txId;
          await assignRiderToTx(txId, currentUser.uid);
          // update request status
          await db.collection('riderRequests').doc(reqId).update({ status:'accepted', riderUid: currentUser.uid });
          alert('You accepted the request. Proceed to pickup.');
        };
      });
    });

    db.collection('transactions').where('rider_uid','==', currentUser.uid).onSnapshot(snap=>{
      const tasks = []; snap.forEach(d=> tasks.push({ id:d.id, ...d.data() }));
      document.getElementById('riderTasksCount').innerText = tasks.length;
      document.getElementById('riderTaskList').innerHTML = tasks.length ? tasks.map(t=>`
        <div class="card" style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between">
            <div>
              <div style="font-weight:700">${escapeHtml(t.description || t.id)}</div>
              <div class="small muted">Amount: ₦${Number(t.amount).toLocaleString()}</div>
              <div class="small muted">Status: ${escapeHtml(t.status)}</div>
              <div class="small muted">Seller: ${escapeHtml(t.seller_uid)}</div>
              <div class="small muted">Buyer: ${escapeHtml(t.buyer_uid)}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${t.status !== 'delivered' ? `<button class="primary" data-id="${t.id}" data-action="mark-arrived">Arrived (Confirm)</button>` : `<span style="color:#9fe29f">Delivered</span>`}
              <button class="primary" data-id="${t.id}" data-action="text-buyer">Text Buyer</button>
              <button class="primary" data-id="${t.id}" data-action="text-seller">Text Seller</button>
            </div>
          </div>
        </div>
      `).join('') : `<div class="small muted">No tasks</div>`;

      // wire actions for tasks (arrived and texting)
      document.querySelectorAll('button[data-action="mark-arrived"]').forEach(b=>{
        b.onclick = async ()=> {
          const id = b.dataset.id;
          await riderConfirmArrived(id);
          alert('You confirmed arrival. If buyer confirms too, funds will be released.');
        };
      });
      document.querySelectorAll('button[data-action="text-buyer"]').forEach(b=>{
        b.onclick = async ()=> {
          const id = b.dataset.id;
          const tx = (await db.collection('transactions').doc(id).get()).data();
          if(!tx) return alert('Transaction not found');
          const buyer = { uid: tx.buyer_uid, name: (await db.collection('users').doc(tx.buyer_uid).get()).data().name || tx.buyer_uid };
          openChatWith(buyer);
        };
      });
      document.querySelectorAll('button[data-action="text-seller"]').forEach(b=>{
        b.onclick = async ()=> {
          const id = b.dataset.id;
          const tx = (await db.collection('transactions').doc(id).get()).data();
          if(!tx) return alert('Transaction not found');
          const seller = { uid: tx.seller_uid, name: (await db.collection('users').doc(tx.seller_uid).get()).data().name || tx.seller_uid };
          openChatWith(seller);
        };
      });
    });

    if(window.startMapForElement) startMapForElement('mapPlaceholder');
  }

  // initialize after auth
  auth.onAuthStateChanged(async user=>{
    if(!user) return window.location.href = 'index.html';
    const uDoc = await db.collection('users').doc(user.uid).get();
    if(!uDoc.exists || !uDoc.data().role) {
      // if role missing, send to index for role selection
      window.location.href = 'index.html';
      return;
    }
    currentUser = { uid: user.uid, ...(uDoc.data()||{}) };
    welcomeName.innerText = `Hi, ${currentUser.name || 'User'}`;
    roleLabel.innerText = `Role: ${currentUser.role || '-'}`;
    topUser.innerText = currentUser.name || user.email || user.uid;
    // attach search/list
    attachUserList();
    attachSearch();
    // render role-specific UI (and lock role)
    if(currentUser.role === 'buyer') { renderBuyerUI(); }
    else if(currentUser.role === 'seller') { renderSellerUI(); }
    else { renderRiderUI(); }

    // set debug/show tabs (these buttons are only for testing; actual role locked)
    showBuyerTab.onclick = ()=> renderBuyerUI();
    showSellerTab.onclick = ()=> renderSellerUI();
    showRiderTab.onclick = ()=> renderRiderUI();
  });

  refreshUsersBtn.addEventListener('click', attachUserList);

})();
