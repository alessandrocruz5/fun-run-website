<?php
require __DIR__ . '/data.php';
$default = $_GET['d'] ?? '21k';
if (!isset($DISTANCES[$default])) $default = '21k';
$R = $DISTANCES[$default];
$T = order_totals($R['price'], 10);
$TEE = 'M95 20 L120 10 C130 32 170 32 180 10 L205 20 L282 62 L256 122 L225 106 L225 300 L75 300 L75 106 L44 122 L18 62 Z';
$routesJson = [];
foreach ($DISTANCES as $id => $d) {
  $routesJson[$id] = $d + ['elevLine' => elev_points($d['elev'])];
}
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Riverline Run 2027 — Port Meridian</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap">
<link rel="stylesheet" href="assets/style.css">
<link rel="stylesheet" href="assets/motion.css">
<link rel="stylesheet" href="assets/responsive.css">
</head>
<body>

<div class="progress" id="progress"></div>
<div class="banner mono"><span>● TEST MODE — no real charges</span><span>Success card 4242 4242 4242 4242</span><span>Decline card 4000 0000 0000 0002</span></div>

<header class="wrap hdr">
  <div class="logo"><i><b></b></i>RIVERLINE RUN</div>
  <a href="#register" class="pill-dark m-reg">Register</a>
  <button class="menu-btn" id="menuBtn" type="button" aria-label="Menu" aria-expanded="false"><span></span><span></span></button>
  <nav id="nav"><a href="#routes">Routes</a><a href="#kit">Shirts &amp; Medals</a><a href="#cause">The Cause</a><a href="#register" class="pill-dark">Register</a></nav>
</header>

<section class="wrap hero">
  <div class="stack">
    <div class="row mono rise" style="--d:0s"><span class="chip">SUN · APR 18, 2027</span><span class="chip">PORT MERIDIAN WATERFRONT</span></div>
    <h1 class="disp"><span class="line"><span style="--d:.1s">Run the</span></span><span class="line"><span style="--d:.22s"><em>river</em>line.</span></span></h1>
    <p class="rise" style="--d:.4s">Four distances along the Meridian River — from a 5K stroll to the full 42.2K. Every entry funds river restoration and clean water work by the Clearwater Collective.</p>
    <div class="row rise" style="--d:.52s"><a href="#register" class="btn accent">REGISTER — FROM $<?= min(array_column($DISTANCES, 'price')) ?></a><a href="#routes" class="btn">SEE THE ROUTES</a></div>
  </div>
  <div class="hero-map rise" style="--d:.3s">
    <svg viewBox="0 0 600 460">
      <path d="M-20 130 C120 100 200 210 320 220 S520 310 640 340" fill="none" stroke="#1E4466" stroke-width="56" stroke-linecap="round"/>
      <path d="M-20 130 C120 100 200 210 320 220 S520 310 640 340" fill="none" stroke="#9CC8D9" stroke-width="2" stroke-dasharray="4 10" opacity=".6"/>
      <path id="heroPath" class="draw go" pathLength="1" style="--dur:3.2s;--d:.6s" transform="translate(0 10)" d="<?= h($DISTANCES['42k']['path']) ?>" fill="none" stroke="#FF5A1F" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="300" cy="238" r="13" fill="#F3EFE6"/><circle cx="300" cy="238" r="6" fill="#10233A"/>
      <circle class="runner" r="7" fill="#F3EFE6" stroke="#FF5A1F" stroke-width="3"><animateMotion dur="14s" begin="3.8s" repeatCount="indefinite"><mpath href="#heroPath"/></animateMotion></circle>
    </svg>
    <div class="cap mono">FULL MARATHON COURSE<br><span style="color:#FF5A1F">42.195 KM · 2 BRIDGES · 1 RIVER</span></div>
    <div class="tags"><?php foreach ($DISTANCES as $d): ?><span><?= h($d['name']) ?></span><?php endforeach; ?></div>
  </div>
