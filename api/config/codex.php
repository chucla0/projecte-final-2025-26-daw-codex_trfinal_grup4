<?php

return [
    // Closed on the public demo: only seeded accounts can sign in
    'registration_enabled' => env('REGISTRATION_ENABLED', true),

    'demo_password'  => env('DEMO_PASSWORD', 'password'),
    'admin_password' => env('ADMIN_PASSWORD', env('DEMO_PASSWORD', 'password')),
];
