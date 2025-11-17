// transaction.js - small helpers you may use (optional)
// kept minimal: helper to format NGN
function formatNGN(n){
  const v = Number(n||0);
  return '₦' + v.toLocaleString('en-NG', { minimumFractionDigits: 0 });
}
