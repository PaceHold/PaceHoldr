// chat.js — Minimal Realtime DB chat system (rooms + live messages)
// Uses rtdb (firebase.database())

(function(){
  if(!window.rtdb) return console.error('Realtime DB not initialized (firebase-config.js)');

  // create room id from two uids (sorted)
  function roomIdFor(a, b){
    if(!a || !b) return null;
    return [a,b].sort().join('__');
  }

  // expose to global
  window.openChatRoom = async function(withUser){
    const me = auth.currentUser;
    if(!me) return alert('Sign in first');
    const room = roomIdFor(me.uid, withUser.uid || withUser.id);
    if(!room) return alert('Invalid chat partner');
    window.currentChatRoom = room;
    document.getElementById('chatWith').innerText = withUser.name ? `${withUser.name} (${withUser.uid||withUser.id})` : (withUser.uid||withUser.id);
    document.getElementById('chatPanel').style.display = 'flex';
    loadMessages(room);
  };

  // send message
  document.getElementById('sendMessageBtn').addEventListener('click', async ()=>{
    const txt = document.getElementById('messageInput').value.trim();
    if(!txt) return;
    const me = auth.currentUser;
    if(!me) return alert('Sign in first');
    const room = window.currentChatRoom;
    if(!room) return alert('Select a chat');
    const msgRef = rtdb.ref('chats/' + room + '/messages').push();
    await msgRef.set({
      from: me.uid,
      text: txt,
      ts: firebase.database.ServerValue.TIMESTAMP
    });
    document.getElementById('messageInput').value = '';
  });

  // load messages & subscribe
  let currentListener = null;
  function loadMessages(room){
    const body = document.getElementById('chatBody');
    if(currentListener) currentListener.off();
    const ref = rtdb.ref('chats/' + room + '/messages').limitToLast(200);
    currentListener = ref;
    ref.on('value', snap=>{
      const data = snap.val() || {};
      const rows = Object.keys(data).map(k => ({ id:k, ...data[k] })).sort((a,b)=>a.ts - b.ts);
      body.innerHTML = rows.map(m => {
        const me = auth.currentUser && auth.currentUser.uid;
        const cls = (me && m.from === me) ? 'msg me' : 'msg them';
        return `<div class="${cls}">${escapeHtml(m.text)}</div>`;
      }).join('');
      body.scrollTop = body.scrollHeight;
    });
  }

  // helper escape
  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // open chat from dashboard when clicking user-row
  window.openChatWith = function(user){
    // user has uid/id and name
    openChatRoom(user);
  };

  // update notification badge count (simple logic: count unread recent rooms)
  function updateBadge(){
    const me = auth.currentUser;
    if(!me) return;
    rtdb.ref('chats').once('value').then(snap=>{
      const rooms = snap.val() || {};
      let cnt = 0;
      Object.keys(rooms).forEach(room=>{
        const parts = room.split('__');
        if(parts.indexOf(me.uid) > -1) cnt++;
      });
      const el = document.getElementById('chatBadge');
      if(cnt) { el.style.display='flex'; el.innerText = cnt; } else el.style.display='none';
    }).catch(()=>{});
  }
  // poll badge every 10s
  setInterval(updateBadge, 10000);
  updateBadge();

  // toggle functions
  window.toggleChatPanel = function(){ const el = document.getElementById('chatPanel'); el.style.display = el.style.display === 'flex' ? 'none' : 'flex'; };
  window.closeChatPanel = function(){ document.getElementById('chatPanel').style.display = 'none'; };

})();
