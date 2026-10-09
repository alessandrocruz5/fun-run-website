<?php
// Event data shared by index.php and checkout.php
const TEST_SUCCESS_CARD = '4242424242424242';
const TEST_DECLINE_CARD = '4000000000000002';
const FEE_RATE = 0.025;
const SEND_EMAIL = false;            // true = send confirmation via PHP mail()
const FROM_EMAIL = 'hello@riverlinerun.org';
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const DONATIONS = [0, 10, 25, 50, 100];

$DISTANCES = [
  '5k' => [
    'name' => '5K', 'full' => '5K Fun Run', 'km' => '5.0', 'price' => 35, 'gain' => '8 m', 'aid' => '1', 'cutoff' => '1h 15m', 'start' => '9:30 AM',
    'includes' => 'Medal', 'corral' => 'D',
    'medal' => 'Bronze river medal', 'medalLabel' => '5K', 'ribbonH' => 48, 'medalSize' => 120,
    'metal' => 'linear-gradient(135deg,#E3A774,#9C5B2E)', 'face' => '#C9844E', 'faceInk' => '#3A1E0A',
    'blurb' => 'A flat loop around Harbor Plaza and the old ferry docks. Strollers, walkers and dogs on leashes welcome.',
    'path' => 'M300 228 L360 250 C400 262 420 300 400 330 L330 340 C290 344 270 300 300 228 Z',
    'elev' => [4,4,5,6,6,7,8,8,7,6,6,5,5,4,4],
    'highlights' => [['KM 1','Ferry Docks boardwalk'],['KM 3','Water station + DJ booth'],['KM 5','Finish chute at Harbor Plaza']],
  ],
  '10k' => [
    'name' => '10K', 'full' => '10K River Loop', 'km' => '10.0', 'price' => 45, 'gain' => '22 m', 'aid' => '2', 'cutoff' => '1h 45m', 'start' => '8:45 AM',
    'includes' => 'Medal', 'corral' => 'C',
    'medal' => 'Silver river medal', 'medalLabel' => '10K', 'ribbonH' => 56, 'medalSize' => 134,
    'metal' => 'linear-gradient(135deg,#F1F3F5,#9AA4AE)', 'face' => '#C7CED5', 'faceInk' => '#10233A',
    'blurb' => 'Crosses the river once at Salt Street Bridge and loops back through Dockside Park on shaded paths.',
    'path' => 'M300 228 C360 250 440 250 480 290 C510 320 480 370 420 370 L300 360 C240 354 220 300 240 260 C252 236 280 226 300 228 Z',
    'elev' => [4,5,8,12,18,22,18,12,9,8,10,12,9,6,4],
    'highlights' => [['KM 2','Salt Street Bridge crossing'],['KM 6','Dockside Park shade trail'],['KM 9','Cheer zone by Clearwater volunteers']],
  ],
  '21k' => [
    'name' => 'Half', 'full' => 'Half Marathon', 'km' => '21.1', 'price' => 75, 'gain' => '64 m', 'aid' => '5', 'cutoff' => '3h 30m', 'start' => '7:30 AM',
    'includes' => 'Medal + finisher shirt', 'corral' => 'B',
    'medal' => 'Gold medal + finisher shirt', 'medalLabel' => '21.1', 'ribbonH' => 64, 'medalSize' => 150,
    'metal' => 'linear-gradient(135deg,#FFE08A,#C08A1E)', 'face' => '#E5B341', 'faceInk' => '#3A2800',
    'blurb' => 'Both banks of the Meridian: out along the north shore to Heron Point, back across Salt Street Bridge to the plaza.',
    'path' => 'M300 228 C220 214 160 160 100 130 C60 110 40 70 80 50 C130 30 200 60 240 100 C280 140 340 150 400 170 C470 196 540 230 560 290 C575 340 520 380 460 370 C400 360 360 300 300 228 Z',
    'elev' => [4,8,14,22,30,38,34,26,18,22,30,40,32,20,12,8,6,4],
    'highlights' => [['KM 4','Heron Point overlook'],['KM 11','Restored wetlands — Clearwater project site'],['KM 17','Salt Street Bridge']],
  ],
  '42k' => [
    'name' => 'Full', 'full' => 'Full Marathon', 'km' => '42.2', 'price' => 95, 'gain' => '148 m', 'aid' => '10', 'cutoff' => '6h 30m', 'start' => '6:45 AM',
    'includes' => 'Medal + finisher shirt', 'corral' => 'A',
    'medal' => 'Enamel gold medal + finisher shirt', 'medalLabel' => '42.2', 'ribbonH' => 72, 'medalSize' => 168,
    'metal' => 'linear-gradient(135deg,#FFE08A,#B07A12)', 'face' => '#10233A', 'faceInk' => '#FF5A1F',
    'blurb' => 'The whole river. Two bridges, Heron Point, the reservoir climb and a long riverside run home to Harbor Plaza.',
    'path' => 'M300 228 C220 214 160 170 90 140 C40 118 20 60 70 36 C140 10 230 40 280 80 C330 120 420 110 480 120 C550 132 590 190 580 250 C572 310 590 360 540 395 C480 430 380 410 320 390 C250 368 160 380 110 340 C70 306 120 270 180 262 C230 256 270 246 300 228 Z',
    'elev' => [4,10,18,26,34,30,24,30,44,58,72,80,66,50,38,30,26,34,40,30,20,14,10,6,4],
    'highlights' => [['KM 9','Heron Point overlook'],['KM 22','Reservoir climb — the only real hill'],['KM 35','Riverside mile of signs from families']],
  ],
];

function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

function elev_points(array $elev): string {
  $n = count($elev) - 1; $pts = [];
  foreach ($elev as $i => $v) $pts[] = round($i / $n * 600, 1) . ',' . round(112 - $v * 1.25, 1);
  return implode(' ', $pts);
}

function order_totals(int $price, int $donation): array {
  $fee = round(($price + $donation) * FEE_RATE, 2);
  return ['entry' => $price, 'donation' => $donation, 'fee' => $fee, 'total' => round($price + $donation + $fee, 2)];
}