</section>

<section id="routes" class="dark">
  <div class="wrap sec">
    <div class="sechead" data-reveal>
      <h2 class="disp h2">THE ROUTES</h2>
      <div class="tabs" id="routeTabs">
        <?php foreach ($DISTANCES as $id => $d): ?>
          <button data-route="<?= h($id) ?>" class="<?= $id === $default ? 'on' : '' ?>"><?= h($d['name']) ?></button>
        <?php endforeach; ?>
      </div>
    </div>
    <div class="grid2">
      <div class="map" data-reveal id="routeMap">
        <svg viewBox="0 0 600 440">
          <defs><pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#E0D8C7"/></pattern></defs>
          <rect width="600" height="440" fill="url(#grid)"/>
          <path d="M-20 120 C120 90 200 200 320 210 S520 300 640 330" fill="none" stroke="#9CC8D9" stroke-width="44" stroke-linecap="round"/>
          <line x1="190" y1="100" x2="230" y2="210" stroke="#10233A" stroke-width="7" opacity=".25"/>
          <line x1="440" y1="225" x2="470" y2="320" stroke="#10233A" stroke-width="7" opacity=".25"/>
          <path class="js-path draw" pathLength="1" style="--dur:2.2s" d="<?= h($R['path']) ?>" fill="none" stroke="#10233A" stroke-width="10" stroke-linejoin="round" stroke-linecap="round" opacity=".12"/>
          <path id="routeMain" class="js-path draw" pathLength="1" style="--dur:2.2s" d="<?= h($R['path']) ?>" fill="none" stroke="#FF5A1F" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
          <path class="js-path dots" d="<?= h($R['path']) ?>" fill="none" stroke="#F3EFE6" stroke-width="1.5" stroke-dasharray="2 14" stroke-linejoin="round"/>
          <circle class="runner" r="7" fill="#10233A" stroke="#FF5A1F" stroke-width="3"><animateMotion dur="9s" repeatCount="indefinite"><mpath href="#routeMain"/></animateMotion></circle>
          <circle cx="300" cy="228" r="12" fill="#10233A"/><circle cx="300" cy="228" r="5" fill="#FF5A1F"/>
          <text x="318" y="252" font-family="JetBrains Mono" font-size="12" font-weight="600" fill="#10233A">START / FINISH · HARBOR PLAZA</text>
          <text x="40" y="200" font-family="JetBrains Mono" font-size="11" fill="#10233A" opacity=".55">MERIDIAN RIVER</text>
        </svg>
        <div class="lbl mono"><span id="rFull"><?= h($R['full']) ?></span> · COURSE MAP</div>
      </div>
      <div class="stack" style="gap:22px" data-reveal data-stagger id="routeInfo">
        <div class="row" style="align-items:baseline;gap:14px"><div class="disp km" id="rKm"><?= h($R['km']) ?></div><div class="mono" style="font-size:13px;opacity:.7">KILOMETERS</div></div>
        <p style="margin:0;font-size:18px;line-height:1.5;max-width:34em" id="rBlurb"><?= h($R['blurb']) ?></p>
        <div class="stats">
          <div><span class="mono">START</span><span id="rStart"><?= h($R['start']) ?></span></div>
          <div><span class="mono">GAIN</span><span id="rGain"><?= h($R['gain']) ?></span></div>
          <div><span class="mono">AID STATIONS</span><span id="rAid"><?= h($R['aid']) ?></span></div>
          <div><span class="mono">CUTOFF</span><span id="rCutoff"><?= h($R['cutoff']) ?></span></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <span class="mono" style="font-size:11px;opacity:.6">ELEVATION PROFILE</span>
          <svg viewBox="0 0 600 120" preserveAspectRatio="none" style="width:100%;height:96px;display:block">
            <polygon id="rArea" class="area" points="0,120 <?= elev_points($R['elev']) ?> 600,120" fill="#FF5A1F"/>
            <polyline id="rLine" class="draw" pathLength="1" style="--dur:1.6s;--d:.3s" points="<?= elev_points($R['elev']) ?>" fill="none" stroke="#FF5A1F" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
          </svg>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px" id="rHl">
          <?php foreach ($R['highlights'] as [$at, $t]): ?><div class="hl"><span class="mono"><?= h($at) ?></span><span><?= h($t) ?></span></div><?php endforeach; ?>
        </div>
      </div>
    </div>
  </div>
