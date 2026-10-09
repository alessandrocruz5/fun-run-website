<?php
// Preview the confirmation email: email.php?c=RL-TEST-XXXXXX (or no param for a sample)
require __DIR__ . '/mail.php';
$c = preg_replace('/[^A-Z0-9-]/', '', strtoupper($_GET['c'] ?? ''));
$file = __DIR__ . "/orders/$c.json";
$order = ($c && is_file($file)) ? json_decode(file_get_contents($file), true) : sample_order();
header('Content-Type: text/html; charset=utf-8');
echo render_email($order);
