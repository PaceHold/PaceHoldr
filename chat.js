// chat.js — Realtime DB chat fully functional with sender name and left/right balloons
(function(){
  if(!window.rtdb) return console.error('Realtime DB not initialized (firebase-config.js)');

  // create room id from two uids (sorted)
  function roomIdFor(a, b){
    if(!a || !b) return null;
    return [a,b].sort().join('__');
  }

  // returns user display name quickly (cache)
  const userNameCache = {};
  async function getUserName(uid){
    if(!uid) return '';
    if(userNameCache[uid]) return userNameCache[uid];
    try {
      const doc = await db.collection('users').doc(uid).get();
      const name = doc.exists ? (doc.data().name || uid) : uid;
      userNameCache[uid] = name;
      return name;
    } catch(e){ return uid; }
  }

  // open chat room with user object { uid, name }
  window.openChatRoom = async function(withUser){
    const me = auth.currentUser;
    if(!me) return alert('Sign in first');
    const partnerUid = withUser.uid || withUser.id;
    if(!partnerUid) return alert('Invalid chat partner');
    const room = roomIdFor(me.uid, partnerUid);
    window.currentChatRoom = room;
    const partnerName = withUser.name || await getUserName(partnerUid);
    document.getElementById('chatWith').innerText = `${partnerName} (${partnerUid})`;
    document.getElementById('chatPanel').style.display = 'flex';
    loadMessages(room);
  };

  // send message (includes senderUid and senderName)
  document.getElementById('sendMessageBtn').addEventListener('click', async ()=>{
    const txtEl = document.getElementById('messageInput');
    const txt = txtEl.value.trim();
    if(!txt) return;
    const me = auth.currentUser;
    if(!me) return alert('Sign in first');
    const room = window.currentChatRoom;
    if(!room) return alert('Select a chat');
    const senderName = (me.displayName || (await getUserName(me.uid))) || me.uid;
    const payload = { from: me.uid, fromName: senderName, text: txt, ts: firebase.database.ServerValue.TIMESTAMP };
    await rtdb.ref('chats/' + room + '/messages').push(payload);
    txtEl.value = '';
  });

  // load messages & subscribe
  let currentRef = null;
  async function loadMessages(room){
    const body = document.getElementById('chatBody');
    if(currentRef) currentRef.off();
    currentRef = rtdb.ref('chats/' + room + '/messages').limitToLast(200);
    currentRef.on('value', async snap=>{
      const data = snap.val() || {};
      const rows = Object.keys(data).map(k => ({ id:k, ...data[k] })).sort((a,b)=>a.ts - b.ts);
      // prepare HTML
      const meUid = auth.currentUser ? auth.currentUser.uid : null;
      const html = await Promise.all(rows.map(async m => {
        const isMe = m.from === meUid;
        const name = m.fromName || await getUserName(m.from);
        const cls = isMe ? 'msg me' : 'msg them';
        const time = m.ts ? (new Date(m.ts)).toLocaleTimeString() : '';
        return `<div class="${cls}"><div style="font-weight:700;font-size:13px">${escapeHtml(name)}</div><div style="margin-top:6px">${escapeHtml(m.text)}</div><div class="meta">${escapeHtml(time)}</div></div>`;
      }));
      body.innerHTML = html.join('');
      body.scrollTop = body.scrollHeight;
    });
  }

  // escape helper
  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // helper to open chat from dashboard
  window.openChatWith = async function(user){
    await openChatRoom(user);
  };

  // chat notification badge count (basic)
  async function updateBadge(){
    const me = auth.currentUser;
    if(!me) return;
    try {
      const snap = await rtdb.ref('chats').once('value');
      const rooms = snap.val() || {};
      let cnt = 0;
      Object.keys(rooms).forEach(room=>{
        if(room.indexOf(me.uid) > -1) cnt++;
      });
      const el = document.getElementById('chatBadge');
      if(cnt) { el.style.display='flex'; el.innerText = cnt; } else el.style.display='none';
    } catch(e){}
  }
  setInterval(updateBadge, 10000);
  updateBadge();

  // toggle chat panel
  window.toggleChatPanel = function(){ const el = document.getElementById('chatPanel'); el.style.display = el.style.display === 'flex' ? 'none' : 'flex'; };
  window.closeChatPanel = function(){ document.getElementById('chatPanel').style.display = 'none'; };
})();