</section>

<section id="kit" class="wrap sec" style="padding-top:80px;padding-bottom:80px;gap:56px">
  <div class="sechead" data-reveal>
    <h2 class="disp h2">WEAR IT.<br>EARN IT.</h2>
    <p style="margin:0;max-width:26em;font-size:17px;line-height:1.5">Every runner gets the race jersey in their packet. Finisher shirts are handed out only past the line — Half and Full only.</p>
  </div>
  <div class="kit" data-reveal data-stagger>
    <div class="shirt" style="background:var(--sand)">
      <div class="top mono"><span>RACE JERSEY</span><span>ALL DISTANCES</span></div>
      <svg viewBox="0 0 300 310">
        <defs><clipPath id="tee1"><path d="<?= $TEE ?>"/></clipPath></defs>
        <g clip-path="url(#tee1)">
          <rect width="300" height="310" fill="#10233A"/>
          <path d="M-10 200 C60 170 120 240 190 205 S280 170 320 190 L320 230 C260 210 230 260 170 245 S60 215 -10 240 Z" fill="#FF5A1F"/>
          <path d="M-10 250 C60 225 120 285 190 255 S280 225 320 245" fill="none" stroke="#9CC8D9" stroke-width="5"/>
          <path d="M-10 266 C60 241 120 301 190 271 S280 241 320 261" fill="none" stroke="#9CC8D9" stroke-width="2"/>
          <rect x="18" y="62" width="60" height="60" fill="#1E4466"/><rect x="222" y="62" width="60" height="60" fill="#1E4466"/>
          <text x="150" y="110" text-anchor="middle" font-family="Archivo" font-weight="900" font-size="26" fill="#F3EFE6" style="font-stretch:125%">RIVERLINE</text>
          <text x="150" y="134" text-anchor="middle" font-family="JetBrains Mono" font-weight="600" font-size="11" fill="#FF5A1F">RUN · 2027</text>
        </g>
        <path d="M120 10 C130 32 170 32 180 10" fill="none" stroke="#FF5A1F" stroke-width="4"/>
      </svg>
      <div><h3>River Navy Tech Tee</h3><p style="opacity:.75">Recycled poly, mesh side panels, reflective wave print.</p></div>
    </div>
    <div class="shirt" style="background:var(--accent)">
      <div class="top mono"><span>FINISHER SHIRT</span><span>HALF · 21.1K</span></div>
      <svg viewBox="0 0 300 310">
        <defs><clipPath id="tee2"><path d="<?= $TEE ?>"/></clipPath></defs>
        <g clip-path="url(#tee2)">
          <rect width="300" height="310" fill="#F3EFE6"/>
          <text x="150" y="160" text-anchor="middle" font-family="Archivo" font-weight="900" font-size="66" fill="#FF5A1F" style="font-stretch:125%">21.1</text>
          <text x="150" y="186" text-anchor="middle" font-family="JetBrains Mono" font-weight="600" font-size="12" fill="#10233A">HALF · FINISHER</text>
          <path d="M90 220 C120 205 150 235 180 220 S210 205 225 212" fill="none" stroke="#10233A" stroke-width="3"/>
          <text x="150" y="252" text-anchor="middle" font-family="JetBrains Mono" font-size="9" fill="#10233A" opacity=".7">RIVERLINE RUN 2027</text>
        </g>
        <path d="M120 10 C130 32 170 32 180 10" fill="none" stroke="#10233A" stroke-width="4"/>
      </svg>
      <div><h3>Bone White Finisher</h3><p>Heavyweight cotton, puff-print 21.1 on the chest.</p></div>
    </div>
    <div class="shirt dark">
      <div class="top mono"><span>FINISHER SHIRT</span><span style="color:#FF5A1F">FULL · 42.2K</span></div>
      <svg viewBox="0 0 300 310">
        <defs><clipPath id="tee3"><path d="<?= $TEE ?>"/></clipPath></defs>
        <g clip-path="url(#tee3)">
          <rect width="300" height="310" fill="#0A0F16"/>
          <path d="M150 70 C120 72 96 92 100 112 C104 130 132 128 150 138 C168 148 196 150 200 170 C204 192 180 206 150 208 C124 210 104 196 110 180" fill="none" stroke="#FF5A1F" stroke-width="4"/>
          <circle cx="150" cy="70" r="6" fill="#F3EFE6"/>
          <text x="150" y="246" text-anchor="middle" font-family="Archivo" font-weight="900" font-size="30" fill="#F3EFE6" style="font-stretch:125%">42.195</text>
          <text x="150" y="266" text-anchor="middle" font-family="JetBrains Mono" font-weight="600" font-size="10" fill="#FF5A1F">I RAN THE WHOLE RIVER</text>
        </g>
        <path d="M120 10 C130 32 170 32 180 10" fill="none" stroke="#FF5A1F" stroke-width="4"/>
      </svg>
      <div><h3>Blackwater Marathoner</h3><p style="opacity:.8">Course line printed full-size across the chest.</p></div>
    </div>
  </div>
  <div class="stack" style="gap:24px">
    <div class="mono" style="letter-spacing:.06em" data-reveal>FINISHER MEDALS — ONE PER DISTANCE</div>
    <div class="medals" data-reveal data-stagger>
      <?php foreach ($DISTANCES as $d): ?>
      <div class="medal">
        <div class="ribbon" style="height:<?= (int)$d['ribbonH'] ?>px"><i></i><i></i></div>
        <div class="disc" style="--ms:<?= (int)$d['medalSize'] ?>px;width:<?= (int)$d['medalSize'] ?>px;height:<?= (int)$d['medalSize'] ?>px;background:<?= h($d['metal']) ?>">
          <div class="face" style="background:<?= h($d['face']) ?>;color:<?= h($d['faceInk']) ?>"><b><?= h($d['medalLabel']) ?></b><small>RIVERLINE ’27</small></div>
        </div>
        <div style="margin-top:18px;font:800 17px/1 'Archivo';font-stretch:115%"><?= h($d['full']) ?></div>
        <div style="margin-top:6px;font-size:13px;opacity:.7"><?= h($d['medal']) ?></div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<section id="cause" class="cause">
  <div class="wrap grid2" style="padding-top:80px;padding-bottom:80px;gap:48px;align-items:center">
    <div class="photo mono" data-reveal>PHOTO — Clearwater volunteers<br>at a riverbank cleanup</div>
    <div class="stack" style="gap:22px" data-reveal data-stagger>
      <div class="mono" style="letter-spacing:.06em">ORGANIZED BY THE CLEARWATER COLLECTIVE</div>
      <h2 class="disp" style="font-size:clamp(36px,5vw,64px);line-height:.92">Every kilometer keeps a river running clean.</h2>
      <p style="margin:0;font-size:18px;line-height:1.55">Clearwater Collective is a non-profit that restores urban waterways and funds clean drinking water projects in communities that don't have it. 100% of race surplus — after permits, medals and shirts — goes straight to field work.</p>
      <div class="impact">
        <div><b data-count="20" data-prefix="$">$20</b><span>of every entry funded to field work</span></div>
        <div><b data-count="14" data-suffix=" km">14 km</b><span>of Meridian riverbank restored since 2019</span></div>
        <div><b data-count="31">31</b><span>community wells built</span></div>
      </div>
    </div>
  </div>
