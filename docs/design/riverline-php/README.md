# Riverline Run — PHP

Run locally (PHP 8+):

    cd riverline-php
    php -S localhost:8000

Open http://localhost:8000

- `index.php` — the page (routes, shirts, medals, cause, registration)
- `data.php` — distances, prices, routes, test card numbers
- `checkout.php` — sandbox payment endpoint (POST → JSON). Saves orders to `orders/` and `test-orders.log`, sends the email if `SEND_EMAIL` is on
- `mail.php` — confirmation email template (`render_email()`) + `send_confirmation()`
- `email.php` — preview the email: `email.php?c=RL-TEST-XXXXXX`, or no param for a sample
- `assets/style.css`, `assets/motion.css` (animations), `assets/app.js`

To actually send emails set `SEND_EMAIL = true` in `data.php` (needs a working mail setup on the server, e.g. sendmail/SMTP).

Test cards: `4242 4242 4242 4242` approves, `4000 0000 0000 0002` declines. Any expiry (MM/YY) and 3-digit CVC.
`?d=5k|10k|21k|42k` sets the default selected distance.
