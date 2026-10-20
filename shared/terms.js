// Terms & Conditions: shown in Settings and on the sign-up screens.
export function termsHtml(price = '$2', note = 'paid cash in hand to the site owner', months = 6) {
  return `
    <p><b>Price.</b> ${
      months
        ? `Access to War Grounds costs <b>${price} for <u>${months} months</u></b> (${months} whole months, not one), ${note}. When your ${months} months are up, pay again to keep playing.`
        : `Access to War Grounds is a one-time payment of <b>${price}</b>, ${note}. It's for life: no subscription and nothing more to pay.`
    }</p>
    <p><b>No refunds.</b> All payments are final. There are no refunds for any reason, including if your account is banned, if you stop playing, or if the game changes, goes offline or closes.</p>
    <p><b>Switching your account on.</b> Accounts are turned on by hand once the owner has your payment, so it can take a while. Your time starts from when your account is switched on.</p>
    <p><b>Playing fair.</b> The owner can time out, ban or turn off any account that cheats, harasses other players or breaks the rules, without a refund. One account per person; don't share your login.</p>
    <p><b>The game.</b> War Grounds is provided as it is. It can change at any time, may have downtime, and progress may be reset.</p>
    <p><b>Your details.</b> Your email is only used to log you in. The game keeps your player name, stats and internet address (for bans).</p>`;
}

// The price, big: "$2 for 6 MONTHS" with the months standing out (or "$2 once, forever"). price is already escaped.
export function priceTag(price = '$2', months = 6) {
  if (!months) return `<div class="price-tag"><span class="pt-price">${price}</span><span class="pt-for">once</span><span class="pt-months">FOREVER</span></div>`;
  const n = Number(String(price).replace(/[^0-9.]/g, ''));
  const cents = n && /^\$/.test(price) ? Math.round((n / months) * 100) : 0;
  const each = cents ? (cents < 100 ? `${cents}c` : `$${(cents / 100).toFixed(2)}`) : '';
  return `<div class="price-tag"><span class="pt-price">${price}</span><span class="pt-for">for</span><span class="pt-months"><b>${months}</b> MONTHS</span>${
    each ? `<span class="pt-each">that's only ${each} a month · a whole ${months} months of play</span>` : `<span class="pt-each">a whole ${months} months of play</span>`
  }</div>`;
}