</section>

<section id="register" class="wrap sec" style="padding-top:80px;padding-bottom:80px">
  <div class="sechead" data-reveal>
    <h2 class="disp h2">REGISTER</h2>
    <span class="mono" style="background:var(--accent);padding:8px 12px;border-radius:999px">TEST TRANSACTIONS ONLY</span>
  </div>

  <div class="done dark" id="doneView" hidden>
    <div class="stack" style="gap:18px">
      <div class="mono" style="color:var(--accent)">✓ TEST PAYMENT APPROVED · NO CHARGE MADE</div>
      <div class="disp" style="font-size:clamp(40px,5vw,64px);line-height:.92">You're in, <span id="dFirst"></span>.</div>
      <p style="margin:0;font-size:17px;line-height:1.5;opacity:.85">Confirmation sent to <span id="dEmail"></span>. Packet pickup opens Apr 16 at Harbor Plaza.</p>
      <div class="mono" style="display:flex;flex-direction:column;gap:8px;font-weight:400;font-size:13px;line-height:1.4;opacity:.85">
        <span>CONFIRMATION · <span id="dConf"></span></span><span>CHARGED (TEST) · $<span id="dTotal"></span></span><span>DONATION · $<span id="dDon"></span> to Clearwater</span>
      </div>
      <div class="row"><a class="ghost" id="emailLink" href="email.php" target="_blank" style="text-decoration:none;background:var(--paper);color:var(--ink)">Open confirmation email ↗</a><button class="ghost" id="resetBtn" type="button">Run another test transaction</button></div>
    </div>
    <div class="bib">
      <div class="mono" style="display:flex;justify-content:space-between;font-size:11px"><span>RIVERLINE RUN 2027</span><span class="tag" id="dDist"></span></div>
      <div class="disp num" id="dBib"></div>
      <div class="mono" style="display:flex;justify-content:space-between;font-size:11px"><span id="dName"></span><span>CORRAL <span id="dCorral"></span> · <span id="dStart"></span></span></div>
    </div>
  </div>

  <div class="inbox" id="emailView" hidden>
    <div class="inbox-bar">
      <div class="dots3"><i></i><i></i><i></i></div>
      <div class="mono" style="font-size:11px;opacity:.7">INBOX · 1 NEW</div>
    </div>
    <div class="inbox-head">
      <div class="avatar">R</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600">Riverline Run <span style="opacity:.55;font-weight:400">&lt;hello@riverlinerun.org&gt;</span></div>
        <div style="font-size:14px">You're in — Bib #<span id="eBib"></span> · Riverline Run 2027 <span class="tag mono">TEST</span></div>
        <div style="font-size:12px;opacity:.6">to <span id="eTo"></span> · just now</div>
      </div>
    </div>
    <iframe id="emailFrame" title="Confirmation email" scrolling="no"></iframe>
  </div>

  <form class="reg" id="regForm" data-reveal action="checkout.php" method="post" novalidate>
    <input type="hidden" name="distance" value="<?= h($default) ?>">
    <input type="hidden" name="size" value="M">
    <input type="hidden" name="donation" value="10">
    <div class="stack" style="gap:30px">
      <div class="field">
        <div class="mono">01 · DISTANCE</div>
        <div class="opts">
          <?php foreach ($DISTANCES as $id => $d): ?>
          <button type="button" class="opt <?= $id === $default ? 'on' : '' ?>" data-pick="distance" data-val="<?= h($id) ?>"><b><?= h($d['name']) ?></b><span class="mono" style="font-size:13px">$<?= (int)$d['price'] ?></span><small><?= h($d['includes']) ?></small></button>
          <?php endforeach; ?>
        </div>
      </div>
      <div class="field">
        <div class="mono">02 · JERSEY SIZE</div>
        <div class="row" style="gap:8px">
          <?php foreach (SIZES as $s): ?><button type="button" class="sz <?= $s === 'M' ? 'on' : '' ?>" data-pick="size" data-val="<?= $s ?>"><?= $s ?></button><?php endforeach; ?>
        </div>
      </div>
      <div class="field">
        <div class="mono">03 · ADD A DONATION TO CLEARWATER</div>
        <div class="row" style="gap:8px">
          <?php foreach (DONATIONS as $v): ?><button type="button" class="don <?= $v === 10 ? 'on' : '' ?>" data-pick="donation" data-val="<?= $v ?>"><?= $v ? '$' . $v : 'No thanks' ?></button><?php endforeach; ?>
        </div>
      </div>
      <div class="field">
        <div class="mono">04 · RUNNER</div>
        <div class="inputs">
          <label>Full name<input name="name" placeholder="Alex Rivera" autocomplete="name"><span class="err" data-err="name"></span></label>
          <label>Email<input name="email" type="email" placeholder="alex@email.com" autocomplete="email"><span class="err" data-err="email"></span></label>
        </div>
      </div>
      <div class="field">
        <div class="row" style="justify-content:space-between;align-items:center">
          <div class="mono">05 · PAYMENT (TEST)</div>
          <div class="row" style="gap:8px"><button type="button" class="fill mono" data-fill="4242 4242 4242 4242">Fill success card</button><button type="button" class="fill bad mono" data-fill="4000 0000 0000 0002">Fill decline card</button></div>
        </div>
        <div class="inputs card">
          <label>Card number<input name="card" inputmode="numeric" placeholder="4242 4242 4242 4242" autocomplete="off"></label>
          <label>Expiry<input name="exp" placeholder="MM/YY" autocomplete="off"></label>
          <label>CVC<input name="cvc" placeholder="123" autocomplete="off"></label>
        </div>
        <div class="errbox" data-err="card" hidden></div>
      </div>
    </div>

    <aside class="summary dark">
      <div style="display:flex;justify-content:space-between;align-items:center"><span class="mono">ORDER SUMMARY</span><span class="tag mono">TEST</span></div>
      <div class="disp" style="font-size:44px;line-height:.9" id="sFull"><?= h($R['full']) ?></div>
      <div class="lines">
        <div><span>Entry · <span id="sName"><?= h($R['name']) ?></span></span><span>$<span id="sEntry"><?= number_format($T['entry'], 2) ?></span></span></div>
        <div class="dim"><span>Race jersey · <span id="sSize">M</span></span><span>Included</span></div>
        <div class="dim"><span id="sIncl"><?= h($R['includes']) ?></span><span>Included</span></div>
        <div><span>Donation to Clearwater</span><span>$<span id="sDon"><?= number_format($T['donation'], 2) ?></span></span></div>
        <div class="dim"><span>Processing fee</span><span>$<span id="sFee"><?= number_format($T['fee'], 2) ?></span></span></div>
      </div>
      <div class="total"><span class="mono">TOTAL</span><b>$<span id="sTotal"><?= number_format($T['total'], 2) ?></span></b></div>
      <button class="pay" type="submit" id="payBtn">PAY $<?= number_format($T['total'], 2) ?> (TEST)</button>
      <div style="font-size:12px;line-height:1.45;opacity:.7">Sandbox payment. No card is charged.</div>
    </aside>
  </form>
</section>

<footer class="dark">
  <div class="wrap" style="padding-top:40px;padding-bottom:40px;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;font:400 13px/1.5 'JetBrains Mono'">
    <span style="font:800 18px/1 'Archivo';font-stretch:125%">RIVERLINE RUN</span>
    <span style="opacity:.7">A Clearwater Collective event · Port Meridian · Apr 18, 2027</span>
  </div>
</footer>

<script>window.RL = { routes: <?= json_encode($routesJson, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?>, feeRate: <?= FEE_RATE ?> };</script>
<script src="assets/app.js"></script>
</body>
</html>
