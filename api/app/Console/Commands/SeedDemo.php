<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

class SeedDemo extends Command
{
    protected $signature = 'codex:seed-demo';

    protected $description = 'Seed the demo data once, only if there are no users yet';

    public function handle(): int
    {
        if (User::query()->exists()) {
            $this->info('Users already exist, skipping demo seed.');

            return self::SUCCESS;
        }

        if (app()->isProduction()
            && in_array('password', [config('codex.demo_password'), config('codex.admin_password')], true)) {
            $this->error('Set DEMO_PASSWORD and ADMIN_PASSWORD before seeding in production.');

            return self::FAILURE;
        }

        return $this->call('db:seed', ['--force' => true]);
    }
}
