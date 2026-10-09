<?php
// Sandbox payment endpoint — accepts POST, returns JSON. No real charges.
require __DIR__ . '/mail.php';
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['ok' => false, 'errors' => ['card' => 'POST only.']]);
  exit;
}

$dist     = $_POST['distance'] ?? '';
$size     = $_POST['size'] ?? '';
$donation = (int)($_POST['donation'] ?? 0);
$name     = trim($_POST['name'] ?? '');
$email    = trim($_POST['email'] ?? '');
$card     = preg_replace('/\D/', '', $_POST['card'] ?? '');
$exp      = trim($_POST['exp'] ?? '');
$cvc      = trim($_POST['cvc'] ?? '');

$errors = [];
if (!isset($DISTANCES[$dist])) $errors['card'] = 'Pick a distance.';
if (!in_array($size, SIZES, true)) $errors['card'] = 'Pick a jersey size.';
if (!in_array($donation, DONATIONS, true)) $donation = 0;
if ($name === '') $errors['name'] = 'Enter your name as it should appear on your bib.';
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $errors['email'] = 'Enter a valid email.';
if (strlen($card) !== 16 || !preg_match('/^\d\d\/\d\d$/', $exp) || !preg_match('/^\d{3,4}$/', $cvc)) {
  $errors['card'] = 'Check card details — use a test card above.';
}
if ($errors) { echo json_encode(['ok' => false, 'errors' => $errors]); exit; }

usleep(900000); // simulate gateway latency

if ($card === TEST_DECLINE_CARD) {
  echo json_encode(['ok' => false, 'errors' => ['card' => 'Card declined (test decline card 4000 0000 0000 0002). Try 4242 4242 4242 4242.']]);
  exit;
}
if ($card !== TEST_SUCCESS_CARD) {
  echo json_encode(['ok' => false, 'errors' => ['card' => 'Only test cards are accepted in sandbox mode.']]);
  exit;
}

$d = $DISTANCES[$dist];
$totals = order_totals($d['price'], $donation);
$order = [
  'confirmation' => 'RL-TEST-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6)),
  'bib'          => (string)random_int(1000, 9999),
  'name'         => $name,
  'firstName'    => explode(' ', $name)[0],
  'email'        => $email,
  'distanceId'   => $dist,
  'distance'     => $d['name'],
  'full'         => $d['full'],
  'km'           => $d['km'],
  'includes'     => $d['includes'],
  'last4'        => substr($card, -4),
  'start'        => $d['start'],
  'corral'       => $d['corral'],
  'size'         => $size,
  'totals'       => array_map(fn($v) => number_format($v, 2), $totals),
  'created'      => date('c'),
];

// Store test order (used by email.php preview) and log it
@mkdir(__DIR__ . '/orders', 0775, true);
@file_put_contents(__DIR__ . "/orders/{$order['confirmation']}.json", json_encode($order));
@file_put_contents(__DIR__ . '/test-orders.log', json_encode($order) . PHP_EOL, FILE_APPEND | LOCK_EX);

$order['emailSent'] = send_confirmation($order);
echo json_encode(['ok' => true, 'order' => $order]);
