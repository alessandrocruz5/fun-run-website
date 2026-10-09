<?php
// Confirmation email: table-based, inline-styled HTML (safe for Gmail/Outlook/Apple Mail)
require_once __DIR__ . '/data.php';

function sample_order(): array {
  return [
    'confirmation' => 'RL-TEST-8F3K2Q', 'bib' => '4127', 'name' => 'Alex Rivera', 'firstName' => 'Alex',
    'email' => 'alex@email.com', 'distanceId' => '21k', 'distance' => 'Half', 'full' => 'Half Marathon', 'km' => '21.1',
    'start' => '7:30 AM', 'corral' => 'B', 'size' => 'M', 'includes' => 'Medal + finisher shirt', 'last4' => '4242',
    'totals' => ['entry' => '75.00', 'donation' => '10.00', 'fee' => '2.13', 'total' => '87.13'],
    'created' => date('c'),
  ];
}

function render_email(array $o): string {
  $e = fn($k) => h($o[$k] ?? '');
  $t = $o['totals'];
  $row = fn($l, $v, $dim = false) => '<tr><td style="padding:8px 0;font:15px/1.4 Helvetica,Arial,sans-serif;color:' . ($dim ? '#5B6B7C' : '#10233A') . '">' . $l . '</td><td align="right" style="padding:8px 0;font:15px/1.4 Helvetica,Arial,sans-serif;color:' . ($dim ? '#5B6B7C' : '#10233A') . '">' . $v . '</td></tr>';
  $detail = fn($l, $v) => '<td width="25%" valign="top" style="padding:14px 10px 14px 0;border-top:1px solid #D6CDB9"><div style="font:600 10px/1 Menlo,Consolas,monospace;letter-spacing:.08em;color:#5B6B7C">' . $l . '</div><div style="font:800 18px/1.2 Helvetica,Arial,sans-serif;color:#10233A;padding-top:6px">' . $v . '</div></td>';
  $date = date('M j, Y · g:i A', strtotime($o['created'] ?? 'now'));

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You\'re registered — Riverline Run 2027</title>
<style>
@media only screen and (max-width:620px){
  .px{padding-left:18px!important;padding-right:18px!important}
  .hero-t{font-size:34px!important}
  .bib-n{font-size:72px!important;letter-spacing:-2px!important}
  .det td{display:inline-block!important;width:50%!important;box-sizing:border-box}
  .outer{padding:12px 6px!important}
}
</style></head>
<body style="margin:0;padding:0;background:#E9E3D6">
<div style="display:none;max-height:0;overflow:hidden">Bib #' . $e('bib') . ' · ' . $e('full') . ' · Apr 18, 2027. Your test payment was approved.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E9E3D6"><tr><td align="center" class="outer" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">

<tr><td align="center" style="background:#FF5A1F;padding:8px 16px;border-radius:14px 14px 0 0;font:600 11px/1.4 Menlo,Consolas,monospace;color:#10233A;letter-spacing:.06em">TEST TRANSACTION · NO REAL CHARGE WAS MADE</td></tr>

<tr><td class="px" style="background:#10233A;padding:28px 32px 36px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font:900 18px/1 Helvetica,Arial,sans-serif;color:#F3EFE6;letter-spacing:.02em">RIVERLINE RUN</td>
    <td align="right" style="font:600 11px/1 Menlo,Consolas,monospace;color:#9CC8D9">' . $e('confirmation') . '</td>
  </tr></table>
  <div class="hero-t" style="font:900 44px/1 Helvetica,Arial,sans-serif;color:#F3EFE6;letter-spacing:-1px;padding-top:36px">You\'re in, <span style="color:#FF5A1F">' . $e('firstName') . '</span>.</div>
  <div style="font:16px/1.5 Helvetica,Arial,sans-serif;color:#C9D6E2;padding-top:12px">Your spot in the ' . $e('full') . ' is confirmed. See you on the waterfront.</div>
</td></tr>

<tr><td class="px" style="background:#F3EFE6;padding:28px 32px 8px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:2px solid #10233A;border-radius:14px"><tr><td style="padding:18px 20px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font:600 11px/1 Menlo,Consolas,monospace;color:#10233A">RIVERLINE RUN 2027</td>
      <td align="right"><span style="background:#FF5A1F;color:#10233A;font:700 11px/1 Menlo,Consolas,monospace;padding:5px 8px;border-radius:4px">' . strtoupper($e('distance')) . '</span></td>
    </tr></table>
    <div class="bib-n" style="font:900 96px/1 Helvetica,Arial,sans-serif;color:#10233A;text-align:center;letter-spacing:-4px;padding:14px 0 10px">' . $e('bib') . '</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font:600 11px/1 Menlo,Consolas,monospace;color:#10233A">' . strtoupper($e('name')) . '</td>
      <td align="right" style="font:600 11px/1 Menlo,Consolas,monospace;color:#10233A">CORRAL ' . $e('corral') . ' · ' . $e('start') . '</td>
    </tr></table>
  </td></tr></table>
  <div style="font:12px/1.5 Helvetica,Arial,sans-serif;color:#5B6B7C;text-align:center;padding-top:10px">Your printed bib is in your race packet. Bring this email or your confirmation code.</div>
</td></tr>

<tr><td class="px" style="background:#F3EFE6;padding:20px 32px 8px">
  <table role="presentation" class="det" width="100%" cellpadding="0" cellspacing="0"><tr>' .
    $detail('RACE DAY', 'Sun · Apr 18') . $detail('START', $e('start')) . $detail('DISTANCE', $e('km') . ' km') . $detail('JERSEY', $e('size')) .
  '</tr></table>
</td></tr>

<tr><td class="px" style="background:#F3EFE6;padding:20px 32px">
  <div style="font:600 11px/1 Menlo,Consolas,monospace;letter-spacing:.08em;color:#10233A;padding-bottom:6px">RECEIPT</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #10233A">' .
    $row('Entry · ' . $e('full'), '$' . h($t['entry'])) .
    $row('Race jersey (' . $e('size') . ') + ' . strtolower($e('includes')), 'Included', true) .
    $row('Donation to Clearwater Collective', '$' . h($t['donation'])) .
    $row('Processing fee', '$' . h($t['fee']), true) .
  '<tr><td style="padding:14px 0 4px;border-top:1px solid #D6CDB9;font:700 12px/1 Menlo,Consolas,monospace;color:#10233A">TOTAL (TEST)</td><td align="right" style="padding:14px 0 4px;border-top:1px solid #D6CDB9;font:900 28px/1 Helvetica,Arial,sans-serif;color:#FF5A1F">$' . h($t['total']) . '</td></tr>
  </table>
  <div style="font:12px/1.5 Menlo,Consolas,monospace;color:#5B6B7C;padding-top:8px">Test card •••• ' . $e('last4') . ' · ' . h($date) . '</div>
</td></tr>

<tr><td class="px" style="background:#F3EFE6;padding:12px 32px 28px">
  <div style="font:600 11px/1 Menlo,Consolas,monospace;letter-spacing:.08em;color:#10233A;padding-bottom:12px">WHAT\'S NEXT</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td width="48" valign="top" style="font:900 22px/1 Helvetica,Arial,sans-serif;color:#FF5A1F;padding:6px 0">01</td><td style="font:15px/1.5 Helvetica,Arial,sans-serif;color:#10233A;padding:6px 0"><b>Packet pickup</b> · Apr 16–17, Harbor Plaza, 10 AM–7 PM</td></tr>
    <tr><td width="48" valign="top" style="font:900 22px/1 Helvetica,Arial,sans-serif;color:#FF5A1F;padding:6px 0">02</td><td style="font:15px/1.5 Helvetica,Arial,sans-serif;color:#10233A;padding:6px 0"><b>Corral ' . $e('corral') . ' closes</b> 15 minutes before your ' . $e('start') . ' start</td></tr>
    <tr><td width="48" valign="top" style="font:900 22px/1 Helvetica,Arial,sans-serif;color:#FF5A1F;padding:6px 0">03</td><td style="font:15px/1.5 Helvetica,Arial,sans-serif;color:#10233A;padding:6px 0"><b>Cross the line</b> · collect your medal' . (in_array($o['distanceId'] ?? '', ['21k', '42k']) ? ' and finisher shirt' : '') . '</td></tr>
  </table>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr><td style="background:#10233A;border-radius:999px"><a href="#" style="display:inline-block;padding:15px 24px;font:800 14px/1 Helvetica,Arial,sans-serif;color:#F3EFE6;text-decoration:none;letter-spacing:.04em">VIEW COURSE MAP →</a></td></tr></table>
</td></tr>

<tr><td class="px" style="background:#9CC8D9;padding:24px 32px">
  <div style="font:900 20px/1.2 Helvetica,Arial,sans-serif;color:#10233A">Your $' . h($t['donation']) . ' keeps a river running clean.</div>
  <div style="font:14px/1.5 Helvetica,Arial,sans-serif;color:#10233A;padding-top:6px">Race surplus and donations fund Clearwater Collective\'s river restoration and clean water projects.</div>
</td></tr>

<tr><td class="px" style="background:#10233A;padding:22px 32px;border-radius:0 0 14px 14px;font:12px/1.6 Menlo,Consolas,monospace;color:#9FB0C2">
  Riverline Run · A Clearwater Collective event · Port Meridian<br>
  Sent to ' . $e('email') . ' because you registered for Riverline Run 2027.
</td></tr>

</table></td></tr></table></body></html>';
}

function send_confirmation(array $o): bool {
  if (!SEND_EMAIL) return false;
  $headers = "MIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nFrom: Riverline Run <" . FROM_EMAIL . ">\r\n";
  return @mail($o['email'], "You're in — Bib #{$o['bib']} · Riverline Run 2027 [TEST]", render_email($o), $headers);
}
