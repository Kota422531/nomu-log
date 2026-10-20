// のむログのオリジナルキャラクター「ぽんちゃん」(たぬき)
// mood: 'normal' | 'happy' | 'sleepy' | 'worried'

const C = {
  fur: '#c99a72', furDark: '#a8774f', mask: '#6e4b3a', ear: '#6e4b3a',
  face: '#f7e8d6', muzzle: '#fff8ef', nose: '#3b2a22', eye: '#2b1d16',
  belly: '#f8ead9', cheek: '#ff9ab5', leaf: '#86c39a', leafVein: '#5fa676',
  pill: '#ff7fa6', pillLight: '#fff', line: '#5a3d30',
};

function eyes(mood) {
  if (mood === 'happy') {
    return `<path d="M64 95 q8 -9 16 0" stroke="${C.muzzle}" stroke-width="4" fill="none" stroke-linecap="round"/>
            <path d="M120 95 q8 -9 16 0" stroke="${C.muzzle}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  }
  if (mood === 'sleepy') {
    return `<path d="M64 95 q8 6 16 0" stroke="${C.muzzle}" stroke-width="4" fill="none" stroke-linecap="round"/>
            <path d="M120 95 q8 6 16 0" stroke="${C.muzzle}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  }
  const brow = mood === 'worried'
    ? `<path d="M62 76 l14 -6" stroke="${C.mask}" stroke-width="3.5" stroke-linecap="round"/>
       <path d="M138 76 l-14 -6" stroke="${C.mask}" stroke-width="3.5" stroke-linecap="round"/>`
    : '';
  return `${brow}
    <circle cx="72" cy="94" r="7.5" fill="${C.eye}"/><circle cx="74.5" cy="91" r="2.6" fill="#fff"/>
    <circle cx="128" cy="94" r="7.5" fill="${C.eye}"/><circle cx="130.5" cy="91" r="2.6" fill="#fff"/>`;
}

function mouth(mood) {
  if (mood === 'happy') return `<path d="M91 116 q9 12 18 0 z" fill="#e8607f"/>`;
  if (mood === 'worried') return `<path d="M93 119 q7 -5 14 0" stroke="${C.line}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  if (mood === 'sleepy') return `<ellipse cx="100" cy="117" rx="3.5" ry="2.5" fill="${C.line}"/>`;
  return `<path d="M92 114 q4 5 8 0 q4 5 8 0" stroke="${C.line}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
}

function extras(mood) {
  if (mood === 'happy') {
    return `<g fill="#ffc94d"><path d="M28 60 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z"/><path d="M168 44 l2.4 5.6 5.6 2.4 -5.6 2.4 -2.4 5.6 -2.4 -5.6 -5.6 -2.4 5.6 -2.4z"/></g>`;
  }
  if (mood === 'sleepy') {
    return `<g fill="#b9a6e0" font-family="'M PLUS Rounded 1c',sans-serif" font-weight="800">
      <text x="150" y="58" font-size="22">Z</text><text x="168" y="40" font-size="15">z</text></g>`;
  }
  if (mood === 'worried') {
    return `<path d="M156 66 q8 12 0 18 q-8 -6 0 -18z" fill="#8fd0f0"/>`;
  }
  return '';
}

function hands(mood) {
  // normal / happy はおくすりを抱えている
  if (mood === 'normal' || mood === 'happy') {
    return `<g transform="rotate(-18 100 158)">
        <rect x="80" y="149" width="40" height="18" rx="9" fill="${C.pillLight}" stroke="${C.line}" stroke-width="2"/>
        <path d="M100 149 h11 a9 9 0 0 1 0 18 h-11z" fill="${C.pill}" stroke="${C.line}" stroke-width="2"/>
      </g>
      <ellipse cx="78" cy="162" rx="11" ry="9" fill="${C.furDark}"/>
      <ellipse cx="122" cy="156" rx="11" ry="9" fill="${C.furDark}"/>`;
  }
  return `<ellipse cx="80" cy="160" rx="11" ry="9" fill="${C.furDark}"/><ellipse cx="120" cy="160" rx="11" ry="9" fill="${C.furDark}"/>`;
}

export function tanuki(mood = 'normal', size = 120, label = 'たぬきのぽんちゃん') {
  return `<svg class="tanuki mood-${mood}" width="${size}" height="${size}" viewBox="0 0 200 200" role="img" aria-label="${label}">
  <!-- しっぽ -->
  <g transform="rotate(28 160 160)">
    <ellipse cx="160" cy="160" rx="18" ry="30" fill="${C.fur}"/>
    <path d="M143 150 q17 6 34 0" stroke="${C.mask}" stroke-width="7" fill="none"/>
    <path d="M144 168 q16 6 32 0" stroke="${C.mask}" stroke-width="7" fill="none"/>
  </g>
  <!-- からだ -->
  <ellipse cx="100" cy="158" rx="50" ry="38" fill="${C.fur}"/>
  <ellipse cx="100" cy="166" rx="31" ry="25" fill="${C.belly}"/>
  <ellipse cx="74" cy="192" rx="14" ry="7" fill="${C.furDark}"/>
  <ellipse cx="126" cy="192" rx="14" ry="7" fill="${C.furDark}"/>
  <!-- みみ -->
  <circle cx="52" cy="50" r="19" fill="${C.fur}"/><circle cx="52" cy="50" r="10" fill="${C.ear}"/>
  <circle cx="148" cy="50" r="19" fill="${C.fur}"/><circle cx="148" cy="50" r="10" fill="${C.ear}"/>
  <!-- あたま -->
  <ellipse cx="100" cy="90" rx="64" ry="54" fill="${C.fur}"/>
  <ellipse cx="100" cy="104" rx="50" ry="34" fill="${C.face}"/>
  <!-- 目のまわりの模様 -->
  <ellipse cx="72" cy="94" rx="21" ry="15" fill="${C.mask}" transform="rotate(-18 72 94)"/>
  <ellipse cx="128" cy="94" rx="21" ry="15" fill="${C.mask}" transform="rotate(18 128 94)"/>
  ${eyes(mood)}
  <!-- ほっぺ -->
  <ellipse cx="54" cy="116" rx="11" ry="7" fill="${C.cheek}" opacity=".75"/>
  <ellipse cx="146" cy="116" rx="11" ry="7" fill="${C.cheek}" opacity=".75"/>
  <!-- はな・くち -->
  <ellipse cx="100" cy="112" rx="17" ry="12" fill="${C.muzzle}"/>
  <ellipse cx="100" cy="105" rx="7" ry="5" fill="${C.nose}"/>
  ${mouth(mood)}
  <!-- あたまのはっぱ -->
  <g transform="rotate(-25 104 36)">
    <path d="M104 14 q20 14 0 44 q-20 -30 0 -44z" fill="${C.leaf}"/>
    <path d="M104 18 v38" stroke="${C.leafVein}" stroke-width="2.5" stroke-linecap="round"/>
  </g>
  ${hands(mood)}
  ${extras(mood)}
</svg>`;
}
